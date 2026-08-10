# Billiards — Tournament Control

A bracket manager built around how a billiards club night actually runs: two
(or more) tables, a queue that never stalls, results reported in one tap, and a
public board players can follow from a phone or a wall-mounted TV.

**Live:** https://tjblech.github.io/Billiards/
**Public board:** https://tjblech.github.io/Billiards/?public=1 — use this URL for the QR code.

---

## Design

The interface follows a **broadcast-operations** language, the way a live sports
control room looks:

- Near-black surfaces, hairline rules, flat panels. No glass, gradients or glow.
- **Exactly three signal colours.** Acid lime = next up / primary action.
  Broadcast red = live on a table. Everything else is greyscale. Nothing is
  coloured for decoration.
- Barlow Condensed for names (reads across a room), JetBrains Mono with tabular
  figures for anything numeric so digits never jitter.
- Square-ish 3px corners, uppercase micro-labels used sparingly.

Tokens live in `src/index.css` under `@theme`. Change a colour there and it
propagates everywhere.

---

## Running a night

**Floor** is the screen you actually work from. Every table is a card showing
who is on it and a live elapsed clock; the winner is one tap. The open table
offers the next match with a single **Send to table** button — you never have
to leave the screen to run the whole event.

**Matches** is the full list, grouped by on-the-tables / ready / waiting / done,
for when you need to reach past the queue.

**Standings** ranks by finish, with career club stats when they exist.

`Ctrl/Cmd + Z` undoes the last result. Everything saves to this browser as you go.

---

## Public board

One responsive view, two jobs:

- **Phone** — a pinned "you're up next" banner answers the only question players
  actually have, then bracket and standings below.
- **TV** — hit **TV** then **Full**. Names scale to the viewport, and **Auto**
  rotates tables → bracket → standings every 15 seconds so a wall screen stays
  useful unattended.

---

## Features

- 8-ball / 9-ball, singles / doubles, single or double elimination
- **1–6 tables**, configurable per tournament
- Queue that avoids scheduling anyone already playing, balances rest between
  matches, and interleaves winners/losers cards on double elimination
- Late arrivals (fill a bye, take an open slot, or replace a bye-advanced player)
- Rename or swap a player mid-bracket
- Balanced random doubles teams from a private ratings config, with locked pairs
- Undo history, text export, optional career club stats
- Zoomable bracket with fit-to-width

---

## Bugs fixed in this pass

| Issue | Effect |
|---|---|
| **Double elimination deadlocked whenever there were byes** | A losers-bracket match fed by a bye received a winner but no loser, so it sat `waiting` forever — the losers final never resolved and the grand final never filled. Any entrant count that wasn't a power of two could not finish. Fixed by resolving walkovers and void slots once all upstream results are settled, iterated to a fixed point. |
| **Byes counted as match wins** | Inflated both the night's standings and permanent career club stats. Byes are now excluded from win/loss counting. |
| **Standings ranked by raw win count** | A losers-bracket grinder outranked the actual champion because they played more games. Now ranked by finish first. |
| **"Fill bye" late entry never worked** | It looked for an *unfinished* bye, but byes auto-advance the moment the bracket is built, so no slot was ever found. Now accepts an auto-advanced bye as long as that player hasn't started their next match. |
| **Saving to club stats silently did nothing** | The guard read `statsSaved !== false`, which is true when the flag is `undefined` — i.e. for every tournament restored from an earlier save. |
| **Only two tables could ever be used** | The queue readied a hard-coded pair of matches. Now readies one per table. |
| **Missing `@keyframes slowPulse`** | A referenced animation was never defined, so the queue highlight did nothing. |
| **Dead code shipped to users** | Duplicate copies of the whole app at the repo root, a 1,739-line `App_working_backup.tsx` inside `src/` (compiled on every build), unused Vite template assets, and a committed `.tsbuildinfo`. |

Older saved tournaments are migrated on load, so nothing breaks on upgrade.

---

## Tech

React · TypeScript · Vite · Tailwind v4 · GitHub Pages

```
src/
  lib/tournament.ts   engine — brackets, queue, propagation, stats, storage. no React.
  ui/primitives.tsx   buttons, panels, chips, fields, modal, clock
  ui/Bracket.tsx      bracket board with zoom/fit
  ui/Console.tsx      table cards, queue, match control
  ui/Leaderboard.tsx  standings
  ui/Public.tsx       public / TV board
  App.tsx             admin shell + setup
```

## Development

```bash
npm install
npm run dev        # local server
npm test           # regression suite
npm run build      # typecheck + production build
```

`npm test` runs three suites against a jsdom DOM: the engine, a sweep of every
entrant count from 2–24 across both formats, 1–4 tables and two winner
strategies (≈750 simulated tournaments), and a UI smoke test that drives the
real app through building a bracket, sending matches to tables, reporting
results, undo, and every tab in both views.

## Deployment

GitHub Actions → GitHub Pages on push to `main`. Vite `base` is `/Billiards/`.

## Roadmap

- Supabase sync so the public board updates live across devices
- Race-to-N formats (`getRaceTo` in the engine is the seam)
- Richer placement labels beyond T-3rd / T-5th

## License

Currently unlicensed.
