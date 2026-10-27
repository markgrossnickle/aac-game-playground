// "Connect AAC board" in the hub: pair this device with an AAC app once, and
// every AAC game picks the pairing up. Shown when there is a relay to pair
// through: this bundle's own aac-bridge relay (bundle.config.json aac.relay),
// or a relay on the local network that serves this site (local play,
// `npm run local`).
//
// Flow: tap Connect -> the relay issues a one-time 6-digit code -> the player
// or a grown-up types it into the AAC app's "share with a game" setting -> the
// AAC app starts sharing -> "Connected", Done. Cancel before that revokes the
// half-made pairing; Disconnect later revokes it on the relay, so neither
// side's token works again.
import { createAacListener, createPairing, relayTransport, revokePairing } from "aac-bridge";
import vocabularies from "virtual:aac-vocabularies";
import { clearPairing, findRelay, readPairing, writePairing } from "../sdk/aac";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Every word the bundle's games understand, so the AAC app can share only those. */
function bundleWords(): Array<string | { word: string; synonyms?: string[] }> {
  return Object.values(vocabularies).flat();
}

export async function initAacConnect(): Promise<void> {
  const header = document.querySelector(".hdr");
  if (!header) return;
  const relay = await findRelay();
  if (!relay) return;

  const btn = el("button", "aac-connect");
  btn.type = "button";
  header.appendChild(btn);

  let watcher: ReturnType<typeof createAacListener> | null = null;
  // The pairing attempt in progress, from the moment the code is requested.
  // Closing the dialog any way (Cancel, Escape) before the AAC app confirms
  // abandons it: a pairing that already exists is revoked, and one still being
  // requested is revoked as soon as the relay answers, never saved.
  interface Attempt {
    token: string | null;
    confirmed: boolean;
    cancelled: boolean;
  }
  let pending: Attempt | null = null;
  const abandonPending = (): void => {
    const p = pending;
    pending = null;
    if (!p || p.confirmed) return;
    p.cancelled = true;
    if (!p.token) return; // still being requested; startPairing cleans up when it lands
    clearPairing();
    void revokePairing({ relay, token: p.token }).catch(() => {});
  };

  const render = (): void => {
    const p = readPairing();
    btn.textContent = p ? (p.appName ? `AAC: ${p.appName}` : "AAC paired") : "Connect AAC board";
    btn.classList.toggle("is-paired", !!p);
    btn.setAttribute("aria-label", p ? "AAC board settings" : "Connect an AAC board");
  };

  const dialog = el("dialog", "aac-dialog");
  dialog.setAttribute("aria-label", "Connect an AAC board");
  document.body.appendChild(dialog);

  const close = (): void => {
    watcher?.close();
    watcher = null;
    if (dialog.open) dialog.close();
    render();
  };

  const showPaired = (): void => {
    const p = readPairing();
    dialog.replaceChildren();
    dialog.append(
      el("h2", "", "AAC board"),
      el("p", "", p?.appName ? `Paired with ${p.appName}. Games react to the words chosen on the board.` : "Paired. Turn on sharing in the AAC app to play."),
    );
    const disconnect = el("button", "aac-btn aac-btn--danger", "Disconnect");
    disconnect.type = "button";
    disconnect.addEventListener("click", async () => {
      const cur = readPairing();
      clearPairing();
      if (cur) await revokePairing({ relay: cur.relay, token: cur.listenerToken }).catch(() => {});
      close();
    });
    const done = el("button", "aac-btn", "Done");
    done.type = "button";
    done.addEventListener("click", close);
    const row = el("div", "aac-row");
    row.append(disconnect, done);
    dialog.append(row);
  };

  const startPairing = async (): Promise<void> => {
    abandonPending(); // a previous attempt, if any, is superseded
    const mine: Attempt = { token: null, confirmed: false, cancelled: false };
    pending = mine;
    const cancelLoading = el("button", "aac-btn", "Cancel");
    cancelLoading.type = "button";
    cancelLoading.addEventListener("click", () => {
      abandonPending();
      close();
    });
    dialog.replaceChildren(el("h2", "", "Connect an AAC board"), el("p", "", "Getting a code…"), cancelLoading);
    if (!dialog.open) dialog.showModal();
    let pairing;
    try {
      pairing = await createPairing({ relay, vocabulary: bundleWords() });
    } catch (err) {
      if (mine.cancelled) return;
      if (pending === mine) pending = null;
      dialog.replaceChildren(el("h2", "", "Could not connect"), el("p", "", `The pairing service did not answer (${(err as Error).message}). Check the connection and try again.`));
      const ok = el("button", "aac-btn", "Close");
      ok.type = "button";
      ok.addEventListener("click", close);
      dialog.append(ok);
      return;
    }
    if (mine.cancelled || pending !== mine) {
      // Closed (or restarted) while the code was being requested: the relay
      // made a pairing nobody will use. Revoke it; save and watch nothing.
      void revokePairing({ relay, token: pairing.listenerToken }).catch(() => {});
      return;
    }
    mine.token = pairing.listenerToken;
    writePairing({ relay, listenerToken: pairing.listenerToken, expiresAt: pairing.expiresAt });
    const code = `${pairing.code.slice(0, 3)} ${pairing.code.slice(3)}`;
    const status = el("p", "aac-status", "Waiting for the AAC app…");
    dialog.replaceChildren(
      el("h2", "", "Connect an AAC board"),
      el("p", "", "In the AAC app, open the setting to share with a game and enter this code:"),
      el("p", "aac-code", code),
      el("p", "aac-hint", "The code works once, for 10 minutes."),
      status,
    );

    // One button, one handler. Before the AAC app connects it is Cancel and
    // revokes the half-made pairing; after, it is Done and keeps it.
    const action = el("button", "aac-btn", "Cancel");
    action.type = "button";
    action.addEventListener("click", () => {
      abandonPending();
      close();
    });
    dialog.append(action);

    // Watch for the AAC app to start sharing, then confirm.
    watcher = createAacListener({ transport: relayTransport({ relay, token: pairing.listenerToken }) });
    watcher.on("hello", ({ source }) => {
      if (mine.confirmed) return;
      mine.confirmed = true;
      writePairing({ relay, listenerToken: pairing.listenerToken, expiresAt: pairing.expiresAt, appName: source.app });
      status.textContent = `Connected to ${source.app}.`;
      action.textContent = "Done";
    });
    watcher.on("status", () => {
      const s = watcher?.statusOf("relay");
      if (s === "revoked" || s === "unauthorized") {
        if (pending === mine) pending = null;
        clearPairing();
        status.textContent = "The code expired. Close and try again.";
        action.textContent = "Close";
      }
    });
  };

  btn.addEventListener("click", () => {
    if (readPairing()) {
      showPaired();
      dialog.showModal();
    } else void startPairing();
  });
  dialog.addEventListener("close", () => {
    abandonPending();
    watcher?.close();
    watcher = null;
    render();
  });
  render();
}
