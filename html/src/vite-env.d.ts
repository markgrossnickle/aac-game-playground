/// <reference types="vite/client" />

declare module "virtual:bundle-config" {
  const config: {
    name: string;
    shortName: string;
    description: string;
    webUrl: string;
    apkUrl: string;
    theme: { background: string; accent: string };
    audio: { defaultMutedOnDesktop: boolean };
    /** relay: this bundle's aac-bridge relay base URL, or null when none is deployed. */
    aac: { relay: string | null };
  };
  export default config;
}

declare module "virtual:aac-vocabularies" {
  /** game id -> the AAC vocabulary declared in that game's game.json. */
  const vocabularies: Record<string, Array<{ word: string; synonyms?: string[] }>>;
  export default vocabularies;
}

declare const __BUNDLE_GAME_COUNT__: number;
