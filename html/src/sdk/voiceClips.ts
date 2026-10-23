// The easy path for spoken lines: prerecorded clips, one shared queue so two
// lines never overlap, already wired to the SDK's AudioContext and mute state.
//
//   const voice = createVoiceClips(import.meta.glob("../audio/vo/*.mp3", { eager: true, query: "?url", import: "default" }));
//   // inside bootGame({ onFirstGesture: () => voice.prime() })
//   voice.say("Great job!");            // plays assets/audio/vo/great-job.mp3 if it exists
//   voice.say("Try again", "player2");  // one queue per player in two-player games
//
// A line with no clip is skipped silently: keep the text on screen as well.
import { getAudioContext, getMasterNode, isMuted } from "./audio";
import { buildClipUrlMap, createClipBank, slugify, type ClipBank } from "./clips";
import { createVoiceController, type SpeakOpts, type VoiceController } from "./voice";

export interface VoiceClips {
  /** Decode every clip. Call inside the first gesture (bootGame's onFirstGesture). */
  prime(): void;
  /** Queue a line for `side` ("narrator" by default). */
  say(text: string, side?: string, opts?: SpeakOpts): void;
  /** Does a clip exist for this exact line? */
  has(text: string): boolean;
  /** Stop and forget everything queued for `side`. */
  cancel(side?: string): void;
  readonly bank: ClipBank;
  readonly controller: VoiceController;
}

export function createVoiceClips(glob: Record<string, string>): VoiceClips {
  const clips = buildClipUrlMap(glob);
  const bank = createClipBank({
    clips,
    getContext: getAudioContext,
    getDestination: getMasterNode,
    isMuted,
  });
  const controller = createVoiceController({
    muted: isMuted,
    knows: (name) => name in clips,
    now: () => bank.now(),
    start: (name, onEnded) => {
      const res = bank.speak(name, onEnded);
      if (res) return res;
      return name in clips ? "pending" : "missing";
    },
  });
  return {
    prime: () => bank.prime(),
    say: (text, side = "narrator", opts) => controller.speak(slugify(text), side, opts),
    has: (text) => bank.has(text),
    cancel: (side = "narrator") => controller.cancel(side),
    bank,
    controller,
  };
}
