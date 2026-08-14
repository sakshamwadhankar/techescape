# Deployment

This document covers running the platform for the event. It targets a **single
host** (the simplest topology that meets the 500+ concurrent player goal) and
ends with a short section on scaling out if a single host proves insufficient.

## Prerequisites

- Node.js 22.13+ and pnpm 11 (see `package.json > engines` and `packageManager`)
- Docker (for PostgreSQL + Redis) or an existing Postgres/Redis instance
- The repo checked out with `pnpm install` completed

## Topology (single host)

```text
Players
   │ HTTPS
   ▼
Caddy / Nginx (TLS, reverse proxy)
   │
   ├── /api → node apps/api/dist/main.js   (port 4000)
   └── /    → node apps/web/.next (next start, port 3000)
```

PostgreSQL and Redis run on the same host via `docker compose`. Static assets
(shadow images, card art) are served from object storage behind a CDN; in
development they fall back to the web app origin.

## 1. Provision the databases

```sh
pnpm db:up            # docker compose up -d postgres redis
pnpm db:migrate       # apply Prisma migrations (packages/db)
pnpm db:seed          # seed the round + game content if needed
```

The API is stateless; only Postgres (source of truth) and Redis (temporary
state/cache/locks) persist anything.

## 2. Configure the environment

Copy `.env.example` to `.env` on the host and set production values. Required
changes from the template:

| Variable | Production value |
| --- | --- |
| `DATABASE_URL` | Internal URL of the Postgres instance (credentials per host) |
| `REDIS_URL` | Internal URL of the Redis instance |
| `JWT_SECRET` | Long random string (e.g. `openssl rand -hex 64`) — rotate per event |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of the admin password; leave `ADMIN_PASSWORD` empty |
| `COOKIE_SECURE` | `true` (cookies only over HTTPS) |
| `COOKIE_SAMESITE` | `lax` for same-origin; `none` when web and API are on different sites (e.g. Vercel + Railway) — requires `COOKIE_SECURE=true` |
| `WEB_ORIGIN` | Public origin of the web app, e.g. `https://spidey.example.com` |
| `CORS_ORIGINS` | Same as `WEB_ORIGIN` |
| `TRUST_PROXY` | `true` when the API is behind the reverse proxy/CDN |
| `RATE_LIMIT_MAX` | `400` at the event (do not raise in production) |
| `ASSET_CDN_URL` | Public CDN base for shadow/card assets |
| `NEXT_PUBLIC_API_URL` (web) | Public API base, e.g. `https://spidey.example.com/api` |

Do **not** reuse dev secrets. Never commit `.env`.

## 3. Build and start

```sh
# Build all packages + apps (production, minified)
pnpm build

# Apply schema changes to the DB
pnpm db:migrate

# Start both apps under a process manager (systemd/pm2)
# API:
DATABASE_URL=... node apps/api/dist/main.js        # listens on 4000
# Web:
NEXT_PUBLIC_API_URL=... pnpm --filter @spiderman/web start   # next start, port 3000
```

Notes:

- `NEXT_PUBLIC_API_URL` is inlined at web build time, so set it before
  `pnpm build`; `next start` runs the already-built output.
- Verify with a smoke test after start: a player login against the event PIN
  and one `start` request per game. (There is no `/health` endpoint yet; the
  login + start calls cover API reachability.)

### Docker images

Both apps ship a Dockerfile (build context = repo root):

```sh
docker build -f apps/api/Dockerfile -t spiderman-api .
docker build -f apps/web/Dockerfile -t spiderman-web \
  --build-arg NEXT_PUBLIC_API_URL=https://spidey.example.com/api .
```

- Multi-stage builds: `turbo prune` keeps only the target app and its
  workspace dependencies, then `pnpm install --frozen-lockfile` + `pnpm turbo
  build` run against the pruned graph. `tsconfig.base.json` is copied in
  explicitly (turbo prune does not include it).
- `NEXT_PUBLIC_API_URL` is a build ARG on the web image because it is inlined
  into the client bundle.
- The API image entrypoint runs `prisma migrate deploy` against
  `DATABASE_URL` before starting the app, so migrations are applied
  automatically on container start (safe to re-run; it applies only pending
  migrations). The web image has no database.
- Runtime config comes from environment variables (`DATABASE_URL`, `REDIS_URL`,
  `JWT_SECRET`, `EVENT_PIN`, ...). The API validates required vars on boot
  (`apps/api/src/config/env.ts`) and fails fast if any are missing; never bake
  secrets into an image.
- The API listens on `API_PORT` (default 4000), the web app on `PORT` (default
  3000). Example run:

```sh
docker run -d --name api -p 4000:4000 \
  -e DATABASE_URL=... -e REDIS_URL=... -e JWT_SECRET=... -e EVENT_PIN=... \
  -e TRUST_PROXY=true \
  spiderman-api
docker run -d --name web -p 3000:3000 spiderman-web
```

### Railway (Railpack)

Deploying to Railway uses the same image content via Railpack instead of the
Dockerfiles above. The repo ships two Railpack configs:

- `railpack.json` — API service. Builds the full workspace graph first
  (`pnpm turbo build --filter=@spiderman/api`, which compiles
  `@spiderman/types`, `@spiderman/validation`, `@spiderman/db` before the API)
  and starts with `prisma migrate deploy` + `node apps/api/dist/main.js`.
- `railpack.web.json` — web service. Point the web service at it by setting
  `RAILPACK_CONFIG_FILE=railpack.web.json` in the service, otherwise the
  default `railpack.json` (API) is used. Its start command is
  `node apps/web/.next/standalone/apps/web/server.js` (Next keeps the
  standalone output in the workspace tree; the Dockerfile instead copies the
  standalone root to `/app`, which is why the path differs from `server.js`).

Why these configs exist: Railpack's default build for a workspace package runs
only that package's `build` script (e.g. `pnpm --filter @spiderman/api build`),
so the shared packages are never compiled and `nest build` fails to resolve
`@spiderman/*`. The configs swap the build step for turbo, which builds the
dependency graph topologically.

Per-service settings on Railway:

| Service | Setting | Value |
| --- | --- | --- |
| api | `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (≥16 chars), `EVENT_PIN` (≥4 chars) | required service variables |
| api | `API_PORT` | Railway exposes port 3000 by default, so set `API_PORT=3000` (the app ignores `PORT`) |
| api | `TRUST_PROXY` | `true` |
| api | `CORS_ORIGINS`, `WEB_ORIGIN`, `ASSET_CDN_URL` | public web origin / CDN base |
| api | `RAILPACK_CONFIG_FILE` | do **not** set it on the API service — it would build/run the web app instead of the API (`railpack.json` is the API default) |
| api | Start command / Build command fields | leave empty — Railpack picks them up from `railpack.json` |
| web | `NEXT_PUBLIC_API_URL` | public API base (inlined at build time) |
| web | `RAILPACK_CONFIG_FILE` | `railpack.web.json` |

Notes:

- Migrations run on every API start (`prisma migrate deploy`); it is safe to
  re-run because it only applies pending migrations.
- Dev dependencies (including the `prisma` CLI) are kept in the runtime image
  by default; do **not** set `RAILPACK_PRUNE_DEPS=true` on the API service or
  the migration step will fail.
- If a custom Start/Build command is set in the Railway service UI (or via
  `RAILPACK_BUILD_CMD`/`RAILPACK_START_CMD`), it wins over `railpack.json` —
  remove them so the configs take effect.

## 4. Reverse proxy (TLS)

Terminate TLS in front of both apps, forward `/api/*` to the API and everything
else to the web app. Example Caddyfile:

```caddyfile
spidey.example.com {
  reverse_proxy /api/* localhost:4000
  reverse_proxy /*    localhost:3000
}
```

Set `TRUST_PROXY=true` so per-client rate limiting reads `X-Forwarded-For`.

## 5. Event-day runbook

1. Confirm `docker compose ps` (postgres + redis healthy).
2. Confirm `.env` has the event PIN (`EVENT_PIN`), correct `ADMIN_PASSWORD_HASH`,
   and `RATE_LIMIT_MAX=400`.
3. Confirm the round is `ACTIVE` from the admin dashboard (or
   `POST /api/admin/round/start`).
4. Smoke test: login as a test team, start each game once, verify scores land
   on the leaderboard, then remove the test team and reset its sessions.
5. Watch: API logs, Postgres/Redis resource usage, `p95 < 300ms` and
   `error rate < 1%` at 500+ concurrent players.

## 6. Scaling out (stretch, not required at this size)

If a single host cannot meet p95 < 300ms at the target concurrency:

- Move Postgres and Redis to their own hosts (or managed services).
- Put object storage + CDN in front of all static assets.
- Run multiple API replicas behind the proxy (stateless by design). Note that
  the rate limiter is currently in-memory per instance, so per-IP limits split
  across replicas; a shared Redis-backed throttler storage is a future change
  if multi-replica rate limiting is required.
- Run the web app as a stateless Next.js deployment.

The modular monolith backend is intentionally not split into microservices;
do not introduce them unless measurement proves a real bottleneck.
