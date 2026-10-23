---
name: check-game
description: Run every check a reviewer runs on one game in this bundle and report what fails and why. Use when the user says "/check-game <id>", "check my game", "is my game ready", or before opening a game PR.
---

# /check-game <id>

Run the same gates CI and the human reviewer apply, then report. Do not fix
anything unless asked; the point is a faithful report.

1. Conformity lint (fast, explains each rule):

   ```bash
   node tools/check-games.mjs <id>
   ```

2. Build and smoke test (headless, muted; never open the game in a sounding browser):

   ```bash
   cd html && npm run build && npm run smoke -- --grep <id>
   ```

3. Scope: a game branch may only change `html/games/<id>/` and `docs/games/<id>.md`.

   ```bash
   node tools/check-pr-scope.mjs --base origin/main
   ```

4. Read `docs/REVIEW-CHECKLIST.md` (and `docs/guides/UI.md` for the rules behind it) and walk the "must" items that tools cannot
   check: amount of on-screen text, touch target sizes, what happens on a 390x844
   phone versus a 1280x800 tablet, whether the top-left safe zone stays clear,
   whether progress survives a reload, and whether sound only starts after a tap.
   Read the game's `index.html`, `style.css` and `src/` to answer each one.

5. Report in this order: blocking failures (with file and line), things a human
   should look at, and what passed. Quote tool output in a code block; do not
   paraphrase an error.
