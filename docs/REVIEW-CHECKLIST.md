# Review checklist

What a game PR must satisfy to merge. CI enforces the first block by machine;
the automated review and the human maintainer walk the rest. "Must" items block
the merge. "Should" items are comments.

## Enforced by CI (must)

- `tools/check-games.mjs` passes: valid `game.json`, module scripts only, no
  absolute paths, no external URLs, no banned APIs (`speechSynthesis`, `eval`,
  `alert`, raw `localStorage`, IndexedDB, WebSocket, XHR, external `fetch`), no
  package imports, size budgets, allowed file types, audio files over 4 KB,
  `bootGame()` called.
- `tools/check-pr-scope.mjs` passes: only `html/games/<id>/` and
  `docs/games/<id>.md` changed, one game per PR.
- `npm run build` is green (type check included).
- `npm run smoke` is green for the game: loads at 390x844 and 1280x800 with no
  console errors, no failed requests, no broken images, no horizontal overflow,
  a Back link in the corner, caches itself and then plays offline, shows the
  update banner when the manifest changes.

## Must (reviewer)

1. **Scope and honesty.** The PR template is filled in truthfully. The game
   described is the game in the diff. Screenshots match the code.
2. **Plays at both sizes.** Open it at a phone size and a tablet size. Nothing
   is cut off, nothing is tiny, nothing depends on a specific aspect ratio.
3. **Readable by a non-reader.** A child who cannot read can start and play from
   the icons, colours, motion and sound. Any on-screen text is one short line and
   is not needed to understand what to do.
4. **Touch targets.** Anything tappable is at least 44 px on the smallest
   viewport, with generous hit areas (small fingers miss).
5. **Safe zone.** The top-left corner (92x60 px) holds only the Back link, in
   both orientations and every screen of the game (intro, play, win).
6. **Two players, two zones.** A two-player game gives each player a clearly
   separate area with independent touches; one player's taps never affect the
   other's zone, in either orientation.
7. **Sound only after a tap.** No audio before the first gesture; a mute button
   works; voice lines never overlap (use `createVoiceClips`); nothing is
   unbearably loud or repetitive.
8. **State.** Progress that matters survives a reload, through `createStore`
   only. Nothing personal is stored.
9. **No surprises.** No network calls, no third-party scripts or fonts, no ads,
   no links out of the bundle, no timers that keep running in the background.
10. **Budget and bloat.** Within `bundle.config.json` budgets with headroom;
    art is sized for the screen it is drawn on (no 4000 px PNGs for a 200 px
    sprite); audio is mono 64 kbps mp3 or similar.
11. **Docs.** `html/games/<id>/README.md` and `docs/games/<id>.md` describe the
    real game: controls, saved state, audio sources, gotchas.

## Should (comments, not blockers)

- A clear loop in the first five seconds; feedback on every tap.
- Difficulty that ramps or stays gentle; no fail states that feel like punishment.
- Consistent art style within the game; no mixed pixel densities.
- `game.json` description that a parent would understand.
- No dead code, no commented-out blocks, no console.log left behind.
- Frame rate holds on a mid-range tablet (no per-frame allocations in a hot loop,
  no thousand DOM nodes).

## How to review (human)

1. Check out the branch, `cd html && npm run build && npm run smoke -- --grep <id>`.
2. Play it muted in a headless screenshot pass if you cannot have sound where you
   are; otherwise on a real tablet.
3. Post one review with must-fixes first, each pointing at a file and line and
   naming the guide rule. Approve when the must list is empty.
