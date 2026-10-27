// Synthesized sounds only: no files, no voice. Everything goes through the
// SDK's shared AudioContext and master gain, so the mute button covers it.
// Nothing plays until bootGame() has unlocked audio in the first tap, which
// keeps AAC words that arrive before any touch silent rather than noisy.
import { getAudioContext, getMasterNode, isAudioUnlocked, isMuted } from "../../../src/sdk";

/** A short tone that slides from `from` Hz to `to` Hz, starting `at` seconds from now. */
function slide(from: number, to: number, dur: number, opts: { type?: OscillatorType; vol?: number; at?: number } = {}): void {
  if (!isAudioUnlocked() || isMuted()) return;
  const c = getAudioContext();
  const dest = getMasterNode();
  if (!c || !dest) return;
  try {
    const t = c.currentTime + (opts.at ?? 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const v = opts.vol ?? 0.2;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(v, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch {
    // A sound is a bonus; never let it break the game.
  }
}

/** The pop: a quick bright blip that drops in pitch. Pitch varies so it never drones. */
export function popSound(at = 0, size = 1): void {
  const base = (900 + Math.random() * 500) / size;
  slide(base, base * 0.3, 0.08, { vol: 0.22, at });
  slide(base * 2.2, base * 1.6, 0.03, { type: "triangle", vol: 0.06, at });
}

/** A big bubble taking its first hit: a rubbery boing. */
export function boingSound(): void {
  slide(220, 420, 0.16, { type: "triangle", vol: 0.18 });
}

/** New bubbles arriving: a soft rising burble. */
export function moreSound(): void {
  for (let i = 0; i < 3; i++) slide(380 + i * 120, 620 + i * 160, 0.09, { vol: 0.12, at: i * 0.06 });
}

/** Blowing a big bubble: a slow rising whoosh. */
export function blowSound(): void {
  slide(160, 520, 0.4, { type: "triangle", vol: 0.12 });
}

/** Flow stopped / resumed. */
export function stopSound(): void {
  slide(520, 300, 0.18, { type: "triangle", vol: 0.14 });
}
export function goSound(): void {
  slide(330, 660, 0.16, { type: "triangle", vol: 0.14 });
}

/** Nothing to do right now: a small low bump, not a buzzer. */
export function wobbleSound(): void {
  slide(200, 160, 0.12, { type: "sine", vol: 0.1 });
}

/** A little cheer every ten pops: a quick major arpeggio. */
export function cheerSound(): void {
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => slide(f, f, 0.14, { type: "triangle", vol: 0.12, at: i * 0.08 }));
}
