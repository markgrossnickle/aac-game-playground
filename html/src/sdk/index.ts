// The game SDK. Import from "../../src/sdk" (relative to html/games/<id>/src/).
// Everything a game needs to behave like its siblings lives here; see
// docs/guides/CODING.md for the rules and templates/game for a worked example.
export { bootGame, type BootOptions, type BootedGame } from "./boot";
export {
  getAudioContext,
  getMasterNode,
  unlockAudio,
  isAudioUnlocked,
  isMuted,
  setMuted,
  toggleMuted,
  onMuteChange,
  loadSound,
  playSound,
  playTone,
} from "./audio";
export { createStore, type Store, type StoreOptions } from "./storage";
export { viewport, onViewportChange, fitCanvas, type ViewportSize, type FittedCanvas } from "./viewport";
export { startUpdateCheck, showUpdateBanner, type UpdateChecker } from "./update";
export { fetchManifest, currentGameId, type GamesManifest, type GameEntry } from "./manifest";
export { createClipBank, buildClipUrlMap, slugify, type ClipBank, type ClipHandle } from "./clips";
export { createVoiceController, type VoiceController, type VoiceEngine, type SpeakOpts } from "./voice";
export { createVoiceClips, type VoiceClips } from "./voiceClips";
