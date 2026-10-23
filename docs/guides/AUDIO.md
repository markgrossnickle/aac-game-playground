# Audio

Sound is half of a kids' game and the part most likely to break on a device.
These rules come from games that were silent on tablets while fine on laptops.

## The three facts

1. **Nothing plays before a tap.** Browsers and the Android WebView block
   audio until a user gesture. `bootGame()` unlocks one shared `AudioContext`
   inside the first pointer event; every sound in the game goes through it.
   This is why every game has a start screen with a button.
2. **`speechSynthesis` does not work in the Android WebView.** Spoken lines
   are prerecorded clips, played through the same AudioContext. The lint
   rejects `speechSynthesis`.
3. **One AudioContext per page.** Do not create your own; use the SDK.

## The SDK

```ts
import { playTone, loadSound, playSound, createVoiceClips, bootGame } from "../../../src/sdk";

// Synthesized feedback, no files:
playTone(660, 0.1);                               // tap
playTone(880, 0.25, { type: "triangle" });        // success

// A sound file:
const pop = await loadSound(new URL("../assets/pop.mp3", import.meta.url).href);
if (pop) playSound(pop, { volume: 0.8 });

// Voice lines (one queue, never overlapping):
const voice = createVoiceClips(
  import.meta.glob("../assets/vo/*.mp3", { eager: true, query: "?url", import: "default" }),
);
bootGame({ onFirstGesture: () => voice.prime() });
voice.say("Great job!");            // plays assets/vo/great-job.mp3 if it exists, else nothing
voice.say("Your turn", "player2");  // one queue per player in two-player games
```

A line whose clip is missing is skipped silently, so always keep the text or
icon on screen too.

## Clip file names are the contract

`voice.say(text)` plays the clip whose file name is the slug of the text:
lowercase, apostrophes dropped, every other run of non-letters becomes one
hyphen, trimmed, max 60 chars. "Great job!" is `great-job.mp3`; "It's a
cat" is `its-a-cat.mp3`. Keep a list of lines in the game's README so clips can
be regenerated in the same voice.

## Making clips

Any text-to-speech or sound-effect service is fine as long as the whole game
uses the same voice and the same settings. What worked well before: a
multilingual TTS voice for lines, a dedicated sound-effect model for SFX, **one
generation per line** (batching several lines in one take makes the model rush
and splitting is error-prone), and naming the animal or object explicitly in
every SFX prompt ("Samoyed bark", not "dog").

Then normalise every file the same way:

```bash
ffmpeg -i in.mp3 -af "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-1.5:LRA=11" -ac 1 -b:a 64k out.mp3
```

(trim silence at both ends, loudness-normalise, mono, 64 kbps). Voice around
-18 to -25 dB mean volume; soft SFX a little lower.

## Rules the lint enforces

- Formats: `.mp3` or `.ogg`. No `.wav` (ten times the size).
- Every audio file over 4 KB. Smaller files get inlined by the build as data
  URIs and then are missing from the offline cache.
- Files live in the game folder and are referenced through the build.

## Checking without listening

The build machine may not play sound. Check clips by numbers:

```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 clip.mp3     # sensible for the text?
ffmpeg -i clip.mp3 -af volumedetect -f null - 2>&1 | grep mean_volume   # in range?
ls -l assets/vo | awk '$5 < 4096'                                       # anything too small?
```

The smoke test runs with Chromium muted; keep it that way.

## Design notes

- Short and soft. Vary pitch or pick from two or three variants so a repeated
  action does not drone.
- Voice lines: one idea, under three seconds, cheerful but not shouty.
- Never stack a voice line on a voice line; SFX may overlap.
- Honour the mute button (the SDK does, if you play through it).
