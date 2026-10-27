// Drawing: pre-rendered bubble sprites (one per colour, drawn once) and a
// fixed pool of pop particles, so the frame loop allocates nothing.

export const COLOURS = ["red", "blue", "green", "yellow"] as const;
export type Colour = (typeof COLOURS)[number];

export const HEX: Record<Colour, string> = {
  red: "#ff4d5e",
  blue: "#3b8cff",
  green: "#2fd36b",
  yellow: "#ffd23f",
};

const SPRITE = 256;

function makeSprite(hex: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = SPRITE;
  const g = c.getContext("2d");
  if (!g) return c;
  const r = SPRITE / 2 - 4;
  const cx = SPRITE / 2;
  // Body: clear-ish centre, colour toward the rim, like a real soap bubble.
  const body = g.createRadialGradient(cx - r * 0.25, cx - r * 0.3, r * 0.1, cx, cx, r);
  body.addColorStop(0, "rgba(255,255,255,0.35)");
  body.addColorStop(0.55, hex + "99");
  body.addColorStop(0.9, hex + "ee");
  body.addColorStop(1, hex);
  g.fillStyle = body;
  g.beginPath();
  g.arc(cx, cx, r, 0, Math.PI * 2);
  g.fill();
  // Rim.
  g.lineWidth = SPRITE * 0.025;
  g.strokeStyle = "rgba(255,255,255,0.75)";
  g.stroke();
  // Shine.
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.beginPath();
  g.ellipse(cx - r * 0.38, cx - r * 0.42, r * 0.2, r * 0.12, -Math.PI / 4, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(cx + r * 0.42, cx + r * 0.38, r * 0.06, 0, Math.PI * 2);
  g.fill();
  return c;
}

export const sprites: Record<Colour, HTMLCanvasElement> = {
  red: makeSprite(HEX.red),
  blue: makeSprite(HEX.blue),
  green: makeSprite(HEX.green),
  yellow: makeSprite(HEX.yellow),
};

// --- particles ---------------------------------------------------------------

interface Particle {
  on: boolean;
  ring: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  max: number;
  hex: string;
}

const POOL: Particle[] = Array.from({ length: 240 }, () => ({ on: false, ring: false, x: 0, y: 0, vx: 0, vy: 0, size: 0, life: 0, max: 1, hex: "#fff" }));
let active = 0;

function take(): Particle | null {
  for (const p of POOL) if (!p.on) return p;
  return null;
}

/** The pop: an expanding ring plus droplets flying out. */
export function burst(x: number, y: number, r: number, hex: string, drops = 12): void {
  const ring = take();
  if (ring) {
    Object.assign(ring, { on: true, ring: true, x, y, vx: 0, vy: 0, size: r, life: 0.28, max: 0.28, hex });
    active++;
  }
  for (let i = 0; i < drops; i++) {
    const p = take();
    if (!p) break;
    const a = (i / drops) * Math.PI * 2 + Math.random() * 0.4;
    const s = r * (2.2 + Math.random() * 2.2);
    Object.assign(p, {
      on: true,
      ring: false,
      x: x + Math.cos(a) * r * 0.7,
      y: y + Math.sin(a) * r * 0.7,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      size: r * (0.1 + Math.random() * 0.08),
      life: 0.45 + Math.random() * 0.2,
      max: 0.6,
      hex,
    });
    active++;
  }
}

/** A faint ripple where a tap missed. */
export function ripple(x: number, y: number, r: number): void {
  const p = take();
  if (!p) return;
  Object.assign(p, { on: true, ring: true, x, y, vx: 0, vy: 0, size: r * 0.5, life: 0.25, max: 0.25, hex: "#ffffff" });
  active++;
}

export function particlesActive(): number {
  return active;
}

export function clearParticles(): void {
  for (const p of POOL) p.on = false;
  active = 0;
}

export function stepParticles(dt: number, height: number): void {
  for (const p of POOL) {
    if (!p.on) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.on = false;
      active--;
      continue;
    }
    if (p.ring) {
      p.size += p.size * 3.2 * dt;
    } else {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 3 * dt;
      p.vy = p.vy * (1 - 3 * dt) + height * 0.6 * dt;
    }
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D): void {
  for (const p of POOL) {
    if (!p.on) continue;
    const k = Math.max(0, p.life / p.max);
    ctx.globalAlpha = k;
    if (p.ring) {
      ctx.strokeStyle = p.hex;
      ctx.lineWidth = Math.max(2, p.size * 0.12 * k);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.hex;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
