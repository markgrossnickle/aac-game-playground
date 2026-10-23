// Shared dialog/voice-over controller: ONE serialized queue per game so two
// spoken lines NEVER play at once. SFX may overlap; dialog never does.
//
// SCOPE: this controller sequences DIALOG (narration / VO / read-aloud) only.
// SFX and gameplay cues still play through playSound/playTone and overlap freely.
//
// The controller owns only the SEQUENCING policy and stays engine-agnostic: a
// thin VoiceEngine adapter knows how to start/stop a clip (voiceClips.ts wires
// it to the clip bank; that is the reference).
//
// POLICY:
//   - At most one dialog line sounds at a time, game-wide.
//   - A line arriving while another plays QUEUES. At most one pending line per
//     side: a newer line for a side replaces that side's queued one (stale
//     narration after a wait is more confusing than none).
//   - interrupt: true lets a side cut off ITS OWN currently-playing line; it
//     never cuts off a different side (that queues).
//   - maxWaitMs expires a queued line: praise that waited out its moment is
//     dropped rather than played late.


export interface SpeakOpts {
  /** Cut off THIS side's currently-playing line instead of queueing behind it. */
  interrupt?: boolean;
  /** Drop this line if it hasn't started within this many ms of queueing. */
  maxWaitMs?: number;
}

/** A started clip the controller can stop early (interrupt / teardown). */
export interface VoiceHandle {
  stop(): void;
}

/**
 * Result of asking the engine to start a clip:
 *   • object  → playing; `duration` (s) is used only for the overlap log.
 *   • "pending" → clip known but not decoded yet; controller retries, holding
 *                 the gate so queued order is preserved.
 *   • "missing" → unplayable (muted, unknown, no context); gate is released.
 */
export type StartResult =
  | { handle: VoiceHandle; duration: number }
  | "pending"
  | "missing";

export interface VoiceEngine {
  /** Global mute state: a muted engine drops every request. */
  muted(): boolean;
  /** Is `name` a known clip (regardless of decode state)? */
  knows(name: string): boolean;
  /** AudioContext currentTime in seconds, for the overlap log (0 if none). */
  now(): number;
  /** Begin playback; call `onEnded` exactly once when the clip finishes. */
  start(name: string, onEnded: () => void): StartResult;
}

export interface VoiceLogEntry {
  name: string;
  side: string;
  start: number; // engine.now() when playback began
  end: number; // engine.now() when it finished / was stopped
}

export interface VoiceController {
  /** Queue (or interrupt-and-play) a dialog line for `side`. */
  speak(name: string, side: string, opts?: SpeakOpts): void;
  /**
   * Silence `side`: stop its currently-playing line (if it owns the gate) and
   * drop any line it has queued. Used when a game moves on and stale narration
   * for that side (e.g. the just-answered question's fact bleeding into the next
   * question) must not play. Never touches another side's line.
   */
  cancel(side: string): void;
  /** Chronological start/end log: Playwright asserts no two entries overlap. */
  readonly log: VoiceLogEntry[];
}

interface VoiceItem {
  name: string;
  side: string;
  interrupt: boolean;
  expiresAt: number | null; // performance.now() deadline, or null = never
  retries: number;
}

const MAX_RETRIES = 12; // ~3s of 250ms polls while a buffer finishes decoding

export function createVoiceController(engine: VoiceEngine): VoiceController {
  let busy = false;
  let side: string | null = null;
  let handle: VoiceHandle | null = null;
  let token = 0; // bumped to invalidate in-flight retries / onended
  let entry: VoiceLogEntry | null = null;
  const queue: VoiceItem[] = [];
  const log: VoiceLogEntry[] = [];

  function finish(t: number): void {
    if (t !== token) return;
    if (entry) entry.end = engine.now();
    busy = false;
    side = null;
    handle = null;
    entry = null;
    pump();
  }

  function stop(): void {
    token++;
    if (entry) entry.end = engine.now();
    if (handle) {
      try {
        handle.stop();
      } catch {
        /* already ended */
      }
    }
    busy = false;
    side = null;
    handle = null;
    entry = null;
  }

  function begin(item: VoiceItem): void {
    busy = true;
    side = item.side;
    const t = ++token;
    const attempt = (): void => {
      if (t !== token) return;
      if (engine.muted() || !engine.knows(item.name)) {
        finish(t);
        return;
      }
      const res = engine.start(item.name, () => finish(t));
      if (res === "pending") {
        // Decode not done: hold the gate (preserves order) and retry.
        if (item.retries-- > 0) {
          window.setTimeout(attempt, 250);
        } else {
          finish(t);
        }
        return;
      }
      if (res === "missing") {
        finish(t);
        return;
      }
      handle = res.handle;
      const startAt = engine.now();
      entry = {
        name: item.name,
        side: item.side,
        start: startAt,
        end: startAt + res.duration,
      };
      log.push(entry);
    };
    attempt();
  }

  function pump(): void {
    while (queue.length) {
      const item = queue.shift()!;
      if (item.expiresAt !== null && performance.now() > item.expiresAt)
        continue;
      begin(item);
      return;
    }
  }

  function speak(name: string, spk: string, opts: SpeakOpts = {}): void {
    if (engine.muted()) return;
    const item: VoiceItem = {
      name,
      side: spk,
      interrupt: !!opts.interrupt,
      expiresAt:
        opts.maxWaitMs !== undefined
          ? performance.now() + opts.maxWaitMs
          : null,
      retries: MAX_RETRIES,
    };
    if (busy) {
      if (side === spk && item.interrupt) {
        stop();
        begin(item);
        return;
      }
      const i = queue.findIndex((q) => q.side === spk);
      if (i >= 0) queue[i] = item;
      else queue.push(item);
      return;
    }
    begin(item);
  }

  function cancel(spk: string): void {
    // Drop this side's queued line (if any) so it never plays late.
    const i = queue.findIndex((q) => q.side === spk);
    if (i >= 0) queue.splice(i, 1);
    // If this side owns the gate right now, stop it and let the queue advance.
    if (busy && side === spk) {
      stop();
      pump();
    }
  }

  return {
    speak,
    cancel,
    get log() {
      return log;
    },
  };
}
