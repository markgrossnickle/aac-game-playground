// "Connect AAC board" in the hub: pair this device with an AAC app once, and
// every AAC game picks the pairing up. Shown only when bundle.config.json has
// an aac.relay (this bundle's own aac-bridge relay).
//
// Flow: tap Connect -> the relay issues a one-time 6-digit code -> the player
// or a grown-up types it into the AAC app's "share with a game" setting -> the
// AAC app starts sharing -> "Connected". Disconnect revokes the pairing on the
// relay, so neither side's token works again.
import { createAacListener, createPairing, relayTransport, revokePairing } from "aac-bridge";
import bundleConfig from "virtual:bundle-config";
import { clearPairing, readPairing, writePairing } from "../sdk/aac";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function initAacConnect(): void {
  const relay = bundleConfig.aac.relay;
  const header = document.querySelector(".hdr");
  if (!relay || !header) return;

  const btn = el("button", "aac-connect");
  btn.type = "button";
  header.appendChild(btn);

  let watcher: ReturnType<typeof createAacListener> | null = null;

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
      if (cur) await revokePairing({ relay, token: cur.listenerToken }).catch(() => {});
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
    dialog.replaceChildren(el("h2", "", "Connect an AAC board"), el("p", "", "Getting a code…"));
    if (!dialog.open) dialog.showModal();
    let pairing;
    try {
      pairing = await createPairing({ relay });
    } catch (err) {
      dialog.replaceChildren(el("h2", "", "Could not connect"), el("p", "", `The pairing service did not answer (${(err as Error).message}). Check the internet connection and try again.`));
      const ok = el("button", "aac-btn", "Close");
      ok.type = "button";
      ok.addEventListener("click", close);
      dialog.append(ok);
      return;
    }
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
    const cancel = el("button", "aac-btn", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", async () => {
      clearPairing();
      await revokePairing({ relay, token: pairing.listenerToken }).catch(() => {});
      close();
    });
    dialog.append(cancel);

    // Watch for the AAC app to start sharing, then confirm.
    watcher = createAacListener({ transport: relayTransport({ relay, token: pairing.listenerToken }) });
    watcher.on("hello", ({ source }) => {
      writePairing({ relay, listenerToken: pairing.listenerToken, expiresAt: pairing.expiresAt, appName: source.app });
      status.textContent = `Connected to ${source.app}.`;
      cancel.textContent = "Done";
      cancel.onclick = (ev) => {
        ev.stopImmediatePropagation();
        close();
      };
    });
    watcher.on("status", ({ state }) => {
      if (state === "revoked" || state === "unauthorized") {
        clearPairing();
        status.textContent = "The code expired. Close and try again.";
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
    watcher?.close();
    watcher = null;
    render();
  });
  render();
}
