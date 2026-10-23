<!-- Game PR: fill in every line. Framework PR: delete the game section. -->

## Game

- Id / title: `html/games/<id>` / Title
- One line: what the player does and why it is fun.
- Players: 1 or 2. Orientation: any / portrait / landscape. Ages:
- Audio: none / synthesized tones / prerecorded clips (how many, total KB)
- Art: none / procedural / files (how many, total KB, how they were made)

## Checks I ran (locally: CI does not run browsers)

- [ ] `npm run check:games` passes (repo root)
- [ ] `cd html && npm run build && npm run smoke -- --grep <id>` passes. Last line of its output: `__ passed`
- [ ] Played it at a phone size (390x844) and a tablet size (1280x800)
- [ ] The top-left corner (Back link) is never covered
- [ ] Nothing in this PR touches files outside `html/games/<id>/` and `docs/games/<id>.md`

## Screenshots

<!-- One portrait, one landscape. -->

## Notes for the reviewer

<!-- Anything you could not verify, or chose to do differently from the guides and why. -->
