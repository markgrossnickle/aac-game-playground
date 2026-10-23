// One AudioContext per page, unlocked inside the first user gesture, with a
// master gain for mute. Every sound a game makes goes through here, whether a
// synthesized tone, a decoded SFX, or a prerecorded voice clip (see clips.ts
// and voice.ts). Never use speechSynthesis: it is dead in the Android WebView.
import bundleConfig from "virtual:bundle-config";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let unlocked = false;
const listeners = new Set<(muted: boolean) => void>();

const MUTE_KEY = "bundle:muted";

function platformDefaultMuted(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isCapacitor = typeof (window as unknown as { Capacitor?: unknown }).Capacitor !== "undefined";
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  if (isCapacitor || isMobile) return false;
  return bundleConfig.audio.defaultMutedOnDesktop;
}

function readMuted(): boolean {
  try {
    const raw = localStorage.getItem(MUTE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    // ignore
  }
  return platformDefaultMuted();
}

muted = readMuted();

/** The shared AudioContext, created lazily. Null before any gesture in strict browsers. */
export function getAudioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);
  return ctx;
}

/** Where every sound should connect: the master gain (mute lives here). */
export function getMasterNode(): AudioNode | null {
  if (!ctx) getAudioContext();
  return master;
}

/**
 * Call from inside the first pointerdown/touchstart/click. Resumes the context
 * and plays a one-sample silent buffer, the trick that reliably unlocks audio
 * in WebViews. Safe to call many times.
 */
export function unlockAudio(): void {
  const c = getAudioContext();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  if (unlocked) return;
  unlocked = true;
  try {
    const buf = c.createBuffer(1, 1, c.sampleRate);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch {
    // ignore
  }
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (master) master.gain.value = muted ? 0 : 1;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // ignore
  }
  for (const l of listeners) l(muted);
}

export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
}

export function onMuteChange(cb: (muted: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Decode a bundled audio file (URL from new URL(..., import.meta.url) or import.meta.glob). */
export async function loadSound(url: string): Promise<AudioBuffer | null> {
  const c = getAudioContext();
  if (!c) return null;
  try {
    const res = await fetch(url);
    const data = await res.arrayBuffer();
    return await new Promise<AudioBuffer>((resolve, reject) => {
      const p = c.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
      if (p && typeof p.then === "function") p.then(resolve, reject);
    });
  } catch {
    return null;
  }
}

/** Play a decoded buffer through the master gain. Returns a stop function. */
export function playSound(buffer: AudioBuffer, opts: { volume?: number; rate?: number; loop?: boolean } = {}): () => void {
  const c = getAudioContext();
  const dest = getMasterNode();
  if (!c || !dest || muted) return () => {};
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.loop = !!opts.loop;
  src.playbackRate.value = opts.rate ?? 1;
  const gain = c.createGain();
  gain.gain.value = opts.volume ?? 1;
  src.connect(gain).connect(dest);
  try {
    src.start(0);
  } catch {
    return () => {};
  }
  return () => {
    try {
      src.stop();
    } catch {
      // already stopped
    }
  };
}

/**
 * A tiny synthesized tone for quick feedback (tap, success, miss) without any
 * asset file. frequency in Hz, duration in seconds.
 */
export function playTone(frequency = 440, duration = 0.12, opts: { type?: OscillatorType; volume?: number } = {}): void {
  const c = getAudioContext();
  const dest = getMasterNode();
  if (!c || !dest || muted) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.value = frequency;
  const v = opts.volume ?? 0.2;
  const t = c.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(v, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}
