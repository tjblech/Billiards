# Billiards Tournament Manager

A modern tournament bracket manager built for billiards clubs.

This project was made to improve on tools like BracketHQ by offering a cleaner interface, smarter match ordering, better two-table flow, and a public-facing bracket display that works well for club environments.

## Why this exists

Most bracket tools work, but they are not built around the actual flow of a billiards club night.

Common problems:

- Poor multi-table coordination
- Awkward manual match ordering
- Weak support for late arrivals
- Cluttered or outdated UI
- No good public screen for players checking the bracket

This app is meant to solve those problems with a cleaner and more practical system.

## Features

### Tournament formats

- 8-ball
- 9-ball
- Singles
- Doubles
- Single elimination
- Double elimination

### Queue management

- Automatic Next Up and On Deck assignment
- Match ordering designed for two-table play
- Avoids assigning players already in progress
- Supports mixed winner/loser bracket card ordering for easier tournament running

### Views

- Admin view for running the bracket
- Public view for players checking the tournament
- Call-to-table display
- Leaderboard display
- Bracket display
- QR code for easy phone access

### Tournament controls

- Create a new bracket from a player list
- Start matches
- Finish matches
- Rename players
- Add late arrivals
- Reset and rebuild brackets

### Club features

- Optional club stat tracking
- Leaderboard support
- Exportable tournament summary
- Balanced random doubles team generation using hidden player ratings

## Live site

The site is deployed on GitHub Pages:

```text
https://tjblech.github.io/Billiards/
```


## Phone / QR access

Players can open the public view directly from a phone:

```text
https://tjblech.github.io/Billiards/#public
```

Use that URL when making a QR code.

Note: the current version uses browser local storage, so different devices can open the site, but they will not receive live bracket updates from the admin device until a shared backend such as Supabase is added.

## Tech stack

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

## Current status

The project is live and functional, and it is still being improved.

## Future improvements

- Supabase integration for synced multi-device updates
- Improved live public display behavior
- Better double-elimination scheduling logic
- Easier late-entry handling
- Stronger admin controls for editing active brackets

## License

This project is currently unlicensed.
