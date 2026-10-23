---
name: new-game
description: Turn a short game idea into a finished, reviewed-ready game PR in this bundle. Use when the user describes a game they want added, says "/new-game", "make a game", "add a game", or pastes a game idea.
---

# /new-game: from idea to pull request

You are adding ONE game to this bundle. The bundle has strict conventions so that
every game loads, scales, caches offline and updates the same way. Follow the steps
in order; do not skip the checks.

## 1. Read the rules first (once per session)

Read these files before writing any game code. They are short.

- `docs/guides/AAC.md`: this playground's games can be played with words from
  an AAC board. Read it first; most games here should support it.
- `docs/guides/GAME-DESIGN.md`: what makes a small kids' game work (one verb,
  feedback, difficulty, players, sound as design).
- `docs/guides/UI.md`: how it must look and behave on screen (scaling, minimal
  text, touch targets, the Back-link safe zone, standard controls).
- `docs/guides/CODING.md`: the SDK, allowed and banned APIs, asset rules.
- `docs/guides/BUDGETS.md`: size limits CI enforces.
- `docs/guides/ART.md` and `docs/guides/AUDIO.md` only if the game needs art or sound.
- `templates/game/src/main.ts`: the worked example every game starts from.

## 2. Pin down the idea in at most three questions

Ask only what the scaffold needs and the idea leaves open. Usually:

- One or two players? (Two players means two clearly separate zones on one screen.)
- Which words should play it from an AAC board? (Default: yes, with `--aac`.
  Suggest core-board words like go, stop, more, again, colours, animals.)
- Portrait, landscape or any?
- Age range, and whether it needs voice or sound.

Then write back a three-line brief: the core loop (what the player does over and
over), the win or progress feedback, and what is on screen. Get a yes, or proceed
if the user said to just build it.

## 3. Scaffold

From the repo root:

```bash
node html/scripts/new-game.mjs <id> "Title" --aac --players 1|2 --orientation any|portrait|landscape --emoji <one emoji> --author <github handle>
```

`<id>` is lowercase with hyphens. This creates `html/games/<id>/` and
`docs/games/<id>.md`. Create a branch named `game/<id>` before editing.

## 4. Build the game

Work ONLY inside `html/games/<id>/` (and `docs/games/<id>.md`). Never edit files
under `html/src/`, `html/plugins/`, `html/index.html`, workflows or configs; a game
PR that touches them is rejected by CI.

- Keep `bootGame()` as the first thing `src/main.ts` does.
- Lay out in fractions of the viewport (`fitCanvas`, `viewport()`, CSS `clamp()`),
  never fixed pixels. Test mentally at 390x844 and 1280x800.
- Little or no reading: icons, shapes, colour, motion and sound carry the meaning.
- Any image or audio file lives in `html/games/<id>/assets/` and is referenced
  through `new URL("../assets/x.png", import.meta.url)` or `import.meta.glob`.
- Persist with `createStore`, sound with `playTone` / `playSound` /
  `createVoiceClips`. No `fetch` to the network, no packages, no `speechSynthesis`.
- Update `README.md` in the game folder and `docs/games/<id>.md` so they describe
  the real game (controls, saved state, audio, gotchas).

## 5. Check, exactly like CI

```bash
node tools/check-games.mjs <id>
cd html && npm run build && npm run smoke -- --grep <id>
```

Both must pass. The smoke test is headless and muted; never open the game in a
browser that can play sound on this machine. Fix every error; do not weaken a check.

## 6. Open the PR

```bash
git add html/games/<id> docs/games/<id>.md
git commit -m "game(<id>): <title>"
git push -u origin game/<id>
gh pr create --title "game(<id>): <title>" --body-file .github/PULL_REQUEST_TEMPLATE.md
```

Then edit the PR body: fill every line of the template truthfully, including the
checks you ran (with their results) and anything you could not verify. CI
runs one quick lint-and-build job; the smoke and gameplay tests are YOURS to run
locally, and the PR must say they passed. A maintainer reviews (optionally
asking Claude with a `/claude-review` comment), merges, and starts a deploy;
every installed app picks it up on next focus.

## If something is out of scope

A game that needs a framework change (new SDK helper, a new permission, a
dependency) is two PRs: open an issue or a separate framework PR for the shared
part first, and say so in the game PR. Do not sneak shared changes into a game PR.
