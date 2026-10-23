// games(): the one Vite plugin that turns html/games/*/game.json into a bundle.
//
//  1. config()            every games/<id>/index.html becomes a rollup input, so
//                         nobody edits vite.config.ts or index.html to add a game.
//  2. transformIndexHtml  fills %BUNDLE_*% placeholders from bundle.config.json
//                         and injects one hub card per game at <!-- GAMES -->.
//  3. virtual modules     `virtual:bundle-config` gives the SDK the branding bits;
//                         `virtual:aac-vocabularies` gives it each game's AAC words.
//  4. generateBundle      emits site.webmanifest from the config.
//  5. closeBundle         walks dist/.vite/manifest.json per game and writes
//                         dist/games-manifest.json: the registry the hub renders,
//                         the exact file list the service worker precaches, and a
//                         content hash per game that changes iff its files change.
//                         That hash is the whole update story (see docs/ARCHITECTURE.md).
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { normalizePath, type Plugin, type ResolvedConfig } from "vite";
import { aacVocabulary, escapeHtml, validateGameMeta, type GameMeta } from "./game-meta.mjs";

export interface BundleConfig {
  name: string;
  shortName: string;
  description: string;
  appId: string;
  webUrl: string;
  apkUrl: string;
  theme: { background: string; accent: string };
  budgets: { maxGameMB: number; maxFileMB: number; maxFilesPerGame: number };
  audio?: { defaultMutedOnDesktop?: boolean };
  aac?: { relay: string | null };
}

export interface DiscoveredGame {
  meta: GameMeta;
  dir: string; // absolute path of games/<id>
  entry: string; // absolute path of games/<id>/index.html
  htmlKey: string; // manifest key: games/<id>/index.html
}

interface ManifestChunk {
  file: string;
  src?: string;
  isEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
  assets?: string[];
}
type ViteManifest = Record<string, ManifestChunk>;

export interface GameManifestEntry extends GameMeta {
  route: string;
  version: string;
  sizeBytes: number;
  files: string[];
}

export interface GamesManifest {
  buildId: string;
  builtAt: string;
  base: string;
  bundle: { name: string; shortName: string };
  hub: { version: string; files: string[] };
  games: GameManifestEntry[];
}

const VIRTUAL_ID = "virtual:bundle-config";
const RESOLVED_VIRTUAL_ID = "\0" + VIRTUAL_ID;
const AAC_VIRTUAL_ID = "virtual:aac-vocabularies";
const RESOLVED_AAC_VIRTUAL_ID = "\0" + AAC_VIRTUAL_ID;
const NEW_WINDOW_DAYS = 30;

export function loadBundleConfig(root: string): BundleConfig {
  const path = resolve(root, "..", "bundle.config.json");
  return JSON.parse(readFileSync(path, "utf8")) as BundleConfig;
}

export function discoverGames(root: string): DiscoveredGame[] {
  const gamesDir = resolve(root, "games");
  if (!existsSync(gamesDir)) return [];
  const out: DiscoveredGame[] = [];
  const problems: string[] = [];
  for (const name of readdirSync(gamesDir).sort()) {
    const dir = join(gamesDir, name);
    if (!statSync(dir).isDirectory() || name.startsWith(".") || name.startsWith("_")) continue;
    const metaPath = join(dir, "game.json");
    const entry = join(dir, "index.html");
    if (!existsSync(metaPath)) {
      problems.push(`${name}: missing game.json`);
      continue;
    }
    if (!existsSync(entry)) {
      problems.push(`${name}: missing index.html`);
      continue;
    }
    let meta: unknown;
    try {
      meta = JSON.parse(readFileSync(metaPath, "utf8"));
    } catch (err) {
      problems.push(`${name}: game.json is not valid JSON (${(err as Error).message})`);
      continue;
    }
    const errors = validateGameMeta(meta, name);
    if (errors.length) {
      problems.push(...errors.map((e) => `${name}: ${e}`));
      continue;
    }
    const m = meta as GameMeta;
    if (typeof m.icon === "string" && !existsSync(join(dir, m.icon))) {
      problems.push(`${name}: icon file "${m.icon}" not found in the game folder`);
      continue;
    }
    out.push({ meta: m, dir, entry, htmlKey: `games/${name}/index.html` });
  }
  if (problems.length) {
    throw new Error(`Invalid game(s):\n  - ${problems.join("\n  - ")}\nSee docs/guides/CODING.md and schemas/game.schema.json.`);
  }
  return out;
}

function isNew(addedOn: string): boolean {
  const when = Date.parse(addedOn);
  if (Number.isNaN(when)) return false;
  const ageDays = (Date.now() - when) / 86_400_000;
  return ageDays >= 0 && ageDays <= NEW_WINDOW_DAYS;
}

function renderCard(g: DiscoveredGame): string {
  const m = g.meta;
  const icon =
    typeof m.icon === "string"
      ? `<img class="ico" src="games/${m.id}/${m.icon}" alt="" width="132" height="132" />`
      : `<div class="ico ico--emoji" aria-hidden="true">${escapeHtml(m.icon.emoji)}</div>`;
  const tag = isNew(m.addedOn) ? `<span class="card-tag">New</span>` : "";
  const aac = m.input?.includes("aac");
  const aacBadge = aac ? `<span class="card-aac" title="Plays with an AAC board">AAC</span>` : "";
  return [
    `<a class="card" href="games/${m.id}/index.html" data-game="${m.id}" data-added-on="${m.addedOn}" data-players="${m.players}"${aac ? ' data-aac="1"' : ""} title="${escapeHtml(m.description)}">`,
    `  ${icon}`,
    `  <span class="title">${escapeHtml(m.title)}</span>`,
    tag ? `  ${tag}` : "",
    aacBadge ? `  ${aacBadge}` : "",
    `</a>`,
  ]
    .filter(Boolean)
    .join("\n      ");
}

function fillPlaceholders(html: string, cfg: BundleConfig): string {
  return html
    .replace(/%BUNDLE_NAME%/g, escapeHtml(cfg.name))
    .replace(/%BUNDLE_SHORT_NAME%/g, escapeHtml(cfg.shortName))
    .replace(/%BUNDLE_DESCRIPTION%/g, escapeHtml(cfg.description))
    .replace(/%BUNDLE_BG%/g, cfg.theme.background)
    .replace(/%BUNDLE_ACCENT%/g, cfg.theme.accent)
    .replace(/%BUNDLE_WEB_URL%/g, cfg.webUrl)
    .replace(/%BUNDLE_APK_URL%/g, cfg.apkUrl);
}

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function webManifest(cfg: BundleConfig): string {
  return JSON.stringify(
    {
      name: cfg.name,
      short_name: cfg.shortName,
      description: cfg.description,
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "any",
      background_color: cfg.theme.background,
      theme_color: cfg.theme.background,
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2,
  );
}

export function games(): Plugin {
  let root = "";
  let cfg: BundleConfig;
  let discovered: DiscoveredGame[] = [];
  let resolved: ResolvedConfig;

  return {
    name: "game-bundle:games",

    config(userConfig) {
      root = resolve(userConfig.root ?? ".");
      cfg = loadBundleConfig(root);
      discovered = discoverGames(root);
      const input: Record<string, string> = {
        main: resolve(root, "index.html"),
        download: resolve(root, "download/index.html"),
      };
      for (const g of discovered) input[g.meta.id] = g.entry;
      return {
        define: {
          __BUNDLE_GAME_COUNT__: JSON.stringify(discovered.length),
        },
        build: {
          manifest: true,
          rollupOptions: { input },
        },
      };
    },

    configResolved(c) {
      resolved = c;
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
      if (id === AAC_VIRTUAL_ID) return RESOLVED_AAC_VIRTUAL_ID;
      return null;
    },

    load(id) {
      if (id === RESOLVED_AAC_VIRTUAL_ID) {
        // Every AAC game's vocabulary, keyed by game id, straight from game.json.
        const map: Record<string, ReturnType<typeof aacVocabulary>> = {};
        for (const g of discovered) {
          const v = aacVocabulary(g.meta);
          if (v.length) map[g.meta.id] = v;
        }
        return `export default ${JSON.stringify(map)};`;
      }
      if (id !== RESOLVED_VIRTUAL_ID) return null;
      const pub = {
        name: cfg.name,
        shortName: cfg.shortName,
        description: cfg.description,
        webUrl: cfg.webUrl,
        apkUrl: cfg.apkUrl,
        theme: cfg.theme,
        audio: { defaultMutedOnDesktop: cfg.audio?.defaultMutedOnDesktop ?? false },
        aac: { relay: cfg.aac?.relay ?? null },
      };
      return `export default ${JSON.stringify(pub)};`;
    },

    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        let out = fillPlaceholders(html, cfg);
        if (normalizePath(ctx.filename) === normalizePath(resolve(root, "index.html"))) {
          const visible = discovered.filter((g) => !g.meta.hidden);
          const sorted = [...visible].sort((a, b) => b.meta.addedOn.localeCompare(a.meta.addedOn) || a.meta.title.localeCompare(b.meta.title));
          const cards = sorted.map(renderCard).join("\n      ");
          if (!out.includes("<!-- GAMES -->")) {
            throw new Error("index.html must contain the <!-- GAMES --> marker inside <main class=\"grid\">");
          }
          out = out.replace("<!-- GAMES -->", cards || "<!-- no games yet -->");
        }
        return out;
      },
    },

    configureServer(server) {
      // Dev-only stand-ins for files the build emits, so the hub and SDK code
      // paths run the same way with `npm run dev` (no service worker in dev).
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (url === "/site.webmanifest") {
          res.setHeader("Content-Type", "application/manifest+json");
          res.end(webManifest(cfg));
          return;
        }
        if (url === "/games-manifest.json") {
          const dev: GamesManifest = {
            buildId: "dev",
            builtAt: new Date().toISOString(),
            base: resolved.base,
            bundle: { name: cfg.name, shortName: cfg.shortName },
            hub: { version: "dev", files: [] },
            games: discovered.map((g) => ({ ...g.meta, route: `/games/${g.meta.id}/`, version: "dev", sizeBytes: 0, files: [] })),
          };
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(dev));
          return;
        }
        next();
      });
    },

    generateBundle() {
      this.emitFile({ type: "asset", fileName: "site.webmanifest", source: webManifest(cfg) });
    },

    closeBundle() {
      if (resolved.command !== "build") return;
      const dist = resolve(root, resolved.build.outDir);
      const manifestPath = join(dist, ".vite", "manifest.json");
      if (!existsSync(manifestPath)) {
        throw new Error("dist/.vite/manifest.json not found; build.manifest must stay enabled.");
      }
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ViteManifest;
      const base = resolved.base.endsWith("/") ? resolved.base : resolved.base + "/";

      const walk = (key: string, seen: Set<string>): void => {
        const chunk = manifest[key];
        if (!chunk || seen.has(key)) return;
        seen.add(key);
        seen.add("file:" + chunk.file);
        for (const c of chunk.css ?? []) seen.add("file:" + c);
        for (const a of chunk.assets ?? []) seen.add("file:" + a);
        for (const i of chunk.imports ?? []) walk(i, seen);
        for (const d of chunk.dynamicImports ?? []) walk(d, seen);
      };

      // Belt and braces: also pick up /assets/* references that only appear
      // inside emitted HTML/CSS text (for example CSS url() images), so the
      // precache list never misses a file the page actually loads.
      const scanText = (file: string, into: Set<string>): void => {
        const abs = join(dist, file);
        if (!existsSync(abs)) return;
        const text = readFileSync(abs, "utf8");
        for (const m of text.matchAll(/(?:^|["'(=\s])\/?(assets\/[A-Za-z0-9._-]+)/g)) {
          const rel = m[1]!;
          if (existsSync(join(dist, rel))) into.add("file:" + rel);
        }
      };

      const filesFor = (key: string, extra: string[] = []): string[] => {
        const seen = new Set<string>();
        walk(key, seen);
        const files = new Set<string>([key, ...extra]);
        for (const s of seen) if (s.startsWith("file:")) files.add(s.slice(5));
        for (const f of [...files]) if (/\.(html|css)$/.test(f)) scanText(f, seen);
        for (const s of seen) if (s.startsWith("file:")) files.add(s.slice(5));
        return [...files].filter((f) => existsSync(join(dist, f))).sort();
      };

      const describe = (files: string[]): { version: string; sizeBytes: number; urls: string[] } => {
        let size = 0;
        const lines: string[] = [];
        for (const f of files) {
          const buf = readFileSync(join(dist, f));
          size += buf.length;
          lines.push(`${f}:${sha256(buf)}`);
        }
        return { version: sha256(lines.join("\n")).slice(0, 16), sizeBytes: size, urls: files.map((f) => base + f) };
      };

      const publicIcons = existsSync(join(dist, "icons"))
        ? readdirSync(join(dist, "icons")).map((f) => posix.join("icons", f))
        : [];
      const hub = describe(filesFor("index.html", ["site.webmanifest", ...publicIcons]));

      const entries: GameManifestEntry[] = [];
      const missing: string[] = [];
      for (const g of discovered) {
        if (!manifest[g.htmlKey]) {
          missing.push(g.meta.id);
          continue;
        }
        const d = describe(filesFor(g.htmlKey));
        entries.push({
          ...g.meta,
          route: `${base}games/${g.meta.id}/`,
          version: d.version,
          sizeBytes: d.sizeBytes,
          files: d.urls,
        });
      }
      if (missing.length) {
        throw new Error(`Games missing from the Vite manifest (not built as entries?): ${missing.join(", ")}`);
      }

      const buildId = sha256([hub.version, ...entries.map((e) => `${e.id}:${e.version}`)].join("\n")).slice(0, 16);
      const out: GamesManifest = {
        buildId,
        builtAt: new Date().toISOString(),
        base,
        bundle: { name: cfg.name, shortName: cfg.shortName },
        hub: { version: hub.version, files: hub.urls },
        games: entries,
      };
      writeFileSync(join(dist, "games-manifest.json"), JSON.stringify(out, null, 2));
      resolved.logger.info(
        `[games] wrote games-manifest.json: build ${buildId}, ${entries.length} game(s), hub ${hub.urls.length} file(s)`,
      );
    },
  };
}
