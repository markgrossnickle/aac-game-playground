#!/usr/bin/env node
// Push bundle.config.json into the few files that cannot read it at build time:
//   - vercel.json          (the /games.apk redirect target)
//   - capacitor.config.json (appId, appName, server.url for the shim)
//   - html/shell/index.html (the offline fallback's title and origin)
//   - android/              (applicationId, namespace, app name, MainActivity package)
//
//   node tools/sync-config.mjs          # rewrite files
//   node tools/sync-config.mjs --check  # exit 1 if any file is out of date (CI)
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const check = process.argv.includes("--check");
const cfg = JSON.parse(readFileSync(join(root, "bundle.config.json"), "utf8"));

const stale = [];
function put(relPath, next) {
  const abs = join(root, relPath);
  const prev = existsSync(abs) ? readFileSync(abs, "utf8") : null;
  if (prev === next) return;
  if (check) {
    stale.push(relPath);
    return;
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, next);
  console.log(`sync-config: updated ${relPath}`);
}

function validateConfig() {
  const errors = [];
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(cfg.appId)) errors.push("appId must be a reverse-domain id like com.example.bundle");
  if (!/^https:\/\/[^/]+$/.test(cfg.webUrl)) errors.push("webUrl must be an https origin with no path");
  if (!/^https:\/\/[^/]+$/.test(cfg.apkUrl)) errors.push("apkUrl must be an https origin with no path");
  if (!cfg.name || cfg.name.length > 40) errors.push("name is required (max 40 chars)");
  if (typeof cfg.repository !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cfg.repository)) errors.push("repository must be owner/repo (OWNER/REPO in the template)");
  if (!cfg.shortName || cfg.shortName.length > 12) errors.push("shortName is required (max 12 chars)");
  for (const k of ["maxGameMB", "maxFileMB", "maxFilesPerGame"]) {
    if (typeof cfg.budgets?.[k] !== "number") errors.push(`budgets.${k} must be a number`);
  }
  if (errors.length) {
    console.error("bundle.config.json is invalid:\n  - " + errors.join("\n  - "));
    process.exit(1);
  }
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

validateConfig();

// 1. vercel.json redirect
{
  const path = join(root, "vercel.json");
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.redirects = [
    { source: "/games.apk", destination: `${cfg.apkUrl}/games.apk`, permanent: false },
    ...(json.redirects || []).filter((r) => r.source !== "/games.apk"),
  ];
  put("vercel.json", JSON.stringify(json, null, 2) + "\n");
}

// 1b. capacitor.config.json (the shim: thin shell whose WebView loads webUrl live)
put(
  "capacitor.config.json",
  JSON.stringify(
    {
      appId: cfg.appId,
      appName: cfg.name,
      webDir: "html/shell",
      server: { url: cfg.webUrl, cleartext: false },
    },
    null,
    2,
  ) + "\n",
);

// 2. shell fallback page
{
  const path = join(root, "html", "shell", "index.html");
  let html = readFileSync(path, "utf8");
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeXml(cfg.name)}</title>`);
  html = html.replace(/<h1>[^<]*<\/h1>/, `<h1>${escapeXml(cfg.name)}</h1>`);
  html = html.replace(/var ORIGIN = "[^"]*";/, `var ORIGIN = "${cfg.webUrl}/";`);
  put("html/shell/index.html", html);
}

// 3. Android project (only if it exists)
const android = join(root, "android");
if (existsSync(android)) {
  const gradle = join(android, "app", "build.gradle");
  if (existsSync(gradle)) {
    let g = readFileSync(gradle, "utf8");
    g = g.replace(/namespace\s+"[^"]+"/, `namespace "${cfg.appId}"`);
    g = g.replace(/applicationId\s+"[^"]+"/, `applicationId "${cfg.appId}"`);
    put("android/app/build.gradle", g);
  }
  const strings = join(android, "app", "src", "main", "res", "values", "strings.xml");
  if (existsSync(strings)) {
    const xml = `<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">${escapeXml(cfg.name)}</string>
    <string name="title_activity_main">${escapeXml(cfg.name)}</string>
    <string name="package_name">${cfg.appId}</string>
    <string name="custom_url_scheme">${cfg.appId}</string>
</resources>
`;
    put("android/app/src/main/res/values/strings.xml", xml);
  }
  // MainActivity must live in a package path matching appId.
  const javaRoot = join(android, "app", "src", "main", "java");
  if (existsSync(javaRoot)) {
    const wantDir = join(javaRoot, ...cfg.appId.split("."));
    const wantFile = join(wantDir, "MainActivity.java");
    const content = `package ${cfg.appId};\n\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {}\n`;
    const existing = findFile(javaRoot, "MainActivity.java");
    if (existing && existing !== wantFile) {
      if (check) stale.push(`android MainActivity package (${existing})`);
      else {
        mkdirSync(wantDir, { recursive: true });
        renameSync(existing, wantFile);
        pruneEmptyDirs(javaRoot);
        console.log("sync-config: moved MainActivity.java to the appId package");
      }
    }
    put(join("android", "app", "src", "main", "java", ...cfg.appId.split("."), "MainActivity.java").replace(/\\/g, "/"), content);
  }
}

function findFile(dir, name) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      const r = findFile(p, name);
      if (r) return r;
    } else if (n === name) return p;
  }
  return null;
}

function pruneEmptyDirs(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      pruneEmptyDirs(p);
      if (readdirSync(p).length === 0) rmSync(p, { recursive: true });
    }
  }
}

if (check) {
  if (stale.length) {
    console.error("sync-config: these files are out of date with bundle.config.json:\n  - " + stale.join("\n  - ") + "\nRun: node tools/sync-config.mjs");
    process.exit(1);
  }
  console.log("sync-config: everything matches bundle.config.json");
} else {
  console.log("sync-config: done");
}
