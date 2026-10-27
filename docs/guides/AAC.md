# AAC games

Games here can be played by touch, by an AAC (Augmentative and Alternative
Communication) board such as Cboard, or both at once. A child chooses words on
their board ("go", "pop", "again") and the game acts on them. This page is
everything a game author needs; the connection itself is the framework's job.

## The short version

1. Scaffold with `--aac`:
   ```bash
   node html/scripts/new-game.mjs my-game "My Game" --aac
   ```
2. List the words in `game.json`:
   ```json
   "input": ["touch", "aac"],
   "aac": {
     "vocabulary": [
       { "word": "go", "synonyms": ["start", "play"] },
       "pop",
       { "word": "again", "synonyms": ["more"] }
     ]
   }
   ```
3. Map each word to the same action a tap does:
   ```ts
   import { playWithAac } from "../../../src/sdk";
   playWithAac({ words: { go: start, pop: popOne, again: replay } });
   ```
4. Keep `tests/aac.spec.ts` true to your game (see Testing).

## Rules

- **Touch always works.** `"input"` must include `"touch"`. AAC is another way
  to play, never a gate, and the game must make sense to someone with no board.
- **Words, not sentences.** Pick words that exist on common core boards (go,
  stop, more, again, yes, no, big, little, colours, animals). Up to 50.
  Synonyms catch the same idea said differently; a word or synonym may appear
  only once in the list.
- **Every word maps to an action, and every action is safe at any moment.** A
  child can say "pop" before the game starts or "again" in the middle of play.
  Do nothing harmful, throw nothing.
- **Same action as the tap.** Do not build a separate AAC mode. One `start()`
  function serves the Go button and the word "go".
- **Show what was heard, briefly.** A word that does something visible is the
  feedback; no extra text needed. A word that does nothing right now may get a
  small wobble.
- **No network, no packages.** Never import `aac-bridge` or open a socket from
  a game. `playWithAac` is the only door. The lint enforces this.
- **Nothing kept.** Do not store or log what the child said. Use the word,
  then forget it (see aac-bridge `PRIVACY.md`).

## What the framework handles

- **Pairing.** Once per device pair, in the hub ("Connect AAC board"), when
  there is a relay: this bundle's own (`bundle.config.json` `aac.relay`), or a
  relay in the room serving the site (local play, below). In the room, the AAC
  device taps the game in its "Games nearby" list and the hub asks "Allow?";
  or it scans the hub's QR code; or someone types the 6-digit code. The
  pairing is remembered until someone taps Disconnect or Forget. Nothing is
  shared until the user turns sharing on in the AAC app, and the pairing
  carries the bundle's words so the AAC app can share only those.
- **Connection.** The relay link and same-site channels, reconnects, and a
  small "AAC" chip in the bottom-left while a board is sharing. Keep that
  corner free of important UI. A game opened while sharing is already on shows
  "connected" at once; an AAC app that turns sharing off, closes or loses its
  network turns it off; a revoked pairing ends it, even though same-site
  channels stay open.
- **Matching.** Case, punctuation and spacing are ignored. Stable keys from
  the AAC app (for example `cboard.symbol.yes`) match across languages.
- **Safety.** Duplicate messages act once. Words that arrive more than a few
  seconds late are dropped. Nothing is delivered after the AAC user stops
  sharing. A revoked pairing ends cleanly. No history of words is kept in
  normal play; only the `?aac-test` hook records them.
- **Development.** `npm run dev` shows a row of your words as buttons at the
  bottom of the page (the dev panel), so you can play by "board" without one.

`playWithAac` also takes `onPhrase(text, words)` for when the child speaks a
whole sentence, and `onState(state)` with `"connected" | "waiting" | "offline"
| "ended"` if the game wants to say "Say go!" only while a board is sharing.

## Testing

Every AAC game ships `tests/aac.spec.ts`, and the lint refuses an AAC game
without it. It must show the WORDS PLAY THE GAME, not only that the page loads:

| Case | Assert |
|---|---|
| Start | the start word moves the game from its start screen into play |
| Play | the main words change the game state the way a tap would |
| Replay | the replay word restarts with a fresh state |
| Ignored words | words outside the vocabulary change nothing |
| Duplicates | one message delivered twice acts once |
| Late words | a word that arrives 30 s late changes nothing |
| Disconnects | nothing acts while disconnected; after reconnecting, words act again |
| Sharing off | a word still in flight when the AAC user stops sharing changes nothing |
| Touch | the same game is fully playable by touch |

How: open the game with `?aac-test`. The SDK swaps the real connection for
`window.__aacTest` (`say(word)`, `phrase(text)`, `raw(event)`, `event(...)`,
`hello()`, `bye()`, `disconnect()`, `reconnect()`, `state`, `handled`,
`ignored`), and `exposeStateForTests(() => ({ ... }))` gives the test the
game's state as `window.__gameState()`. The scaffold's spec covers every row
above for the bubble game; change the state fields and words to fit yours.

On top of that, the framework smoke suite checks every AAC game for you:
each vocabulary word and synonym reaches an action, other words do not, and
duplicates, late words and post-sharing words are dropped.

```bash
node tools/check-games.mjs my-game
cd html && npm run build && npm run smoke -- --grep my-game
```

A second suite, `tests/aac-relay.spec.ts`, runs the framework against a REAL
relay serving a built site: the hub's pairing dialog (Done keeps the pairing;
Cancel and Escape revoke it, also while the code is still being requested), a
game opened while sharing is on, game-to-game navigation, sharing off, an AAC
app vanishing, the game's own relay link dropping, revocation, and the example
AAC page pairing from a second browser. It builds its own throwaway site in a
temporary folder, with one game made by the `--aac` scaffold, so it runs in
full whatever games the bundle has, and checks the scaffold too.

## Local play: one Wi-Fi network, no internet

An AAC device controls a game on a computer in the same room. Nothing goes
over the internet.

```bash
cd html && npm ci && npm run local
```

It builds the site and starts the aac-bridge relay serving it, then prints two
addresses:

1. On the computer, open `http://localhost:8787/`, tap "Connect AAC board".
   It shows a QR code and a 6-digit code, and waits.
2. On the AAC device (same Wi-Fi), scan the QR code, or open the printed
   `http://<computer>:8787/aac-bridge/examples/aac-app.html` and tap "AAC Game
   Playground" under Games nearby.
3. On the computer, tap Allow. (After scanning the QR, tap Connect on the AAC
   device instead.)
4. On the AAC device, turn sharing on. "Only the game's words" is on by
   default. On the computer, tap Done and open a game.

This happens once. Both devices and the relay remember the pairing (the relay
in `~/.aac-bridge/relay-pairings.json`, token hashes only), so next time just
run `npm run local`, open both pages and turn sharing on.

Install and build once while online; after that it needs no internet. Allow
Node.js on private networks if the firewall asks. Guest and school networks
that keep devices apart will not work; a hotspot will. Details and limits:
aac-bridge `docs/local-play.md`.

Cboard and other AAC apps can use the same local relay once they support
aac-bridge; an app served over `https` needs extra work to reach a local
`http` address (see aac-bridge `docs/for-aac-apps.md`).

## An internet relay (optional)

`aac.relay` is `null` here, so the live site does not offer pairing. An
internet relay is only needed for play across networks or with an AAC web app
that cannot reach the local network. It is a small Node server (`relay/` in
[aac-bridge](https://github.com/markgrossnickle/aac-bridge)) on a host that
keeps WebSockets open; Vercel functions cannot. Deploy one for this bundle
only, then set `"aac": { "relay": "https://..." }`. Tell users what leaves the
room when they use it.
