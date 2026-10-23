export interface EmojiIcon {
  emoji: string;
}

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
}

export function validateGameMeta(json: unknown, folderName: string): string[];
export function escapeHtml(s: unknown): string;
