// AAC gameplay test for __GAME_TITLE__. Every AAC game keeps one of these and
// adapts it to its own words and state: it proves the words PLAY the game, not
// just that the page loads. Runs headless and muted against the production
// build (npm run build && npm run smoke -- --grep __GAME_ID__).
//
// ?aac-test swaps the real connection for a test channel driven by
// window.__aacTest, and exposes the game's state through window.__gameState.
import { expect, test, type Page } from "@playwright/test";

const ROUTE = "/games/__GAME_ID__/?aac-test";

interface State {
  phase: "start" | "play" | "over";
  score: number;
  bubbles: number;
}

const state = (page: Page) => page.evaluate(() => (window as any).__gameState() as State);
const say = (page: Page, word: string) => page.evaluate((w) => (window as any).__aacTest.say(w), word);

test.describe("__GAME_ID__ with AAC", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE);
    await page.waitForFunction(() => (window as any).__aacTest && (window as any).__gameState);
  });

  test("start, play and replay by words", async ({ page }) => {
    expect((await state(page)).phase).toBe("start");

    await say(page, "go");
    expect((await state(page)).phase).toBe("play");

    await expect.poll(async () => (await state(page)).bubbles, { timeout: 5000 }).toBeGreaterThan(0);
    await say(page, "pop");
    expect((await state(page)).score).toBe(1);

    await say(page, "stop");
    expect((await state(page)).phase).toBe("over");

    await say(page, "again");
    const after = await state(page);
    expect(after.phase).toBe("play");
    expect(after.score).toBe(0);
  });

  test("words outside the vocabulary change nothing", async ({ page }) => {
    await say(page, "go");
    const before = await state(page);
    await say(page, "banana");
    await say(page, "jump");
    const after = await state(page);
    expect(after.phase).toBe(before.phase);
    expect(after.score).toBe(before.score);
    expect(await page.evaluate(() => (window as any).__aacTest.ignored)).toEqual(["banana", "jump"]);
  });

  test("a duplicated message acts once", async ({ page }) => {
    await say(page, "go");
    await expect.poll(async () => (await state(page)).bubbles, { timeout: 5000 }).toBeGreaterThan(1);
    await page.evaluate(() => {
      const t = (window as any).__aacTest;
      const e = t.event("symbol.select", { symbol: { text: "pop" } });
      t.raw(e);
      t.raw(e);
    });
    expect((await state(page)).score).toBe(1);
  });

  test("a late word is dropped", async ({ page }) => {
    await say(page, "go");
    await expect.poll(async () => (await state(page)).bubbles, { timeout: 5000 }).toBeGreaterThan(0);
    await page.evaluate(() => {
      const t = (window as any).__aacTest;
      t.raw(t.event("symbol.select", { symbol: { text: "pop" } }, { ts: Date.now() - 30_000 }));
    });
    expect((await state(page)).score).toBe(0);
  });

  test("after a disconnect nothing arrives; after reconnecting it plays again", async ({ page }) => {
    await say(page, "go");
    await page.evaluate(() => (window as any).__aacTest.disconnect());
    expect(await page.evaluate(() => (window as any).__aacTest.state)).toBe("offline");
    await say(page, "stop");
    expect((await state(page)).phase).toBe("play");
    await page.evaluate(() => (window as any).__aacTest.reconnect());
    await say(page, "stop");
    expect((await state(page)).phase).toBe("over");
  });

  test("when the AAC user stops sharing, later words are ignored", async ({ page }) => {
    await say(page, "go");
    expect(await page.evaluate(() => (window as any).__aacTest.state)).toBe("connected");
    await page.evaluate(() => {
      const t = (window as any).__aacTest;
      // Words still in flight from the session that just ended:
      const late = t.event("symbol.select", { symbol: { text: "stop" } });
      t.bye();
      t.raw(late);
    });
    expect(await page.evaluate(() => (window as any).__aacTest.state)).toBe("waiting");
    expect((await state(page)).phase).toBe("play");
  });

  test("touch still plays the whole game", async ({ page }) => {
    await page.click("#start-btn");
    expect((await state(page)).phase).toBe("play");
  });
});
