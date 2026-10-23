# __GAME_TITLE__

One line: what the player does and why it is fun.

## Files

- `game.json`: hub card and metadata (title, icon, players, orientation, added date).
- `index.html`: the page. Loads `style.css` and `src/main.ts` as a module.
- `src/main.ts`: the game. Calls `bootGame()` first; everything else is yours.
- `assets/`: images and audio, referenced only through the build
  (`new URL("../assets/x.png", import.meta.url)` or `import.meta.glob`).

## How to play

- Tap a bubble to pop it.

## Saved state

- `best`: highest score, through `createStore("__GAME_ID__", ...)`.

## Checks before opening a PR

```sh
npm run check:games           # from the repo root
cd html && npm run build && npm run smoke -- --grep __GAME_ID__
```
