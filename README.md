# AAC Game Playground

Small games that can be played by touch, with an AAC (Augmentative and
Alternative Communication) board such as [Cboard](https://github.com/cboard-org/cboard),
or both. A child picks words on their board ("go", "pop", "again") and the game
acts on them. Everything ships as one web site, an installable PWA, and a thin
Android app, and new games arrive on every device the next time it comes to
the front.

Live site: https://aac-game-playground.vercel.app. Android installer:
`/download` on the live site.

**Anyone can contribute a game.** With Claude Code, describe the game and run
`/new-game`; you get a pull request. Without it, follow
[CONTRIBUTING.md](CONTRIBUTING.md). You run the browser and gameplay tests
locally and paste the result; one quick CI job lints and builds it; a
maintainer reviews (optionally asking Claude), plays it, merges and deploys.

## How AAC input works

- Games declare their words in `game.json` and map each to an action with one
  SDK call, `playWithAac()`. Touch always works too.
- The AAC connection uses the open
  [aac-bridge](https://github.com/markgrossnickle/aac-bridge) protocol
  (0.3.0). A device pairs once in the hub with a one-time code typed into the
  AAC app. Nothing is shared until the AAC user turns sharing on, nothing
  arrives after they turn it off, and the AAC app can share only the games'
  words.
- **Local play, no internet:** `cd html && npm run local` serves the games and
  a relay from a computer, and an AAC device on the same Wi-Fi drives them.
- Every AAC game ships a gameplay test proving the words play it: start,
  play, replay, ignored words, duplicates, disconnects, sharing off. It runs
  locally with the smoke tests (`cd html && npm run build && npm run smoke`).

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
| AAC relay | local play runs one on your computer (`npm run local`); no internet relay (`aac.relay` is `null`), by choice |

Deploys refuse any other project (`tools/check-hosting.mjs`).

## Status

- Hosting projects exist, with one project-scoped token each. Deploys are
  started by hand from `main` (`gh workflow run deploy.yml`), per
  [docs/CI-BUDGET.md](docs/CI-BUDGET.md).
- AAC pairing works in local play. The live site has no internet relay, so
  there it takes AAC words only from same-site pages and the dev panel.
- No games yet. Be the first.

Built from a private game bundle template. License: MIT.
