#!/usr/bin/env node
// Conformity lint for every game under html/games/. Runs in CI and locally
// (`npm run check:games`). Exit code 1 with a readable list of problems.
//
// What it enforces (why, in docs/guides/CODING.md and BUDGETS.md):
//   - game.json valid, id equals folder, icon file present
//   - index.html loads scripts as ES modules and calls into the SDK
//   - no absolute /assets paths, no public/ dependence, no cache-buster queries
//   - no external network (fetch/XHR/WebSocket/script src to other origins)
//   - no speechSynthesis, eval, document.write, alert/confirm/prompt
//   - no raw localStorage/IndexedDB (use createStore), no service worker of its own
//   - no node_modules imports beyond the SDK (no new dependencies without approval)
//   - size budgets from bundle.config.json: per game, per file, file count
//   - media formats: png/webp/svg/jpg for images, mp3/ogg for audio; audio over 4 KB
//   - only game folders changed in a game PR is checked separately (check-pr-scope)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateGameMeta } from "../html/plugins/game-meta.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const gamesDir = join(root, "html", "games");
const config = JSON.parse(readFileSync(join(root, "bundle.config.json"), "utf8"));
const budgets = config.budgets;

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const problems = [];
const warnings = [];
let checked = 0;

function add(game, msg) {
  problems.push(`${game}: ${msg}`);
}
function warn(game, msg) {
  warnings.push(`${game}: ${msg}`);
}

function walk(dir, cb) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walk(p, cb);
    } else cb(p, st);
  }
}

const TEXT_EXT = new Set([".html", ".css", ".ts", ".js", ".mjs", ".json", ".svg", ".md", ".txt"]);
const IMAGE_EXT = new Set([".png", ".webp", ".svg", ".jpg", ".jpeg", ".gif"]);
const AUDIO_EXT = new Set([".mp3", ".ogg", ".wav", ".m4a"]);
const FONT_EXT = new Set([".woff", ".woff2", ".ttf", ".otf"]);
const DATA_EXT = new Set([".json", ".txt", ".csv", ".md"]);
const ALLOWED_EXT = new Set([...TEXT_EXT, ...IMAGE_EXT, ...AUDIO_EXT, ...FONT_EXT, ...DATA_EXT]);

const BANNED = [
  [/\bspeechSynthesis\b|SpeechSynthesisUtterance/, "uses speechSynthesis (dead in the Android WebView): use prerecorded clips via createVoiceClips"],
  [/\beval\s*\(|new\s+Function\s*\(/, "uses eval/new Function"],
  [/document\.write\s*\(/, "uses document.write"],
  [/\b(alert|confirm|prompt)\s*\(/, "uses alert/confirm/prompt (blocks the WebView): draw your own overlay"],
  [/navigator\.serviceWorker/, "registers its own service worker: the bundle owns the one worker"],
  [/\bindexedDB\b|openDatabase\s*\(/, "uses IndexedDB/WebSQL: use createStore from the SDK"],
  [/\blocalStorage\.(setItem|getItem|removeItem|clear)\b/, "uses localStorage directly: use createStore from the SDK"],
  [/new\s+WebSocket\s*\(|EventSource\s*\(/, "opens a network connection: games are offline-only"],
  [/\bfetch\s*\(\s*["'`]https?:/, "fetches an external URL: games are offline-only"],
  [/XMLHttpRequest/, "uses XMLHttpRequest: games are offline-only"],
  [/https?:\/\/(?!localhost)[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)]*\.(js|css|mjs|png|jpg|jpeg|webp|gif|svg|mp3|ogg|wav|woff2?|ttf|otf)\b/i, "loads an asset from another origin: everything ships inside the game folder"],
  [/@import\s+url\(\s*["']?https?:/, "imports a remote stylesheet (fonts included): bundle fonts locally or use system fonts"],
  [/<link[^>]+href=["']https?:\/\//i, "links a remote stylesheet/font: bundle it locally or use system fonts"],
  [/<script[^>]+src=["']https?:\/\//i, "loads a remote script"],
  [/\?v=\d+|\?cb=|\?t=\d+/, "has a manual cache-buster query string: the build already content-hashes files"],
  [/(["'`(])\/(assets|public|icons|games)\//, "uses an absolute path starting with /: reference assets relatively through the build"],
  [/\bimport\.meta\.env\.VITE_/, "reads custom VITE_ env vars: games must not depend on build environment"],
];

const SDK_IMPORT = /from\s+["'](\.\.\/)+src\/sdk(\/[A-Za-z]+)?["']/;
const PACKAGE_IMPORT = /^\s*import\s+[^"'`]*from\s+["']([^./"'`][^"'`]*)["']/m;

function checkGame(dir) {
  const id = relative(gamesDir, dir);
  checked++;
  const metaPath = join(dir, "game.json");
  const entry = join(dir, "index.html");
  if (!existsSync(metaPath)) return add(id, "missing game.json");
  if (!existsSync(entry)) return add(id, "missing index.html");

  let meta;
  try {
    meta = JSON.parse(readFileSync(metaPath, "utf8"));
  } catch (e) {
    return add(id, `game.json is not valid JSON: ${e.message}`);
  }
  for (const e of validateGameMeta(meta, id)) add(id, `game.json ${e}`);
  if (typeof meta.icon === "string") {
    const iconPath = join(dir, meta.icon);
    if (!existsSync(iconPath)) add(id, `icon "${meta.icon}" not found`);
    else if (statSync(iconPath).size > 300 * 1024) add(id, `icon "${meta.icon}" is over 300 KB`);
  }

  if (!existsSync(join(dir, "README.md"))) warn(id, "no README.md (the scaffold makes one; keep it current)");
  if (!existsSync(join(root, "docs", "games", `${id}.md`))) warn(id, `no docs/games/${id}.md page`);

  const html = readFileSync(entry, "utf8");
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) add(id, "index.html has no viewport meta tag");
  if (!/<title>\s*\S/.test(html)) add(id, "index.html has no <title>");
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1]);
  if (scripts.length === 0) add(id, "index.html loads no script");
  for (const attrs of scripts) {
    const hasSrc = /\bsrc=/.test(attrs);
    const isModule = /type=["']module["']/.test(attrs);
    if (hasSrc && !isModule) add(id, "index.html loads a classic <script src>: use type=\"module\" so the build tracks it");
    if (!hasSrc) add(id, "index.html has an inline <script>: move the code to src/main.ts");
  }
  if (/<a\s[^>]*class=["'][^"']*\bback\b/.test(html)) warn(id, "index.html hand-writes the Back link; bootGame() adds it (remove yours or pass backLink: false)");

  let total = 0;
  let count = 0;
  let sawBoot = false;
  let sawModuleCode = false;
  let sawAac = false;
  walk(dir, (file, st) => {
    const rel = relative(dir, file).replace(/\\/g, "/");
    const ext = extname(file).toLowerCase();
    count++;
    total += st.size;
    if (!ALLOWED_EXT.has(ext)) add(id, `${rel}: file type ${ext || "(none)"} is not allowed in a game folder`);
    if (st.size > budgets.maxFileMB * 1024 * 1024) add(id, `${rel}: ${(st.size / 1048576).toFixed(1)} MB is over the ${budgets.maxFileMB} MB per-file budget`);
    if (AUDIO_EXT.has(ext)) {
      if (ext === ".wav") add(id, `${rel}: .wav is too large; encode as mp3 (mono, 64 kbps) or ogg`);
      if (st.size <= 4096) add(id, `${rel}: audio file is 4 KB or smaller; tiny files are inlined by the build and miss the offline cache`);
    }
    if (ext === ".jpeg") warn(id, `${rel}: prefer .webp or .png`);
    if (ext === ".gif") warn(id, `${rel}: prefer a sprite sheet or webp; gif is large and slow`);
    if (rel.startsWith("assets_raw/") || rel.includes("/raw/")) add(id, `${rel}: raw/source assets do not belong in the game folder`);

    // Playwright specs under tests/ run in Node, not in the game: they may use
    // absolute routes and import @playwright/test, so the in-game rules skip them.
    const isTest = rel.startsWith("tests/");
    if (isTest && !/\.spec\.ts$/.test(rel)) add(id, `${rel}: only *.spec.ts files belong in tests/`);

    if (TEXT_EXT.has(ext) && ext !== ".svg" && ext !== ".md" && !isTest) {
      const text = readFileSync(file, "utf8");
      if (/\.(ts|js|mjs)$/.test(ext)) {
        sawModuleCode = true;
        if (/\bbootGame\s*\(/.test(text)) sawBoot = true;
        if (/\bplayWithAac\s*\(/.test(text)) sawAac = true;
        if (SDK_IMPORT.test(text) && !/from\s+["']\.\.\/\.\.\/\.\.\/src\/sdk/.test(text) && rel.split("/").length === 2) {
          warn(id, `${rel}: SDK import path looks wrong for a file in src/ (expected ../../../src/sdk)`);
        }
        for (const m of text.matchAll(/^\s*import\s+[^"'`]*from\s+["']([^"'`]+)["']/gm)) {
          const spec = m[1];
          if (spec.startsWith(".")) {
            if (/\/src\/(landing|plugins)\b/.test(spec) || spec.includes("../games/")) add(id, `${rel}: imports outside the game folder or SDK (${spec})`);
            if (/\.\.\/src\/sdk\/(sw|offline)\b/.test(spec)) add(id, `${rel}: imports an SDK internal (${spec}); import from "../../../src/sdk" only`);
          } else if (!spec.startsWith("virtual:")) {
            add(id, `${rel}: imports a package (${spec}); games may only import the SDK and their own files`);
          }
        }
      }
      for (const [re, msg] of BANNED) {
        if (re.test(text)) add(id, `${rel}: ${msg}`);
      }
    }
  });
  const wantsAac = Array.isArray(meta.input) && meta.input.includes("aac");
  if (wantsAac && !sawAac) add(id, 'game.json "input" includes "aac" but the code never calls playWithAac() from the SDK');
  if (!wantsAac && sawAac) add(id, 'calls playWithAac() but game.json "input" does not include "aac"');
  if (wantsAac && !existsSync(join(dir, "tests", "aac.spec.ts"))) {
    add(id, "AAC games need tests/aac.spec.ts: gameplay driven by words (start, play, replay, ignored words, duplicates, disconnects, sharing off). See docs/guides/AAC.md.");
  }
  if (sawModuleCode && !sawBoot) add(id, "never calls bootGame() from the SDK (import { bootGame } from \"../../../src/sdk\")");
  if (count > budgets.maxFilesPerGame) add(id, `${count} files is over the ${budgets.maxFilesPerGame} file budget`);
  if (total > budgets.maxGameMB * 1024 * 1024) add(id, `${(total / 1048576).toFixed(1)} MB is over the ${budgets.maxGameMB} MB per-game budget`);
  else if (total > budgets.maxGameMB * 1024 * 1024 * 0.6) warn(id, `${(total / 1048576).toFixed(1)} MB is over 60% of the ${budgets.maxGameMB} MB budget`);
}

if (!existsSync(gamesDir)) {
  console.log("check-games: html/games/ does not exist; nothing to check.");
  process.exit(0);
}
const dirs = readdirSync(gamesDir)
  .filter((n) => !n.startsWith(".") && !n.startsWith("_") && statSync(join(gamesDir, n)).isDirectory())
  .filter((n) => only.length === 0 || only.includes(n));
for (const n of dirs) checkGame(join(gamesDir, n));

for (const w of warnings) console.log(`warning  ${w}`);
for (const p of problems) console.log(`error    ${p}`);
console.log(`check-games: ${checked} game(s), ${problems.length} error(s), ${warnings.length} warning(s)`);
process.exit(problems.length ? 1 : 0);
