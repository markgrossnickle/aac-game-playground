# UI

How a game looks and behaves on screen so it works on every device in the
bundle. These are the rules the reviewer checks and the smoke test partly
enforces. What makes the game fun is in `GAME-DESIGN.md`.

## 1. Scale to the device, always

Players use anything from a 390x844 phone to a 1280x800 tablet, in either
orientation. A game is never designed for one size.

- Lay out in fractions of the viewport. `fitCanvas()` gives logical
  `width`/`height` that change on resize; CSS uses `vw`, `vh`, `%`, `clamp()`.
  Never a fixed `800px` stage, never `transform: scale()` of a fixed stage.
- Relayout on resize and orientation change (`onViewportChange`). Never reload.
- Fonts: `clamp(16px, 2.4vw, 28px)` and up; nothing under 14 px on a phone.
- Set `orientation` in `game.json` only when the game truly cannot work the
  other way; prefer `any`.
- No horizontal scroll, ever (the smoke test fails on overflow).

## 2. Text: as little as possible

- A start screen is one short line and one big button at most.
- In play, text is a label or a number, never a sentence. If a word carries
  meaning, pair it with an icon and, ideally, a voice clip (`AUDIO.md`).
- High contrast: no thin light-grey on white; check it in sunlight.

## 3. Touch

- Targets at least 44 px on the smallest viewport, with a hit area larger
  than the drawn shape. Small fingers miss by 10 to 20 px.
- Feedback on every touch within a frame: a sound, a squash, a highlight.
- No hover states, no double-tap, no long-press as the only way to act.
- Multitouch where two players share a screen: handle each pointer by id;
  never assume one finger.
- The SDK disables pinch zoom, double-tap zoom, text selection and
  pull-to-refresh; do not re-enable them.

## 4. The Back link safe zone

`bootGame()` pins a Back link in the top-left corner. It is the only way out,
so the rectangle **0,0 to 92x60 px** stays free of game UI in every orientation
and on every screen (intro, play, win, pause).

- Put HUDs top-right or bottom. Centre titles and overlays.
- Canvas games: draw nothing interactive or important in that corner.
- A top bar gets class `topbar`; the SDK stylesheet pads it clear.
- Style the link to match the game (`a.back` in your CSS); its position is
  fixed by the SDK and cannot be moved.

## 5. Standard controls

- Mute: include `<button id="mute-toggle">`; the SDK wires it and remembers
  the choice. Place it away from the safe zone.
- Start: a start overlay with one button; the SDK unlocks audio in that tap.
- Pause or replay: optional, large, and never in the safe zone.
- No native dialogs (`alert`, `confirm`, `prompt`): draw overlays instead.

## 6. Screens and states

- Intro, play, win, and any pause are full-screen overlays or states of the
  same page, not separate HTML pages.
- Overlays block touches to the game beneath them and pause the loop.
- A win screen offers one obvious "again" action and leaves the Back link clear.
- The SDK may show a small "update ready" banner at the bottom at any time;
  keep the bottom 80 px free of critical controls, or accept that it may sit
  over decoration.

## 7. Performance on a mid-range tablet

- One `requestAnimationFrame` loop; stop it when paused, behind an overlay, or
  when the page is hidden.
- Reuse objects in hot loops; avoid per-frame allocations.
- Prefer one canvas over hundreds of DOM nodes; prefer CSS transforms over
  layout changes.
- Art sized for the display size (`ART.md`); avoid full-screen shadows and
  filters that repaint every frame.

## 8. Verify

Open the built game at 390x844 and 1280x800 (`npm run smoke -- --grep <id>`
does it headless and muted), rotate, check the corner, check nothing overflows,
check every tap answers.

## Do / do not

Do: viewport fractions, `clamp()` type, 44 px targets, instant touch feedback,
start overlay with one button, mute button, HUD away from the top-left,
overlays that pause.

Do not: fixed stages, sentences on screen, hover or long-press as the only
input, anything in the 92x60 corner, native dialogs, loops that run behind
overlays, horizontal scroll.
