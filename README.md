# Billiards Tournament Manager

A modern tournament bracket manager built for billiards clubs.

This project was made to improve on tools like BracketHQ by offering a cleaner interface, smarter match ordering, better two-table flow, and a public-facing bracket display that works well for club environments.

## Why This Exists

Most bracket tools work, but they are not built around the actual flow of a billiards club night.

Common problems:

- poor multi-table coordination
- awkward manual match ordering
- weak support for late arrivals
- cluttered or outdated UI
- no good public screen for players checking the bracket

This app is meant to solve those problems with a cleaner and more practical system.

## Features

### Tournament Formats

- 8-ball
- 9-ball
- singles
- doubles
- single elimination
- double elimination

### Queue Management

- automatic Next Up and On Deck assignment
- match ordering designed for two-table play
- avoids assigning players already in progress
- supports mixed winner/loser bracket card ordering for easier tournament running

### Views

- admin view for running the bracket
- public view for players checking the tournament
- call-to-table display
- leaderboard display
- bracket display
- QR code for easy phone access

### Tournament Controls

- create a new bracket from a player list
- start matches
- finish matches
- rename players
- add late arrivals
- reset and rebuild brackets

### Club Features

- optional club stat tracking
- leaderboard support
- exportable tournament summary
- balanced random doubles team generation using hidden player ratings

## Live Site

The site is deployed on GitHub Pages:

```text
https://tjblech.github.io/Billiards/
```

## Tech Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- GitHub Pages

## Local Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## Deployment

This project is deployed with GitHub Pages through GitHub Actions.

The Vite config uses:

```ts
base: "/Billiards/"
```

## Current Status

The project is live and functional, and it is still being improved.

## Future Improvements

- Supabase integration for synced multi-device updates
- improved live public display behavior
- better double-elimination scheduling logic
- easier late-entry handling
- stronger admin controls for editing active brackets

## License

This project is currently unlicensed.
