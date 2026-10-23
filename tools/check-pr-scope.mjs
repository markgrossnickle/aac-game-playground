#!/usr/bin/env node
// A game PR may only touch its own folder and its own doc page. Anything
// shared (SDK, hub, plugin, workflows, config) is a framework change that needs
// a maintainer, not a game contributor. CI runs this on pull requests.
//
//   node tools/check-pr-scope.mjs [--base origin/main]
//
// Rules:
//   - If the PR changes html/games/<id>/** for exactly one id, every other
//     changed file must be docs/games/<id>.md. Otherwise fail.
//   - A PR that touches no html/games/** file is a framework PR; it passes
//     here and is judged by review + CODEOWNERS.
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const base = baseIdx >= 0 ? args[baseIdx + 1] : process.env.PR_BASE_REF ? `origin/${process.env.PR_BASE_REF}` : "origin/main";

let files;
try {
  files = execSync(`git diff --name-only ${base}...HEAD`, { encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
} catch (e) {
  console.error(`check-pr-scope: could not diff against ${base}: ${e.message}`);
  process.exit(2);
}

const gameIds = new Set();
for (const f of files) {
  const m = /^html\/games\/([^/]+)\//.exec(f);
  if (m) gameIds.add(m[1]);
}

if (gameIds.size === 0) {
  console.log(`check-pr-scope: no game folders changed (${files.length} file(s)); framework PR, skipping scope rule.`);
  process.exit(0);
}
if (gameIds.size > 1) {
  console.error(`check-pr-scope: a PR must change one game at a time; this one touches: ${[...gameIds].join(", ")}`);
  process.exit(1);
}

const [id] = gameIds;
const allowed = (f) => f.startsWith(`html/games/${id}/`) || f === `docs/games/${id}.md`;
const outside = files.filter((f) => !allowed(f));
if (outside.length) {
  console.error(`check-pr-scope: game PR for "${id}" changes files outside html/games/${id}/ and docs/games/${id}.md:`);
  for (const f of outside) console.error(`  - ${f}`);
  console.error("Open a separate PR for framework changes, or ask a maintainer.");
  process.exit(1);
}
console.log(`check-pr-scope: OK, ${files.length} file(s), all inside game "${id}".`);
