// Prerecorded voice-clip player: the WebView-safe replacement for the browser
// speechSynthesis API, which is effectively dead in the Android System WebView
// the shim runs inside (docs/guides/AUDIO.md). SFX work there because they go
// through WebAudio; spoken dialogue did not. This module routes dialogue through
// the SAME WebAudio path: small prerecorded mp3s are decoded into the shared
// AudioContext and played by a slug derived from the line's text.
//
// Design rules:
//   - NEVER call speechSynthesis. Not as a fallback, not as a warmup.
//   - Degrade gracefully. If a clip is unknown, still decoding, muted, or the
//     context is missing, speak() returns null and the caller keeps its
//     on-screen text: the game never breaks and never goes fully silent.
//   - Reuse the SDK's WebAudio unlock (audio.ts): prime() after the first tap.
//
// Clips come from Vite's import.meta.glob(..., { query: "?url" }) so they are
// bundled, hashed and in the precache graph. Most games should use
// createVoiceClips() in voiceClips.ts rather than this module directly.

/**
 * Turn a spoken line into a stable clip slug. MUST stay identical to the
 * slug the generator script writes (scripts/gen-voice-clips.mjs): the two are
 * the contract. Lowercase, drop apostrophes, every other run of non-alphanumerics
 * becomes a single hyphen, trimmed, capped so filenames stay sane.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** A started clip the caller can stop early (interrupt / teardown). */
export interface ClipHandle {
  stop(): void;
}

export interface ClipBankOpts {
  /** Slug → bundled mp3 URL. Build with buildClipUrlMap(import.meta.glob(...)). */
  clips: Record<string, string>;
  /** The game's shared AudioContext (already unlocked in the start gesture). */
  getContext: () => AudioContext | null;
  /** Optional master gain node to route through (for game-wide mute/volume). */
  getDestination?: () => AudioNode | null;
  /** Global mute: a muted bank plays nothing (caller keeps its text). */
  isMuted?: () => boolean;
}

/**
 * Convert a glob map ({"../audio/vo/great-job.mp3": "/assets/great-job.hash.mp3"})
 * into a slug→url map ({"great-job": "/assets/great-job.hash.mp3"}).
 */
export function buildClipUrlMap(
  glob: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(glob)) {
    const base = path.split("/").pop() ?? path;
    const slug = base.replace(/\.[a-z0-9]+$/i, "");
    out[slug] = url;
  }
  return out;
}

export interface ClipBank {
  /** Adopt the game's AudioContext and kick off background decode of all clips. */
  prime(): void;
  /** Is there a clip for this exact line? (regardless of decode state) */
  has(text: string): boolean;
  /**
   * Play the clip for `text`. Returns a handle when a clip actually started;
   * returns null when it can't (muted / unknown / not decoded yet / no context)
   * so the caller can fall back to on-screen text. `onEnded` fires exactly once
   * when the clip finishes or is stopped.
   */
  speak(text: string, onEnded?: () => void): { handle: ClipHandle; duration: number } | null;
  /**
   * Higher-level play used by the FIFO-queue games. Tries to play `text` now; if
   * the clip is KNOWN but still decoding (the race at game start, before prime's
   * background decode finishes), it polls briefly and plays once ready instead
   * of dropping the line. Calls exactly one of:
   *   • onPlay(durationSec) when a clip starts (schedule your own hard timeout),
   *   • onEnded() when that clip finishes/stops,
   *   • onFallback() when there is no usable clip (muted / unknown / gave up).
   * Returns a handle whose stop() cancels a pending poll or a playing clip.
   */
  play(
    text: string,
    cbs: { onPlay?: (durationSec: number) => void; onEnded?: () => void; onFallback?: () => void },
  ): ClipHandle;
  /** AudioContext currentTime (seconds), or 0: for the voiceController log. */
  now(): number;

  // ── Composable lines (stem + slot model) ──────────────────────────────
  // A voiced line with a variable element (ingredient, animal, number…) is
  // recorded as SEPARATE clips: fixed phrase stem(s) + the variable tokens -
  // and assembled at runtime by playing the clips back-to-back on the shared
  // AudioContext timeline. Swapping a token just swaps its clip; no full line
  // is ever re-recorded. See docs/guides/AUDIO.md.

  /** True only if EVERY slug in the sequence has a bundled clip (any decode state). */
  hasSequence(slugs: string[]): boolean;
  /** True once every KNOWN token in the sequence has finished decoding (ready to
   *  stitch without a missing part). Used by voiceController adapters to return
   *  "pending" until the whole line can play in order. */
  sequenceReady(slugs: string[]): boolean;
  /**
   * Assemble and play an ordered list of clip slugs gaplessly (a small `gapMs`
   * of natural spacing between tokens). Buffers are scheduled end-to-end on the
   * AudioContext clock so there is no JS-timer jitter between tokens. Any slug
   * with no decoded buffer is skipped (the line still plays the parts it has).
   * Returns a handle + total duration when at least one token started; returns
   * null (muted / no context / nothing decoded yet) so the caller keeps its
   * on-screen text. `onEnded` fires once when the last token finishes/stops.
   */
  speakSequence(
    slugs: string[],
    onEnded?: () => void,
    gapMs?: number,
  ): { handle: ClipHandle; duration: number } | null;
  /**
   * Queue-game variant of speakSequence: like `play`, it briefly polls for
   * known-but-still-decoding tokens (the start-of-game race) before assembling,
   * then calls exactly one of onPlay(totalSec) / onEnded() / onFallback().
   */
  playSequence(
    slugs: string[],
    cbs: { onPlay?: (durationSec: number) => void; onEnded?: () => void; onFallback?: () => void },
    gapMs?: number,
  ): ClipHandle;
}

export function createClipBank(opts: ClipBankOpts): ClipBank {
  const buffers = new Map<string, AudioBuffer>();
  const decoding = new Set<string>();
  let loaded = false;

  function ctx(): AudioContext | null {
    return opts.getContext();
  }

  function decode(slug: string, url: string): void {
    const c = ctx();
    if (!c || buffers.has(slug) || decoding.has(slug)) return;
    decoding.add(slug);
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then(
        (buf) =>
          new Promise<AudioBuffer>((resolve, reject) => {
            // Callback form for the widest WebView support (older Android
            // WebViews don't return a Promise from decodeAudioData).
            const p = c.decodeAudioData(buf, resolve, reject) as
              | Promise<AudioBuffer>
              | undefined;
            if (p && typeof p.then === "function") p.then(resolve, reject);
          }),
      )
      .then((audio) => {
        buffers.set(slug, audio);
        decoding.delete(slug);
      })
      .catch(() => {
        // Unplayable clip → leave it absent; speak() will fall back to text.
        decoding.delete(slug);
      });
  }

  function prime(): void {
    if (loaded) return;
    loaded = true;
    // Decode everything now (right after the unlock gesture) so lines that fire
    // a moment later already have audio. A line that fires before its buffer is
    // ready simply falls back to text that once.
    for (const [slug, url] of Object.entries(opts.clips)) decode(slug, url);
  }

  function has(text: string): boolean {
    return slugify(text) in opts.clips;
  }

  function speak(
    text: string,
    onEnded?: () => void,
  ): { handle: ClipHandle; duration: number } | null {
    if (opts.isMuted?.()) return null;
    const c = ctx();
    if (!c) return null;
    const slug = slugify(text);
    const buffer = buffers.get(slug);
    if (!buffer) {
      // Known but not decoded yet → start decoding for next time, fall back now.
      if (slug in opts.clips) decode(slug, opts.clips[slug]!);
      return null;
    }
    if (c.state === "suspended") void c.resume();
    const dest = opts.getDestination?.() ?? c.destination;
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.connect(dest);
    let done = false;
    const fire = (): void => {
      if (done) return;
      done = true;
      onEnded?.();
    };
    src.onended = fire;
    try {
      src.start(0);
    } catch {
      return null;
    }
    return {
      handle: {
        stop: () => {
          try {
            src.stop();
          } catch {
            /* already stopped */
          }
          fire();
        },
      },
      duration: buffer.duration,
    };
  }

  // Poll window for a known-but-still-decoding clip before giving up. Covers the
  // start-of-game race where a line fires the same tick prime() kicks off decode.
  const POLL_MS = 150;
  const MAX_POLLS = 14; // ~2.1s

  function play(
    text: string,
    cbs: { onPlay?: (durationSec: number) => void; onEnded?: () => void; onFallback?: () => void },
  ): ClipHandle {
    let cancelled = false;
    let timer: number | null = null;
    let inner: ClipHandle | null = null;
    let settled = false;

    const fallback = (): void => {
      if (settled) return;
      settled = true;
      cbs.onFallback?.();
    };

    // No point polling if muted, contextless, or the clip simply doesn't exist.
    const known = slugify(text) in opts.clips;
    if (opts.isMuted?.() || !ctx() || !known) {
      if (known) decode(slugify(text), opts.clips[slugify(text)]!);
      fallback();
      return { stop: () => {} };
    }

    let polls = 0;
    const attempt = (): void => {
      if (cancelled || settled) return;
      const res = speak(text, () => {
        if (!cancelled) cbs.onEnded?.();
      });
      if (res) {
        settled = true;
        inner = res.handle;
        cbs.onPlay?.(res.duration);
        return;
      }
      if (polls++ >= MAX_POLLS) {
        fallback();
        return;
      }
      timer = window.setTimeout(attempt, POLL_MS);
    };
    attempt();

    return {
      stop: () => {
        cancelled = true;
        if (timer !== null) window.clearTimeout(timer);
        inner?.stop();
      },
    };
  }

  // ── Composable lines ────────────────────────────────────────────────────
  function hasSequence(slugs: string[]): boolean {
    return slugs.length > 0 && slugs.every((s) => s in opts.clips);
  }

  function sequenceReady(slugs: string[]): boolean {
    const known = slugs.filter((s) => s in opts.clips);
    if (known.length === 0) return false;
    // Kick decodes for anything not yet started, then report all-known-decoded.
    for (const s of known) if (!buffers.has(s)) decode(s, opts.clips[s]!);
    return known.every((s) => buffers.has(s));
  }

  function speakSequence(
    slugs: string[],
    onEnded?: () => void,
    gapMs = 120,
  ): { handle: ClipHandle; duration: number } | null {
    if (opts.isMuted?.()) return null;
    const c = ctx();
    if (!c) return null;
    // Collect the buffers we actually have; skip any token still undecoded so a
    // partial line still speaks (and kick a decode so it's ready next time).
    const parts: AudioBuffer[] = [];
    for (const slug of slugs) {
      const buf = buffers.get(slug);
      if (buf) parts.push(buf);
      else if (slug in opts.clips) decode(slug, opts.clips[slug]!);
    }
    if (parts.length === 0) return null;
    if (c.state === "suspended") void c.resume();
    const dest = opts.getDestination?.() ?? c.destination;
    const gap = Math.max(0, gapMs) / 1000;
    // Schedule every token on the AudioContext clock so tokens abut with no
    // JS-timer jitter between them. Start slightly in the future so the first
    // token isn't clipped by scheduling latency.
    const start = c.currentTime + 0.04;
    let t = start;
    const sources: AudioBufferSourceNode[] = [];
    let last: AudioBufferSourceNode | null = null;
    for (const buf of parts) {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(dest);
      try {
        src.start(t);
      } catch {
        break;
      }
      sources.push(src);
      last = src;
      t += buf.duration + gap;
    }
    if (!last) return null;
    const duration = t - gap - start; // no trailing gap after the last token
    let done = false;
    const fire = (): void => {
      if (done) return;
      done = true;
      onEnded?.();
    };
    last.onended = fire;
    return {
      handle: {
        stop: () => {
          for (const s of sources) {
            try {
              s.stop();
            } catch {
              /* already stopped */
            }
          }
          fire();
        },
      },
      duration,
    };
  }

  function playSequence(
    slugs: string[],
    cbs: { onPlay?: (durationSec: number) => void; onEnded?: () => void; onFallback?: () => void },
    gapMs = 120,
  ): ClipHandle {
    let cancelled = false;
    let timer: number | null = null;
    let inner: ClipHandle | null = null;
    let settled = false;

    const fallback = (): void => {
      if (settled) return;
      settled = true;
      cbs.onFallback?.();
    };

    // Nothing usable → fall back immediately (caller keeps its on-screen text).
    const anyKnown = slugs.some((s) => s in opts.clips);
    if (opts.isMuted?.() || !ctx() || !anyKnown) {
      for (const s of slugs) if (s in opts.clips) decode(s, opts.clips[s]!);
      fallback();
      return { stop: () => {} };
    }

    // Poll until every KNOWN token has decoded (or we give up), so the assembled
    // line isn't missing a token that was mid-decode at game start.
    const known = slugs.filter((s) => s in opts.clips);
    let polls = 0;
    const attempt = (): void => {
      if (cancelled || settled) return;
      const ready = known.every((s) => buffers.has(s));
      if (ready || polls++ >= MAX_POLLS) {
        const res = speakSequence(
          slugs,
          () => {
            if (!cancelled) cbs.onEnded?.();
          },
          gapMs,
        );
        if (res) {
          settled = true;
          inner = res.handle;
          cbs.onPlay?.(res.duration);
        } else {
          fallback();
        }
        return;
      }
      timer = window.setTimeout(attempt, POLL_MS);
    };
    attempt();

    return {
      stop: () => {
        cancelled = true;
        if (timer !== null) window.clearTimeout(timer);
        inner?.stop();
      },
    };
  }

  function now(): number {
    return ctx()?.currentTime ?? 0;
  }

  return {
    prime,
    has,
    speak,
    play,
    now,
    hasSequence,
    sequenceReady,
    speakSequence,
    playSequence,
  };
}
