// "Connect AAC board" in the hub: pair this device with an AAC app once, and
// every AAC game picks the pairing up. Shown when there is a relay to pair
// through: this bundle's own aac-bridge relay (bundle.config.json aac.relay),
// or a relay on the local network that serves this site (local play,
// `npm run local`).
//
// Tap Connect and the hub opens a pairing and waits. The AAC side joins in
// one of three ways:
//   - Tap to allow (local relay): the AAC device lists this game under "Games
//     nearby"; tapping it makes the hub ask "Allow <app> (<device>)?".
//   - QR code (local relay): scanning it opens the AAC page with the code
//     filled in.
//   - The 6-digit code, typed (works with any relay).
// The pairing is REMEMBERED: it lasts until someone taps Disconnect (or it
// goes unused for 90 days), so this happens once per device pair.
//
// Cancel or Escape before the AAC side is allowed or connects revokes the
// half-made pairing; Disconnect later revokes it on the relay, so neither
// side's token works again.
import { createAacListener, createPairing, pairingLink, relayTransport, revokePairing, type PairingRequest } from "aac-bridge";
import qrcode from "qrcode-generator";
import bundleConfig from "virtual:bundle-config";
import vocabularies from "virtual:aac-vocabularies";
import { clearPairing, findRelayInfo, readPairing, writePairing } from "../sdk/aac";

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

/** A QR code (SVG) for a pairing link. */
function qr(link: string): HTMLElement {
  const code = qrcode(0, "M");
  code.addData(link);
  code.make();
  const box = el("div", "aac-qr");
  box.innerHTML = code.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  box.querySelector("svg")?.setAttribute("aria-label", "QR code to pair an AAC device");
  box.dataset.link = link;
  return box;
}

const isLoopback = (host: string): boolean => host === "localhost" || host === "127.0.0.1" || host === "[::1]";

export async function initAacConnect(): Promise<void> {
  const header = document.querySelector(".hdr");
  if (!header) return;
  const info = await findRelayInfo();
  if (!info) return;
  const relay = info.relay;
  // The address an AAC device on the Wi-Fi uses. A hub opened at localhost
  // cannot be reached at "localhost" from a phone, so use the relay's own
  // network address there.
  const reachable = info.local && isLoopback(location.hostname) ? (info.addresses[0] ?? null) : relay;

  const btn = el("button", "aac-connect");
  btn.type = "button";
  header.appendChild(btn);

  let watcher: ReturnType<typeof createAacListener> | null = null;
  // The pairing attempt in progress, from the moment the code is requested.
  // Closing the dialog any way (Cancel, Escape) before the AAC side is allowed
  // or connects abandons it: a pairing that already exists is revoked, and one
  // still being requested is revoked as soon as the relay answers, never saved.
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
      el("p", "aac-hint", "This stays paired until you tap Disconnect."),
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
    dialog.replaceChildren(el("h2", "", "Connect an AAC board"), el("p", "", "Getting ready…"), cancelLoading);
    if (!dialog.open) dialog.showModal();
    let pairing;
    try {
      pairing = await createPairing({ relay, vocabulary: bundleWords(), name: bundleConfig.name, discoverable: info.local, remember: true });
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
    const save = (appName?: string): void =>
      writePairing({ relay, listenerToken: pairing.listenerToken, expiresAt: pairing.expiresAt, remembered: pairing.remembered, ...(appName ? { appName } : {}) });
    save();

    const code = `${pairing.code.slice(0, 3)} ${pairing.code.slice(3)}`;
    const status = el("p", "aac-status", "Waiting for the AAC device…");
    const prompts = el("div", "aac-requests");
    // Allow/Deny prompts go first, right under the title, so they are seen at once.
    const parts: HTMLElement[] = [el("h2", "", "Connect an AAC board"), prompts];
    if (pairing.discoverable) {
      parts.push(el("p", "", `On the AAC device, open the AAC page and tap "${bundleConfig.name}" under Games nearby.`));
    }
    if (info.local && reachable) {
      parts.push(el("p", "", pairing.discoverable ? "Or scan this with the AAC device:" : "Scan this with the AAC device:"));
      parts.push(qr(pairingLink({ relay: reachable, code: pairing.code })));
      parts.push(el("p", "aac-hint", `${reachable}/aac-bridge/examples/aac-app.html`));
    }
    parts.push(el("p", "", info.local ? "Or type this code:" : "In the AAC app, open the setting to share with a game and enter this code:"));
    parts.push(el("p", "aac-code", code), el("p", "aac-hint", "The code works once, for 10 minutes. After pairing, this device stays paired."), status);
    dialog.replaceChildren(...parts);

    // One button, one handler. Before the AAC side is allowed or connects it
    // is Cancel and revokes the half-made pairing; after, it is Done and keeps it.
    const action = el("button", "aac-btn", "Cancel");
    action.type = "button";
    action.addEventListener("click", () => {
      abandonPending();
      close();
    });
    dialog.append(action);

    const confirm = (appName: string, text: string): void => {
      if (mine.confirmed) return;
      mine.confirmed = true;
      save(appName);
      prompts.replaceChildren();
      status.textContent = text;
      action.textContent = "Done";
    };

    // Tap to allow: an AAC device asks; the person at this screen decides.
    // The app and device names are what the AAC device says about itself.
    const ask = (r: PairingRequest): void => {
      if (mine.confirmed) return;
      const row = el("div", "aac-request");
      row.dataset.request = r.id;
      row.append(el("p", "", r.device ? `${r.app} (${r.device}) wants to connect.` : `${r.app} wants to connect.`));
      const allow = el("button", "aac-btn", "Allow");
      allow.type = "button";
      const deny = el("button", "aac-btn aac-btn--danger", "Deny");
      deny.type = "button";
      allow.addEventListener("click", () => {
        allow.disabled = deny.disabled = true;
        watcher?.approve(r.id);
      });
      deny.addEventListener("click", () => {
        watcher?.deny(r.id);
        row.remove();
      });
      const buttons = el("div", "aac-row");
      buttons.append(deny, allow);
      row.append(buttons);
      prompts.append(row);
      row.scrollIntoView({ block: "nearest" });
      allow.focus();
    };
    const requests = new Map<string, PairingRequest>();

    watcher = createAacListener({ transport: relayTransport({ relay, token: pairing.listenerToken }) });
    watcher.on("request", (r) => {
      requests.set(r.id, r);
      ask(r);
    });
    watcher.on("request-done", ({ id, approved }) => {
      prompts.querySelector(`[data-request="${CSS.escape(id)}"]`)?.remove();
      const r = requests.get(id);
      if (approved && r) confirm(r.app, `Paired with ${r.app}. Turn on sharing on the board to play.`);
    });
    // Paired by code (typed or from the QR): confirmed when the board starts sharing.
    watcher.on("hello", ({ source }) => confirm(source.app, `Connected to ${source.app}.`));
    watcher.on("status", () => {
      const s = watcher?.statusOf("relay");
      if (s === "revoked" || s === "unauthorized") {
        if (pending === mine) pending = null;
        clearPairing();
        prompts.replaceChildren();
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
