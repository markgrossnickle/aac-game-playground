# CLAUDE.md

This is the **AAC Game Playground**: games playable by touch and by words from
an AAC board. AAC games use `playWithAac()` from the SDK and must ship
`tests/aac.spec.ts`; read `docs/guides/AAC.md` before touching one. Scaffold
them with `node html/scripts/new-game.mjs <id> "Title" --aac`.

Guidance for Claude Code in this game bundle. Short on purpose: the detail lives
in the files linked here, read them when the task touches their area.

## What this repo is

Many small web games in one Vite app (`html/`), served as a site and loaded live
by a thin Android shim. One folder per game under `html/games/<id>/` with a
`game.json`; the build (`html/plugins/games.ts`) discovers games, draws the hub,
and writes `games-manifest.json`, which drives update-on-focus and the offline
cache. `docs/ARCHITECTURE.md` explains the whole flow.

## Standing rules

- **Adding or changing a game: use `/new-game` or `/check-game`.** They encode
  the process. A game PR changes only `html/games/<id>/` and `docs/games/<id>.md`;
  `tools/check-pr-scope.mjs` enforces it. Never register a game by hand in
  `vite.config.ts` or `index.html`; the plugin does that from `game.json`.
- **Read the guides before writing game code:** `docs/guides/AAC.md` (AAC
  games), `docs/guides/GAME-DESIGN.md`, `docs/guides/UI.md`, `docs/guides/CODING.md`, `docs/guides/BUDGETS.md`; `ART.md` and `AUDIO.md` when
  relevant. `templates/game/` is the worked example.
- **Everything goes through the build.** Relative asset references,
  `new URL(..., import.meta.url)` or `import.meta.glob`; no `public/` games, no
  absolute `/assets` paths, no cache-buster query strings, no external URLs.
- **No sound on this machine during checks.** Smoke tests run headless and
  muted (`npm run smoke`). Never open a game in a browser that can play audio to
  "see if it works". Check audio files with ffmpeg numbers, not by listening.
- **Fresh hosting per bundle, always.** Never point a bundle at a Vercel
  project, domain or APK host another bundle or app has used.
  `tools/check-hosting.mjs` enforces it before every deploy; never weaken it.
- **Shipping: `DEPLOY.md`.** Merging to `main` deploys the commit CI tested. Verify at the
  real URL (`tools/verify-live.sh`), never from a workflow's green badge. Only
  native changes need the shim workflow, and a shim only installs if
  `versionCode` went up (the workflow bumps it).
- **GitHub Actions minutes are scarce: `docs/CI-BUDGET.md`.** Local checks are the
  gate. No e2e, matrices, crons, macOS runners or per-PR LLM jobs in Actions; at
  most one cheap ubuntu build + unit job on PRs. Trim this template's workflows
  at spin-off as that doc says.
- **Branding lives in `bundle.config.json` only.** The framework must not
  contain a client name; `tools/sync-config.mjs --check` and CI look for leaks.
- **Docs: no em dashes; use "-" or ":".** Per-game docs go in
  `docs/games/<id>.md`; session logs go in `docs/archive/` with a date in the name.

## Commands

```bash
node tools/check-games.mjs [id]          # conformity lint (what CI runs)
node tools/sync-config.mjs [--check]     # push bundle.config.json into vercel.json, shell, capacitor, android
node html/scripts/new-game.mjs <id> "Title" [--players 2] [--orientation portrait] [--emoji 🎲]
cd html && npm run dev                   # hub + games at http://localhost:5173
cd html && npm run build && npm run smoke [-- --grep <id>]
```
