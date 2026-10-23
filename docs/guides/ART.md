# Art

How to make and ship pictures that look right on every screen and do not bloat
the bundle. The budgets are in `BUDGETS.md`; the reasons are here.

## First choice: no files at all

Procedural art (canvas shapes, gradients, emoji, inline SVG) weighs nothing,
scales perfectly and cannot 404 offline. Many of the best-loved games in past
bundles were drawn entirely in code. Reach for files when a character or scene
needs real illustration.

## Formats

| Use | Format | Notes |
|---|---|---|
| Illustrations, sprites with transparency | PNG or WebP (lossless or q85) | WebP is 25 to 40 percent smaller; both are fine. |
| Photos, big backgrounds | WebP q75 to q85 | Never PNG for a photo. |
| Icons, simple flat shapes | SVG | Crisp at any size, tiny. The build emits it as a file. |
| Animation | Sprite sheet (PNG/WebP) drawn on canvas | Not GIF. Not video. |

Never `.psd`, `.ai`, `.tiff`, `.bmp`, raw renders, or a `source/` folder in the
game. Keep sources outside the repo or in a separate assets repo.

## Size for the screen, not the file

Draw at the size it will be shown on the largest target (1280x800 tablet, 2x
density): a sprite shown at 120 px needs about 240 px of pixels, not 2000.

- Backgrounds: at most 1600 px on the long side.
- Characters and props: 256 to 512 px.
- Hub icon (`game.json` `icon`): square, 512 px, PNG or WebP, under 300 KB,
  readable at 64 px (bold shape, little detail, no small text).
- One file over 1 MB is a smell; check `BUDGETS.md`.

Trim transparent padding, flatten layers, strip metadata. A quick pass with
`sharp`, `squoosh`, or `cwebp -q 85` before committing is routine.

## Consistency

- One style per game. Mixing a photo, a flat vector and a pixel-art sprite in
  one scene reads as broken.
- Same light direction and outline weight across a set of sprites.
- Palette: a handful of colours with strong contrast against the background;
  check that text and important shapes read in sunlight (high contrast, no thin
  light-grey on white).
- Nothing in the top-left 92x60 px (the Back link; `UI.md`).

## Generated art

AI image tools are fine. What matters is the result and the file:

- Prompt for a single subject on a plain background, then knock the background
  out and crop to content.
- Forbid text in the prompt; generated letters are almost always wrong.
- Name the species, object and pose in the prompt, not a nickname.
- Regenerate rather than hand-fix; keep the prompt in the game's README so the
  next person can make a matching sprite.
- Check every generated image by opening it in the game at both viewports.

## Referencing art in code

Always through the build (`CODING.md`): relative paths in HTML and CSS,
`new URL("../assets/x.png", import.meta.url)` or `import.meta.glob` in
TypeScript. Preload what the first screen needs inside `onFirstGesture` or
behind the start button so the game never shows a blank frame.

## Do / do not

Do: procedural first, PNG/WebP/SVG, sized for display, one style, trimmed and
compressed, referenced relatively, hub icon readable at 64 px.

Do not: GIF or video, raw or source files, 4000 px sprites, text baked into
images, mixed styles, anything loaded from a URL.
