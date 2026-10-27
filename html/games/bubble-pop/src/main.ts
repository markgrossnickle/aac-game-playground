// Bubble Pop: colourful bubbles drift up; tap one to pop it. Played by touch
// or with words from an AAC board. Every word calls the same function a tap or
// button calls, and every action is safe at any moment: with nothing to act on
// it gives a small wobble instead.
import { bootGame, createStore, exposeStateForTests, fitCanvas, playWithAac } from "../../../src/sdk";
import { COLOURS, HEX, burst, clearParticles, drawParticles, particlesActive, ripple, sprites, stepParticles, type Colour } from "./render";
import { blowSound, boingSound, cheerSound, goSound, moreSound, popSound, stopSound, wobbleSound } from "./sound";

const GAME_ID = "bubble-pop";

/** start: the Go screen. play: bubbles keep coming. paused: "stop" halted new bubbles. */
type Phase = "start" | "play" | "paused";

interface Bubble {
  id: number;
  x: number;
  y: number;
  r: number;
  vy: number;
  sway: number;
  colour: Colour;
  /** Pops left: 2 for a big bubble, 1 for a normal one. */
  hp: number;
  big: boolean;
  /** Seconds since it appeared (grow-in) and since it was last hit (squash). */
  age: number;
  hit: number;
}

const MAX_BUBBLES = 24;
const MAX_BIG = 2;
const BURST = 5;
/** Bubbles fade out and float away above this line, so the Back corner stays clear. */
const TOP_LINE = 64;

const store = createStore(GAME_ID, { version: 1, defaults: { best: 0 } });

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const scoreEl = document.getElementById("score")!;
const startOverlay = document.getElementById("start") as HTMLElement;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
const bestEl = document.getElementById("best") as HTMLElement;
const flowBtn = document.getElementById("flow-btn") as HTMLButtonElement;
const moreBtn = document.getElementById("more-btn") as HTMLButtonElement;
const bigBtn = document.getElementById("big-btn") as HTMLButtonElement;
const againBtn = document.getElementById("again-btn") as HTMLButtonElement;
const heard = document.getElementById("heard") as HTMLElement;

const bubbles: Bubble[] = [];
let phase: Phase = "start";
let score = 0;
let wobbles = 0;
let nextId = 1;
let spawnTimer = 0;
let last = 0;
let raf = 0;

bootGame();

const stage = fitCanvas(canvas, (s) => {
  // Keep bubbles on screen after a rotate or resize.
  for (const b of bubbles) b.x = Math.min(Math.max(b.x, b.r), Math.max(b.r, s.width - b.r));
  if (phase !== "start") draw();
});

function baseR(): number {
  return Math.min(70, Math.max(30, Math.min(stage.width, stage.height) * 0.075));
}

// --- bubbles ------------------------------------------------------------------

/** Colours come round fairly: a shuffled cycle, so no colour is missing for long. */
let colourBag: Colour[] = [];
function nextColour(): Colour {
  if (colourBag.length === 0) {
    colourBag = [...COLOURS];
    for (let i = colourBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colourBag[i], colourBag[j]] = [colourBag[j]!, colourBag[i]!];
    }
  }
  return colourBag.pop()!;
}

function addBubble(opts: { colour?: Colour; y?: number; big?: boolean }): Bubble | null {
  if (bubbles.length >= MAX_BUBBLES) return null;
  const big = !!opts.big;
  const r = baseR() * (big ? 1.9 : 0.85 + Math.random() * 0.3);
  const b: Bubble = {
    id: nextId++,
    x: r + Math.random() * Math.max(1, stage.width - 2 * r),
    y: opts.y ?? stage.height + r,
    r,
    vy: -stage.height * (big ? 0.05 : 0.065 + Math.random() * 0.045),
    sway: Math.random() * Math.PI * 2,
    colour: opts.colour ?? nextColour(),
    hp: big ? 2 : 1,
    big,
    age: 0,
    hit: 1,
  };
  bubbles.push(b);
  return b;
}

/** A handful of bubbles, already on screen, with every colour in it. */
function addBurst(count: number): number {
  const order = [...COLOURS].sort(() => Math.random() - 0.5);
  let added = 0;
  for (let i = 0; i < count; i++) {
    const colour = i < order.length ? order[i]! : nextColour();
    if (addBubble({ colour, y: stage.height * (0.55 + Math.random() * 0.3) })) added++;
  }
  return added;
}

/** One hit on bubble `b`. A big bubble shrinks on its first hit and pops on the second. */
function hit(b: Bubble, at = 0): void {
  const i = bubbles.indexOf(b);
  if (i < 0) return;
  b.hp -= 1;
  if (b.hp > 0) {
    b.r *= 0.72;
    b.hit = 0;
    burst(b.x, b.y, b.r * 0.6, HEX[b.colour], 6);
    boingSound();
    return;
  }
  bubbles.splice(i, 1);
  burst(b.x, b.y, b.r, HEX[b.colour], b.big ? 20 : 12);
  popSound(at, b.big ? 1.6 : 1);
  score += 1;
  scoreEl.textContent = String(score);
  if (score > store.state.best) store.update((s) => (s.best = score));
  if (score % 10 === 0) cheer();
}

function cheer(): void {
  cheerSound();
  const { width, height } = stage;
  COLOURS.forEach((c, i) => burst(width * (0.2 + 0.2 * i), height * 0.35, baseR() * 0.8, HEX[c], 10));
}

// --- feedback for "nothing to do right now" ---------------------------------

function wobble(target?: HTMLElement): void {
  wobbles++;
  const el = phase === "start" ? startBtn : (target ?? canvas);
  el.classList.remove("wobble");
  void el.offsetWidth; // restart the animation
  el.classList.add("wobble");
  wobbleSound();
}

// --- actions: shared by touch, buttons and AAC -----------------------------

/** "go" / Go button / play button: start from the start screen, or resume after "stop". */
function go(): void {
  if (phase === "start") return begin();
  if (phase === "paused") {
    phase = "play";
    spawnTimer = 0.3;
    renderFlow();
    goSound();
    ensureLoop();
    return;
  }
  wobble(flowBtn);
}

/** "again" / Again button: a fresh round, from anywhere. */
function again(): void {
  begin();
}

function begin(): void {
  bubbles.length = 0;
  clearParticles();
  score = 0;
  scoreEl.textContent = "0";
  phase = "play";
  startOverlay.hidden = true;
  heard.textContent = "";
  spawnTimer = 1.4;
  addBurst(4);
  renderFlow();
  goSound();
  ensureLoop();
  draw();
}

/** "stop" / pause button: no new bubbles until "go". The ones out there keep floating. */
function stop(): void {
  if (phase !== "play") return wobble(flowBtn);
  phase = "paused";
  renderFlow();
  stopSound();
}

/** "pop": pop the bubble closest to floating away (one hit for a big one). */
function popTop(): void {
  if (phase === "start" || bubbles.length === 0) return wobble();
  let top = bubbles[0]!;
  for (const b of bubbles) if (b.y < top.y) top = b;
  hit(top);
  ensureLoop();
  draw();
}

/** "more" / plus button: a burst of new bubbles right now. */
function more(): void {
  if (phase === "start") return wobble(moreBtn);
  const added = addBurst(Math.min(BURST, MAX_BUBBLES - bubbles.length));
  if (added === 0) return wobble(moreBtn);
  moreSound();
  ensureLoop();
  draw();
}

/** A colour word or colour button: pop every bubble of that colour. */
function popColour(colour: Colour): void {
  const btn = document.querySelector<HTMLElement>(`.ctl[data-colour="${colour}"]`) ?? undefined;
  if (phase === "start") return wobble(btn);
  const targets = bubbles.filter((b) => b.colour === colour);
  if (targets.length === 0) return wobble(btn);
  targets.forEach((b, i) => hit(b, Math.min(i, 4) * 0.06));
  ensureLoop();
  draw();
}

/** "big" / big button: blow one big bubble that takes two pops. */
function blowBig(): void {
  if (phase === "start") return wobble(bigBtn);
  if (bubbles.filter((b) => b.big).length >= MAX_BIG) return wobble(bigBtn);
  if (!addBubble({ big: true, y: stage.height * 0.7 })) return wobble(bigBtn);
  blowSound();
  ensureLoop();
  draw();
}

function renderFlow(): void {
  const paused = phase === "paused";
  flowBtn.textContent = paused ? "▶" : "⏸";
  flowBtn.setAttribute("aria-label", paused ? "go" : "stop");
}

// --- AAC: one line per word -----------------------------------------------

playWithAac({
  words: {
    go,
    pop: popTop,
    more,
    red: () => popColour("red"),
    blue: () => popColour("blue"),
    green: () => popColour("green"),
    yellow: () => popColour("yellow"),
    big: blowBig,
    stop,
    again,
  },
  onState: (s) => {
    heard.textContent = s === "connected" && phase === "start" ? "Say go!" : "";
  },
});

// --- touch -------------------------------------------------------------------

startBtn.addEventListener("click", go);
againBtn.addEventListener("click", again);
moreBtn.addEventListener("click", more);
bigBtn.addEventListener("click", blowBig);
flowBtn.addEventListener("click", () => (phase === "paused" ? go() : stop()));
for (const btn of document.querySelectorAll<HTMLButtonElement>(".ctl[data-colour]")) {
  btn.addEventListener("click", () => popColour(btn.dataset.colour as Colour));
}

canvas.addEventListener("pointerdown", (ev) => {
  if (phase === "start") return;
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  // Last drawn is on top; generous hit area for small fingers.
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]!;
    const reach = Math.max(b.r * 1.25, 30);
    if ((x - b.x) ** 2 + (y - b.y) ** 2 <= reach * reach) {
      hit(b);
      ensureLoop();
      draw();
      return;
    }
  }
  ripple(x, y, baseR());
  ensureLoop();
});

// --- loop ----------------------------------------------------------------------

function ensureLoop(): void {
  if (raf || phase === "start" || document.visibilityState === "hidden") return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    cancelAnimationFrame(raf);
    raf = 0;
  } else ensureLoop();
});

function frame(t: number): void {
  raf = 0;
  const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
  last = t;
  update(dt);
  draw();
  // Paused with nothing left moving: the loop rests until the next action.
  if (phase === "play" || bubbles.length > 0 || particlesActive() > 0) raf = requestAnimationFrame(frame);
}

function update(dt: number): void {
  if (phase === "play") {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      addBubble({});
      // Gentle ramp, capped: from one bubble every 1.3 s to one every 0.8 s.
      spawnTimer = Math.max(0.8, 1.3 - score * 0.01);
    }
  }
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]!;
    b.age += dt;
    b.hit += dt;
    b.sway += dt * 1.6;
    b.y += b.vy * dt;
    b.x += Math.sin(b.sway) * b.r * 0.35 * dt;
    if (b.y < TOP_LINE) bubbles.splice(i, 1); // floated away; no penalty
  }
  stepParticles(dt, stage.height);
}

function draw(): void {
  const { ctx, width, height } = stage;
  ctx.clearRect(0, 0, width, height);
  const band = height * 0.14;
  for (const b of bubbles) {
    const grow = Math.min(1, 0.3 + b.age * 2.5);
    // Squash and stretch for a moment after a hit.
    const k = b.hit / 0.3;
    const sq = k < 1 ? Math.sin(k * Math.PI * 3) * 0.12 * (1 - k) : 0;
    const rx = b.r * grow * (1 + sq);
    const ry = b.r * grow * (1 - sq);
    ctx.globalAlpha = Math.max(0, Math.min(1, (b.y - TOP_LINE) / band));
    ctx.drawImage(sprites[b.colour], b.x - rx, b.y - ry, rx * 2, ry * 2);
  }
  ctx.globalAlpha = 1;
  drawParticles(ctx);
}

// --- start screen ------------------------------------------------------------

if (store.state.best > 0) {
  bestEl.textContent = `⭐ ${store.state.best}`;
  bestEl.hidden = false;
}
renderFlow();
draw();

// Tests read the game through this (only with ?aac-test or ?test in the URL).
exposeStateForTests(() => {
  const colours: Record<Colour, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
  for (const b of bubbles) colours[b.colour]++;
  return {
    phase,
    score,
    wobbles,
    bubbles: bubbles.length,
    big: bubbles.filter((b) => b.big).length,
    colours,
    list: bubbles.map((b) => ({ id: b.id, x: b.x, y: b.y, r: b.r, colour: b.colour, hp: b.hp, big: b.big })),
  };
});
