# Frontend API Integration

How `apps/web` talks to the NestJS API. This is the endpoint reference the
frontend team needs to integrate: authentication, session/player state, the
three games, the leaderboard and the admin dashboard.

`docs/api.md` is the authoritative full reference (backend-focused); this doc is
the same contract from the browser's point of view. A machine-readable
[OpenAPI 3.0 spec](../docs/openapi.json) is generated from the API and committed
at `docs/openapi.json` (regenerate with `pnpm openapi:gen`) — tools such as
Redoc, Swagger UI, or code generators can consume it directly.

## Conventions

### Base URL and CORS

All routes live under the `/api` prefix. The web app resolves the base from
`NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api`) in
`apps/web/src/lib/api.ts`. Cookies are sent with every request via
`credentials: "include"` — the browser must not run through a Next.js server
proxy, it calls the API directly (through the CDN in production).

### Cookies

Auth uses HTTP-only cookies; the frontend never reads or stores tokens.

- `spm_access_token` — player (set by `POST /auth/player/login`).
- `spm_admin_token` — admin (set by `POST /auth/admin/login`).

Because they are HTTP-only, the way to "know" you are logged in is to probe
`GET /auth/me` (player) or `GET /admin/round` (admin) and treat a `401` as
"not logged in" (`apps/web/src/lib/auth.ts`).

### Errors

Every error response uses the `ApiErrorBody` shape:

```json
{ "statusCode": 409, "error": "Conflict", "message": "..." }
```

`message` is a string or `string[]`. The web client (`apiFetch`) throws
`ApiError` with `.status` and `.details` — UI should map statuses:

| Status | Meaning for the UI |
|---|---|
| `400` | Bad input — show the message, let the player retry |
| `401` | Not authenticated — redirect to `/login` or `/admin/login` |
| `404` | No session — call `start` first |
| `409` | Conflict — round closed/paused, game disabled, session busy, or game already played |
| `429` | Rate limited — retry after a moment (`x-ratelimit-limit` header shows the window cap) |

### Idempotency keys (`clientActionId`)

Every mutating game action (`guess`, `answer`, `move`, `finish`, and `start`
for wordle) takes a `clientActionId`:

- 8–64 characters, alphanumeric + `-`.
- Generate a fresh key per user action, e.g. `actionId("guess")` →
  `guess-<uuid>` (`apps/web/src/lib/api.ts`).
- Replaying the same key returns the **cached response** — never a second
  mutation. This is what makes double-clicks and network retries safe.
- A `start` replayed with the same key is fine too (idempotent per team+game).

## Quick start

The web app already wraps every endpoint in `apps/web/src/lib/api.ts` (the
`api` object) and `apps/web/src/lib/auth.ts` (session hooks). Typical flow:

```ts
import { api, actionId } from "@/lib/api";

const { team } = await api.playerLogin(code, pin);
const status = await api.playerStatus(); // sessions + roundOpen
const { sessionId, expiresAt, questions } = await api.shadowStart();
const res = await api.shadowAnswer(qid, answer, actionId("ans"));
```

## Auth

| Endpoint | Auth | Description |
|---|---|---|
| `POST /auth/player/login` | — | `{ accessCode, pin }` → sets player cookie, returns team |
| `POST /auth/player/logout` | — | clears player cookie |
| `GET /auth/me` | player | returns the authenticated team |
| `POST /auth/admin/login` | — | `{ username, password }` → sets admin cookie |
| `POST /auth/admin/logout` | — | clears admin cookie |

### `POST /auth/player/login`

Body: `{ "accessCode": "teama", "pin": "1234" }`.

`accessCode` is the roster team code lowercased; `pin` is the shared event PIN.
`400` when the code or PIN is wrong.

```json
{ "team": { "id": "cmspz6z310001z9fcyi80n24h", "code": "teama", "name": "Team Alpha", "memberNames": ["A1", "A2"], "room": "A101" } }
```

### `POST /auth/player/logout`

Body: `{}`. Response: `{ "ok": true }`. Redirect to `/login`.

### `GET /auth/me`

Response: `{ "team": { ... } }` (same shape as login). `401` when not logged in.

### Admin auth

- `POST /auth/admin/login` — `{ "username": "...", "password": "..." }` →
  `{ "role": "admin" }`.
- `POST /auth/admin/logout` — `{}` → `{ "ok": true }`.
- Admin endpoints themselves return `401` when the admin cookie is missing.

## Player status

### `GET /players/me` (player)

The home screen's data source — team profile plus the per-game session status
and whether the round is live. `404` for a missing team is not expected after
login.

```json
{
  "team": { "id": "cmspz6z310001z9fcyi80n24h", "code": "teama", "name": "Team Alpha", "memberNames": ["A1", "A2"], "room": "A101" },
  "sessions": {
    "WORDLE":  { "game": "WORDLE",  "status": "ABANDONED",  "startedAt": null, "expiresAt": null, "finishedAt": null, "score": null },
    "SHADOW":  { "game": "SHADOW",  "status": "COMPLETED", "startedAt": "2026-08-12T12:00:00.000Z", "expiresAt": "2026-08-12T12:30:00.000Z", "finishedAt": "2026-08-12T12:05:00.000Z", "score": 240 },
    "CARDS":   { "game": "CARDS",   "status": "ACTIVE",     "startedAt": "2026-08-12T12:06:00.000Z", "expiresAt": "2026-08-12T12:36:00.000Z", "finishedAt": null, "score": null }
  },
  "roundOpen": true
}
```

`status` semantics for the UI:

| Status | UI |
|---|---|
| `ACTIVE` | In progress — offer "Resume" |
| `COMPLETED` | Played — show final score, disable the game |
| `TIMEOUT` | Round ended mid-game — show score (possibly `0`), disable |
| `ABANDONED` | Not started (or reset by admin) — offer "Play" |

`roundOpen` gates the Play buttons; when `false`, games stay disabled until the
admin starts the round.

## Wordle

Base: `/api/games/wordle` — all routes require the player cookie.

### `POST /start`

Body: `{}` (may include a `clientActionId`).

Starts or re-opens the team's Wordle session. Returns the session bounds —
**not** the answer (never sent to the browser).

```json
{ "sessionId": "cmspz6z310001z9fcyi80n24h", "expiresAt": "2026-08-12T12:30:00.000Z", "attemptsAllowed": 6, "wordLength": 5 }
```

Errors: `409` when the round is closed/paused, the game is disabled, or the game
was already completed.

### `POST /guess`

Body: `{ "guess": "crane", "clientActionId": "guess-<uuid>" }`.

- `guess` must be exactly 5 letters and a real dictionary word → else `400`.
- The response is feedback only; the answer is never returned.

```json
{
  "guessCount": 1,
  "attemptsLeft": 5,
  "feedback": [
    { "letter": "c", "status": "correct" },
    { "letter": "r", "status": "present" },
    { "letter": "a", "status": "absent" }
  ],
  "wordleStatus": "IN_PROGRESS"
}
```

`wordleStatus`: `IN_PROGRESS` | `WON` | `LOST` | `TIMEOUT`.

- Winning or losing guess → terminal; the stored score applies.
- Expiry is reported as `wordleStatus: "TIMEOUT"` (score `0`).

Errors: `400` invalid word/`clientActionId`; `404` no session (call `start`
first); `409` busy lock or already completed.

### `POST /finish`

Body: `{ "clientActionId": "finish-<uuid>" }`.

Call this once the status is terminal, or when the countdown hits zero.

- Expired but not yet terminal → finalized as `TIMEOUT`; returns `{ score: 0, timeMs }`.
- Already terminal → returns the stored `{ score, timeMs }`.
- Still in progress and not expired → `409` (do not call yet).

```json
{ "score": 800, "timeMs": 93211 }
```

## Shadow

Base: `/api/games/shadow` — all routes require the player cookie.

### `POST /start`

Body: `{}`.

Starts or re-opens the team's Shadow session and returns the round's questions
in order. `options` includes the correct answer; the server returns the correct
answer only when a submission is correct.

```json
{
  "sessionId": "cmsq0oc4x0001z9xr2ztd9ryf",
  "expiresAt": "2026-08-12T12:30:00.000Z",
  "maxAttemptsPerQuestion": 3,
  "questions": [
    { "id": "cmspxk2y30006z963kwd5pf5a", "assetUrl": "https://cdn.example.com/shadow/black-cat.webp", "options": ["Spider-Man", "Black Cat", "Venom"] }
  ]
}
```

Errors: `409` when the round is closed/paused, game disabled, already completed,
or no shadow questions configured.

### `POST /answer`

Body:

```json
{ "questionId": "cmspxk2y30006z963kwd5pf5a", "answer": "Black Cat", "clientActionId": "ans-<uuid>" }
```

Answers are matched case-insensitively and trimmed. The response reports
scoring/attempts; `correctAnswer` is returned only when the submitted answer is
correct (`""` on wrong answers, never revealed):

```json
{
  "questionId": "cmspxk2y30006z963kwd5pf5a",
  "questionIndex": 0,
  "correct": true,
  "correctAnswer": "Black Cat",
  "attemptsUsed": 1,
  "attemptsLeft": 2,
  "questionScore": 100,
  "totalCorrect": 1,
  "questionCount": 6,
  "status": "IN_PROGRESS"
}
```

`status`: `IN_PROGRESS` | `COMPLETED` | `TIMEOUT`.

- Correct on attempts 1/2/3 scores `100`/`70`/`40`; a question locked after 3
  wrong attempts scores `0` and the game moves on.
- The last question resolving flips `status` to `COMPLETED`.
- Expiry → `status: "TIMEOUT"` (score earned so far is kept).

Errors: `400` unknown `questionId`/malformed body; `404` no session; `409`
question already resolved, attempts exhausted, busy lock, or already completed.

### `POST /finish`

Body: `{ "clientActionId": "finish-<uuid>" }`.

Same contract as Wordle `finish`: `{ score, timeMs }`, `409` while still in
progress and not expired.

## Cards

Base: `/api/games/cards` — all routes require the player cookie.

### `POST /start`

Body: `{}`.

Starts or re-opens the team's Cards session. Returns the 100 board positions
**ids only** — front assets are never sent up front (only the shared back
asset).

```json
{
  "sessionId": "cmsq17znv0001z9efllqoqgqx",
  "expiresAt": "2026-08-12T12:30:00.000Z",
  "cards": [ { "id": "a00c6eca-b097-430c-b799-b1fdcf6a22e1", "index": 0 } ],
  "backAssetUrl": "https://cdn.example.com/assets/cards/back.svg"
}
```

Errors: `409` when the round is closed/paused, game disabled, or already
completed.

### `POST /move`

Body: `{ "cardId": "a00c6eca-b097-430c-b799-b1fdcf6a22e1", "clientActionId": "m-<uuid>" }`.

A move flips one card; the front asset is returned only for that card on flip:

```json
{
  "moveId": "m-<uuid>",
  "cardId": "a00c6eca-b097-430c-b799-b1fdcf6a22e1",
  "frontAssetUrl": "https://cdn.example.com/assets/cards/black-cat.svg",
  "revealed": true,
  "matched": false,
  "matchCompleted": false,
  "unmatchedFlipBack": false,
  "state": {
    "moves": 1,
    "revealed": [0],
    "matched": [],
    "matchedPairs": 0,
    "totalPairs": 50,
    "status": "IN_PROGRESS"
  }
}
```

Read the flip flags to drive the animation:
- `revealed: true` — first card of an attempt, now face-up.
- `matched: true` + `matchCompleted: true` — this flip resolved a pair; both
  cards stay face-up.
- `unmatchedFlipBack: true` — mismatch; both cards flip back.

`state.revealed` are the currently face-up (unmatched) card indices;
`state.matched` are the matched card indices. `state.status`:
`IN_PROGRESS` | `COMPLETED` | `TIMEOUT`; the last pair completes the game.

Errors: `400` unknown `cardId`/malformed body; `404` no session; `409` card
already matched/revealed, busy lock, or already completed.

### `POST /finish`

Body: `{ "clientActionId": "finish-<uuid>" }`.

Same contract: `{ score, timeMs }`, `409` while still in progress and not
expired.

## Leaderboard

| Endpoint | Auth | Description |
|---|---|---|
| `GET /leaderboard?limit=50` | public | top ranked teams (`limit` 1–100, default 50) |
| `GET /leaderboard/me` | player | the team's rank + entry |

```json
{
  "entries": [
    { "rank": 1, "teamCode": "teama", "teamName": "Team Alpha", "totalScore": 1000, "totalTimeMs": 36, "gamesCompleted": 1 }
  ],
  "totalTeams": 2
}
```

`GET /leaderboard/me` → `{ "rank": 1, "entry": { ... } }`, or
`{ "rank": null, "entry": null }` when the team hasn't finished any game. Order:
total score desc, then total time asc, then team name asc.

## Admin

All admin routes require the admin cookie. `401` when missing.

| Endpoint | Description |
|---|---|
| `GET /admin/round` | round status + config (also used as the admin "am I logged in" probe) |
| `POST /admin/round/config` | update game toggles / `wordleAnswer` / `cardsSeed` |
| `POST /admin/round/start` | `IDLE`/`ENDED` → `ACTIVE` (restart after a round ends) |
| `POST /admin/round/pause` | `ACTIVE` → `PAUSED` |
| `POST /admin/round/resume` | `PAUSED` → `ACTIVE` (pause time is not counted) |
| `POST /admin/round/end` | `ACTIVE`/`PAUSED` → `ENDED` |
| `POST /admin/roster/import` | upsert teams from `{ teams: [...] }` |
| `GET /admin/teams` | roster with per-game session rows |
| `POST /admin/teams/reset` | allow a team to replay a finished game |

### `GET /admin/round`

```json
{
  "number": 1,
  "status": "IDLE",
  "startedAt": null,
  "pausedAt": null,
  "expiresAt": null,
  "wordleEnabled": true,
  "shadowEnabled": true,
  "cardsEnabled": true,
  "wordleAnswer": null,
  "cardsSeed": null
}
```

### `POST /admin/round/config`

Body (any subset; `null` clears `wordleAnswer`/`cardsSeed`):

```json
{ "wordleEnabled": true, "shadowEnabled": true, "cardsEnabled": true, "wordleAnswer": "spide", "cardsSeed": 123 }
```

`wordleAnswer` must be exactly 5 letters; `cardsSeed` a positive int. `409`
while the round is `ACTIVE` (config is locked during a live round).

### `POST /admin/round/start|pause|resume|end`

No body. Each validates the current status and returns the updated round (same
shape as `GET /admin/round`). `start` also resets `expiresAt` to now +
`ROUND_DURATION_SECONDS` (default 30 min); `resume` shifts `expiresAt` by the
paused duration.

### `POST /admin/roster/import`

Body:

```json
{ "teams": [ { "code": "TEAMA", "name": "Team Alpha", "memberNames": ["A1", "A2"], "room": "A101" } ] }
```

`code` becomes the player's lowercased `accessCode`. Re-importing an existing
code updates it; `400` on case-colliding codes. Response:

```json
{ "created": 2, "updated": 0, "total": 2 }
```

### `GET /admin/teams`

Every team with its sessions (`game`, `status`, timestamps, `score`, `timeMs`)
and a `totalScore` sum.

### `POST /admin/teams/reset`

Body: `{ "teamId": "<cuid>", "game": "WORDLE" | "SHADOW" | "CARDS" | undefined }`.

Resets finished (`COMPLETED`/`TIMEOUT`) sessions so the team can replay;
in-progress sessions are untouched. Response: `{ "reset": 1 }`.

## Integration checklist

- **Countdown is visual only.** The server's `expiresAt` is authoritative. When
  it hits zero, call `finish`; the server finalizes as `TIMEOUT`. Never trust a
  client-side clock for scoring.
- **Call `start` before any action** (`404` otherwise), and **`finish` after a
  terminal status or on expiry** (`409` while still in progress).
- **Games are one-shot.** A completed game returns `409` on `start`; replay is
  only possible after an admin team reset. Gate the Play button on
  `sessions[game].status`.
- **Generate a fresh `clientActionId` per action.** Never reuse one for a
  different action — a replayed key returns the cached (previous) response.
- **Render state from server responses** — feedback, revealed/matched cards,
  resolved questions, scores. The browser never computes outcomes.
- **Never request or display answers** — wordle answers, shadow correct
  answers, and card fronts arrive only via server responses; card/shadow assets
  load from the CDN URLs the server returns.
- **Handle `409` and `429` gracefully** — disable actions while a request is
  in flight, show round-closed messages when `roundOpen` is `false`, and keep a
  "round is live" indicator.
