# Bubble Pop

Colourful bubbles drift up the screen; tap one and it pops with a burst of
droplets and a bright little pop. Played by touch, by words from an AAC board,
or both at once. No lives, no game over, nothing to read.

## Files

- `game.json`: hub card, metadata and the AAC vocabulary.
- `index.html`: the page (canvas, score, mute, control tray, Go screen).
- `style.css`: viewport-relative layout; the tray floats above the bottom 80 px.
- `src/main.ts`: game state and the actions shared by touch, buttons and words.
- `src/render.ts`: pre-drawn bubble sprites and a fixed particle pool.
- `src/sound.ts`: synthesized sounds through the SDK AudioContext.
- `tests/aac.spec.ts`: words and touch play the game; layout at four viewports.

## How to play

Tap a bubble to pop it. The tray buttons do exactly what the words do:

| Word (synonyms) | Button | What happens | With nothing to act on |
|---|---|---|---|
| go (start, play) | Go, ▶ | Starts from the Go screen; resumes after stop | wobble (already playing) |
| pop (burst) | tap a bubble | Pops the bubble nearest the top (a big one takes a hit) | wobble (Go screen, no bubbles) |
| more | ➕ | Five new bubbles at once, every colour included | wobble (Go screen, screen full: 24) |
| red, blue, green, yellow | colour dots | Pops every bubble of that colour | wobble (Go screen, none of it) |
| big | big bubble | Blows one big bubble that takes two pops | wobble (Go screen, two bigs out, screen full) |
| stop | ⏸ | No new bubbles; the ones out there keep floating and can still be popped | wobble (not playing) |
| again | 🔄 | A fresh round: score 0, four new bubbles (also starts from the Go screen) | never needed |

A wobble is a short shake of the button (or the Go button, or the whole
stage) and a soft low bump, never an error. Bubbles that float away cost
nothing. Every tenth pop gets a small cheer. New bubbles come a little faster
as the score grows (one every 1.3 s down to one every 0.8 s, capped).

## Layout

- Back link top-left and the AAC chip bottom-left are kept clear; bubbles fade
  out before reaching the top 64 px.
- Score and mute top-right. The tray is centred 84 px above the bottom (clear
  of the update banner), one row, or two rows of four on a portrait phone.

## Saved state

- `best`: highest score, through `createStore("bubble-pop", ...)`, shown as a
  star on the Go screen.

## Audio

Synthesized only (pitch-swept oscillators in `src/sound.ts`), no files, no
voice. Nothing plays until the SDK unlocks audio in the first tap; the mute
button silences everything.

## Checks

```sh
node tools/check-games.mjs bubble-pop                       # from the repo root
cd html && npm run build && npx playwright test --grep bubble-pop
```
