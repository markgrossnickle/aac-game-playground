# Architecture

How a game goes from a folder in this repo to a child's finger on a tablet, and
how it stays current.

## The pieces

```
html/games/<id>/game.json ──┐
html/games/<id>/index.html ─┤  plugins/games.ts (Vite)
html/index.html  <!-- GAMES -->┘        │
                                        ├─ dist/index.html           hub with one card per game
                                        ├─ dist/games/<id>/          each game, hashed assets under /assets
                                        ├─ dist/games-manifest.json  buildId + per-game {version, files}
                                        └─ dist/site.webmanifest     PWA manifest from bundle.config.json

public/sw.js            serves caches; network-first for HTML + manifest, cache-first for /assets
src/sdk/                what games import: bootGame, audio, storage, viewport, clips, update, offline
src/landing/            hub behaviour: tabs, favorites, offline dots, update banner, hold-to-exit
android/ + capacitor.config.json   the shim: a WebView pointed at webUrl (generated from bundle.config.json)
apk-host/               a separate tiny hosting project that serves /games.apk once
```

## 1. Registration: `game.json` is the only registry

A game is a folder under `html/games/` with a `game.json`
(`schemas/game.schema.json`) and an `index.html`. `plugins/games.ts`:

- in `config()`, discovers the folders, validates every `game.json`, and adds
  each `index.html` as a rollup input (plus the hub and the download page);
- in `transformIndexHtml`, fills `%BUNDLE_*%` placeholders from
  `bundle.config.json` and injects one card per game at the `<!-- GAMES -->`
  marker (newest first, a New tag for 30 days, emoji or hashed icon);
- in `closeBundle`, reads Vite's own `dist/.vite/manifest.json`, walks each
  entry's graph (chunk, css, assets, imports, plus any `/assets/...` reference
  found in emitted HTML or CSS text), and writes `dist/games-manifest.json`.

So adding a game never touches a shared file, and two game PRs never conflict.

## 2. Versions: content hashes, not counters

For each game, `version` is a SHA-256 over the sorted list of its files and the
hash of each file's bytes. Vite already content-hashes `/assets/*` names, but
`games/<id>/index.html` keeps a fixed name, so hashing bytes as well means the
version changes exactly when anything the player would see changes. `buildId`
hashes the hub version and every game version. Nothing time-based is mixed in,
so an identical rebuild gives an identical id (which is how `verify-live.sh`
proves the live site serves the build CI made).

## 3. Delivery: one static origin, three surfaces

- **Web**: the site at `webUrl`. HTML and the manifest are served with
  `max-age=0, must-revalidate`; `/assets/*` with `immutable` (`vercel.json`).
- **PWA**: `site.webmanifest` plus the service worker make it installable.
- **Android**: the shim is a Capacitor app whose WebView loads `webUrl`
  directly (`server.url`). It contains only `html/shell/index.html` as an
  offline fallback. It is installed once; content never requires a reinstall.

## 4. Update-on-focus (`src/sdk/update.ts`)

Every page starts an update checker. It fetches `games-manifest.json` with
`cache: "no-store"` on load and again on `visibilitychange`, `focus`, `online`,
and Capacitor's `appStateChange` when running in the shim. Checks are throttled
to one per 15 seconds.

- **Hub**: if the hub's own version changed (new game, renamed card), it reloads
  itself. Games already cached are refreshed in the background (section 5) and
  their offline dots repainted.
- **Game**: if the game's own version changed, a small banner appears: "A new
  version is ready. Tap to update." Nothing reloads under a child's fingers. The
  next time the game is opened from the hub it is the new version anyway,
  because HTML is network-first.

## 5. Offline (`public/sw.js` + `src/sdk/offline.ts`)

The split that keeps this simple: **the page decides what to cache, the worker
only serves**.

- `bootGame()` registers the worker (production only) and, 1.5 s after the
  first manifest arrives, calls `ensureGameCached(manifest, id)`: it opens a
  cache named `game:<id>:<version>`, fetches each file in the game's list, and
  writes a `/__cache-complete__` marker only when every file is stored. Old
  `game:<id>:*` caches are deleted after the new one is complete, so a failed
  update never removes a working copy.
- The hub does the same for itself (`hub:<version>`), refreshes any cached game
  whose version changed (`refreshCachedGames`), deletes caches of games that no
  longer exist, and prunes the opportunistic `runtime-assets` cache.
- The worker: `games-manifest.json` and every navigation are network-first with
  cache fallback (a navigation to `/games/<id>/` falls back to the cached
  `/games/<id>/index.html`; an uncached game offline gets a friendly 503 page).
  `/assets/*` is cache-first. Matching uses `ignoreVary: true` because hosts send
  `Vary: Origin` on JS/CSS and the precache fetch has no Origin header; without
  it offline play fails on every chunk.

What is deliberately not here: per-game Get/Uninstall buttons. A game is cached
the first time it is played online, and kept current, with no choices to make.

## 6. The contribution loop

1. `node html/scripts/new-game.mjs <id> "Title"` copies `templates/game/`.
2. The author (or Claude via `/new-game`) builds inside the folder, using the SDK.
3. `tools/check-games.mjs` lints conformity; `npm run smoke` renders the built
   game headless and muted at 390x844 and 1280x800, checks for console errors,
   failed requests, broken images, overflow, the Back link, offline play after
   caching, and the update banner.
4. CI runs the same on the PR, plus `check-pr-scope.mjs` (only the game folder
   changed) and a Claude review against `docs/REVIEW-CHECKLIST.md`.
5. A maintainer merges (main is protected: PRs only, review, CI). CI runs on
   `main`, smoke-testing the real build and saving it as the `site` artifact.
   When CI passes, `deploy.yml` proves the hosting is this bundle's own
   (`check-hosting.mjs`), uploads exactly that artifact with a token scoped to
   the one web project (`vercel-upload.mjs`), and verifies it live. Devices
   pick it up on next focus.

## 7. Spinoffs

Everything client-specific is in `bundle.config.json` and a few generated
files (`tools/sync-config.mjs`). `docs/SPINOFF.md` is the recipe. The template
repo stays game-free; spinoffs collect games.
