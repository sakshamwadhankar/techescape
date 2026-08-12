# API

NestJS API at `apps/api/src`. All routes are under the `/api` prefix and
protected by `ThrottlerGuard` (400 req/min default).

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
