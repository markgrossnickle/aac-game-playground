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

- **Pairing.** Once per device, in the hub ("Connect AAC board"), when this
  bundle has a relay (`bundle.config.json` `aac.relay`). The AAC app enters a
  one-time code; nothing is shared until the user turns sharing on there.
- **Connection.** The relay link and same-site channels, reconnects, and a
  small "AAC" chip in the bottom-left while a board is sharing. Keep that
  corner free of important UI.
- **Matching.** Case, punctuation and spacing are ignored. Stable keys from
  the AAC app (for example `cboard.symbol.yes`) match across languages.
- **Safety.** Duplicate messages act once. Words that arrive more than a few
  seconds late are dropped. Nothing is delivered after the AAC user stops
  sharing. A revoked pairing ends cleanly.
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

## Without a relay

Until `aac.relay` is set, the hub hides "Connect AAC board", and games still
take words from the dev panel, from tests, and from AAC pages on the same site.
A relay is a small Node server (`relay/` in
[aac-bridge](https://github.com/markgrossnickle/aac-bridge)) on a host that
keeps WebSockets open; Vercel functions cannot. Deploy one for this bundle
only, then set `"aac": { "relay": "https://..." }`.
