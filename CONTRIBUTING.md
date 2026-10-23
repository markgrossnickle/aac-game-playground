# Contributing a game

Thank you. Here is the whole process; it is designed so you only ever touch your
own folder.

1. **Read the guides** (about ten minutes): `docs/guides/GETTING-STARTED.md`,
   then `GAME-DESIGN.md`, `UI.md`, `CODING.md`, `BUDGETS.md`. `ART.md` and `AUDIO.md` if
   your game has pictures or sound.
2. **Get the code and the test browser** (once):
   ```bash
   # Fork the repository on GitHub, then:
   git clone https://github.com/<you>/<repo>.git && cd <repo>
   git remote add upstream https://github.com/<owner>/<repo>.git
   cd html && npm ci && npx playwright install --with-deps chromium && cd ..
   ```
   Maintainers with write access can skip the fork and branch directly.
3. **Scaffold**: `node html/scripts/new-game.mjs <id> "Title"` creates
   `html/games/<id>/` from `templates/game/` and `docs/games/<id>.md`.
   Work on a branch named `game/<id>`.
4. **Build it** inside `html/games/<id>/` only. Call `bootGame()` first and use
   the SDK (`html/src/sdk/`) for audio, storage, sizing. No packages, no network.
5. **Check it**: `node tools/check-games.mjs <id>` and
   `cd html && npm run build && npm run smoke -- --grep <id>`. Both must pass.
   The smoke test runs headless and muted; please do the same.
6. **Open a PR** from your fork's `game/<id>` branch to `main`, with the
   template filled in. CI runs the same checks. The automated review runs by
   itself for branches of this repository; for a fork, GitHub keeps secrets
   away from the workflow, so a maintainer starts it by commenting
   `/claude-review`. A maintainer plays the game, approves and merges. Merging
   deploys, after CI passes again on `main`.

Keep your fork current with `git fetch upstream && git rebase upstream/main`.

Using Claude Code? `/new-game` walks through all of this and `/check-game <id>`
runs the review locally.

## What gets a PR sent back

- Files changed outside `html/games/<id>/` and `docs/games/<id>.md`.
- Anything in `docs/REVIEW-CHECKLIST.md` under "must".
- A game that only works at one screen size, needs reading to play, plays sound
  before the first tap, or keeps state anywhere but `createStore`.

## Framework changes

Changes to the SDK, hub, plugin, workflows or config are welcome but separate:
open an issue first, then a PR that touches no game folder. CODEOWNERS routes
them to a maintainer.
