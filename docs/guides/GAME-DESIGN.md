# Game design

What makes a small touch game for kids worth playing, learned from shipping
dozens of them. This page is about the game. How it looks and behaves on
screen is in `UI.md`; how it is built is in `CODING.md`.

## 1. One loop, learnable in five seconds

- The game is one verb: tap, drag, pop, catch, match, trace. Everything else
  decorates that verb.
- The first thing on screen already invites the verb. A child should be
  playing before an adult could finish reading instructions.
- If the idea needs a second verb, make it a second game.

## 2. Feedback is the game

- Every action gets an immediate response: sound, squash and stretch, sparkle,
  colour change. Silence after a tap reads as broken.
- Reward the right move more than you mark the wrong one. A miss wobbles and
  lets the child try again; it never locks the screen or ends the game.
- Celebrate often and briefly. A one-second win moment beats a ten-second
  cutscene the child cannot skip.

## 3. Difficulty: gentle ramp or none

- Start easier than feels necessary. The first round should be impossible to
  lose.
- Ramp slowly and visibly (more bubbles, faster, smaller), and cap it. Many
  kids play the same easy level fifty times happily.
- No lives, no game over, no timers that punish. If the game needs an ending,
  make it a celebration the child chooses to leave.
- Randomness should feel fair: avoid streaks of impossible spawns; vary
  outcomes so repetition stays interesting.

## 4. Who is playing

- Ages matter more than skill. A four-year-old taps with a whole hand; an
  eight-year-old wants a score. Pick an age band in `game.json` and design for
  its bottom edge.
- Assume no reading. Meaning comes from icons, colour, motion and sound; a
  spoken line can carry a word if one is needed.
- Two players on one device: give each a clearly separate zone with its own
  touches and its own feedback, so one child's taps never land in the other's
  area, and make the split obvious. Which way the screen splits is the game's
  call. Turn-taking games need an unmistakable "your turn" signal.

## 5. Sound as part of the design

- Short, soft, varied. Pick from two or three variants so a repeated action
  does not drone. A sound that fires every second gets the device muted.
- Voice lines: one idea, under three seconds, cheerful, never stacked on each
  other. Use them for encouragement and for the one word the game teaches.
- Design the game to be fun muted too; sound is a bonus, not the instructions.

## 6. Respect the session

- Sessions are short and interrupted. Progress that matters survives a reload
  and a switch to another game.
- No background timers, no "come back tomorrow" hooks, no links out, no text
  entry, no ads, nothing that collects anything.
- Quitting is always one tap away (the Back link), and the game never fights it.

## 7. Scope

A finished small game beats an ambitious half game. The budgets in
`BUDGETS.md` are generous for a one-verb game; if you are near them, the game
is probably two games.

## Do / do not

Do: one verb, instant feedback, start impossible to lose, celebrate briefly,
design for the youngest in the band, separate zones for two players, fun when
muted, progress saved.

Do not: instructions to read, lives or game over, punishing timers, stacked
voice lines, droning sounds, background hooks, two games in one folder.
