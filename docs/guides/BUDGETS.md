# Budgets

Limits CI enforces per game, and why they exist. The numbers live in
`bundle.config.json` (`budgets`) so a client can tune them; the defaults are
the ones that kept a thirty-game bundle fast on a mid-range tablet.

| Limit | Default | Why |
|---|---|---|
| Total size of a game folder | 10 MB (warning at 6) | Every played game is cached on the device in full. Thirty games at 10 MB is 300 MB of a child's tablet. |
| One file | 3 MB | A single big file stalls the first open and the background update. Split, compress, or draw it in code. |
| Files per game | 400 | Each file is a fetch during caching; hundreds of tiny sprites belong in a sheet. |
| Audio file | over 4 KB, mp3 or ogg | Under 4 KB the build inlines it and the offline cache misses it; wav is ten times mp3. |
| Hub icon | 512 px square, under 300 KB | The hub loads every icon at once. |
| Allowed file types | html css ts js mjs json svg md txt png webp jpg jpeg gif mp3 ogg wav m4a woff woff2 ttf otf | Anything else is a source file or a mistake. (gif, wav, jpeg warn.) |

Also enforced, with no number:

- No packages (`import` of anything but the SDK and your own files).
- No network: `fetch`, XHR, WebSocket, remote scripts, fonts or stylesheets.
- No `public/` dependence, no absolute `/assets` paths, no cache-buster queries.

## Checking

```bash
node tools/check-games.mjs <id>      # errors fail, warnings print
du -sh html/games/<id>               # the number the budget compares
```

## When you are over

1. Art: draw it in code, shrink to display size, convert to WebP, trim padding.
2. Audio: mono, 64 kbps, trim silence, fewer variants, synthesize SFX with `playTone`.
3. Data: generate levels from a seed instead of shipping them.
4. Still over: ask a maintainer before raising the budget; the answer is usually
   a smaller game, because the cost lands on every device.
