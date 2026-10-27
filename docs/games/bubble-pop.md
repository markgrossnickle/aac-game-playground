# Bubble Pop (`html/games/bubble-pop`)

Colourful bubbles drift up; tap one to pop it. One verb, no lives, no game
over. Every AAC word does exactly what a tap or tray button does, and a word
with nothing to act on gives a small wobble.

- Players: 1. Orientation: any. Ages: 3-7.
- Code: `html/games/bubble-pop/src/` (`main.ts` actions and loop, `render.ts` sprites and particles, `sound.ts` synthesized sounds). No assets.
- Saved state: `best` score via `createStore("bubble-pop")`.
- Audio: synthesized tones only, through the SDK AudioContext; silent until the first tap unlocks audio; honours mute.
- AAC words: go (start, play), pop (burst), more, red, blue, green, yellow, big, stop, again. Gameplay test: `html/games/bubble-pop/tests/aac.spec.ts`.
- Known gotchas: "stop" halts new bubbles only; bubbles already out keep rising and can still be popped, and "more" and "big" still work while stopped. "again" also starts the game from the Go screen. The tray sits 84 px above the bottom, so on a short landscape phone it covers part of the play area; bubbles rise above it.
