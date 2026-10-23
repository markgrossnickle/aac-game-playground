import { defineConfig } from "vite";
import { games } from "./plugins/games";

// Multi-page app: the hub (index.html), the download page, and one entry per
// game under games/<id>/. Games are discovered by plugins/games.ts from their
// game.json, so adding a game never touches this file.
export default defineConfig({
  root: ".",
  publicDir: "public",
  base: "/",
  plugins: [games()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
    // Emit every asset as a real hashed file. Inlined data: URIs would be
    // invisible to the per-game precache list, and the Android WebView has
    // choked on inlined SVG in the past.
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    open: false,
  },
  preview: {
    port: 4173,
  },
});
