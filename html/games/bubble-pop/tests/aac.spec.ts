// AAC gameplay test for Bubble Pop: proves the words PLAY the game, not just
// that the page loads, and that touch plays the same game. Runs headless and
// muted against the production build:
//   cd html && npm run build && npx playwright test --grep bubble-pop
//
// ?aac-test swaps the real connection for a test channel driven by
// window.__aacTest, and exposes the game's state through window.__gameState.
// Where an exact count matters, the word and both state reads happen inside
// one page.evaluate, so no animation frame (spawns, bubbles floating away)
// can land in between.
import { expect, test, type Page } from "@playwright/test";

const ROUTE = "/games/bubble-pop/?aac-test";
const COLOURS = ["red", "blue", "green", "yellow"] as const;
type Colour = (typeof COLOURS)[number];

interface BubbleInfo {
  id: number;
  x: number;
  y: number;
  r: number;
  colour: Colour;
  hp: number;
  big: boolean;
}
interface State {
  phase: "start" | "play" | "paused";
  score: number;
  wobbles: number;
  bubbles: number;
  big: number;
  colours: Record<Colour, number>;
  list: BubbleInfo[];
}

const state = (page: Page) => page.evaluate(() => (window as any).__gameState() as State);
const say = (page: Page, word: string) => page.evaluate((w) => (window as any).__aacTest.say(w), word);
/** Say a word and read the state just before and just after it, in one go. */
const act = (page: Page, word: string) =>
  page.evaluate((w) => {
    const before = (window as any).__gameState() as State;
    (window as any).__aacTest.say(w);
    const after = (window as any).__gameState() as State;
    return { before, after };
  }, word);
const maxId = (s: State) => Math.max(0, ...s.list.map((b) => b.id));

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
}

async function open(page: Page): Promise<void> {
  await page.goto(ROUTE);
  await page.waitForFunction(() => (window as any).__aacTest && (window as any).__gameState);
}

test.describe("bubble-pop with AAC", () => {
  test.beforeEach(async ({ page }) => open(page));

  test("start: go moves the start screen into play, with every colour on screen", async ({ page }) => {
    const s0 = await state(page);
    expect(s0.phase).toBe("start");
    expect(s0.bubbles).toBe(0);
    await say(page, "go");
    const s = await state(page);
    expect(s.phase).toBe("play");
    expect(s.score).toBe(0);
    expect(s.bubbles).toBeGreaterThanOrEqual(4);
    for (const c of COLOURS) expect(s.colours[c], c).toBeGreaterThan(0);
    await expect(page.locator("#start")).toBeHidden();
  });

  for (const synonym of ["start", "play"]) {
    test(`start: "${synonym}" starts like go`, async ({ page }) => {
      await say(page, synonym);
      expect((await state(page)).phase).toBe("play");
    });
  }

  for (const word of ["pop", "burst"]) {
    test(`play: "${word}" pops the bubble nearest the top`, async ({ page }) => {
      await say(page, "go");
      const { before, after } = await act(page, word);
      const top = before.list.reduce((a, b) => (b.y < a.y ? b : a));
      expect(after.score).toBe(before.score + 1);
      expect(after.bubbles).toBe(before.bubbles - 1);
      expect(after.list.some((b) => b.id === top.id)).toBe(false);
    });
  }

  test('play: "more" adds a burst of new bubbles in every colour', async ({ page }) => {
    await say(page, "go");
    const { before, after } = await act(page, "more");
    expect(after.bubbles).toBe(before.bubbles + 5);
    expect(after.score).toBe(before.score);
    const fresh = after.list.filter((b) => b.id > maxId(before));
    expect(new Set(fresh.map((b) => b.colour)).size).toBe(4);
  });

  for (const colour of COLOURS) {
    test(`play: "${colour}" pops every ${colour} bubble and no other`, async ({ page }) => {
      await say(page, "go");
      await say(page, "more");
      const { before, after } = await act(page, colour);
      expect(before.colours[colour]).toBeGreaterThan(0);
      expect(after.colours[colour]).toBe(0);
      expect(after.score).toBe(before.score + before.colours[colour]);
      for (const other of COLOURS.filter((c) => c !== colour)) expect(after.colours[other], other).toBe(before.colours[other]);
      expect(after.wobbles).toBe(before.wobbles);
    });
  }

  test('play: "big" blows one big bubble that takes two pops', async ({ page }) => {
    await say(page, "go");
    const { before, after } = await act(page, "big");
    expect(after.big).toBe(1);
    const big = after.list.find((b) => b.big)!;
    expect(big.hp).toBe(2);
    expect(big.r).toBeGreaterThan(Math.max(...before.list.map((b) => b.r)));

    // First pop: still there, smaller, one pop left. Second pop: gone.
    const hit1 = await act(page, big.colour);
    const after1 = hit1.after.list.find((b) => b.id === big.id)!;
    expect(after1).toBeTruthy();
    expect(after1.hp).toBe(1);
    expect(after1.r).toBeLessThan(big.r);
    const hit2 = await act(page, big.colour);
    expect(hit2.after.list.some((b) => b.id === big.id)).toBe(false);
    expect(hit2.after.score).toBeGreaterThan(hit2.before.score);
  });

  test('play: "stop" halts new bubbles and "go" brings them back', async ({ page }) => {
    await say(page, "go");
    await say(page, "stop");
    const paused = await state(page);
    expect(paused.phase).toBe("paused");
    await expect(page.locator("#flow-btn")).toHaveAttribute("aria-label", "go");

    // Nothing new appears while stopped (bubbles normally arrive every ~1.3 s).
    await page.waitForTimeout(2500);
    const still = await state(page);
    expect(still.phase).toBe("paused");
    expect(still.list.filter((b) => b.id > maxId(paused))).toEqual([]);

    // Words still play while stopped: a tap-equivalent pop works.
    const popped = await act(page, "pop");
    expect(popped.after.score).toBe(popped.before.score + 1);

    await say(page, "go");
    expect((await state(page)).phase).toBe("play");
    await expect.poll(async () => maxId(await state(page)), { timeout: 5000 }).toBeGreaterThan(maxId(still));
  });

  test('replay: "again" restarts a fresh round from play, from stop and from the start screen', async ({ page }) => {
    // From the start screen it simply starts.
    await say(page, "again");
    expect((await state(page)).phase).toBe("play");

    await say(page, "red");
    await say(page, "blue");
    await say(page, "more");
    const mid = await state(page);
    expect(mid.score).toBeGreaterThan(0);

    const { after } = await act(page, "again");
    expect(after.phase).toBe("play");
    expect(after.score).toBe(0);
    expect(after.bubbles).toBe(4);
    expect(after.list.every((b) => b.id > maxId(mid))).toBe(true);
    await expect(page.locator("#score")).toHaveText("0");

    await say(page, "stop");
    await say(page, "green");
    const again2 = await act(page, "again");
    expect(again2.before.phase).toBe("paused");
    expect(again2.after.phase).toBe("play");
    expect(again2.after.score).toBe(0);
  });

  test("safe at any moment: words with nothing to act on wobble and never error", async ({ page }) => {
    const errors = watchErrors(page);

    // Before start: every word except go/start/play/again just wobbles.
    for (const w of ["pop", "burst", "more", "red", "blue", "green", "yellow", "big", "stop"]) {
      const { before, after } = await act(page, w);
      expect(after.phase, w).toBe("start");
      expect(after.bubbles, w).toBe(0);
      expect(after.wobbles, w).toBe(before.wobbles + 1);
    }

    // Playing: go has nothing to do.
    await say(page, "go");
    let r = await act(page, "go");
    expect(r.after.phase).toBe("play");
    expect(r.after.wobbles).toBe(r.before.wobbles + 1);

    // Stopped: stop has nothing to do.
    await say(page, "stop");
    r = await act(page, "stop");
    expect(r.after.phase).toBe("paused");
    expect(r.after.wobbles).toBe(r.before.wobbles + 1);

    // Stopped with no bubbles at all: pop and every colour wobble.
    for (const c of COLOURS) await say(page, c);
    expect((await state(page)).bubbles).toBe(0);
    for (const w of ["pop", ...COLOURS]) {
      const res = await act(page, w);
      expect(res.after.wobbles, w).toBe(res.before.wobbles + 1);
      expect(res.after.score, w).toBe(res.before.score);
    }

    // Big: at most two at once, the third wobbles.
    await say(page, "big");
    await say(page, "big");
    r = await act(page, "big");
    expect(r.after.big).toBe(2);
    expect(r.after.wobbles).toBe(r.before.wobbles + 1);

    // More: capped; once full, more wobbles.
    for (let i = 0; i < 8; i++) await say(page, "more");
    r = await act(page, "more");
    expect(r.after.bubbles).toBe(r.before.bubbles);
    expect(r.after.wobbles).toBe(r.before.wobbles + 1);

    // A rapid stream of every word, in any order.
    await page.evaluate(() => {
      const t = (window as any).__aacTest;
      const words = ["again", "stop", "stop", "go", "go", "pop", "big", "more", "red", "blue", "green", "yellow", "burst", "start", "play"];
      for (let i = 0; i < 3; i++) for (const w of words) t.say(w);
    });
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });

  test("ignored words: words outside the vocabulary change nothing", async ({ page }) => {
    await say(page, "go");
    await say(page, "stop");
    const before = await state(page);
    await say(page, "banana");
    await say(page, "jump");
    await say(page, "purple");
    const after = await state(page);
    expect(after.phase).toBe(before.phase);
    expect(after.score).toBe(before.score);
    expect(after.wobbles).toBe(before.wobbles);
    expect(after.list.filter((b) => b.id > maxId(before))).toEqual([]);
    expect(await page.evaluate(() => (window as any).__aacTest.ignored)).toEqual(["banana", "jump", "purple"]);
  });

  test("duplicates: one message delivered twice acts once", async ({ page }) => {
    await say(page, "go");
    await say(page, "stop");
    const res = await page.evaluate(() => {
      const t = (window as any).__aacTest;
      const before = (window as any).__gameState() as State;
      const e = t.event("symbol.select", { symbol: { text: "more" } });
      t.raw(e);
      t.raw(e);
      return { before, after: (window as any).__gameState() as State };
    });
    expect(res.after.bubbles).toBe(res.before.bubbles + 5);
  });

  test("late words: a word that arrives 30 s late changes nothing", async ({ page }) => {
    await say(page, "go");
    const res = await page.evaluate(() => {
      const t = (window as any).__aacTest;
      const before = (window as any).__gameState() as State;
      t.raw(t.event("symbol.select", { symbol: { text: "pop" } }, { ts: Date.now() - 30_000 }));
      return { before, after: (window as any).__gameState() as State };
    });
    expect(res.after.score).toBe(res.before.score);
    expect(res.after.wobbles).toBe(res.before.wobbles);
  });

  test("disconnects: nothing acts while disconnected; after reconnecting, words act again", async ({ page }) => {
    await say(page, "go");
    await page.evaluate(() => (window as any).__aacTest.disconnect());
    expect(await page.evaluate(() => (window as any).__aacTest.state)).toBe("offline");
    await say(page, "stop");
    expect((await state(page)).phase).toBe("play");
    await page.evaluate(() => (window as any).__aacTest.reconnect());
    await say(page, "stop");
    expect((await state(page)).phase).toBe("paused");
  });

  test("sharing off: a word in flight when the AAC user stops sharing changes nothing", async ({ page }) => {
    await say(page, "go");
    expect(await page.evaluate(() => (window as any).__aacTest.state)).toBe("connected");
    await page.evaluate(() => {
      const t = (window as any).__aacTest;
      const late = t.event("symbol.select", { symbol: { text: "stop" } });
      t.bye();
      t.raw(late);
    });
    expect(await page.evaluate(() => (window as any).__aacTest.state)).toBe("waiting");
    expect((await state(page)).phase).toBe("play");
  });
});

// Touch plays the same game, and the layout keeps the corners clear, at a
// phone and a tablet in both orientations.
const VIEWPORTS = [
  { name: "phone portrait", width: 390, height: 844 },
  { name: "phone landscape", width: 844, height: 390 },
  { name: "tablet landscape", width: 1280, height: 800 },
  { name: "tablet portrait", width: 800, height: 1280 },
];

for (const vp of VIEWPORTS) {
  test.describe(`bubble-pop touch, ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("touch plays the whole game", async ({ page }) => {
      const errors = watchErrors(page);
      await open(page);
      await page.click("#start-btn");
      expect((await state(page)).phase).toBe("play");

      // Pause so nothing new arrives, then tap a bubble that is clear of the tray.
      await page.click("#flow-btn");
      expect((await state(page)).phase).toBe("paused");
      const tray = (await page.locator("#tray").boundingBox())!;
      const clear = (s: State) => s.list.filter((b) => b.y + b.r < tray.y && b.y > 120).sort((a, b) => b.y - a.y)[0];
      // On a short landscape phone the bubbles may need a moment to rise above the tray.
      await expect.poll(async () => !!clear(await state(page)), { timeout: 8000 }).toBe(true);
      const pre = await state(page);
      const target = clear(pre)!;
      await page.mouse.click(target.x, target.y - 4);
      const tapped = await state(page);
      // The tap pops one bubble: the target, or one overlapping it and drawn on top.
      expect(tapped.score).toBe(1);
      expect(tapped.list.filter((b) => b.id <= maxId(pre)).length).toBe(pre.bubbles - 1);

      // A tap on empty water does nothing harmful.
      await page.mouse.click(vp.width - 30, vp.height * 0.4);
      expect((await state(page)).score).toBeGreaterThanOrEqual(1);

      // Every button does what its word does.
      let before = await state(page);
      await page.click("#more-btn");
      expect((await state(page)).bubbles).toBe(before.bubbles + 5);

      const colour = COLOURS.find((c) => before.colours[c] > 0) ?? "red";
      await page.click(`.ctl[data-colour="${colour}"]`);
      expect((await state(page)).colours[colour]).toBe(0);

      await page.click("#big-btn");
      expect((await state(page)).big).toBe(1);

      await page.click("#flow-btn");
      expect((await state(page)).phase).toBe("play");
      await page.click("#flow-btn");
      expect((await state(page)).phase).toBe("paused");

      before = await state(page);
      expect(before.score).toBeGreaterThan(0);
      await page.click("#again-btn");
      const fresh = await state(page);
      expect(fresh.phase).toBe("play");
      expect(fresh.score).toBe(0);
      expect(errors).toEqual([]);
    });

    test("layout: big targets, corners clear, nothing overflows", async ({ page }) => {
      await open(page);
      await page.click("#start-btn");
      const boxes = await page.$$eval(".ctl, #mute-toggle", (els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { id: e.getAttribute("aria-label") ?? e.id ?? e.className, x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      );
      for (const b of boxes) {
        expect(b.w, `${b.id} width`).toBeGreaterThanOrEqual(44);
        expect(b.h, `${b.id} height`).toBeGreaterThanOrEqual(44);
        expect(b.x, `${b.id} inside`).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w, `${b.id} inside`).toBeLessThanOrEqual(vp.width);
        expect(b.y + b.h, `${b.id} inside`).toBeLessThanOrEqual(vp.height);
        // Back link corner (0,0)-(92,60).
        const inBack = b.x < 92 && b.y < 60;
        expect(inBack, `${b.id} clear of the Back corner`).toBe(false);
        // AAC chip corner, bottom-left.
        const inChip = b.x < 140 && b.y + b.h > vp.height - 48;
        expect(inChip, `${b.id} clear of the AAC chip corner`).toBe(false);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
    });
  });
}
