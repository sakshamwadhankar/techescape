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

## Shadow

Directory: `apps/api/src/games/shadow/`

- `shadow.domain.ts` — pure logic (answer matching, scoring, resolution).
- `shadow.service.ts` — session orchestration + per-round Redis question cache.
- `shadow.controller.ts` — `POST /api/games/shadow/*`.

### Rules

- 6 rounds of "Guess the Character by Shadow", 3 attempts per question.
- Each question exposes an `assetUrl` (served from object storage/CDN, never
  through NestJS) and an answer `options` list. The correct answer lives only in
  server-side Redis state and is returned in the response **only when the team
  answers correctly** — wrong answers never reveal it.
- Answers are matched case-insensitively (`matchesAnswer`, trimmed + lowercased).
- A question resolves on a correct answer **or** when 3 wrong attempts are used;
  a failed question scores `0` and the game continues to the next question.
- The game completes when every question is resolved. Expiry → `TIMEOUT` with
  the score earned so far.
- The question set is stable for the whole round. The first `start` loads the
  active questions and caches them in Redis (`shadow:questions:round:<id>`), so
  500+ concurrent starts read from Redis, not Postgres.

### Scoring

```text
Per question:
  1st attempt correct:   100
  2nd attempt correct:    70
  3rd attempt correct:    40
  failed / timeout:        0

Session total = sum of question scores (max 600)
```

### API

| Endpoint | Body | Response |
|---|---|---|
| `POST /api/games/shadow/start` | `{}` | `ShadowStartResponse` |
| `POST /api/games/shadow/answer` | `{ questionId, answer, clientActionId }` | `ShadowAnswerResponse` |
| `POST /api/games/shadow/finish` | `{ clientActionId }` | `GameFinishResponse` |

`finish` finalizes an expired session as `TIMEOUT` and returns the stored
result for already-terminal sessions; it returns `409` while a game is still in
progress.

## Cards

Directory: `apps/api/src/games/cards/`

- `cards.domain.ts` — pure logic (seeded deck, flip state machine, scoring).
- `cards.service.ts` — session orchestration + per-round Redis deck cache.
- `cards.controller.ts` — `POST /api/games/cards/*`.

### Rules

- Memory match: 12 pairs on a 24-card board. Each pair is one distinct front
  asset; the deck is generated from `CARDS_DECK_SLUGS` (`c1`..`c12`, served as
  `.jpeg` files).
- A move is a single flip (`POST /move` with a `cardId`). Two face-up cards
  resolve an attempt: matching `pairId`s keep the pair face-up (`matched`),
  otherwise both flip back (`unmatchedFlipBack`).
- A card that is already matched or currently face-up cannot be flipped again
  (`409`). Card front assets are served from object storage/CDN and revealed
  only after a card is flipped — the server never sends them up front.
- The board is identical for every team: a seeded shuffle
  (`cards.domain.mulberry32`). The seed is `Round.cardsSeed`, or a one-time
  random pick cached in Redis (`cards:seed:round:<id>`) when unset. The built
  deck is cached per round (`cards:deck:round:<id>`) so 500+ concurrent starts
  read from Redis, not Postgres.
- Completing the last pair → `COMPLETED`. Expiry → `TIMEOUT` with the score
  earned so far.

### Scoring

```text
score = max(0, 100 × matchedPairs − 10 × max(0, moves − 2 × matchedPairs))
```

A perfect game is 24 moves → 1200. Each extra move costs 10 points (per pair
found); the score floors at 0. Mid-game (timeout) the formula credits the pairs
matched so far.

### API

| Endpoint | Body | Response |
|---|---|---|
| `POST /api/games/cards/start` | `{}` | `CardsStartResponse` |
| `POST /api/games/cards/move` | `{ cardId, clientActionId }` | `CardsMoveResponse` |
| `POST /api/games/cards/finish` | `{ clientActionId }` | `GameFinishResponse` |

`finish` finalizes an expired session as `TIMEOUT` and returns the stored
result for already-terminal sessions; it returns `409` while a game is still in
progress.

See `docs/api.md` for details.
