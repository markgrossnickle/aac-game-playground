// AAC over a REAL relay: the hub's pairing dialog, a game opened while sharing
// is already on, sharing off, the AAC app vanishing, the game losing its own
// relay link, revocation, and local play with the example AAC app in a second
// browser. The relay is aac-bridge's own server, run in this process and
// serving a built site the way `npm run local` does, so the hub finds it on
// its own origin.
//
// The site is a THROWAWAY build, not dist/: a temporary copy of this project
// with one AAC game made by the real scaffold (`new-game.mjs --aac`) and no
// catalog games. So these tests always run, whatever games the bundle ships
// (including none), and they exercise the scaffold too. Nothing is written to
// the repository.
//
// The AAC app side is driven from Node with the aac-bridge sender, except in
// the last test, which uses the example AAC page like a phone would.
// Headless and muted (playwright.config.ts).
import { expect, test, type Browser, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { claimPairing, createAacEmitter, relayTransport, revokePairing, type AacEmitter, type Transport } from "aac-bridge";
import { createRelay } from "aac-bridge/relay";

interface ManifestGame {
  id: string;
  route: string;
  input?: string[];
  aac?: { vocabulary: Array<string | { word: string; synonyms?: string[] }> };
}
const firstWord = (g: ManifestGame): string => {
  const e = g.aac!.vocabulary[0];
  return typeof e === "string" ? e : e.word;
};

const htmlDir = fileURLToPath(new URL("..", import.meta.url));
const repoDir = join(htmlDir, "..");
const FIXTURE_ID = "aac-fixture";

/** Copy the project (no node_modules, dist or games), scaffold one AAC game, build. */
function buildFixtureSite(): { site: string; dist: string } {
  const site = mkdtempSync(join(tmpdir(), "aac-fixture-"));
  const html = join(site, "html");
  const skip = /^(node_modules|dist|test-results|playwright-report|games)$/;
  cpSync(htmlDir, html, { recursive: true, filter: (src) => !skip.test(relative(htmlDir, src).split(/[\\/]/)[0] ?? "") });
  cpSync(join(repoDir, "templates"), join(site, "templates"), { recursive: true });
  cpSync(join(repoDir, "bundle.config.json"), join(site, "bundle.config.json"));
  symlinkSync(join(htmlDir, "node_modules"), join(html, "node_modules"), "junction");
  const run = (args: string[], cwd: string) => execFileSync(process.execPath, args, { cwd, stdio: "pipe" });
  run([join(html, "scripts", "new-game.mjs"), FIXTURE_ID, "AAC Fixture", "--aac"], site);
  run([join(html, "node_modules", "vite", "bin", "vite.js"), "build", "--logLevel", "error"], html);
  return { site, dist: join(html, "dist") };
}

const PAIRING_KEY = "bundle:aac-pairing";
let relay: ReturnType<typeof createRelay>;
let origin = "";
let fixture: { site: string; dist: string } | null = null;
let aacGame: ManifestGame;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  fixture = buildFixtureSite();
  const manifest = JSON.parse(readFileSync(join(fixture.dist, "games-manifest.json"), "utf8")) as { games: ManifestGame[] };
  aacGame = manifest.games.find((g) => g.id === FIXTURE_ID)!;
  expect(aacGame?.aac?.vocabulary?.length, "the scaffolded AAC game is in the fixture build").toBeGreaterThan(0);
  relay = createRelay({ port: 0, host: "127.0.0.1", serveDir: fixture.dist, log: () => {} });
  await relay.ready;
  origin = `http://127.0.0.1:${relay.port}`;
  // Tag browser sockets so a test can cut only the game page's own link.
  relay.wss.on("connection", (socket, req) => {
    (socket as unknown as { fromBrowser: boolean }).fromBrowser = /Chrome/.test(String(req.headers["user-agent"]));
  });
});
test.afterAll(async () => {
  await relay?.close();
  if (fixture) {
    unlinkSync(join(fixture.site, "html", "node_modules")); // the junction only, never its target
    rmSync(fixture.site, { recursive: true, force: true });
  }
});

/** An AAC app on "another device": claims the code, then shares when told. */
async function sender(code: string): Promise<{ out: AacEmitter; link: Transport; token: string; vocabulary?: string[] }> {
  const claim = await claimPairing({ relay: origin, code });
  const link = relayTransport({ relay: origin, token: claim.senderToken, WebSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket });
  const out = createAacEmitter({ app: { app: "node-sender", lang: "en" }, transport: link });
  return { out, link, token: claim.senderToken, vocabulary: claim.vocabulary };
}

async function readCode(page: Page): Promise<string> {
  const text = await page.locator(".aac-code").textContent();
  return (text ?? "").replace(/\D/g, "");
}

async function startPairing(page: Page): Promise<string> {
  await page.goto(`${origin}/`);
  await page.getByRole("button", { name: "Connect an AAC board" }).click();
  await expect(page.locator(".aac-code")).toHaveText(/\d{3} \d{3}/);
  return readCode(page);
}

async function pairedHub(page: Page) {
  const code = await startPairing(page);
  const s = await sender(code);
  s.out.enable();
  await expect(page.locator(".aac-status")).toHaveText("Connected to node-sender.");
  await page.getByRole("button", { name: "Done" }).click();
  return s;
}

const stored = (page: Page) => page.evaluate((k) => localStorage.getItem(k), PAIRING_KEY);
const aacState = (page: Page) => page.locator("html").getAttribute("data-aac");
const handledCount = (page: Page) => page.evaluate(() => (window as unknown as { __aacHandledCount?: number }).__aacHandledCount ?? -1);

test.describe("AAC over a real relay", () => {
  test("the hub offers pairing when its own origin is an aac-bridge relay", async ({ page }) => {
    await page.goto(`${origin}/`);
    await expect(page.getByRole("button", { name: "Connect an AAC board" })).toBeVisible();
  });

  test("Done keeps a successful pairing (it used to revoke it)", async ({ page }) => {
    const s = await pairedHub(page);
    await expect(page.locator(".aac-dialog")).not.toBeVisible();
    expect(await stored(page)).toContain("listenerToken");
    await expect(page.locator(".aac-connect")).toHaveText("AAC: node-sender");
    await page.waitForTimeout(300);
    expect(relay.size).toBe(1);
    s.out.close();
    await revokePairing({ relay: origin, token: s.token });
  });

  test("Cancel and Escape before the AAC app connects revoke the half-made pairing", async ({ page }) => {
    await startPairing(page);
    await expect.poll(() => relay.size).toBe(1);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect.poll(() => relay.size).toBe(0);
    expect(await stored(page)).toBeNull();

    await page.getByRole("button", { name: "Connect an AAC board" }).click();
    await expect(page.locator(".aac-code")).toHaveText(/\d{3} \d{3}/);
    await expect.poll(() => relay.size).toBe(1);
    await page.keyboard.press("Escape");
    await expect.poll(() => relay.size).toBe(0);
    expect(await stored(page)).toBeNull();
  });

  test("the pairing offers the bundle's words for limited sharing", async ({ page }) => {
    const code = await startPairing(page);
    const s = await sender(code);
    expect(s.vocabulary).toContain(firstWord(aacGame!));
    await revokePairing({ relay: origin, token: s.token });
  });

  test("a game opened while sharing is on shows connected at once and plays, also after game-to-game navigation", async ({ page }) => {
    const s = await pairedHub(page);
    await page.goto(`${origin}${aacGame!.route}?test`);
    // The heartbeat is 10 s; connected within 2 s proves the relay replayed the hello.
    await expect.poll(() => aacState(page), { timeout: 2_000 }).toBe("connected");
    await expect(page.locator("[data-aac-chip]")).toHaveText("AAC: node-sender");
    s.out.symbol({ text: firstWord(aacGame!) });
    await expect.poll(() => handledCount(page)).toBe(1);

    await page.goto(`${origin}/`);
    await page.goto(`${origin}${aacGame!.route}?test`);
    await expect.poll(() => aacState(page), { timeout: 2_000 }).toBe("connected");
    s.out.symbol({ text: firstWord(aacGame!) });
    await expect.poll(() => handledCount(page)).toBe(1);
    s.out.close();
    await revokePairing({ relay: origin, token: s.token });
  });

  test("sharing off, unmatched words, and the AAC app vanishing without a bye", async ({ page }) => {
    const s = await pairedHub(page);
    await page.goto(`${origin}${aacGame!.route}?test`);
    await expect.poll(() => aacState(page)).toBe("connected");

    s.out.symbol({ text: "zzz not a game word" });
    await page.waitForTimeout(300);
    expect(await handledCount(page)).toBe(0);
    // Word history is a test-hook feature only (?aac-test); none here.
    expect(await page.evaluate(() => "__aacTest" in window)).toBe(false);

    s.out.disable();
    await expect.poll(() => aacState(page)).toBe("waiting");
    s.out.symbol({ text: firstWord(aacGame!) });
    await page.waitForTimeout(300);
    expect(await handledCount(page)).toBe(0);

    s.out.enable();
    await expect.poll(() => aacState(page)).toBe("connected");
    s.link.stop(); // connection gone, no session.bye
    await expect.poll(() => aacState(page)).toBe("waiting");
    expect(await stored(page)).toContain("listenerToken");
    await revokePairing({ relay: origin, token: s.token });
  });

  test("the game's own relay link dropping shows offline at once, then connected again after it reconnects", async ({ page }) => {
    const s = await pairedHub(page);
    await page.goto(`${origin}${aacGame.route}?test`);
    await expect.poll(() => aacState(page)).toBe("connected");
    // Cut only the browser's socket; the AAC app (Node) stays connected and sharing.
    for (const c of relay.wss.clients) if ((c as unknown as { fromBrowser?: boolean }).fromBrowser) c.terminate();
    // Before the 500 ms reconnect: the same-site channel is still open, but the game must not say connected.
    await expect.poll(() => aacState(page), { timeout: 400, intervals: [50] }).toBe("offline");
    await expect(page.locator("[data-aac-chip]")).toBeHidden();
    // After the reconnect the relay replays the hello.
    await expect.poll(() => aacState(page), { timeout: 5_000 }).toBe("connected");
    s.out.symbol({ text: firstWord(aacGame) });
    await expect.poll(() => handledCount(page)).toBe(1);
    s.out.close();
    await revokePairing({ relay: origin, token: s.token });
  });

  test("Escape while the code is still being requested leaves no pairing behind", async ({ page }) => {
    await page.goto(`${origin}/`);
    await expect.poll(() => relay.size).toBe(0);
    let release: () => void = () => {};
    const held = new Promise<void>((r) => (release = r));
    await page.route("**/pairings", async (route) => {
      if (route.request().method() === "POST") await held;
      await route.continue();
    });
    await page.getByRole("button", { name: "Connect an AAC board" }).click();
    await expect(page.locator(".aac-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".aac-dialog")).not.toBeVisible();
    release(); // the relay now answers with a pairing nobody will use
    await page.waitForTimeout(500);
    await expect.poll(() => relay.size).toBe(0);
    expect(await stored(page)).toBeNull();
    await expect(page.locator(".aac-connect")).toHaveText("Connect AAC board");
  });

  test("revoking ends the game's pairing even though the same-site channel stays open", async ({ page }) => {
    const s = await pairedHub(page);
    await page.goto(`${origin}${aacGame!.route}?test`);
    await expect.poll(() => aacState(page)).toBe("connected");
    await revokePairing({ relay: origin, token: s.token });
    await expect.poll(() => aacState(page)).toBe("ended");
    expect(await stored(page)).toBeNull();
    await expect(page.locator("[data-aac-chip]")).toBeHidden();
    s.out.close();
  });

  test("local play: the example AAC page on a second device pairs, shares only game words, and plays", async ({ page, browser }) => {
    const phone = await phoneContext(browser);
    try {
      const code = await startPairing(page);
      const aac = await phone.newPage();
      await aac.goto(`${origin}/aac-bridge/examples/aac-app.html`);
      await aac.locator("#code").fill(code);
      await aac.getByRole("button", { name: "Connect" }).click();
      await expect(aac.locator("#status")).toHaveText("connected, not sharing");
      await expect(aac.getByLabel("Only the game's words")).toBeChecked();
      await aac.getByLabel("Share what I say with the game").check();
      await expect(aac.locator("#status")).toHaveText("sharing the game's words");

      await expect(page.locator(".aac-status")).toHaveText("Connected to example-aac.");
      await page.getByRole("button", { name: "Done" }).click();
      await page.goto(`${origin}${aacGame!.route}?test`);
      await expect.poll(() => aacState(page), { timeout: 2_000 }).toBe("connected");

      const word = firstWord(aacGame!);
      const tile = aac.locator(`.tile[data-word="${word}"]`);
      test.skip((await tile.count()) === 0, `the example page has no "${word}" tile`);
      await tile.click();
      await expect.poll(() => handledCount(page)).toBe(1);
      // A word outside the game's list never leaves the phone.
      await aac.locator('.tile[data-word="sad"]').click();
      await page.waitForTimeout(300);
      expect(await handledCount(page)).toBe(1);

      await aac.getByRole("button", { name: "Forget this game" }).click();
      await expect.poll(() => aacState(page)).toBe("ended");
    } finally {
      await phone.close();
    }
  });
});

async function phoneContext(browser: Browser) {
  return browser.newContext({ viewport: { width: 390, height: 844 } });
}
