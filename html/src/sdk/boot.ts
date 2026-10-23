// bootGame(): the one call every game makes first. It gives each game the same
// chrome and behaviour without the author thinking about it:
//   - the Back link in the top-left safe zone (docs/guides/UI.md),
//   - a mute toggle if the page has <button id="mute-toggle">,
//   - audio unlock inside the first gesture (so sound works in the WebView),
//   - the update-on-focus check with a tap-to-reload banner,
//   - caching this game for offline play once it has loaded online,
//   - a few page-level defaults (no pinch zoom, no text selection, no pull-to-refresh).
import "./back-safe.css";
import { isMuted, onMuteChange, toggleMuted, unlockAudio } from "./audio";
import { currentGameId } from "./manifest";
import { ensureGameCached, registerServiceWorker } from "./offline";
import { showUpdateBanner, startUpdateCheck, type UpdateChecker } from "./update";

export interface BootOptions {
  /** Runs once inside the first pointer gesture, after audio is unlocked. Decode clips here. */
  onFirstGesture?: () => void;
  /** Set false for a game that draws its own back control inside the safe zone. */
  backLink?: boolean;
  /** Where the Back link goes. Default: the hub. */
  backHref?: string;
  /** Default true: add the "update ready" banner when a newer build is live. */
  updateBanner?: boolean;
}

export interface BootedGame {
  id: string | null;
  updates: UpdateChecker;
  /** Resolves true once this game is fully cached for offline play (online only). */
  cached: Promise<boolean>;
}

function injectBackLink(href: string): void {
  if (document.querySelector("a.back")) return;
  const a = document.createElement("a");
  a.className = "back";
  a.href = href;
  a.setAttribute("aria-label", "Back to all games");
  a.textContent = "← back";
  document.body.prepend(a);
}

function wireMuteToggle(): void {
  const btn = document.getElementById("mute-toggle") as HTMLButtonElement | null;
  if (!btn) return;
  const render = (m: boolean): void => {
    btn.setAttribute("aria-pressed", m ? "true" : "false");
    btn.classList.toggle("is-muted", m);
    const icon = btn.querySelector(".mute-icon");
    const label = btn.querySelector(".mute-label");
    if (icon) icon.textContent = m ? "\u{1F507}" : "\u{1F50A}";
    if (label) label.textContent = m ? "Sound Off" : "Sound On";
    if (!icon && !label) btn.textContent = m ? "\u{1F507}" : "\u{1F50A}";
    btn.title = m ? "Turn sound on" : "Turn sound off";
  };
  render(isMuted());
  onMuteChange(render);
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    unlockAudio();
    toggleMuted();
  });
}

function pageDefaults(): void {
  const s = document.documentElement.style;
  s.setProperty("touch-action", "manipulation");
  s.setProperty("overscroll-behavior", "none");
  s.setProperty("-webkit-user-select", "none");
  s.setProperty("user-select", "none");
  s.setProperty("-webkit-tap-highlight-color", "transparent");
  // Block pinch zoom and double-tap zoom in the WebView.
  document.addEventListener(
    "gesturestart",
    (e) => e.preventDefault(),
    { passive: false },
  );
  let lastTouch = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = Date.now();
      if (now - lastTouch < 300) e.preventDefault();
      lastTouch = now;
    },
    { passive: false },
  );
}

export function bootGame(opts: BootOptions = {}): BootedGame {
  const id = currentGameId();
  pageDefaults();
  if (opts.backLink !== false) injectBackLink(opts.backHref ?? "../../");
  wireMuteToggle();

  let first = true;
  const onGesture = (): void => {
    unlockAudio();
    if (first) {
      first = false;
      opts.onFirstGesture?.();
    }
  };
  for (const type of ["pointerdown", "touchstart", "keydown"] as const) {
    window.addEventListener(type, onGesture, { capture: true, passive: true });
  }

  void registerServiceWorker();

  let resolveCached: (ok: boolean) => void = () => {};
  const cached = new Promise<boolean>((r) => (resolveCached = r));

  const updates = startUpdateCheck({
    onManifest(m, firstSeen) {
      if (firstSeen && id && import.meta.env.PROD) {
        // Wait for the page to settle before downloading the rest of the game.
        window.setTimeout(() => void ensureGameCached(m, id).then(resolveCached), 1500);
      } else if (firstSeen) {
        resolveCached(false);
      }
    },
    onUpdateAvailable() {
      if (opts.updateBanner !== false) showUpdateBanner();
    },
  });

  return { id, updates, cached };
}
