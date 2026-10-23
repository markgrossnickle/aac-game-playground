// __GAME_TITLE__: a tiny bubble-popping game that shows the SDK in use.
// Everything a game needs (back link, mute, audio unlock, updates, offline
// caching, device-independent sizing, saved state) comes from the SDK.
import { bootGame, createStore, fitCanvas, playTone } from "../../../src/sdk";

const GAME_ID = "__GAME_ID__";

// Saved state: keep it small and versioned.
const store = createStore(GAME_ID, {
  version: 1,
  defaults: { best: 0 },
});

interface Bubble {
  x: number;
  y: number;
  r: number;
  vy: number;
  hue: number;
}

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const scoreEl = document.getElementById("score")!;
const startOverlay = document.getElementById("start") as HTMLElement;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;

const stage = fitCanvas(canvas);
const bubbles: Bubble[] = [];
let score = 0;
let running = false;
let spawnTimer = 0;
let last = 0;

// Boot first: this wires the chrome and unlocks audio in the first tap.
bootGame({
  onFirstGesture() {
    // Decode voice clips or sound files here if the game has any.
  },
});

function spawn(): void {
  const r = Math.max(24, Math.min(stage.width, stage.height) * 0.07);
  bubbles.push({
    x: r + Math.random() * (stage.width - 2 * r),
    y: stage.height + r,
    r,
    vy: -(stage.height * (0.12 + Math.random() * 0.1)),
    hue: Math.floor(Math.random() * 360),
  });
}

function pop(i: number): void {
  const b = bubbles[i]!;
  bubbles.splice(i, 1);
  score += 1;
  scoreEl.textContent = String(score);
  playTone(440 + b.hue, 0.1, { type: "triangle" });
  if (score > store.state.best) store.update((s) => (s.best = score));
}

function frame(t: number): void {
  if (!running) return;
  const dt = Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawn();
    spawnTimer = 0.7;
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
    ctx.beginPath();
    ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fill();
  }
  ctx.fillStyle = "rgba(234,242,255,0.6)";
  ctx.font = `600 ${Math.max(14, Math.round(height * 0.025))}px system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText(`Best ${store.state.best}`, width - 14, height - 14);
}

canvas.addEventListener("pointerdown", (ev) => {
  if (!running) return;
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]!;
    // Generous hit area: small fingers.
    if ((x - b.x) ** 2 + (y - b.y) ** 2 <= (b.r * 1.3) ** 2) {
      pop(i);
      break;
    }
  }
});

startBtn.addEventListener("click", () => {
  startOverlay.hidden = true;
  running = true;
  last = performance.now();
  requestAnimationFrame(frame);
});

draw();
