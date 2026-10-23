// The hub. The cards themselves are static HTML injected at build time by
// plugins/games.ts from each game's game.json, so this script only adds
// behaviour: filter tabs, favorites, offline caching, the update check and the
// hold-to-exit button (native only). Everything degrades to plain links.
import "./close-app";
import { cachedGameIds, ensureHubCached, isGameCached, pruneRuntimeCache, refreshCachedGames, registerServiceWorker } from "../sdk/offline";
import { startUpdateCheck } from "../sdk/update";
import type { GamesManifest } from "../sdk/manifest";

const FAVORITES_KEY = "bundle:favorites";
const NEW_WINDOW_DAYS = 30;

type TabId = "all" | "new" | "favorites";

function readFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v) => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function writeFavorites(favorites: Set<string>): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  } catch {
    // Private mode or quota: favorites just do not persist this session.
  }
}

function cardKey(card: HTMLElement): string {
  return card.dataset.game || card.getAttribute("href") || "";
}

function cardIsNew(card: HTMLElement): boolean {
  const added = card.getAttribute("data-added-on");
  if (!added) return false;
  const when = Date.parse(added);
  if (Number.isNaN(when)) return false;
  const ageDays = (Date.now() - when) / 86_400_000;
  return ageDays >= 0 && ageDays <= NEW_WINDOW_DAYS;
}

const HEART_OUTLINE =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20.5l-1.5-1.35C5.4 14.55 2.5 11.9 2.5 8.7 2.5 6.2 4.45 4.3 6.9 4.3c1.55 0 3.05.77 3.95 1.98.9-1.21 2.4-1.98 3.95-1.98 2.45 0 4.4 1.9 4.4 4.4 0 3.2-2.9 5.85-8 10.45L12 20.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
const HEART_FILLED =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20.5l-1.5-1.35C5.4 14.55 2.5 11.9 2.5 8.7 2.5 6.2 4.45 4.3 6.9 4.3c1.55 0 3.05.77 3.95 1.98.9-1.21 2.4-1.98 3.95-1.98 2.45 0 4.4 1.9 4.4 4.4 0 3.2-2.9 5.85-8 10.45L12 20.5z" fill="currentColor"/></svg>';

function initCards(): HTMLElement[] {
  const grid = document.querySelector<HTMLElement>(".grid");
  if (!grid) return [];
  const cards = [...grid.querySelectorAll<HTMLElement>(".card")];

  const emptyState = document.createElement("p");
  emptyState.className = "empty-state";
  emptyState.hidden = true;
  grid.parentNode?.insertBefore(emptyState, grid.nextSibling);

  if (cards.length === 0) {
    emptyState.hidden = false;
    emptyState.textContent = "No games yet. The first one is on its way.";
    return [];
  }

  const favorites = readFavorites();

  const tabs: { id: TabId; label: string }[] = [
    { id: "all", label: "All games" },
    { id: "new", label: "New" },
    { id: "favorites", label: "Favorites" },
  ];
  const tabBar = document.createElement("nav");
  tabBar.className = "tabs";
  tabBar.setAttribute("aria-label", "Filter games");
  const tabButtons = new Map<TabId, HTMLButtonElement>();
  for (const tab of tabs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab";
    btn.textContent = tab.label;
    btn.dataset.tab = tab.id;
    btn.addEventListener("click", () => setTab(tab.id));
    tabBar.appendChild(btn);
    tabButtons.set(tab.id, btn);
  }
  grid.parentNode?.insertBefore(tabBar, grid);

  for (const card of cards) {
    card.classList.add("has-fav");
    const key = cardKey(card);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fav-btn";
    const title = card.querySelector(".title")?.textContent?.trim() || "this game";
    const sync = (): void => {
      const on = favorites.has(key);
      btn.classList.toggle("is-fav", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.setAttribute("aria-label", on ? `Remove ${title} from favorites` : `Add ${title} to favorites`);
      btn.innerHTML = on ? HEART_FILLED : HEART_OUTLINE;
    };
    sync();
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (favorites.has(key)) favorites.delete(key);
      else favorites.add(key);
      writeFavorites(favorites);
      sync();
      if (currentTab === "favorites") applyFilter();
    });
    card.appendChild(btn);

    const dot = document.createElement("span");
    dot.className = "offline-dot";
    dot.title = "Not downloaded yet";
    card.appendChild(dot);
  }

  let currentTab: TabId = "all";
  function matches(card: HTMLElement): boolean {
    if (currentTab === "new") return cardIsNew(card);
    if (currentTab === "favorites") return favorites.has(cardKey(card));
    return true;
  }
  function applyFilter(): void {
    let visible = 0;
    for (const card of cards) {
      const show = matches(card);
      card.hidden = !show;
      if (show) visible++;
    }
    if (visible === 0) {
      emptyState.hidden = false;
      emptyState.textContent =
        currentTab === "favorites"
          ? "No favorites yet. Tap the heart on a game to save it here."
          : "No new games right now. Check back soon!";
    } else {
      emptyState.hidden = true;
    }
  }
  function setTab(id: TabId): void {
    currentTab = id;
    for (const [tabId, btn] of tabButtons) {
      const active = tabId === id;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    }
    applyFilter();
  }
  setTab("all");
  return cards;
}

async function paintOfflineDots(cards: HTMLElement[], manifest: GamesManifest | null): Promise<void> {
  const have = await cachedGameIds();
  for (const card of cards) {
    const id = cardKey(card);
    const dot = card.querySelector<HTMLElement>(".offline-dot");
    if (!dot) continue;
    const game = manifest?.games.find((g) => g.id === id);
    const current = game ? await isGameCached(id, game.version) : false;
    dot.classList.toggle("is-ready", current);
    dot.classList.toggle("is-stale", !current && have.has(id));
    dot.title = current ? "Ready offline" : have.has(id) ? "Updating" : "Not downloaded yet";
  }
}

function showBanner(text: string, onClick?: () => void): void {
  const el = document.getElementById("update-banner");
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  if (onClick) {
    el.classList.add("is-clickable");
    el.onclick = onClick;
  }
}

function init(): void {
  const cards = initCards();
  void registerServiceWorker();

  let hubVersion: string | null = null;
  startUpdateCheck({
    onManifest(m, first) {
      const buildEl = document.getElementById("build-id");
      if (buildEl) buildEl.textContent = `build ${m.buildId}`;

      if (hubVersion === null) hubVersion = m.hub.version;
      else if (hubVersion !== m.hub.version) {
        // The hub itself changed (new game, renamed card). Nothing to lose here,
        // so pick it up right away.
        showBanner("Updating…");
        window.setTimeout(() => location.reload(), 300);
        return;
      }

      if (!import.meta.env.PROD) return;
      void (async () => {
        await ensureHubCached(m);
        const refreshed = await refreshCachedGames(m);
        await pruneRuntimeCache(m);
        await paintOfflineDots(cards, m);
        if (!first && refreshed.length) {
          showBanner(`Updated ${refreshed.length} game${refreshed.length === 1 ? "" : "s"}.`);
          window.setTimeout(() => {
            const el = document.getElementById("update-banner");
            if (el) el.hidden = true;
          }, 4000);
        }
      })();
    },
  });

  void paintOfflineDots(cards, null);
}

init();

export {};
