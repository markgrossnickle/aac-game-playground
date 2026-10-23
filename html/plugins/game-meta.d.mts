export interface EmojiIcon {
  emoji: string;
}

export type AacVocabularyEntry = string | { word: string; synonyms?: string[] };

export interface GameMeta {
  id: string;
  title: string;
  icon: string | EmojiIcon;
  players: 1 | 2;
  orientation: "any" | "portrait" | "landscape";
  ages?: string;
  addedOn: string;
  authors?: string[];
  description: string;
  entry?: "index.html";
  hidden?: boolean;
  /** How the game can be played. Must include "touch"; add "aac" to accept AAC board input. */
  input?: Array<"touch" | "aac">;
  /** Required when input includes "aac": the words the game responds to. */
  aac?: { vocabulary: AacVocabularyEntry[] };
}

export function validateGameMeta(json: unknown, folderName: string): string[];
export function escapeHtml(s: unknown): string;
export function normalizeAacWord(s: unknown): string;
export function aacVocabulary(meta: GameMeta): Array<{ word: string; synonyms?: string[] }>;
