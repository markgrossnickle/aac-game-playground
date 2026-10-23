# AAC Game Playground

Small games that can be played by touch, with an AAC (Augmentative and
Alternative Communication) board such as [Cboard](https://github.com/cboard-org/cboard),
or both. A child picks words on their board ("go", "pop", "again") and the game
acts on them. Everything ships as one web site, an installable PWA, and a thin
Android app, and new games arrive on every device the next time it comes to
the front.

Live site: https://aac-game-playground.vercel.app (first deploy pending, see
Status). Android installer: `/download` on the live site.

**Anyone can contribute a game.** With Claude Code, describe the game and run
`/new-game`; you get a pull request. Without it, follow
[CONTRIBUTING.md](CONTRIBUTING.md). CI builds and tests it, an automated review
comments, a maintainer plays it and merges, and merging deploys.

## How AAC input works

- Games declare their words in `game.json` and map each to an action with one
  SDK call, `playWithAac()`. Touch always works too.
- The AAC connection uses the open
  [aac-bridge](https://github.com/markgrossnickle/aac-bridge) protocol (pinned
  to `v0.2.0`). A device pairs once in the hub with a one-time code typed into
  the AAC app. Nothing is shared until the AAC user turns sharing on, and
  nothing arrives after they turn it off.
- Every AAC game ships a gameplay test proving the words play it: start,
  play, replay, ignored words, duplicates, disconnects, sharing off.

Read [docs/guides/AAC.md](docs/guides/AAC.md) before building an AAC game.

## Start here

| If you want to | Read |
|---|---|
| Add a game | [docs/guides/GETTING-STARTED.md](docs/guides/GETTING-STARTED.md), then [AAC.md](docs/guides/AAC.md), [GAME-DESIGN.md](docs/guides/GAME-DESIGN.md), [UI.md](docs/guides/UI.md), [CODING.md](docs/guides/CODING.md) |
| Review a game | [docs/REVIEW-CHECKLIST.md](docs/REVIEW-CHECKLIST.md) |
| Understand the system | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Ship or debug a deploy | [DEPLOY.md](DEPLOY.md) |

```bash
cd html && npm ci && npx playwright install chromium && cd ..   # once
node html/scripts/new-game.mjs my-game "My Game" --aac          # scaffold an AAC game
cd html && npm run dev                                          # http://localhost:5173/games/my-game/
```

## Hosting

This bundle has its own hosting, created for it and used by nothing else:

| What | Where |
|---|---|
| Web project | Vercel `aac-game-playground` -> https://aac-game-playground.vercel.app |
| APK host | Vercel `aac-game-playground-apk` -> https://aac-game-playground-apk.vercel.app |
| AAC relay | not deployed yet (`bundle.config.json` `aac.relay` is `null`) |

Deploys refuse any other project (`tools/check-hosting.mjs`).

## Status

- Hosting projects exist; the repository needs a `VERCEL_TOKEN` secret before
  the first deploy runs.
- The AAC relay needs a host that keeps WebSockets open; until then games take
  AAC words from the dev panel, tests and same-site pages.
- No games yet. Be the first.

Built from a private game bundle template. License: MIT.
