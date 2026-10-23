# Getting started: your idea to a game in the bundle

You need: Node 24, git, a GitHub account, and either Claude Code or the patience
to follow five steps by hand. No game-dev experience is assumed.

## With Claude Code (recommended)

```bash
# Fork the repository on GitHub first (unless you have write access), then:
git clone https://github.com/<you>/<repo>.git && cd <repo>
cd html && npm ci && npx playwright install --with-deps chromium && cd ..
claude
```

The last install step downloads the headless Chromium the checks use. On
Windows and macOS drop `--with-deps`.

Then type `/new-game` and describe the game in a sentence or two. Claude will
ask at most three questions, scaffold the folder, build the game, run the same
checks CI runs, and open the pull request. Afterwards `/check-game <id>` re-runs
the review on your machine whenever you change something.

Good first ideas are small: one screen, one action, one kind of feedback.
"Tap the animals that make the sound you hear." "Drag shapes into matching
holes." "Two players pop bubbles on their own half." Describe the action, the
feedback and who it is for; Claude handles sizes, sound unlocking, offline
caching and the hub card because the SDK does.

## By hand

1. Scaffold:
   ```bash
   node html/scripts/new-game.mjs my-game "My Game" --emoji 🎲
   ```
2. Run the dev server and open your game:
   ```bash
   cd html && npm run dev      # http://localhost:5173/games/my-game/
   ```
3. Edit `html/games/my-game/src/main.ts`. Keep `bootGame()` first. Read
   `GAME-DESIGN.md`, `UI.md` and `CODING.md` (short) before you go far.
4. Check:
   ```bash
   node tools/check-games.mjs my-game
   cd html && npm run build && npm run smoke -- --grep my-game
   ```
5. Commit on branch `game/my-game`, push to your fork, open a PR to `main`,
   fill the template.

## What happens to your PR

CI lints it against the house rules and builds it (one quick job). The
browser tests are yours: run them before opening the PR and paste the result.
A maintainer reviews against `docs/REVIEW-CHECKLIST.md` (and may ask Claude to
as well), plays it, merges and deploys; every phone, tablet and browser with
the bundle open picks the game up the next time it comes to the front.

## Things that surprise people

- There is no reload button in the app; updates just appear on focus.
- Sound cannot start before the first tap. The SDK handles this, which is why
  games have a start screen.
- Everything the game needs must be inside its folder. No CDN, no fonts from the
  web, no API calls. The game is played offline on tablets without Wi-Fi.
- The reviewer will open your game at 390x844 and at 1280x800. Do that too.
