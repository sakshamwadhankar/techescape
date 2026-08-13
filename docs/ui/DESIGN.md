# Design System: Spider-Man Tech Escape

The visual language for the Spider-Man themed IEEE event platform — the "Tech
Escape Round 1" web app players and admins use during the event. Read this
together with `docs/design.md` (product + player-journey context) and
`docs/frontend.md` (the API contract the UI renders).

This system is the single source of truth for how the app looks. Screens must
render server truth (`docs/design.md` → "Rules and constraints"), so this
document only governs presentation — never behavior, answers, or scores.

## 1. Visual Theme & Atmosphere

A cinematic, dark comic-book night scene. A near-black navy canvas with a faint
web lattice texture, lit by a soft red glow — the web-slinger energy of the
brand. One punchy accent red drives every action; deep charcoal-navy panels with
cool web-line borders carry content. Bold, heavy display type with an
impact-comic character keeps headings loud but legible in a bright, noisy event
hall.

- **Density:** Balanced (5–6/10). Game boards are dense; pages breathe.
- **Variance:** Offset (6/10). Asymmetric page heroes, game cards carry status
  ribbons, panels stay aligned.
- **Motion:** Fluid (5/10). Tactile button presses, gentle card lifts, a
  breathing timer. Nothing spins for its own sake.

One glance must answer: *is the round live, what can I play, am I in progress?*
High contrast, large type, and a strict single-accent palette make that answer
instant — even on a phone in a loud room.

## 2. Color Palette & Roles

- **Ink Night** `#0B0F1C` — page canvas (near-black with a navy cast; never pure
  black). Surface for the web lattice + red glow.
- **Night Panel** `#121A2E` — cards, panels, tables, list rows.
- **Raised Panel** `#1A2440` — inputs, hovered rows, elevated surfaces, keycaps.
- **Web Line** `#27324E` — 1px borders and dividers (a cool "webbing" grey-blue).
- **Ghost Text** `#97A1B8` — secondary text, labels, descriptions.
- **Faint Text** `#5D6880` — tertiary/metadata, timestamps, codes.
- **Spidey Red** `#E63A2E` — the single accent. Primary CTAs, active states,
  focus rings, live-round banners, "You" highlight, brand moments.
- **Spidey Red Bright** `#FF5147` — hover / pressed-feedback accent.
- **Spidey Red Deep** `#7C1713` — tinted error/success-of-red panels, danger
  surfaces, red-adjacent feedback backgrounds.
- **Web Smoke** `rgba(255,255,255,0.05)` — the lattice texture stroke.

Semantic game feedback (Wordle correct/present/absent, Shadow correct/wrong,
Cards matched) uses the functional Tailwind green/amber scale — those are game
meanings, not theme accents, and stay readable on the dark panels.

**Rules:** max one accent (red). No purple, no neon, no cyan. Never pure black.

## 3. Typography

- **Display:** Archivo Black (single weight, 400) — heavy comic-impact headings
  for the brand, page titles, and game titles. Tight tracking
  (`tracking-tight`), use weight + size for hierarchy, not decoration.
- **Body:** Outfit — clean geometric sans, relaxed leading, `65ch` max line
  width for prose.
- **Mono:** JetBrains Mono — timers, scores, team codes, seeds, tabular figures
  (countdown uses `tabular-nums`).
- **Fallbacks:** `ui-sans-serif, system-ui, sans-serif` / `ui-monospace` — the
  app must stay legible if a custom face is unavailable.
- **Banned:** Inter, generic serifs, script fonts.

## 4. Component Stylings

* **Buttons:** Rounded (`rounded-lg`). Primary = Spidey Red fill with white
  text; tactile press (`active:translate-y-px`). Secondary = Raised Panel fill.
  Ghost = transparent, web-line hover. Disabled = muted, no glow. Never an outer
  glow or custom cursor.
* **Cards / Panels:** `rounded-xl`, Night Panel fill, Web Line border, soft tinted
  shadow. Panels carry a top accent notch (Spidey Red hairline) when they lead
  the page. Used where elevation helps hierarchy; tables replace cards at high
  density.
* **Inputs:** Label above, helper below, error below. Dark fill (Raised Panel on
  Night), Web Line border, Spidey Red focus ring. No floating labels.
* **Timer:** Dark chip (Night Panel, Web Line border), JetBrains Mono tabular
  digits, red when under 30s.
* **Loaders:** Branded spider-web spinner, not a generic ring.
* **Empty / Error states:** Composed comic panels — clear title, action, and a
  spider-web motif where it helps, never bare "No data" text.
* **Status chips:** Pills with tinted backgrounds — `ACTIVE` green, `PAUSED`
  amber, `ENDED`/`COMPLETED` red-tinted, `IDLE`/`ABANDONED` ghost.

## 5. Layout Principles

- Grid-first; CSS Grid over flexbox math. No `calc()` percentage hacks.
- Contain layouts: pages `max-w-3xl`, game boards `max-w-5xl`, centered.
- Full-height pages use `min-h-dvh` (never `h-screen`).
- Below `768px` everything collapses to a single column; no horizontal scroll.
- Game status is always visible on every relevant screen (home cards, game
  shells, timer in header).
- Home hero is left-aligned / offset, never a centered generic hero.
- Touch targets ≥ 44px; all interactive elements keyboard-focusable with a
  visible Spidey Red focus ring.

## 6. Motion & Interaction

- Animate only `transform` and `opacity` (hardware-accelerated).
- Buttons: `active:translate-y-px` tactile feedback.
- Cards: subtle lift on hover (`hover:-translate-y-0.5`).
- Timer: low-opacity red pulse when the round is about to expire (< 30s).
- Reveals: stagger card grids with small cascade delays; never mount lists in a
  single frame.
- Perpetual micro-interaction: the background web lattice is static (no noisy
  loops) — the only infinite animation is the page loader spinner and the
  low-time timer pulse.

## 7. Anti-Patterns (Banned)

- No emojis anywhere — use inline SVG icons (spider logo, web motif).
- No `Inter`, no generic serifs, no script fonts.
- No pure black `#000000`.
- No neon/outer-glow shadows, no purple/blue-neon gradients.
- No gradient text on large headers.
- No custom mouse cursors.
- No overlapping elements; clean spatial separation.
- No 3-column "equal card" feature rows unless the content is genuinely 3 items
  (the three games are — they still vary by status ribbon and accent).
- No fake names ("John Doe"), no fake round numbers, no invented metrics.
- No AI copywriting clichés ("Elevate", "Seamless", "Unleash", "Next-Gen").
- No filler UI text ("Scroll to explore", bouncing chevrons).
- No broken image links — game assets come from the CDN URLs the server returns.
