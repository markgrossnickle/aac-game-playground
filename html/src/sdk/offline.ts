// Offline cache control. The page owns the caches; public/sw.js only serves
// them (see the comment at the top of that file).
//
// Cache names: hub:<version> and game:<id>:<version>. A game is cached the first
// time it is opened online, and refreshed in the background whenever the
// manifest reports a new version. Old versions are deleted after the new one is
// complete, so a half-finished update never replaces a working copy.

import { MANIFEST_URL, type GamesManifest } from "./manifest";

const ADDALL_OPTS: RequestInit = { cache: "no-cache", credentials: "same-origin" };
// Written into a cache only after every file is stored, so a cache that exists
// but is still filling (or failed halfway) never reads as "ready".
const COMPLETE_KEY = "/__cache-complete__";

function cacheApiAvailable(): boolean {
  return typeof caches !== "undefined" && typeof caches.open === "function" && location.protocol !== "file:";
}

/** Register public/sw.js. Production builds only; dev stays uncached. */
export async function registerServiceWorker(): Promise<void> {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator) || !cacheApiAvailable()) return;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    // No offline support in this browser; the bundle still works online.
  }
}

async function fillCache(name: string, files: string[]): Promise<boolean> {
  if (!cacheApiAvailable() || files.length === 0) return false;
  try {
    const cache = await caches.open(name);
    // Add one by one instead of addAll so a single transient failure does not
    // discard the files already stored; report false if anything is missing.
    const results = await Promise.all(
      files.map(async (url) => {
        const hit = await cache.match(url, { ignoreVary: true, ignoreSearch: true });
        if (hit) return true;
        try {
          const res = await fetch(url, ADDALL_OPTS);
          if (!res.ok) return false;
          await cache.put(url, res);
          return true;
        } catch {
          return false;
        }
      }),
    );
    const ok = results.every(Boolean);
    if (ok) await cache.put(COMPLETE_KEY, new Response("ok", { headers: { "Content-Type": "text/plain" } }));
    return ok;
  } catch {
    return false;
  }
}

/**
 * Keep the manifest we just used where the service worker looks for an offline
 * fallback ("meta" cache), so a page opened offline still gets a version list
 * instead of a failed fetch. The worker also does this on successful network
 * fetches, but the very first page load is not yet controlled by it.
 */
async function rememberManifest(manifest: GamesManifest): Promise<void> {
  if (!cacheApiAvailable()) return;
  try {
    const cache = await caches.open("meta");
    await cache.put(
      new URL(MANIFEST_URL, location.origin).href,
      new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/json" } }),
    );
  } catch {
    // Best effort only.
  }
}

async function cacheComplete(name: string): Promise<boolean> {
  if (!cacheApiAvailable() || !(await caches.has(name))) return false;
  const cache = await caches.open(name);
  return !!(await cache.match(COMPLETE_KEY));
}

async function deleteCachesMatching(prefix: string, keep: string): Promise<void> {
  if (!cacheApiAvailable()) return;
  const names = await caches.keys();
  await Promise.all(names.filter((n) => n.startsWith(prefix) && n !== keep).map((n) => caches.delete(n)));
}

/** Is this exact game version fully cached? */
export async function isGameCached(id: string, version: string): Promise<boolean> {
  return cacheComplete(`game:${id}:${version}`);
}

/** Which game ids have any cached version at all. */
export async function cachedGameIds(): Promise<Set<string>> {
  const out = new Set<string>();
  if (!cacheApiAvailable()) return out;
  for (const n of await caches.keys()) {
    const m = /^game:([a-z0-9-]+):/.exec(n);
    if (m) out.add(m[1]!);
  }
  return out;
}

/**
 * Make `id` playable offline at the version the manifest lists. Resolves true
 * when every file is stored. Older versions of the same game are removed only
 * after the new one is complete.
 */
export async function ensureGameCached(manifest: GamesManifest, id: string): Promise<boolean> {
  const game = manifest.games.find((g) => g.id === id);
  if (!game) return false;
  const name = `game:${id}:${game.version}`;
  await rememberManifest(manifest);
  if (await cacheComplete(name)) return true;
  const ok = await fillCache(name, game.files);
  if (ok) await deleteCachesMatching(`game:${id}:`, name);
  else if (cacheApiAvailable()) {
    // Do not leave a partial cache behind; a later visit retries from scratch.
    await caches.delete(name).catch(() => {});
  }
  return ok;
}

/** Cache the hub shell itself so the app opens offline. */
export async function ensureHubCached(manifest: GamesManifest): Promise<boolean> {
  const name = `hub:${manifest.hub.version}`;
  await rememberManifest(manifest);
  if (await cacheComplete(name)) return true;
  const files = [...manifest.hub.files, "/", manifest.base];
  const ok = await fillCache(name, [...new Set(files)]);
  if (ok) await deleteCachesMatching("hub:", name);
  return ok;
}

/**
 * Bring every already-cached game up to the manifest's version and drop
 * caches for games that no longer exist. Returns the ids that were refreshed.
 */
export async function refreshCachedGames(manifest: GamesManifest): Promise<string[]> {
  const refreshed: string[] = [];
  const have = await cachedGameIds();
  const live = new Set(manifest.games.map((g) => g.id));
  for (const id of have) {
    if (!live.has(id)) {
      await deleteCachesMatching(`game:${id}:`, "");
      continue;
    }
    const game = manifest.games.find((g) => g.id === id)!;
    if (await isGameCached(id, game.version)) continue;
    if (await ensureGameCached(manifest, id)) refreshed.push(id);
  }
  return refreshed;
}

/** Remove runtime-cached hashed assets no current game or hub references. */
export async function pruneRuntimeCache(manifest: GamesManifest): Promise<void> {
  if (!cacheApiAvailable()) return;
  const keep = new Set<string>(manifest.hub.files);
  for (const g of manifest.games) for (const f of g.files) keep.add(f);
  try {
    const cache = await caches.open("runtime-assets");
    for (const req of await cache.keys()) {
      const path = new URL(req.url).pathname;
      if (!keep.has(path)) await cache.delete(req);
    }
  } catch {
    // Best effort only.
  }
}
