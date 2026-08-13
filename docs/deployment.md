# Deployment

This document covers running the platform for the event. It targets a **single
host** (the simplest topology that meets the 500+ concurrent player goal) and
ends with a short section on scaling out if a single host proves insufficient.

## Prerequisites

- Node.js 20+ and pnpm 9+
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
