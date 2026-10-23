import { defineConfig } from "@playwright/test";

// Smoke tests run against the PRODUCTION build served by `vite preview`, so
// the service worker, the games manifest and hashed asset paths are all real.
// Chromium is launched headless and MUTED: the suite must never make a sound.
const PORT = 4173;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: "chromium",
    headless: true,
    trace: "off",
    launchOptions: {
      args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"],
    },
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/games-manifest.json`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
