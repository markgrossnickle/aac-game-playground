#!/usr/bin/env node
// Render html/public/icons/icon.svg to the PNG sizes the hub, the web manifest
// and the download page use. Uses the Playwright Chromium that html/ already
// depends on, so no image library is needed. Headless and silent.
//
//   node tools/gen-icons.mjs            # all sizes from icon.svg
//   node tools/gen-icons.mjs my.svg     # from another SVG (it is copied over icon.svg)
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const iconsDir = join(root, "html", "public", "icons");
const svgPath = join(iconsDir, "icon.svg");
const SIZES = [16, 32, 180, 192, 512];

const source = process.argv[2];
if (source) copyFileSync(resolve(source), svgPath);
if (!existsSync(svgPath)) {
  console.error("gen-icons: html/public/icons/icon.svg not found");
  process.exit(1);
}

const require = createRequire(join(root, "html", "package.json"));
const { chromium } = require("@playwright/test");

const svg = readFileSync(svgPath, "utf8");
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
try {
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`,
    );
    await page.screenshot({ path: join(iconsDir, `icon-${size}.png`), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log(`gen-icons: wrote icon-${size}.png`);
  }
} finally {
  await browser.close();
}
