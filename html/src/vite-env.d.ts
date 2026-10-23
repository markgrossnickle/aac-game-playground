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
  };
  export default config;
}

declare const __BUNDLE_GAME_COUNT__: number;
