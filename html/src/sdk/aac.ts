// AAC input for games, built on aac-bridge. A game declares its words in
// game.json ("input": ["touch", "aac"], "aac": { "vocabulary": [...] }) and maps
// each word to an action:
//
//   playWithAac({
//     words: { go: startGame, pop: popOne, again: replay, stop: endGame },
//   });
//
// The framework owns everything else: pairing with the AAC app (done once in
// the hub), the relay connection, same-site channels, matching, dropping
// duplicates and late words, the "AAC connected" chip, and cleanup when the
// page goes away. Games never import aac-bridge or open sockets themselves.
//
// Handlers must be safe to call at any moment (before start, after game over):
// a player can say any word at any time.
import {
  EVENT,
  broadcastTransport,
  createAacListener,
  createEvent,
  createVocabulary,
  mountDevPanel,
  randomId,
  relayTransport,
  type AacListener,
  type SymbolDetail,
  type Transport,
} from "aac-bridge";
import bundleConfig from "virtual:bundle-config";
import vocabularies from "virtual:aac-vocabularies";
import { currentGameId } from "./manifest";

export const AAC_PAIRING_KEY = "bundle:aac-pairing";

export interface StoredPairing {
  relay: string;
  listenerToken: string;
  expiresAt: number;
  appName?: string;
}

/** A relay serving this very site: local play (`npm run local`, aac-bridge relay `--serve`). */
function sameOrigin(): string | null {
  try {
    return location.origin && location.origin !== "null" ? location.origin : null;
  } catch {
    return null;
  }
}

let relayLookup: Promise<string | null> | null = null;

/**
 * The relay to pair with: this bundle's configured relay (bundle.config.json
 * aac.relay), or, when the site itself is served by an aac-bridge relay on the
 * local network, that one. Null when there is neither.
 */
export function findRelay(): Promise<string | null> {
  if (bundleConfig.aac.relay) return Promise.resolve(bundleConfig.aac.relay);
  relayLookup ??= (async () => {
    const origin = sameOrigin();
    // A relay in the room serves plain http on the local network. Skip the
    // probe on https (the live site), where it would only log a 404.
    if (!origin || location.protocol !== "http:") return null;
    try {
      const res = await fetch(`${origin}/healthz`, { cache: "no-store", credentials: "omit" });
      if (!res.ok) return null;
      const body = (await res.json()) as { relay?: string };
      return body && body.relay === "aac-bridge" ? origin : null;
    } catch {
      return null;
    }
  })();
  return relayLookup;
}

/** The pairing the hub stored, if it is for this bundle's relay (or the local one) and not expired. */
export function readPairing(): StoredPairing | null {
  try {
    const raw = localStorage.getItem(AAC_PAIRING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as StoredPairing;
    if (!p || typeof p.listenerToken !== "string" || typeof p.relay !== "string") return null;
    const relayOk = p.relay === bundleConfig.aac.relay || p.relay === sameOrigin();
    if (!relayOk || (p.expiresAt && p.expiresAt < Date.now())) {
      clearPairing();
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function writePairing(p: StoredPairing): void {
  try {
    localStorage.setItem(AAC_PAIRING_KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable: the pairing lasts for this page only.
  }
}

export function clearPairing(): void {
  try {
    localStorage.removeItem(AAC_PAIRING_KEY);
  } catch {
    // ignore
  }
}

/**
 * What the player sees and the game can react to:
 *   "connected"  an AAC app is sharing right now
 *   "waiting"    connected to the relay or channel, nobody sharing
 *   "offline"    the connection to the relay is down (it retries)
 *   "ended"      the pairing was revoked or expired; pair again in the hub
 */
export type AacState = "connected" | "waiting" | "offline" | "ended";

export interface PlayWithAacOptions {
  /** word -> action. Keys must be words (not synonyms) from game.json "aac.vocabulary". */
  words: Record<string, (detail: SymbolDetail) => void>;
  /** The AAC user spoke their composed message; `words` are the vocabulary words in it, in order. */
  onPhrase?: (text: string, words: string[]) => void;
  onState?: (state: AacState) => void;
  /** Show the small "AAC" chip in the bottom-left corner (default true). */
  showChip?: boolean;
}

export interface AacSession {
  readonly state: AacState;
  readonly words: string[];
  close(): void;
}

const TEST_FLAG = "aac-test";

function hasParam(name: string): boolean {
  try {
    return new URLSearchParams(location.search).has(name);
  } catch {
    return false;
  }
}

function isTestMode(): boolean {
  return hasParam(TEST_FLAG);
}

/**
 * Product state from separate facts, never from "some channel is open":
 *   paired:  this device holds a relay pairing, and `link` is that relay's own state
 *   sharing: an AAC app said hello (or the relay replayed it) and has not left
 *   anyOpen: any channel (relay, same-site, test) is open
 */
function mapState(paired: boolean, link: string | undefined, sharing: boolean, anyOpen: boolean): AacState {
  if (paired) {
    // A paired game's AAC app is on the relay, so the relay link itself must
    // be up. An always-open same-site channel says nothing about it. When the
    // link comes back, the relay replays the hello (or reports the app gone).
    if (link === "revoked" || link === "unauthorized") return "ended";
    if (link !== "open") return "offline";
    return sharing ? "connected" : "waiting";
  }
  if (sharing && anyOpen) return "connected";
  return anyOpen ? "waiting" : "offline";
}

function chip(): { set(state: AacState, app?: string): void; remove(): void } {
  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.dataset.aacChip = "";
  Object.assign(el.style, {
    position: "fixed",
    left: "10px",
    bottom: "10px",
    zIndex: "35",
    padding: "4px 10px",
    borderRadius: "999px",
    font: "600 12px system-ui, sans-serif",
    color: "#06111f",
    pointerEvents: "none",
    display: "none",
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  return {
    set(state, app) {
      el.style.display = state === "connected" ? "block" : "none";
      el.style.background = "#4fd1a5";
      el.textContent = app ? `AAC: ${app}` : "AAC connected";
    },
    remove: () => el.remove(),
  };
}

interface TestTransport extends Transport {
  deliver(event: unknown): void;
  setUp(up: boolean): void;
}

function testTransport(): TestTransport {
  let handlers: NonNullable<Parameters<Transport["start"]>[0]> = {};
  let up = true;
  return {
    name: "test",
    start(h = {}) {
      handlers = h;
      h.status?.("open");
    },
    stop() {
      handlers = {};
    },
    deliver(event) {
      if (up) handlers.message?.(event, { test: true });
    },
    setUp(next) {
      up = next;
      handlers.status?.(next ? "open" : "closed");
    },
  };
}

/** Test hook installed with ?aac-test: drives the game like an AAC app would. */
export interface AacTestHook {
  say(text: string): string;
  phrase(text: string, words?: string[]): void;
  raw(event: unknown): void;
  event(type: string, payload: object, opts?: { ts?: number; id?: string }): Record<string, unknown>;
  hello(): void;
  bye(): void;
  disconnect(): void;
  reconnect(): void;
  readonly state: AacState;
  readonly handled: string[];
  readonly ignored: string[];
  readonly words: string[];
}

export function playWithAac(opts: PlayWithAacOptions): AacSession {
  const id = currentGameId();
  const vocabEntries = id ? vocabularies[id] : undefined;
  if (!id || !vocabEntries || vocabEntries.length === 0) {
    throw new Error(`playWithAac: game "${id ?? "?"}" has no AAC vocabulary. Add "input": ["touch", "aac"] and "aac": { "vocabulary": [...] } to its game.json.`);
  }
  const vocabulary = createVocabulary(vocabEntries);
  const canonical = new Set(vocabulary.words);

  const handlers = new Map<string, (d: SymbolDetail) => void>();
  for (const [key, fn] of Object.entries(opts.words)) {
    const word = vocabulary.match(key);
    if (!word || word !== key) {
      throw new Error(`playWithAac: "${key}" is not a word in game.json aac.vocabulary (${[...canonical].join(", ")})`);
    }
    handlers.set(word, fn);
  }
  if (import.meta.env.DEV) {
    const missing = vocabulary.words.filter((w) => !handlers.has(w));
    if (missing.length) console.warn(`[aac] no action for vocabulary word(s): ${missing.join(", ")}`);
  }

  const test = isTestMode();
  const transports: Transport[] = [];
  const testT = test ? testTransport() : null;
  const pairing = testT ? null : readPairing();
  if (testT) transports.push(testT);
  else {
    transports.push(broadcastTransport());
    if (pairing) transports.push(relayTransport({ relay: pairing.relay, token: pairing.listenerToken }));
  }

  // Word history exists only for tests (?aac-test). In normal play a word is
  // acted on and dropped, and words the game does not use are never kept.
  const handled: string[] | null = testT ? [] : null;
  const ignored: string[] | null = testT ? [] : null;
  let sharing = false;
  let appName: string | undefined;
  let state: AacState = "offline";
  const indicator = opts.showChip === false ? null : chip();

  const listener: AacListener = createAacListener({
    transports,
    vocabulary,
    onInvalid: import.meta.env.DEV ? (reason) => console.warn(`[aac] ignored a message: ${reason}`) : undefined,
  });

  const update = (): void => {
    const next = mapState(Boolean(pairing), pairing ? listener.statusOf("relay") : undefined, sharing, listener.status === "open");
    if (next === state) return;
    state = next;
    document.documentElement.dataset.aac = state;
    indicator?.set(state, appName);
    if (state === "ended") clearPairing();
    opts.onState?.(state);
  };

  listener.on("status", () => {
    // Paired and the relay link dropped: forget sharing until the relay says
    // again (it replays the hello on reconnect if the AAC app is still there).
    if (pairing && listener.statusOf("relay") !== "open") sharing = false;
    update();
  });
  // hello: sharing started, a heartbeat, or the relay telling a game that
  // opened late that sharing is already on.
  listener.on("hello", ({ source }) => {
    sharing = true;
    appName = source.app;
    update();
  });
  const stopped = (): void => {
    sharing = false;
    update();
  };
  listener.on("bye", stopped);
  listener.on("lost", stopped);
  listener.on("presence", ({ present }) => {
    if (!present) stopped();
  });
  // With ?test (real connection, test observation) count handled words. A
  // number only: which words were said is not kept.
  const observe = hasParam("test");
  const counter = window as unknown as { __aacHandledCount?: number };
  if (observe) counter.__aacHandledCount = 0;
  listener.on("word", (d) => {
    const fn = d.word ? handlers.get(d.word) : undefined;
    if (!fn || !d.word) return;
    handled?.push(d.word);
    if (observe) counter.__aacHandledCount = (counter.__aacHandledCount ?? 0) + 1;
    fn(d);
  });
  if (ignored) {
    listener.on("symbol", (d) => {
      if (!d.word) ignored.push(d.text);
    });
  }
  if (opts.onPhrase) listener.on("phrase", (d) => opts.onPhrase!(d.text, d.words));
  update();

  if (import.meta.env.DEV && !test) {
    mountDevPanel({ listener, words: vocabulary.words, label: "AAC (dev)" });
  }

  if (testT) {
    let session = `test-${randomId()}`;
    let seq = 0;
    const source = { app: "aac-test", lang: "en" };
    const make = (type: string, payload: object, o: { ts?: number; id?: string } = {}) =>
      createEvent(type, payload, { session, seq: seq++, source, ...o }) as Record<string, unknown>;
    const ensureHello = (): void => {
      if (!sharing) testT.deliver(make(EVENT.HELLO, { capabilities: ["symbol.select", "phrase.speak"] }));
    };
    const hook: AacTestHook = {
      say(text) {
        ensureHello();
        const e = make(EVENT.SYMBOL, { symbol: { text } });
        testT.deliver(e);
        return e.id as string;
      },
      phrase(text, words = text.split(/\s+/)) {
        ensureHello();
        testT.deliver(make(EVENT.PHRASE, { text, symbols: words.map((w) => ({ text: w })) }));
      },
      raw: (event) => testT.deliver(event),
      event: make,
      hello: () => ensureHello(),
      bye() {
        testT.deliver(make(EVENT.BYE, {}));
        session = `test-${randomId()}`;
        seq = 0;
      },
      disconnect: () => testT.setUp(false),
      reconnect: () => testT.setUp(true),
      get state() {
        return state;
      },
      get handled() {
        return [...(handled ?? [])];
      },
      get ignored() {
        return [...(ignored ?? [])];
      },
      words: vocabulary.words,
    };
    (window as unknown as { __aacTest: AacTestHook }).__aacTest = hook;
  }

  const close = (): void => {
    listener.close();
    indicator?.remove();
  };
  window.addEventListener("pagehide", close, { once: true });

  return {
    get state() {
      return state;
    },
    words: vocabulary.words,
    close,
  };
}

/**
 * Let tests read game state. Installed only when the page URL has ?aac-test or
 * ?test, so it costs nothing in normal play.
 */
export function exposeStateForTests(getState: () => unknown): void {
  try {
    const q = new URLSearchParams(location.search);
    if (q.has(TEST_FLAG) || q.has("test")) (window as unknown as { __gameState: () => unknown }).__gameState = getState;
  } catch {
    // ignore
  }
}
