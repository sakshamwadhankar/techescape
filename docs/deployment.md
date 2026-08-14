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
  `JWT_SECRET`, `EVENT_PIN`, ...), with the encrypted `apps/api/secrets.json`
  fallback for unset vars (see §4). The API validates required vars on boot
  (`apps/api/src/config/env.ts`) and fails fast if any are missing; never bake
  **plaintext** secrets into an image.
- The API listens on `API_PORT` (default 4000), the web app on `PORT` (default
  3000). Example run:

```sh
docker run -d --name api -p 4000:4000 \
  -e DATABASE_URL=... -e REDIS_URL=... -e JWT_SECRET=... -e EVENT_PIN=... \
  -e TRUST_PROXY=true \
  spiderman-api
docker run -d --name web -p 3000:3000 spiderman-web
```

## 4. Deploying on Railway

The API runs on Railway as a containerized web service (Nixpacks or the
`apps/api/Dockerfile`). Railway injects env vars straight into `process.env`.

Boot-time config resolution order (first one that provides a value wins):

1. `process.env` — Railway service variables, or whatever the host sets.
2. Repo-root `.env` via `dotenv` (`apps/api/src/main.ts`) — silent no-op if
   absent; not present in the image.
3. `apps/api/secrets.json` — AES-256-GCM-encrypted values, decrypted by
   `loadSecrets()` (`apps/api/src/config/load-secrets.ts`) and used only for
   vars that are still unset. This is the **fallback that lets the image boot
   with zero Railway service variables**.

`secrets.json` is generated from the repo-root `.env`:

```sh
node scripts/encrypt-secrets.mjs        # writes apps/api/secrets.json
node scripts/encrypt-secrets.mjs --print  # decrypt + print values (sanity check)
```

- The encryption key is hardcoded in `apps/api/src/config/load-secrets.ts` and
  `scripts/encrypt-secrets.mjs` — keep them in sync. This is **obfuscation, not
  real secret storage**: the key ships in the image, so anyone with image access
  can decrypt the values. Its purpose is to avoid committing plaintext
  credentials to the repo, not to stop an image holder.
- The script skips platform-owned vars (`NODE_ENV`, `API_PORT`, `PORT`, `S3_*`)
  and overrides env-dependent flags for the image
  (`COOKIE_SECURE=true`, `TRUST_PROXY=true`, `WEB_ORIGIN=https://techescape-web.vercel.app`).
- `secrets.json` must be committed to git — Railway builds from the git repo and
  the image only contains what is committed.
- If you prefer explicit control, Railway service variables still take
  precedence over the file and are the documented alternative.

Optional variables to set on the Railway service (Dashboard → Service →
Variables) — only needed if you do **not** want them to come from the file:

| Variable | Source |
| --- | --- |
| `DATABASE_URL` | Railway Postgres plugin (internal `DATABASE_URL`) |
| `REDIS_URL` | Railway Key Value plugin (`REDIS_URL`) |
| `JWT_SECRET` | `openssl rand -hex 64` — rotate per event |
| `EVENT_PIN` | The event access PIN (≥ 4 chars) |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of the admin password; leave `ADMIN_PASSWORD` empty |
| `COOKIE_SECURE` | `true` (HTTPS) |
| `WEB_ORIGIN` / `CORS_ORIGINS` | Public web origin, e.g. `https://web-production-xxxx.up.railway.app` |
| `TRUST_PROXY` | `true` (Railway proxies traffic; rate limiting reads `X-Forwarded-For`) |
| `RATE_LIMIT_MAX` | `400` at the event |

Port: Railway injects `PORT` and routes traffic to it. The API falls back to
`PORT` when `API_PORT` is unset, so leave `API_PORT` empty.

Build/start commands (if not using the Dockerfile):

```sh
# Build: pnpm build   → Start: pnpm start
```
Migrations run automatically on container start via the image entrypoint
(`prisma migrate deploy`). The service fails fast on boot if a required
variable is missing — the log line `Invalid environment configuration: ...`
names the exact variable(s) to set.

## 5. Reverse proxy (TLS)

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
