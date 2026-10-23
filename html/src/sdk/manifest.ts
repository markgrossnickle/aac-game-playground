// games-manifest.json: the one file that says what the bundle currently is.
// Written by html/plugins/games.ts at build time; fetched fresh (never from
// cache) by the hub and by every game on focus. Shape mirrors GamesManifest in
// the plugin; duplicated here so the SDK has no build-time import.

export interface GameEntry {
  id: string;
  title: string;
  icon: string | { emoji: string };
  players: 1 | 2;
  orientation: "any" | "portrait" | "landscape";
  ages?: string;
  addedOn: string;
  authors?: string[];
  description: string;
  hidden?: boolean;
  route: string;
  version: string;
  sizeBytes: number;
  files: string[];
}

export interface GamesManifest {
  buildId: string;
  builtAt: string;
  base: string;
  bundle: { name: string; shortName: string };
  hub: { version: string; files: string[] };
  games: GameEntry[];
}

export const MANIFEST_URL = "/games-manifest.json";

/** Fetch the live manifest. Resolves null offline or when the file is missing. */
export async function fetchManifest(): Promise<GamesManifest | null> {
  try {
    const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as GamesManifest;
    if (!json || typeof json.buildId !== "string" || !Array.isArray(json.games)) return null;
    return json;
  } catch {
    return null;
  }
}

/** The game id for the current page, from /games/<id>/..., or null on the hub. */
export function currentGameId(): string | null {
  const m = /\/games\/([a-z0-9-]+)\//.exec(location.pathname);
  return m ? m[1]! : null;
}
