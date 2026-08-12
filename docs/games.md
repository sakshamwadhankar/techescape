# Games

Architecture and rules for the three Round-1 games: **Wordle**, **Guess the
Character by Shadow** and **Match the Cards**.

All game logic lives in `apps/api/src/games/<game>/`. Games are played through
a shared session lifecycle provided by `SessionsService`
(`apps/api/src/sessions/`). The browser is only responsible for presentation —
the server is authoritative for answers, state, attempts, timing and scores.

## Shared lifecycle

```text
Authenticate (JwtAuthGuard)
    → start (RoundService.assertCanStart + SessionsService.createSession)
    → action (SessionsService.withLock + readState/writeState)
    → terminal (SessionsService.completeSession)
```

Key guarantees, all enforced server-side:

- One `GameSession` per `(teamId, game)` — `@@unique([teamId, game])`.
- Per-session mutex (`withLock`, Redis) prevents concurrent action races; a
  busy lock surfaces as `409 Conflict`.
- Every action is replayed safely via `clientActionId`
  (`getCached`/`cacheAction`, Redis). Duplicate submissions return the cached
  response, never a second mutation.
- Every action is audited in `GameAction` (type, payload, result).
- Expiry uses server time (`expiresAt`). On expiry a session is finalized as
  `TIMEOUT` with score `0`; the browser countdown is visual only.
- Completion is idempotent: `completeSession` keys on `finishKey` (unique) and
  is a no-op when the session is already terminal.
- Game state lives in Redis (`state:<sessionId>`); answers are **never**
  returned to the client.

## Wordle

Directory: `apps/api/src/games/wordle/`

- `wordle.domain.ts` — pure logic (feedback, dictionary, scoring, answer pick).
- `wordle.service.ts` — session orchestration.
- `wordle.controller.ts` — `POST /api/games/wordle/*`.

### Rules

- 5-letter word, 6 guesses.
- Feedback per tile: `correct` (right letter + position), `present` (right
  letter, wrong position), `absent`. Duplicate letters are handled with
  standard Wordle rules (each answer letter is consumed at most once).
- Guesses must be real words from `an-array-of-english-words`
  (~12.6k five-letter words), else `400`.
- The answer is stable for the whole round, per `Round.wordleAnswer` when set.
  If unset, the first `start` picks a random word and caches it in Redis
  (`wordle:answer:round:<id>`) so every team sees the same word.
- Win → `COMPLETED`; run out of attempts → `COMPLETED` with score `0`; expiry →
  `TIMEOUT` with score `0`.

### Scoring

```text
WON:   1000 - (attemptsUsed - 1) * 100   (min 0, capped at 1000)
LOST:  0
TIMEOUT: 0
```

First-attempt win = 1000; a 6-attempt win = 500.

### API

| Endpoint | Body | Response |
|---|---|---|
| `POST /api/games/wordle/start` | `{}` | `WordleStartResponse` |
| `POST /api/games/wordle/guess` | `{ guess, clientActionId }` | `WordleGuessResponse` |
| `POST /api/games/wordle/finish` | `{ clientActionId }` | `GameFinishResponse` |

`finish` finalizes an expired session as `TIMEOUT` and returns the stored
result for already-terminal sessions; it returns `409` while a game is still in
progress.

See `docs/api.md` for details.
