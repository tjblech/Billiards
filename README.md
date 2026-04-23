# Billiards Tournament Manager

A modern tournament bracket manager built for billiards clubs.

This project was made to improve on tools like BracketHQ by offering a cleaner interface, smarter match ordering, better multi-table flow, and a public-facing bracket display that works well for club environments.

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

## Tournament Formats
- 8-ball
- 9-ball
- singles
- doubles
- single elimination
- double elimination

## Queue Management
- automatic Next Up and On Deck assignment
- match ordering designed for two-table play
- avoids assigning players already in progress
- supports alternating flow between winners and losers bracket matches

## Views
- admin view for running the bracket
- public view for players checking the tournament
- call-to-table display
- leaderboard display
- bracket display
- QR code for easy phone access

## Tournament Controls
- create a new bracket from a player list
- start matches
- finish matches
- rename players
- add late arrivals
- reset and rebuild brackets

## Club Features
- optional club stat tracking
- leaderboard support
- exportable tournament summary
- balanced random doubles team generation using hidden player ratings

## Live Site

The site is deployed on GitHub Pages:

`https://tjblech.github.io/Billiards/`

## Tech Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- GitHub Pages

## Project Goal

The goal is to make something that is actually useful for a real billiards club, not just a generic bracket generator.

That means:
- fast to use during live tournaments
- easy to read from a phone
- good-looking enough that people actually want to use it
- flexible enough for singles, doubles, and double elimination formats

## Current Status

The project is live and functional, and it is still being improved.

Current focus areas include:
- cleaner alternating match order in double elimination
- better bracket flow for real club use
- improved reset / rebuild behavior
- future shared-state support across devices

## Future Improvements
- Supabase integration for synced multi-device updates
- better live public display behavior
- improved double elimination scheduling logic
- easier late-entry handling
- better admin controls for editing active brackets

## Local Development

To run locally:

```bash
npm install
npm run dev
