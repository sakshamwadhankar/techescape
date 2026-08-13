# Architecture

Spider-Man themed IEEE event platform supporting **500+ concurrent players**.
This is a **Turborepo monorepo**; the backend is a **modular monolith**.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js + React + TypeScript + Tailwind (`apps/web`) |
| Backend | NestJS + TypeScript (`apps/api`) |
| Database | PostgreSQL + Prisma (`packages/db`) |
| Cache / temp state | Redis (`apps/api/src/common/redis`) |
| Assets | S3/R2 object storage + CDN (never served through NestJS) |
| Deployment | Docker + Cloudflare/CDN |

## Repo layout

```text
apps/
  web/                 # Next.js student + admin UI (client components, direct-fetch)
  api/                 # NestJS API
packages/
  db/                  # Prisma schema + client
  types/               # Shared TypeScript types (no logic)
  ui/                  # Shared React components
  validation/          # Shared zod schemas
  config/              # Shared tooling config
docs/
  architecture.md      # this file
  games.md             # game rules + scoring
  api.md               # endpoint reference
  deployment.md        # (planned) infra + deployment
```

## Web app (`apps/web`)

Next.js (App Router) client for players and admins. It holds **no game logic** —
every page is a client component that calls the API directly and renders the
response.

- **API client** (`src/lib/api.ts`): typed wrapper around `fetch` with
  `credentials: "include"`. Base URL from `NEXT_PUBLIC_API_URL` (default
  `http://localhost:4000/api`). No Next.js rewrites or server proxy — the
  browser talks to the API straight through the CDN. CORS is configured with
  `maxAge` so preflight requests are cached.
- **Auth hooks** (`src/lib/auth.ts`): `usePlayerSession` / `useRequirePlayer`
  and `useAdminSession` / `useRequireAdmin` probe `GET /auth/me` /
  `GET /admin/round` and redirect to `/login` or `/admin/login` on 401.
- **Player routes**: `/` (home + session status), `/login`, `/play/wordle`,
  `/play/shadow`, `/play/cards`, `/leaderboard`.
- **Admin routes**: `/admin/login`, `/admin` (round control, config, roster
  import, team resets). The guard lives in the dashboard page, not the layout,
  so `/admin/login` stays reachable.
- **Game screens** (`src/components/{wordle,shadow,cards}`): start via the API,
  call the server for every action, and only call `finish` once the terminal
  status is known (or the `expiresAt` countdown, which is visual only, hits
  zero). Countdown/timer, guesses, flips, and attempts are all rendered from
  server responses.
- **Shared UI** comes from `packages/ui`; `packages/types` provides the DTOs.
- Testing: Vitest (`src/lib/*.spec.ts`) for the API client and pure game
  helpers. The web app runs `lint`, `typecheck`, `test`, and `build` in the
  Turbo pipeline.

## Request flow

```text
Players
   │
   ▼
Cloudflare / CDN
   │
   ├── Static assets → Object Storage
   │
   ▼
apps/web (REST)
   │
   ▼
apps/api
   │
   ├── Auth            (player + admin JWTs in HTTP-only cookies)
   ├── Players         (GET /players/me)
   ├── Sessions        (round lifecycle + session orchestration)
   ├── Games           (Wordle, Shadow, Cards)
   ├── Scoring         (inside each game service)
   ├── Leaderboard     (aggregated standings)
   └── Admin           (roster, round control, resets)
        │
        ├── Redis
        └── packages/db → PostgreSQL
```

## Core principles

- **PostgreSQL is the persistent source of truth.** Every player action is
  persisted as a `GameAction`; the session row (`GameSession`) is authoritative
  for status, score, and result.
- **Redis holds only temporary state**: per-session game state
  (`state:<sessionId>`), idempotency responses (`idem:<sessionId>:<key>`),
  per-session locks (`lock:<sessionId>`), the cached round (`round:current`),
  per-round game data (wordle answer, shadow questions, cards deck/seed), and
  the leaderboard cache (`leaderboard:round:<id>`).
- **The API is stateless** — no authoritative game state lives in process
  memory, so any instance can serve any request.
- **The server is authoritative** — the browser only renders; all answers,
  timing, attempts, and scores are validated server-side with server
  timestamps (`startedAt` / `expiresAt`).

## Auth

- Player: `POST /api/auth/player/login` with `accessCode` + shared `EVENT_PIN`.
  `accessCode` is the roster team code lowercased. JWT payload
  `{ sub: teamId, code, role: "player" }`, cookie `spm_access_token`.
- Admin: `POST /api/auth/admin/login` with `ADMIN_USERNAME` / `ADMIN_PASSWORD`
  (or bcrypt `ADMIN_PASSWORD_HASH`). JWT `{ sub: "admin", role: "admin" }`,
  cookie `spm_admin_token`.
- Guards: `JwtAuthGuard` (players), `AdminAuthGuard` (admin role). Cookies are
  HTTP-only; `COOKIE_SECURE` forces HTTPS in production.

## Round lifecycle

The admin controls one `Round` (row `number = 1`):

```text
IDLE --start--> ACTIVE --pause--> PAUSED --resume--> ACTIVE --end--> ENDED
ENDED --start--> ACTIVE   (restart: keeps config + scores, refreshes timing)
```

- `start` sets `startedAt` + `expiresAt` (`ROUND_DURATION_SECONDS`, default
  30 min).
- `resume` shifts `expiresAt` by the paused duration so pause time isn't
  counted.
- `assertCanStart(game)` blocks starting any game while the round is not
  `ACTIVE` or the game is disabled (`*Enabled` flags).
- Game-specific config (`wordleAnswer`, `cardsSeed`) is set before `start`;
  config changes are rejected while `ACTIVE`.
- The round is cached in Redis (`round:current`, TTL 5 s) and invalidated by
  every admin transition.

## Session & game flow

```text
Authenticate
   ↓
Round ACTIVE + game enabled
   ↓
start → create/re-open GameSession (one per team+game, unique constraint)
   ↓
store initial state in Redis (state:<sessionId>)
   ↓
player action → validate → apply → persist GameAction + idempotency response
   ↓
terminal (COMPLETED / TIMEOUT) → completeSession (idempotent) → persist result
   ↓
leaderboard reads terminal sessions
```

Key mechanics in `apps/api/src/sessions/sessions.service.ts`:

- `createSession` — exactly one row per `(teamId, game)`; re-opening an
  `ABANDONED` session resets it fresh; `COMPLETED`/`TIMEOUT` cannot restart.
- `withLock` — per-session Redis mutex so concurrent actions serialize; a busy
  session returns `409`.
- `cacheAction` / `getCached` — `clientActionId` idempotency keys; replays
  return the cached response, protecting against duplicate submissions and
  replay attacks.
- `completeSession` — atomic, idempotent finalization (unique `finishKey` for
  the finish request).
- `resetSession` — admin replay support; marks the session `ABANDONED` so
  `start` re-opens it.
- `isExpired` / `remainingTtl` — server-side expiry; the browser countdown is
  visual only. Expired sessions finalize as `TIMEOUT` with the score earned so
  far.

## Games

Each game under `apps/api/src/games/<game>/` contains its own controller,
service, module, domain logic (pure functions), DTOs, and tests. Rules and
scoring live in `docs/games.md`. Common traits:

- **Wordle** — 5-letter word, 6 attempts. WON = `1000 - (attempts-1) * 100`;
  LOST/TIMEOUT = 0. The answer is `Round.wordleAnswer` or a random pick cached
  per round in Redis; it is never exposed before submission.
- **Shadow** — 6 questions, 3 attempts each. 1st/2nd/3rd attempt correct =
  100/70/40; failed = 0. Correct answers live only in server state and are
  revealed after each question resolves.
- **Cards** — 50 pairs on a 100-card board. `100 × matchedPairs − 10 ×
  (moves − 2 × matchedPairs)`, floor 0 (perfect = 600). The board is a seeded
  shuffle (`cards.domain.mulberry32`) shared by every team; front assets are
  revealed only after a flip.

## Leaderboard

`apps/api/src/leaderboard` aggregates terminal sessions
(`COMPLETED`/`TIMEOUT`) per team with one ranked SQL query:
`SUM(score)` desc → `SUM(timeMs)` asc → team name asc. Only teams with at
least one terminal session appear. Cached in Redis
(`leaderboard:round:<id>`, TTL 5 s); `GET /me` computes a fresh ranking for
the authenticated team.

## Admin

`apps/api/src/admin` implements roster import, round lifecycle, and replay
resets. All routes require the admin cookie. Roster `code` doubles as the
lowercased player `accessCode`; imports reject case-colliding codes and
access-code clashes with existing teams.

## Concurrency & idempotency summary

| Threat | Defense |
|---|---|
| Duplicate submissions | `clientActionId` idempotency keys (Redis + unique `GameAction` row) |
| Concurrent actions on one session | per-session Redis lock |
| Double finalization | idempotent `completeSession` + unique `finishKey` |
| Restarting a finished game | `@@unique([teamId, game])` + terminal check |
| 500+ concurrent `start` | per-round Redis caches (deck/questions/answer/round) |
| Leaderboard stampede | short-TTL Redis cache, single SQL aggregate |
| Score/timer manipulation | all logic + timestamps server-side |

## Testing

- Unit tests for every domain and service (`*.spec.ts`), covering correct and
  incorrect answers, timeout, duplicates, invalid input, already-completed
  games, scoring, and boundaries.
- Before the event: load-test 100 → 250 → 500 → 750 → 1000 concurrent users.
  Target p95 < 300 ms, error rate < 1%.

### Load testing (k6)

`scripts/load/spiderman.js` is a k6 script that ramps to 1000 virtual users
against a running API. Each VU plays exactly one valid game (the API forbids
restarting a finished game, so teams must be fresh per run):

```sh
# run against a local API
docker run --rm \
  --add-host host.docker.internal:host-gateway \
  -v "$PWD/scripts/load:/scripts" \
  -e BASE_URL=http://host.docker.internal:4000/api \
  -e GAME=cards|wordle|shadow|leaderboard \
  -e ACCESS_PREFIX=load \
  -e EVENT_PIN="$(node -e '... read EVENT_PIN from .env ...')" \
  grafana/k6 run /scripts/spiderman.js
```

Notes learned from the first load-test round:

- Games are one-shot: a team that already started (or finished) a game gets
  `409` on `start`. Seed fresh teams (e.g. `load-1..load-1000` with access codes
  `load-N`, pinned by the current `EVENT_PIN`) and reset their sessions between
  scenarios. The deck/questions/round caches are per-round.
- k6 reads cookies via `response.cookies` (e.g.
  `res.cookies["spm_access_token"][0].value`), not `response.headers["set-cookie"]`.
- The throttler counts per IP — run k6 and the API on different hosts (or accept
  the shared NAT) so rate limiting does not skew results; raise `RATE_LIMIT_MAX`
  during load runs and restore it afterwards.
- The load generator must not share CPU/memory with the API. On a constrained
  Docker Desktop VM the k6 VUs starve the API and inflate p95; validate latency
  on an idle machine or the real deployment.

## Security

- Answers are never returned before submission (wordle answer, shadow correct
  answer, cards fronts).
- No secrets in the repo; all credentials via env vars (`apps/api/src/config/env.ts`).
- Rate limiting via `ThrottlerGuard` (`RATE_LIMIT_MAX` req/min per IP, default
  400). Limits are env-configurable; set `TRUST_PROXY=true` when deployed behind
  a CDN (e.g. Cloudflare) so per-client rate limiting uses `X-Forwarded-For`.
