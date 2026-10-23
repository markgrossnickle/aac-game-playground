# Coding rules

How a game is built so it loads, caches, updates and behaves like every other
game in the bundle. `tools/check-games.mjs` enforces the mechanical parts;
this page explains them.

## Layout of a game

```
html/games/<id>/
  game.json       hub card and metadata (schemas/game.schema.json)
  index.html      the page: viewport meta, title, style.css, <script type="module" src="./src/main.ts">
  style.css       the game's own styles (viewport-relative sizes)
  src/main.ts     calls bootGame() first, then the game
  assets/         images, audio, data (optional)
  README.md       what it is, controls, saved state, audio sources, gotchas
docs/games/<id>.md    the same at a glance, for the docs index
```

A PR for a game changes only that folder and `docs/games/<id>.md`.
`tools/check-pr-scope.mjs` fails anything else.

## The SDK is the only shared code you touch

```ts
import { bootGame, createStore, fitCanvas, playTone, createVoiceClips } from "../../../src/sdk";
```

| Need | Use | Not |
|---|---|---|
| Chrome, audio unlock, update banner, offline cache | `bootGame({ onFirstGesture })` first thing in `main.ts` | hand-written back links, your own SW |
| Sizing | `fitCanvas(canvas)`, `viewport()`, `onViewportChange()` | fixed pixel sizes, `window.innerWidth` snapshots |
| Saved state | `createStore(id, { version, defaults, migrate })` | `localStorage`, IndexedDB, cookies |
| Short sounds | `playTone()` for synthesized, `loadSound()` + `playSound()` for files | `new Audio()`, autoplay |
| Speech | `createVoiceClips(import.meta.glob(...))`, prerecorded clips | `speechSynthesis` (dead in the Android WebView) |
| Mute | `<button id="mute-toggle">` in the HTML; `isMuted()` if you need it | your own mute state |

No npm packages. If a game truly needs a library, open a framework issue first:
packages are added to the SDK for everyone or not at all.

## Assets go through the build

The bundle precaches each game from the list of files Vite emitted for it. A
file the build cannot see is a file that 404s offline.

- Images in HTML or CSS: relative paths (`./assets/bg.png`, `url(../assets/x.png)`).
- From TypeScript: `new URL("../assets/pop.mp3", import.meta.url).href` for one
  file, `import.meta.glob("../assets/vo/*.mp3", { eager: true, query: "?url", import: "default" })` for a set,
  `import data from "../assets/levels.json"` for JSON.
- Never: leading-slash paths (`/assets/...`), string-built paths at runtime,
  anything in `html/public/`, `?v=3` cache busters, URLs to other hosts.
- Scripts are ES modules only (`<script type="module" src>`), no inline scripts.

## Offline-only, network-free

Games run on tablets without Wi-Fi. No `fetch` to the internet, no WebSocket,
no XHR, no remote fonts or stylesheets, no analytics. The lint rejects all of
these. The one network thing a game does, checking for updates, the SDK does.

## State and lifecycle

- `createStore(id, { version: 1, defaults })`; bump `version` and supply
  `migrate` when the shape changes. Keep it small (a few KB).
- Save on meaningful change, not every frame.
- Pause your loop when an overlay is up or the page is hidden
  (`document.visibilityState`). The SDK may show an update banner at any time;
  never auto-reload yourself.
- Do not use `alert`, `confirm`, `prompt` (they freeze the WebView) or
  `document.write`.

## TypeScript and style

- Strict TypeScript (the repo's `tsconfig.json`); `npm run build` type-checks.
- Plain modules and functions; no frameworks. Keep `main.ts` readable top to
  bottom; split into `src/*.ts` when it passes a few hundred lines.
- Comments explain why, not what. No commented-out code, no `console.log`
  left in. No em dashes in docs or strings.

## Checks

```bash
node tools/check-games.mjs <id>                       # rules above
cd html && npm run build && npm run smoke -- --grep <id>   # loads, offline, update banner (headless, muted)
```

Both must pass locally before the PR; CI runs the same.
