# Design Context — Spider-Man IEEE Event Platform

Context for UI/UX designers working on the Spider-Man themed IEEE event
platform. Read this before designing screens so the work fits the product, the
players, and the technical constraints.

## What this is

An event web app for **500+ teams** playing a Spider-Man themed "Tech Escape
Round 1" at an IEEE event. Each team plays three mini-games on a shared web
session, earning points that feed a live leaderboard. It runs on a laptop or
phone in a physical venue — big screens, projectors, and busy rooms are the
normal environment.

The product has two audiences:

- **Players** — teams of students who sign in with a team code and a shared
  event PIN, play the three games, and check the leaderboard.
- **Admins** — event organizers who control the round (start/pause/resume/end),
  toggle games, import the team roster, and reset teams so they can replay.

## The player journey

1. **Login** (`/login`) — enter team code + event PIN.
2. **Home** (`/`) — team name/code header, a "round is live / not open yet"
   banner, and three game cards (Wordle, Guess the Shadow, Match the Cards),
   each showing its status (Not played / In progress / Completed / Timed out)
   and final score when finished.
3. **Game screens** (`/play/wordle`, `/play/shadow`, `/play/cards`) — play one
   game; a countdown timer for the round lives in the header.
4. **Leaderboard** (`/leaderboard`) — ranked teams, plus the team's own rank.

## The admin journey

1. **Admin login** (`/admin/login`) — username + password.
2. **Dashboard** (`/admin`) — round status controls (start / pause / resume /
   end), game on-off toggles, wordle answer + cards seed config, roster import,
   per-team session viewer, and team reset for replays.

## The three games

### Wordle — "Guess the 5-letter word"

- Classic Wordle: guess a hidden 5-letter word in **6 attempts**.
- Each guess gets per-letter feedback: correct (right letter + position),
  present (right letter, wrong position), absent.
- Guesses must be real words — the UI should show when a word is rejected.
- Scoring: winning on attempt 1 = 1000, dropping 100 per extra attempt
  (500 for a 6th-attempt win); lose or time out = 0.

### Guess the Character by Shadow

- **6 questions**, **3 attempts each**. A character silhouette image is shown
  with an answer option list.
- Pick the character: correct on attempt 1/2/3 scores 100/70/40; three wrong
  answers lock the question (0 points) and move on.
- The correct answer is revealed only **after** a question resolves — designers
  must not imply the answer is knowable up front.
- Max score 600.

### Match the Cards

- Memory match: **12 pairs on a 24-card board** (3 motifs × 4 colorways,
  all spider-hero themed).
- Flip two cards per attempt; matching pairs stay face-up, mismatches flip
  back. The server decides and tells the UI what happened.
- Score = `100 × pairs matched − 10 × extra moves`, floor 0. A perfect 24-move
  game scores 1200; mid-round timeout keeps the score earned so far.

## Rules and constraints that shape the UX

These are non-negotiable platform rules — designs must respect them.

- **The server is the boss.** All answers, state, attempts, timing and scores
  come from the API. The browser only renders what the server returns; the UI
  must never compute or guess outcomes.
- **The countdown is visual only.** The round runs 30 minutes (admin-configurable)
  and can be paused/resumed/ended by an admin. When the timer hits zero the
  game finalizes server-side as timed out — the UI should end gracefully and
  show the result the server returns, even mid-game.
- **Games are one-shot.** A team plays each game once. Finished games are locked;
  only an admin reset re-opens them. The home screen must clearly show what's
  played, what's in progress, and what's available.
- **Answers are hidden until the server reveals them.** The wordle answer, the
  shadow character, and card fronts must never appear in UI mockups as
  pre-known content. Shadow images and card art are loaded from CDN URLs the
  server returns per round.

## Current visual language

The app uses a **dark comic-book night scene** with Tailwind CSS, defined in the
design system at `docs/ui/DESIGN.md` (the source of truth for tokens and
components). Summary:

- Canvas `#0B0F1C` (near-black with a navy cast, never pure black) with a faint
  web-lattice texture and a soft red glow at the top of the page.
- **Spidey Red** `#E63A2E` is the single accent — primary CTAs, focus rings,
  live-round banners, highlights. Dark panels use a cool navy surface
  (`#121A2E`) with web-line borders (`#27324E`).
- **Display type:** Archivo Black for headings (comic impact, tight tracking);
  **body:** Outfit; **mono:** JetBrains Mono for the countdown, scores and team
  codes (tabular figures). Loaded via `next/font` with system fallbacks.
- Brand mark is an inline SVG spider logo — no emojis anywhere.
- Cards/boards responsive from mobile to large screens — the cards board
  uses a wider layout (`max-w-5xl`).

Shared components live in `packages/ui` and are used across screens:
`Button`, `Card`, `Timer`, `GameShell` (page shell with title + timer),
`Dialog`/`Modal`, `LoadingState` (spider-web spinner), `ErrorState`,
`Leaderboard`.

Current player routes: `/`, `/login`, `/play/wordle`, `/play/shadow`,
`/play/cards`, `/leaderboard`. Admin: `/admin/login`, `/admin`.

## Content and assets

- Game imagery (shadow character silhouettes, card fronts/back) is served from
  object storage + CDN — designers coordinate the asset URLs/paths, they are
  not in the app bundle.
- Spider-Man themed tone: heroic, playful, web-slinger aesthetic, but keep it
  legible in a bright event hall (high contrast, large type).

## Design principles

1. **Clarity under pressure** — players are in a loud room, possibly on phones.
   One glance must answer: "is the round live, what can I play, am I in
   progress?"
2. **Progress is always visible** — score, attempts left, timer, and
   played/in-progress/not-played states on every relevant screen.
3. **Never fake the game** — the UI renders server truth; designs should not
   imply client-side knowledge of answers or results.
4. **Mobile-first, big-screen ready** — game boards and the leaderboard scale
   up to projector-sized layouts.
5. **Consistent components** — reuse the shared UI kit so the whole app feels
   like one product.

## Related docs

- `docs/games.md` — full game rules and scoring (the source of truth).
- `docs/frontend.md` — API endpoints and integration contract for engineers.
- `docs/api.md` — authoritative backend endpoint reference.
