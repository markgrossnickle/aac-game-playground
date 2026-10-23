/*
 * Service worker: serves what the hub and the SDK have precached, so games play
 * offline and a stale copy never wins over a fresh one.
 *
 * Division of labour (keep it this way, it avoids postMessage footguns):
 *   - The PAGE decides what to cache. html/src/sdk/offline.ts opens a cache
 *     named game:<id>:<version> (or hub:<version>) and addAll()s the exact file
 *     list from games-manifest.json. When the manifest changes it refills and
 *     drops the old caches.
 *   - This worker only SERVES. It never decides versions.
 *
 * Rules:
 *   - games-manifest.json and every HTML navigation are NETWORK-FIRST, so a
 *     returning online user always gets the current page and version list.
 *   - /assets/* files carry a content hash in their name, so they are
 *     CACHE-FIRST and may be stored opportunistically in a runtime cache.
 *   - Everything else same-origin is network-first with cache fallback.
 *   - ignoreVary: true is load-bearing. cache.addAll stores files from no-cors
 *     requests (no Origin header) while the real crossorigin module-script
 *     request sends one, and hosts tag JS/CSS with "Vary: Origin". Without it
 *     the match fails and offline play breaks with ERR_FAILED on every chunk.
 */

const RUNTIME = "runtime-assets";
const META = "meta";
const MATCH_OPTS = { ignoreVary: true, ignoreSearch: true };

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function isHashedAsset(url) {
  return /\/assets\/[^/]+\.[a-z0-9]+$/i.test(url.pathname);
}

async function fromCache(request, url) {
  const direct = await caches.match(request, MATCH_OPTS);
  if (direct) return direct;
  if (request.mode === "navigate" || url.pathname.endsWith("/")) {
    const withIndex = new URL(url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname + "/index.html", url.origin);
    const idx = await caches.match(withIndex.href, MATCH_OPTS);
    if (idx) return idx;
  }
  return null;
}

function isManifest(url) {
  return url.pathname.endsWith("/games-manifest.json");
}

async function networkFirst(request, url) {
  try {
    const res = await fetch(request, { cache: "no-cache" });
    if (res && res.ok) {
      // Keep the last good manifest so an offline page can still read the
      // version list instead of logging a failed fetch.
      if (isManifest(url)) {
        const copy = res.clone();
        caches.open(META).then((c) => c.put(url.origin + url.pathname, copy)).catch(() => {});
      }
      return res;
    }
    const cached = await fromCache(request, url);
    return cached || res;
  } catch (err) {
    const cached = await fromCache(request, url);
    if (cached) return cached;
    if (request.mode === "navigate") return offlinePage();
    throw err;
  }
}

async function cacheFirst(request, url) {
  const cached = await caches.match(request, MATCH_OPTS);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok && (res.type === "basic" || res.type === "default")) {
    const copy = res.clone();
    caches.open(RUNTIME).then((c) => c.put(request, copy)).catch(() => {});
  }
  return res;
}

function offlinePage() {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0e1116;color:#e6edf3;font-family:system-ui,sans-serif;text-align:center;padding:24px}a{color:#58a6ff}</style>
<div><h1>This game is not downloaded yet</h1><p>Connect to the internet once to play it. Games you have already opened stay playable offline.</p><p><a href="/">Back to all games</a></p></div>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js") return;

  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request, url));
    return;
  }
  // Manifest, HTML navigations and everything else: fresh when online.
  event.respondWith(networkFirst(request, url));
});
