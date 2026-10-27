# docs/games: one page per game

Every folder under `html/games/` has a page here with the same headings: what
it is, players and orientation, where the code and assets live, saved state,
audio, known gotchas. `node html/scripts/new-game.mjs` creates the stub; the
game's author keeps it true. If a game's behaviour changes, update its page in
the same PR.

| Dir (`html/games/<id>`) | Hub title | Doc |
|---|---|---|
| (none yet) | | |

The build (`html/plugins/games.ts`) is the authority on which games exist;
this table is for people. No em dashes.
