// Smoke suite: every game in the production build must load cleanly at a
// phone and a tablet viewport, cache itself for offline play, and react to a
// newer manifest. Runs muted and headless (playwright.config.ts).
//
//   npm run smoke                      # all games
//   npm run smoke -- --grep my-game    # one game
import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface ManifestGame {
  id: string;
  title: string;
  route: string;
  version: string;
  files: string[];
  hidden?: boolean;
  input?: string[];
  aac?: { vocabulary: Array<string | { word: string; synonyms?: string[] }> };
}
interface Manifest {
  buildId: string;
  hub: { version: string; files: string[] };
  games: ManifestGame[];
}

const distManifest = fileURLToPath(new URL("../dist/games-manifest.json", import.meta.url));
if (!existsSync(distManifest)) {
  throw new Error("dist/games-manifest.json not found. Run `npm run build` before `npm run smoke`.");
}
const manifest = JSON.parse(readFileSync(distManifest, "utf8")) as Manifest;

const VIEWPORTS = [
  { name: "phone-portrait", width: 390, height: 844 },
  { name: "tablet-landscape", width: 1280, height: 800 },
];

function collectProblems(page: Page): { errors: string[]; failed: string[] } {
  const errors: string[] = [];
  const failed: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("requestfailed", (req) => {
    // Aborted requests (navigation away) are not failures.
    const reason = req.failure()?.errorText ?? "";
    if (!/aborted/i.test(reason)) failed.push(`${req.url()} (${reason})`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400 && new URL(res.url()).origin === new URL(page.url() || res.url()).origin) {
      failed.push(`${res.url()} -> ${res.status()}`);
    }
  });
  return { errors, failed };
}

test.describe("hub", () => {
  test("renders one card per visible game and registers the service worker", async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto("/");
    await expect(page).toHaveTitle(/.+/);
    const visible = manifest.games.filter((g) => !g.hidden);
    await expect(page.locator(".card")).toHaveCount(visible.length);
    for (const g of visible) {
      await expect(page.locator(`.card[data-game="${g.id}"] .title`)).toHaveText(g.title);
    }
    if (visible.length === 0) {
      await expect(page.locator(".empty-state")).toBeVisible();
    }
    const swState = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return "unsupported";
      const reg = await navigator.serviceWorker.ready;
      return reg.active ? "active" : "inactive";
    });
    expect(swState).toBe("active");
    await expect(page.locator("#build-id")).toContainText(manifest.buildId);
    expect(problems.errors).toEqual([]);
    expect(problems.failed).toEqual([]);
  });

  test("safe zone: nothing overlaps the top-left corner", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const hit = await page.evaluate(() => {
      const el = document.elementFromPoint(40, 30);
      return el ? el.tagName + "." + el.className : null;
    });
    // The hub header may sit there; a card or button may not.
    expect(hit ?? "").not.toMatch(/card|fav-btn|tab/);
  });
});

for (const game of manifest.games) {
  test.describe(game.id, () => {
    for (const vp of VIEWPORTS) {
      test(`loads at ${vp.name} with no errors`, async ({ page }) => {
        const problems = collectProblems(page);
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(game.route);
        await expect(page).toHaveTitle(/.+/);

        // Standard chrome from bootGame().
        const back = page.locator("a.back");
        await expect(back).toHaveCount(1);
        const box = await back.boundingBox();
        expect(box, "back link must be visible").not.toBeNull();
        expect(box!.x).toBeLessThan(40);
        expect(box!.y).toBeLessThan(40);

        // Every image decoded.
        const brokenImages = await page.evaluate(() =>
          [...document.images].filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.src),
        );
        expect(brokenImages).toEqual([]);

        // No horizontal overflow (the page must fit the device).
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(1);

        // A tap must not throw.
        await page.mouse.click(vp.width / 2, vp.height / 2);
        await page.waitForTimeout(300);

        expect(problems.errors).toEqual([]);
        expect(problems.failed).toEqual([]);
      });
    }

    test("caches itself and then plays offline", async ({ page, context }) => {
      await page.goto(game.route);
      // The SDK writes a completion marker only after every file is stored.
      await expect
        .poll(
          () =>
            page.evaluate(async ({ id, version }) => {
              if (!(await caches.has(`game:${id}:${version}`))) return false;
              const c = await caches.open(`game:${id}:${version}`);
              return !!(await c.match("/__cache-complete__"));
            }, { id: game.id, version: game.version }),
          { timeout: 20_000, message: `game:${game.id}:${game.version} never finished caching` },
        )
        .toBe(true);
      const cachedCount = await page.evaluate(async ({ id, version }) => {
        const c = await caches.open(`game:${id}:${version}`);
        return (await c.keys()).length;
      }, { id: game.id, version: game.version });
      expect(cachedCount).toBe(game.files.length + 1);

      await context.setOffline(true);
      const problems = collectProblems(page);
      await page.goto(game.route);
      await expect(page.locator("a.back")).toHaveCount(1);
      await page.waitForTimeout(500);
      // Chrome re-checks /sw.js on navigation; offline that one request may fail and is harmless.
      expect(problems.failed.filter((f) => !f.includes("/sw.js"))).toEqual([]);
      expect(problems.errors).toEqual([]);
      await context.setOffline(false);
    });

    test("shows the update banner when a newer version is live", async ({ browser }) => {
      // Page routing cannot see requests a service worker makes, so this test
      // runs with service workers blocked and talks to the preview server directly.
      const context = await browser.newContext({ serviceWorkers: "block" });
      const page = await context.newPage();
      await page.clock.install();
      let calls = 0;
      await page.route("**/games-manifest.json*", async (route) => {
        calls++;
        const res = await route.fetch();
        const json = (await res.json()) as Manifest;
        if (calls > 1) {
          const g = json.games.find((x) => x.id === game.id);
          if (g) g.version = "0000000000000000";
          json.buildId = "0000000000000000";
        }
        await route.fulfill({ response: res, json });
      });
      await page.goto(game.route);
      await expect(page.locator("#sdk-update-banner")).toHaveCount(0);
      await page.clock.fastForward(20_000);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(page.locator("#sdk-update-banner")).toBeVisible({ timeout: 10_000 });
      expect(calls).toBeGreaterThanOrEqual(2);
      await context.close();
    });
  });
}

// AAC wiring, for every game whose game.json has "input": [..."aac"]. The
// game's own tests/aac.spec.ts proves the words play the game; this proves the
// framework contract for all of them: every declared word and synonym reaches
// an action, nothing else does, and duplicates, late words and words sent
// after sharing stopped are dropped.
for (const game of manifest.games.filter((g) => g.input?.includes("aac"))) {
  test.describe(`${game.id} AAC wiring`, () => {
    const entries = (game.aac?.vocabulary ?? []).map((e) => (typeof e === "string" ? { word: e, synonyms: [] as string[] } : { word: e.word, synonyms: e.synonyms ?? [] }));

    test("every vocabulary word and synonym reaches an action; other words do not", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      await page.goto(`${game.route}?aac-test`);
      await page.waitForFunction(() => (window as any).__aacTest);
      const words = await page.evaluate(() => (window as any).__aacTest.words as string[]);
      expect(words).toEqual(entries.map((e) => e.word));

      for (const e of entries) {
        for (const form of [e.word, ...e.synonyms]) {
          const before = await page.evaluate(() => (window as any).__aacTest.handled.length as number);
          await page.evaluate((w) => (window as any).__aacTest.say(w), form);
          const handled = await page.evaluate(() => (window as any).__aacTest.handled as string[]);
          expect(handled.length, `"${form}" should trigger the action for "${e.word}"`).toBe(before + 1);
          expect(handled[handled.length - 1]).toBe(e.word);
        }
      }

      const count = await page.evaluate(() => (window as any).__aacTest.handled.length as number);
      await page.evaluate(() => (window as any).__aacTest.say("zz-not-a-word"));
      expect(await page.evaluate(() => (window as any).__aacTest.handled.length)).toBe(count);
      expect(await page.evaluate(() => (window as any).__aacTest.ignored)).toContain("zz not a word");
      expect(errors, "AAC actions must be safe to call at any moment").toEqual([]);
    });

    test("duplicates, late words and words after sharing stopped are dropped", async ({ page }) => {
      await page.goto(`${game.route}?aac-test`);
      await page.waitForFunction(() => (window as any).__aacTest);
      const word = entries[0]!.word;
      const result = await page.evaluate((w) => {
        const t = (window as any).__aacTest;
        t.hello();
        const start = t.handled.length;
        const dup = t.event("symbol.select", { symbol: { text: w } });
        t.raw(dup);
        t.raw(dup);
        const afterDup = t.handled.length - start;
        t.raw(t.event("symbol.select", { symbol: { text: w } }, { ts: Date.now() - 60_000 }));
        const afterLate = t.handled.length - start;
        const inFlight = t.event("symbol.select", { symbol: { text: w } });
        t.bye();
        t.raw(inFlight);
        const afterBye = t.handled.length - start;
        return { afterDup, afterLate, afterBye, state: t.state };
      }, word);
      expect(result).toEqual({ afterDup: 1, afterLate: 1, afterBye: 1, state: "waiting" });
    });
  });
}
