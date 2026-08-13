# Spider-Man IEEE Event Platform

Spider-Man themed IEEE event platform supporting 500+ concurrent teams playing
three Round-1 games: **Wordle**, **Guess the Character by Shadow** and **Match
the Cards**.

## Stack

- Turborepo + pnpm monorepo
- `apps/web` — Next.js student + admin UI
- `apps/api` — NestJS API (modular monolith)
- `packages/db` — Prisma schema + client (PostgreSQL)
- PostgreSQL — persistent source of truth
- Redis — session state, locks, idempotency, rate limiting, leaderboard cache
- S3/R2-compatible object storage + CDN for game assets
- Docker Compose for local Postgres/Redis

## Prerequisites

- Node.js >= 20
- pnpm >= 9 (`corepack enable` or `npm i -g pnpm`)
- Docker + Docker Compose

## Quick start

```bash
pnpm install
cp .env.example .env
pnpm db:up          # start postgres + redis
pnpm --filter @spiderman/db db:migrate
pnpm --filter @spiderman/db db:seed
pnpm dev            # api on :4000, web on :3000
```

## Scripts

| Command             | Description                            |
| ------------------- | -------------------------------------- |
| `pnpm dev`          | Run web + api in watch mode            |
| `pnpm build`        | Build all packages and apps            |
| `pnpm lint`         | Lint all packages                      |
| `pnpm typecheck`    | Typecheck all packages                 |
| `pnpm test`         | Run all tests                          |
| `pnpm db:up`        | Start Postgres + Redis containers      |
| `pnpm db:migrate`   | Apply Prisma migrations                |
| `pnpm db:seed`      | Seed wordlist, questions and deck      |
| `pnpm openapi:gen`  | Regenerate `docs/openapi.json`         |

## Documentation

See [docs/](docs/) for architecture, games, API and deployment guides:

- [docs/architecture.md](docs/architecture.md) — system architecture and principles
- [docs/games.md](docs/games.md) — game rules and scoring
- [docs/frontend.md](docs/frontend.md) — API endpoints for frontend integration
- [docs/api.md](docs/api.md) — authoritative backend API reference
- [docs/openapi.json](docs/openapi.json) — machine-readable OpenAPI 3.0 spec
- [docs/design.md](docs/design.md) — product/UX context for UI and UX designers
- [docs/deployment.md](docs/deployment.md) — deployment and event-day runbook

## Security notes

- The server is authoritative for all game state, answers, timing and scores.
- Answers and target words are never exposed to the browser before submission.
- Never commit `.env`; all credentials are environment-based.
