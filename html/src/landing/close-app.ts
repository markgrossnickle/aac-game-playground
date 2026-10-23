// Hold-to-exit button for the hub. Inside the Android shim there is otherwise
// no way to quit the app, so a 2 second press on the power icon exits it. A
// plain tap does nothing (kids tap everything). On the web the button stays
// hidden: a page cannot close itself and a dead control reads as broken.
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

const HOLD_MS = 2000;

function initCloseApp(): void {
  const btn = document.getElementById("close-app");
  if (!btn) return;
  if (!Capacitor.isNativePlatform()) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  btn.setAttribute("aria-label", "Hold to close the app");
  btn.setAttribute("title", "Hold to close the app");

  let holdTimer: number | undefined;
  let exiting = false;

  const cancelHold = (): void => {
    btn.classList.remove("is-holding");
    if (holdTimer !== undefined) {
      window.clearTimeout(holdTimer);
      holdTimer = undefined;
    }
  };

  const startHold = (ev: Event): void => {
    ev.preventDefault();
    if (exiting || holdTimer !== undefined) return;
    btn.classList.add("is-holding");
    holdTimer = window.setTimeout(() => {
      holdTimer = undefined;
      exiting = true;
      cancelHold();
      void App.exitApp();
    }, HOLD_MS);
  };

  btn.addEventListener("pointerdown", startHold);
  btn.addEventListener("pointerup", cancelHold);
  btn.addEventListener("pointerleave", cancelHold);
  btn.addEventListener("pointercancel", cancelHold);
  btn.addEventListener("click", (ev) => ev.preventDefault());
}

initCloseApp();

export {};
