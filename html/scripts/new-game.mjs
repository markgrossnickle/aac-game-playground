#!/usr/bin/env node
// Scaffold a new game from templates/game into html/games/<id>/.
//
//   node html/scripts/new-game.mjs <id> "Title" [--aac] [--author handle] [--emoji 🎲] [--players 1|2] [--orientation any|portrait|landscape]
//
// --aac starts from the AAC version of the scaffold: playable by touch and by
// words from an AAC board, with game.json "input"/"aac" and tests/aac.spec.ts.
//
// The id is the folder name: lowercase letters, digits and single hyphens.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const templateDir = join(repoRoot, "templates", "game");
const aacOverlayDir = join(repoRoot, "templates", "game-aac");
const gamesDir = join(repoRoot, "html", "games");
const docsDir = join(repoRoot, "docs", "games");

const args = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith("--")) {
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) flags[a.slice(2)] = true;
    else {
      flags[a.slice(2)] = next;
      i++;
    }
  } else positional.push(a);
}
const [id, titleArg] = positional;

function fail(msg) {
  console.error(`new-game: ${msg}`);
  console.error('usage: node html/scripts/new-game.mjs <id> "Title" [--author handle] [--emoji 🎲] [--players 1|2] [--orientation any|portrait|landscape]');
  process.exit(2);
}

if (!id) fail("missing <id>");
if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(id) || id.length > 40) fail(`bad id "${id}": lowercase letters, digits and single hyphens only`);
const title = (titleArg || id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")).trim();
if (title.length > 32) fail("title must be 32 characters or fewer");
const target = join(gamesDir, id);
if (existsSync(target)) fail(`html/games/${id} already exists`);

const players = flags.players ? Number(flags.players) : 1;
if (players !== 1 && players !== 2) fail("--players must be 1 or 2");
const orientation = flags.orientation || "any";
if (!["any", "portrait", "landscape"].includes(orientation)) fail("--orientation must be any, portrait or landscape");
const emoji = flags.emoji || "🫧";
const author = flags.author || process.env.GITHUB_ACTOR || process.env.USER || process.env.USERNAME || "you";
const date = new Date().toISOString().slice(0, 10);

const replacements = {
  __GAME_ID__: id,
  __GAME_TITLE__: title,
  __DATE__: date,
  __AUTHOR__: author,
};

function render(text) {
  let out = text;
  for (const [k, v] of Object.entries(replacements)) out = out.split(k).join(v);
  return out;
}

function walk(dir, cb) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, cb);
    else cb(p);
  }
}

mkdirSync(gamesDir, { recursive: true });
cpSync(templateDir, target, { recursive: true });
const aac = flags.aac === true;
if (aac) {
  // Overlay the AAC scaffold; its style.extra.css is appended to the base styles.
  cpSync(aacOverlayDir, target, { recursive: true });
  const extra = join(target, "style.extra.css");
  if (existsSync(extra)) {
    writeFileSync(join(target, "style.css"), readFileSync(join(target, "style.css"), "utf8") + "\n" + readFileSync(extra, "utf8"));
    rmSync(extra);
  }
}
walk(target, (file) => {
  if (!/\.(html|css|ts|js|mjs|json|md)$/.test(file)) return;
  writeFileSync(file, render(readFileSync(file, "utf8")));
});

// Apply the flags to game.json after templating.
const metaPath = join(target, "game.json");
const meta = JSON.parse(readFileSync(metaPath, "utf8"));
meta.players = players;
meta.orientation = orientation;
meta.icon = { emoji };
if (aac) {
  meta.description = "Pop the bubbles by touch or with words from an AAC board.";
  meta.input = ["touch", "aac"];
  meta.aac = {
    vocabulary: [
      { word: "go", synonyms: ["start", "play"] },
      "pop",
      { word: "stop", synonyms: ["finish", "done"] },
      { word: "again", synonyms: ["more", "replay"] },
    ],
  };
}
writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");

// Per-game doc page.
const aacDocLine = aac
  ? `- AAC words: go (start, play), pop, stop (finish, done), again (more, replay). Gameplay test: \`html/games/${id}/tests/aac.spec.ts\`.\n`
  : "";
mkdirSync(docsDir, { recursive: true });
const docPath = join(docsDir, `${id}.md`);
if (!existsSync(docPath)) {
  writeFileSync(
    docPath,
    `# ${title} (\`html/games/${id}\`)

What it is: one or two sentences.

- Players: ${players}. Orientation: ${orientation}. Ages: ${meta.ages || "any"}.
- Code: \`html/games/${id}/src/main.ts\`. Assets: \`html/games/${id}/assets/\`.
- Saved state: \`game:${id}\` in localStorage (see \`createStore\`).
- Audio: none yet.
${aacDocLine}- Known gotchas: none yet.
`,
  );
}

console.log(`Created html/games/${id}/ ("${title}") and docs/games/${id}.md`);
console.log(`
Next:
  1. Read docs/guides/GAME-DESIGN.md, docs/guides/UI.md and docs/guides/CODING.md (short).
  2. Build the game in html/games/${id}/ only. Start with src/main.ts.
  3. cd html && npm run dev   then open http://localhost:5173/games/${id}/
  4. npm run check:games  (repo root)  and  cd html && npm run build && npm run smoke -- --grep ${id}
  5. Commit on a branch named game/${id} and open a PR.
${aac ? "\nAAC: words live in game.json \"aac.vocabulary\" and map to actions in playWithAac().\nKeep tests/aac.spec.ts in step with your words. Read docs/guides/AAC.md.\n" : ""}`);
