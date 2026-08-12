# AGENTS.md

## Project

Spider-Man themed IEEE event platform supporting **500+ concurrent players**.

Games:

* Wordle
* Guess the Character by Shadow
* Match the Cards

This is a **Turborepo monorepo**. Read this file and inspect existing code before making changes.

---

## Stack

* Package manager: **pnpm**
* Monorepo: **Turborepo**
* Frontend: **Next.js + React + TypeScript + Tailwind**
* Backend: **NestJS + TypeScript**
* Database: **PostgreSQL + Prisma**
* Temporary state/cache: **Redis**
* Assets: **S3/R2-compatible storage + CDN**
* Deployment: **Docker + Cloudflare/CDN**

Use a **modular monolith** backend. Do not introduce microservices unless explicitly requested.

---

## Repository Structure

```text
apps/
  web/                 # Next.js student + admin UI
  api/                 # NestJS API

packages/
  db/                  # Prisma schema/client
  types/               # Shared TypeScript types
  ui/                  # Shared React components
  validation/          # Shared validation schemas
  config/              # Shared tooling configuration

docs/
  architecture.md
  games.md
  api.md
  deployment.md
```

### Package responsibilities

**`apps/web`**

* UI
* Pages/routes
* Client state
* API communication
* Game presentation

Never put authoritative game logic here.

**`apps/api`**

* Authentication
* Authorization
* Game sessions
* Game logic
* Server-side timing
* Validation
* Scoring
* Leaderboard
* Admin APIs

**`packages/db`**

* Prisma schema
* Prisma client
* Database access

**`packages/types`**

* Shared TypeScript types only
* Do not put business logic here

**`packages/ui`**

* Reusable UI components

**`packages/validation`**

* Shared request/data validation where genuinely useful

---

## Core Architecture

```text
Players
   │
   ▼
Cloudflare / CDN
   │
   ├── Static assets → Object Storage
   │
   ▼
apps/web
   │ REST
   ▼
apps/api
   │
   ├── Auth
   ├── Players
   ├── Game Sessions
   ├── Wordle
   ├── Shadow
   ├── Cards
   ├── Scoring
   ├── Leaderboard
   └── Admin
        │
        ├── Redis
        └── packages/db → PostgreSQL
```

PostgreSQL is the **persistent source of truth**.

Redis is for temporary state, caching, locks, rate limiting, and leaderboard acceleration.

The API must remain stateless. Never keep authoritative game state only in process memory.

---

## Critical Rules

### Server is authoritative

Never trust the client for:

* Player identity
* Correct answers
* Game state
* Attempts
* Time taken
* Scores
* Completion
* Leaderboard position

The browser is only responsible for presentation and interaction.

### Timing

Use server timestamps:

```text
startedAt
expiresAt
```

The browser countdown is visual only.

### Security

Protect against:

* Score manipulation
* Timer manipulation
* Replay attacks
* Duplicate submissions
* Invalid sessions
* Unauthorized access
* Request flooding

Never expose answers before submission.

Never commit secrets.

Use environment variables for credentials.

### Concurrency

Game completion and scoring must be idempotent.

Use transactions, database constraints, Redis locks, or idempotency keys where appropriate.

### Assets

Never serve large game images through NestJS.

Use object storage + CDN.

---

## Game Architecture

Each game lives under:

```text
apps/api/src/games/
├── wordle/
├── shadow/
└── cards/
```

Each game should contain its own:

```text
controller
service
module
DTOs
game/domain logic
tests
```

Games share the platform's:

* Authentication
* Game sessions
* Timing
* Scoring infrastructure
* Leaderboard
* Database

Conceptual lifecycle:

```text
Authenticate
    ↓
Start Game
    ↓
Create Session
    ↓
Store temporary state
    ↓
Player Action
    ↓
Server Validation
    ↓
Score Calculation
    ↓
Persist Result
    ↓
Leaderboard
```

---

## Turborepo Rules

Use workspace packages instead of duplicating code.

Prefer:

```text
@spiderman/types
@spiderman/ui
@spiderman/db
@spiderman/validation
```

Do not duplicate shared types between `apps/web` and `apps/api`.

Do not import server-only code into `apps/web`.

Do not import Prisma directly from `apps/web`.

Use Turborepo task pipelines for:

```text
dev
build
lint
typecheck
test
```

Keep package boundaries clear.

---

## Development Rules

Before coding:

1. Inspect the relevant package.
2. Search for existing utilities/components/types.
3. Make the smallest clean change.
4. Keep business logic out of React components.
5. Add/update tests.
6. Run typecheck, lint, and relevant tests.
7. Avoid unrelated refactors.

For database changes, create a Prisma migration.

## Documentation Rule

Whenever you implement something differently than described in `docs/` or
implement something new, **update the relevant docs in `docs/`** in the same
change. Docs cover: `architecture.md`, `games.md`, `api.md`, `deployment.md`.
Add new sections/files if a concept does not fit an existing file. Never leave
docs describing behavior that no longer matches the code.

Use TypeScript strict mode.

Avoid `any`.

Do not add dependencies without a clear reason.

---

## Testing

Test all game logic for:

* Correct/incorrect answers
* Timeout
* Duplicate submissions
* Invalid input
* Already completed games
* Score calculation
* Boundary conditions

Before the event, load-test:

```text
100 → 250 → 500 → 750 → 1000 concurrent users
```

Target:

```text
p95 API latency < 300ms
Error rate < 1%
```

---

## Priority

When making decisions:

1. Correctness
2. Security
3. Reliability
4. Performance
5. Maintainability
6. Visual polish

**Keep the system simple. Do not over-engineer.**

