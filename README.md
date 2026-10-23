# Game Bundle Template

A framework for shipping many small web games as one product: a web site, a
PWA, and a thin Android app, all fed from one repository. Anyone with Claude can
describe a game and end up with a pull request; CI builds it, checks it against
the house rules, reviews it, and a maintainer merges it. Installed apps and open
sites pick up the new game on their next focus, offline copies update themselves.

This repository is the **template**. A client bundle is made from it by
following `docs/SPINOFF.md` (one config file, two hosting projects, a handful
of secrets). Games are never added here; they are added to a spinoff.

## What is in the box

| Path | What |
|---|---|
| `bundle.config.json` | The only file that names the client: title, app id, URLs, theme, budgets. |
| `html/` | The Vite app: hub (`index.html`), games (`games/<id>/`), SDK (`src/sdk/`), service worker (`public/sw.js`), build plugin (`plugins/games.ts`). |
| `templates/game/` | The scaffold every new game starts from (`node html/scripts/new-game.mjs`). |
| `tools/` | CI gates: `check-games.mjs` (conformity), `check-pr-scope.mjs`, `sync-config.mjs`, `verify-live.sh`, `gen-icons.mjs`. |
| `.github/workflows/` | `ci.yml` (lint, build, muted smoke test), `claude-review.yml`, `deploy.yml` (on merge to main), `shim.yml` (Android APK, manual). |
| `.claude/skills/` | `/new-game` and `/check-game` for contributors using Claude Code. |
| `android/`, `apk-host/` | The Capacitor shim (its WebView loads the live site) and the tiny project that hosts the APK. |
| `docs/` | `ARCHITECTURE.md`, `SPINOFF.md`, `REVIEW-CHECKLIST.md`, `guides/` (GAME-DESIGN, UI, CODING, ART, AUDIO, BUDGETS: what every game author and bot reads first). |

## Quick start (maintainer)

```bash
cd html && npm ci && npm run dev        # hub at http://localhost:5173 (empty until a game exists)
node html/scripts/new-game.mjs demo "Demo"   # scaffold a game, then open /games/demo/
node tools/check-games.mjs              # conformity lint
cd html && npm run build && npm run smoke    # production build + headless muted smoke test
```

Contributors start at `docs/guides/GETTING-STARTED.md`. Shipping is in
`DEPLOY.md`. How it all fits is in `docs/ARCHITECTURE.md`.

## Principles

- **One folder per game, nothing shared edited.** A game PR touches
  `html/games/<id>/` and `docs/games/<id>.md` only. CI rejects anything else.
- **Everything through the build.** Every asset is a hashed file in the build
  graph, so the per-game precache list is exact and nothing 404s offline.
- **Config, not forks.** Branding lives in `bundle.config.json`; the framework
  never contains a client name.
- **Verify at the real URL.** A green deploy log is not proof; `verify-live.sh` is.
- **No sound on the build machine.** Smoke tests run headless with audio muted.

License: MIT (see `LICENSE`).
