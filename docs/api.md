# API

NestJS API at `apps/api/src`. All routes are under the `/api` prefix and
protected by `ThrottlerGuard` (`RATE_LIMIT_MAX` req/min per IP, default 400,
window `RATE_LIMIT_TTL` seconds).

Frontend engineers integrating the browser app: see
[docs/frontend.md](frontend.md) for the same contract from the client's point
of view. UI/UX designers: see [docs/design.md](design.md).

## OpenAPI spec

A machine-readable OpenAPI 3.0 document is generated from the controllers and
committed at `docs/openapi.json` (26 paths, all request/response schemas,
cookie security schemes, `servers: [{ url: "/api" }]`). Regenerate it after any
API change:

```sh
pnpm openapi:gen          # or pnpm --filter @spiderman/api openapi:gen
```

The spec is built offline (no Postgres/Redis needed) from the Swagger
decorators on each controller. Optionally serve interactive Swagger UI by
setting `ENABLE_SWAGGER=true` in `.env` — it is mounted at `/api/docs`.
**Keep `ENABLE_SWAGGER` off in production.**

Authentication uses HTTP-only cookies:
- `spm_access_token` — player (issued by `POST /api/auth/player/login`).
- `spm_admin_token` — admin (issued by `POST /api/auth/admin/login`).

Error responses follow `ApiErrorBody`:
`{ statusCode, error, message }` where `message` is a string or string[].

## Auth

| Endpoint | Auth | Description |
|---|---|---|
| `POST /api/auth/player/login` | — | `{ accessCode, pin }` → sets player cookie, returns team |
| `POST /api/auth/player/logout` | — | clears player cookie |
| `GET /api/auth/me` | player | returns the authenticated team |
| `POST /api/auth/admin/login` | — | `{ username, password }` → sets admin cookie |
| `POST /api/auth/admin/logout` | — | clears admin cookie |

## Players

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/players/me` | player | team profile + per-game session status + `roundOpen` |

## Wordle

Base: `/api/games/wordle` — all routes require the player cookie.

### `POST /start`

Body: `{}` (optional `clientActionId`).

Starts (or re-opens) the Wordle session for the team. Idempotent per
`(teamId, game)`: while a session is `ACTIVE` the same one is returned; a
completed game cannot be restarted.

```json
{
  "sessionId": "cmspz6z310001z9fcyi80n24h",
  "expiresAt": "2026-08-12T11:03:01.865Z",
  "attemptsAllowed": 6,
  "wordLength": 5
}
```

Errors: `409` when the round is closed/paused, the game is disabled, or the
game was already completed.

### `POST /guess`

Body:

```json
{ "guess": "crane", "clientActionId": "cli-0001" }
```

`guess` must be exactly 5 letters (validated + lowercased by
`wordleGuessSchema`) and a real dictionary word. `clientActionId` is the
idempotency key (8–64 chars, alphanumeric + `-`).

The answer is resolved from `Round.wordleAnswer` (or the per-round cached pick)
and **never** returned. Feedback only.

```json
{
  "guessCount": 1,
  "attemptsLeft": 5,
  "feedback": [
    { "letter": "c", "status": "correct" },
    { "letter": "r", "status": "correct" }
  ],
  "wordleStatus": "IN_PROGRESS"
}
```

`wordleStatus`: `IN_PROGRESS` | `WON` | `LOST` | `TIMEOUT`.

Errors:
- `400` — invalid word, wrong length, or malformed `clientActionId`.
- `409` — session busy (lock), game already completed.
- `404` — no session for this team (start first).

On `WON`/`LOST` the session is finalized with the terminal score; on expiry the
session is finalized as `TIMEOUT` (score `0`) and the response carries
`wordleStatus: "TIMEOUT"`.

### `POST /finish`

Body: `{ "clientActionId": "fin-0001" }`.

- Expired session → finalized as `TIMEOUT`; returns `{ score: 0, timeMs }`.
- Already terminal → returns the stored `{ score, timeMs }`.
- In progress and not expired → `409 Conflict`.

```json
{ "score": 0, "timeMs": 299123 }
```

## Shadow

Base: `/api/games/shadow` — all routes require the player cookie.

### `POST /start`

Body: `{}`.

Starts (or re-opens) the Shadow session for the team. Idempotent per
`(teamId, game)`: while a session is `ACTIVE` the same one is returned; a
completed game cannot be restarted.

Returns the session plus the round's questions (ordered by slug, cached in
Redis after the first load). Answers are **not** included.

```json
{
  "sessionId": "cmsq0oc4x0001z9xr2ztd9ryf",
  "expiresAt": "2026-08-12T12:10:00.000Z",
  "maxAttemptsPerQuestion": 3,
  "questions": [
    {
      "id": "cmspxk2y30006z963kwd5pf5a",
      "assetUrl": "https://cdn.example.com/shadow/black-cat.webp",
      "options": ["Spider-Man", "Black Cat", "Venom"]
    }
  ]
}
```

Errors: `409` when the round is closed/paused, the game is disabled, the game
was already completed, or no shadow questions are configured.

### `POST /answer`

Body:

```json
{
  "questionId": "cmspxk2y30006z963kwd5pf5a",
  "answer": "Black Cat",
  "clientActionId": "ans-0001"
}
```

`answer` is trimmed and matched case-insensitively. `clientActionId` is the
idempotency key (8–64 chars, alphanumeric + `-`); replaying one returns the
cached response.

The correct answer is revealed only after the question resolves.

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

- A correct answer scores `100`/`70`/`40` on attempts 1/2/3.
- After 3 wrong attempts the question locks (`correct: false`, score `0`) and
  the game moves on.
- The final question resolves the whole game → `status: "COMPLETED"`; the total
  score is persisted on the session.
- On expiry → `status: "TIMEOUT"` and the session is finalized with the score
  earned so far.

Errors:
- `400` — unknown `questionId` or malformed body.
- `409` — question already resolved, attempts exhausted, session busy (lock),
  or game already completed.
- `404` — no session for this team (start first).

### `POST /finish`

Body: `{ "clientActionId": "fin-0001" }`.

- Expired session → finalized as `TIMEOUT`; returns `{ score, timeMs }` with the
  score earned so far.
- Already terminal → returns the stored `{ score, timeMs }`.
- In progress and not expired → `409 Conflict`.

```json
{ "score": 600, "timeMs": 328 }
```

## Cards

Base: `/api/games/cards` — all routes require the player cookie.

### `POST /start`

Body: `{}`.

Starts (or re-opens) the Cards session for the team. Idempotent per
`(teamId, game)`: while a session is `ACTIVE` the same one is returned; a
completed game cannot be restarted.

Returns the round's 100 card positions (ids only — fronts are hidden) plus the
shared back asset. The layout is the same for every team (seeded shuffle, deck
cached in Redis after the first load).

```json
{
  "sessionId": "cmsq17znv0001z9efllqoqgqx",
  "expiresAt": "2026-08-12T12:10:00.000Z",
  "cards": [
    { "id": "a00c6eca-b097-430c-b799-b1fdcf6a22e1", "index": 0 }
  ],
  "backAssetUrl": "https://cdn.example.com/assets/cards/back.svg"
}
```

Errors: `409` when the round is closed/paused, the game is disabled, or the
game was already completed.

### `POST /move`

Body:

```json
{ "cardId": "a00c6eca-b097-430c-b799-b1fdcf6a22e1", "clientActionId": "m1" }
```

`cardId` must be a uuid of one of the board cards. `clientActionId` is the
idempotency key (8–64 chars, alphanumeric + `-`); replaying one returns the
cached response.

A move flips one card. The front asset is revealed only on a flip.

```json
{
  "moveId": "m1",
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
    "totalPairs": 6,
    "status": "IN_PROGRESS"
  }
}
```

Response flags per flip:
- `revealed: true` — the flipped card is now face-up (first card of an attempt).
- `matched: true` + `matchCompleted: true` — the flip resolved a pair; both
  cards stay face-up.
- `unmatchedFlipBack: true` — the attempt mismatched; both cards flip back.

`state.status`: `IN_PROGRESS` | `COMPLETED` | `TIMEOUT`. The final pair
resolves the whole game → `COMPLETED` and the total score is persisted.

Errors:
- `400` — unknown `cardId` or malformed body.
- `409` — card already matched, card already revealed, session busy (lock), or
  game already completed.
- `404` — no session for this team (start first).

### `POST /finish`

Body: `{ "clientActionId": "fin-0001" }`.

- Expired session → finalized as `TIMEOUT`; returns `{ score, timeMs }` with the
  score earned so far.
- Already terminal → returns the stored `{ score, timeMs }`.
- In progress and not expired → `409 Conflict`.

```json
{ "score": 360, "timeMs": 63147 }
```

## Leaderboard

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/leaderboard?limit=50` | public | top ranked teams (limit 1–100, default 50) |
| `GET /api/leaderboard/me` | player | the team's rank + entry |

The leaderboard aggregates terminal sessions (`COMPLETED` and `TIMEOUT`) per
team: `totalScore` = sum of scores, `totalTimeMs` = sum of timeMs,
`gamesCompleted` = count of terminal games. Teams with no terminal session do
not appear. Order: `totalScore` desc, then `totalTimeMs` asc, then team name
asc; `rank` is 1-based.

```json
{
  "entries": [
    { "rank": 1, "teamCode": "TEAMA", "teamName": "Team Alpha", "totalScore": 1000, "totalTimeMs": 36, "gamesCompleted": 1 }
  ],
  "totalTeams": 2
}
```

Results are cached in Redis (`leaderboard:round:<id>`) for a few seconds so
concurrent reads don't hit Postgres. `GET /me` computes a fresh full ranking
for the authenticated team:

```json
{ "rank": 1, "entry": { "rank": 1, "teamCode": "TEAMA", "teamName": "Team Alpha", "totalScore": 1000, "totalTimeMs": 36, "gamesCompleted": 1 } }
```

`{ "rank": null, "entry": null }` when the team has not finished any game.

## Admin

All admin routes are under `/api/admin` and require the admin cookie
(`AdminAuthGuard`).

| Endpoint | Description |
|---|---|
| `POST /api/admin/roster/import` | upsert teams from `{ teams: [...] }` |
| `GET /api/admin/round` | round status + config |
| `POST /api/admin/round/config` | update game toggles / `wordleAnswer` / `cardsSeed` |
| `POST /api/admin/round/start` | `IDLE`/`ENDED` → `ACTIVE` (restart after a round ends) |
| `POST /api/admin/round/pause` | `ACTIVE` → `PAUSED` |
| `POST /api/admin/round/resume` | `PAUSED` → `ACTIVE`, extends expiry by the pause |
| `POST /api/admin/round/end` | `ACTIVE`/`PAUSED` → `ENDED` |
| `GET /api/admin/teams` | roster with per-game session rows |
| `POST /api/admin/teams/reset` | allow a team to replay a finished game |

### `POST /roster/import`

Body:

```json
{
  "teams": [
    { "code": "TEAMA", "name": "Team Alpha", "memberNames": ["A1", "A2"], "room": "A101" }
  ]
}
```

`code` becomes the player's `accessCode` (lowercased) used with `EVENT_PIN` at
login. Re-importing an existing `code` updates its name/members/room; unchanged
rows are skipped. Errors:
- `400` — two codes lowercasing to the same access code, or a code whose access
  code already belongs to a different team.

Response:

```json
{ "created": 2, "updated": 0, "total": 2 }
```

### `GET /round`

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

### `POST /round/config`

Body (any subset):

```json
{
  "wordleEnabled": true,
  "shadowEnabled": true,
  "cardsEnabled": true,
  "wordleAnswer": "spide",
  "cardsSeed": 123
}
```

`wordleAnswer` must be exactly 5 letters (lowercased); `cardsSeed` must be a
positive int. Pass `null` to clear either. Returns the updated round. `409`
while the round is `ACTIVE`.

### `POST /round/start|pause|resume|end`

No body. Each validates the current status and returns the updated round:
- `start` from `IDLE` or `ENDED` (restart); sets `startedAt` + `expiresAt`
  (`ROUND_DURATION_SECONDS`, default 30 min).
- `pause` only from `ACTIVE`; records `pausedAt`.
- `resume` only from `PAUSED`; shifts `expiresAt` by the pause duration so
  paused time is not counted.
- `end` only from `ACTIVE`/`PAUSED`.

All transitions invalidate the cached round so players see the new state.

### `GET /teams`

Every team with its sessions (game, status, timestamps, score, timeMs) and a
`totalScore` sum.

### `POST /teams/reset`

Body: `{ "teamId": "<cuid>", "game": "WORDLE" | "SHADOW" | "CARDS" | undefined }`.

Marks finished sessions (`COMPLETED`/`TIMEOUT`) `ABANDONED` and clears their
state, so the team can replay (in-progress sessions are untouched).

```json
{ "reset": 1 }
```
