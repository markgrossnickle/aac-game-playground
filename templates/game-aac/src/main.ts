// __GAME_TITLE__: a bubble game played by touch or with an AAC board.
// The words come from game.json "aac.vocabulary"; playWithAac() maps each one
// to the same action a tap would do. Everything else (pairing, connection,
// matching, duplicates, late words) is handled by the SDK.
import { bootGame, createStore, exposeStateForTests, fitCanvas, playTone, playWithAac } from "../../../src/sdk";

const GAME_ID = "__GAME_ID__";

type Phase = "start" | "play" | "over";

interface Bubble {
  x: number;
  y: number;
  r: number;
  vy: number;
  hue: number;
}

const store = createStore(GAME_ID, { version: 1, defaults: { best: 0 } });

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const scoreEl = document.getElementById("score")!;
const startOverlay = document.getElementById("start") as HTMLElement;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
const overOverlay = document.getElementById("over") as HTMLElement;
const againBtn = document.getElementById("again-btn") as HTMLButtonElement;
const heard = document.getElementById("heard") as HTMLElement;

const stage = fitCanvas(canvas);
const bubbles: Bubble[] = [];
let phase: Phase = "start";
let score = 0;
let spawnTimer = 0;
let last = 0;

bootGame();

// --- actions: shared by touch and AAC ------------------------------------

function start(): void {
  if (phase === "play") return;
  bubbles.length = 0;
  score = 0;
  scoreEl.textContent = "0";
  phase = "play";
  startOverlay.hidden = true;
  overOverlay.hidden = true;
  last = performance.now();
  spawnTimer = 0;
  requestAnimationFrame(frame);
}

function pop(i: number): void {
  const b = bubbles[i];
  if (!b) return;
  bubbles.splice(i, 1);
  score += 1;
  scoreEl.textContent = String(score);
  playTone(440 + b.hue, 0.1, { type: "triangle" });
  if (score > store.state.best) store.update((s) => (s.best = score));
}

/** "pop" by word: pop the bubble that is closest to escaping. */
function popHighest(): void {
  if (phase !== "play" || bubbles.length === 0) return;
  let best = 0;
  for (let i = 1; i < bubbles.length; i++) if (bubbles[i]!.y < bubbles[best]!.y) best = i;
  pop(best);
}

function stop(): void {
  if (phase !== "play") return;
  phase = "over";
  overOverlay.hidden = false;
}

function again(): void {
  if (phase === "play") return;
  phase = "over";
  start();
}

// --- AAC: one line per word ----------------------------------------------

playWithAac({
  words: { go: start, pop: popHighest, stop, again },
  onState: (s) => {
    heard.textContent = s === "connected" ? "Say go!" : "";
  },
});

// --- touch ----------------------------------------------------------------

startBtn.addEventListener("click", start);
againBtn.addEventListener("click", again);
canvas.addEventListener("pointerdown", (ev) => {
  if (phase !== "play") return;
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]!;
    if ((x - b.x) ** 2 + (y - b.y) ** 2 <= (b.r * 1.3) ** 2) {
      pop(i);
      break;
    }
  }
});

// --- loop -------------------------------------------------------------------

function spawn(): void {
  const r = Math.max(24, Math.min(stage.width, stage.height) * 0.07);
  bubbles.push({
    x: r + Math.random() * (stage.width - 2 * r),
    y: stage.height + r,
    r,
    vy: -(stage.height * (0.08 + Math.random() * 0.06)),
    hue: Math.floor(Math.random() * 360),
  });
}

function frame(t: number): void {
  if (phase !== "play") return;
  const dt = Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawn();
    spawnTimer = 0.9;
  }
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]!;
    b.y += b.vy * dt;
    if (b.y < -b.r) bubbles.splice(i, 1);
  }
  draw();
  requestAnimationFrame(frame);
}

function draw(): void {
  const { ctx, width, height } = stage;
  ctx.clearRect(0, 0, width, height);
  for (const b of bubbles) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${b.hue} 80% 65% / 0.85)`;
    ctx.fill();
  }
}

draw();

// Tests read the game through this (only with ?aac-test or ?test in the URL).
exposeStateForTests(() => ({ phase, score, bubbles: bubbles.length }));
