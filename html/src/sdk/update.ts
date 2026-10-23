// Update-on-focus. Every page (hub and games) re-reads games-manifest.json when
// it comes back into view: tab focus, visibilitychange, and the Capacitor
// appStateChange event inside the Android shim. Checks are throttled so a
// flurry of focus events costs one request.
//
// Policy:
//   - Hub: a changed hub version reloads the page (nothing to lose there).
//     Changed game versions are refreshed in the cache in the background.
//   - Game: never reload under a child's fingers. Show a small banner; the
//     reload happens on tap, or automatically the next time the game is opened.
import { currentGameId, fetchManifest, type GamesManifest } from "./manifest";

const MIN_INTERVAL_MS = 15_000;

export interface UpdateCheckOptions {
  /** Called with the fresh manifest on every successful check. */
  onManifest?: (m: GamesManifest, first: boolean) => void;
  /** Called when the current page's own version differs from the first one seen. */
  onUpdateAvailable?: (m: GamesManifest) => void;
}

export interface UpdateChecker {
  check(): Promise<GamesManifest | null>;
  stop(): void;
  readonly latest: GamesManifest | null;
}

function versionForPage(m: GamesManifest): string {
  const id = currentGameId();
  if (!id) return m.hub.version;
  return m.games.find((g) => g.id === id)?.version ?? "missing";
}

interface CapacitorAppPlugin {
  addListener(event: "appStateChange", cb: (state: { isActive: boolean }) => void): unknown;
}

function capacitorApp(): CapacitorAppPlugin | null {
  const cap = (window as unknown as { Capacitor?: { Plugins?: { App?: CapacitorAppPlugin } } }).Capacitor;
  return cap?.Plugins?.App ?? null;
}

export function startUpdateCheck(opts: UpdateCheckOptions = {}): UpdateChecker {
  let baseline: string | null = null;
  let latest: GamesManifest | null = null;
  let lastAt = 0;
  let inflight: Promise<GamesManifest | null> | null = null;
  let announced = false;

  const check = async (): Promise<GamesManifest | null> => {
    if (inflight) return inflight;
    const now = Date.now();
    if (now - lastAt < MIN_INTERVAL_MS && latest) return latest;
    lastAt = now;
    inflight = fetchManifest().then((m) => {
      inflight = null;
      if (!m) return null;
      const first = latest === null;
      latest = m;
      const v = versionForPage(m);
      if (baseline === null) baseline = v;
      opts.onManifest?.(m, first);
      if (!announced && v !== baseline) {
        announced = true;
        opts.onUpdateAvailable?.(m);
      }
      return m;
    });
    return inflight;
  };

  const onVisible = (): void => {
    if (document.visibilityState === "visible") void check();
  };
  const onFocus = (): void => void check();
  const onOnline = (): void => void check();

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);
  const app = capacitorApp();
  app?.addListener("appStateChange", (s) => {
    if (s.isActive) void check();
  });

  void check();

  return {
    check,
    stop() {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    },
    get latest() {
      return latest;
    },
  };
}

/** A small, kid-safe "update ready" banner. Tap reloads; nothing happens on its own. */
export function showUpdateBanner(text = "A new version is ready. Tap to update."): void {
  if (document.getElementById("sdk-update-banner")) return;
  const el = document.createElement("button");
  el.id = "sdk-update-banner";
  el.type = "button";
  el.textContent = text;
  Object.assign(el.style, {
    position: "fixed",
    left: "50%",
    bottom: "16px",
    transform: "translateX(-50%)",
    zIndex: "9999",
    padding: "12px 18px",
    borderRadius: "999px",
    border: "0",
    background: "#58a6ff",
    color: "#0b1220",
    font: "600 15px system-ui, sans-serif",
    boxShadow: "0 4px 16px rgba(0,0,0,.4)",
    cursor: "pointer",
    maxWidth: "90vw",
  } as Partial<CSSStyleDeclaration>);
  el.addEventListener("click", () => location.reload());
  document.body.appendChild(el);
}
