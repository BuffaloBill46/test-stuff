# Santa Hat Arcade: build research and mockup notes

Four playable mockups live in `mockups/` (open `mockups/index.html`, or the published link).
This file explains how they're built, the choices made, and what's still missing.

> **READ FIRST: real money.** Nothing here touches wallets, the $SANTA token, or GP payouts.
> Any plan to pay out tokens or GP for scores, or charge for entry, turns an arcade game into a
> real-money system, which brings legal questions (gambling and prize rules vary by country).
> That is Cody's call, and it should get a proper check before anything is built.

## The visual style: ours, in the santahat.gold family

We match the *style* of the existing brand art without copying its assets or UI:

| Shared DNA (from santahat.gold) | Our own take |
| --- | --- |
| Faceted low-poly shapes, black ink outlines | Every model is generated in code (hat, Santa, elves, reindeer, cottages, pines) |
| Snowy night, lantern light, aurora | Midnight-blue palette with hat red, lantern amber and an aurora shader |
| Red hat with a white brim is the hero object | The hat is the centre of every mockup's mechanic |
| Site UI: wood panels, Cinzel/VT323 fonts | Our UI: ink-outlined night-blue plaques; **Grenze Gotisch** titles, **Alegreya Sans** text, **Silkscreen** numbers; red buttons with a white "brim" |

## How to build it efficiently: options weighed

| Option | Good | Bad | Verdict |
| --- | --- | --- | --- |
| **1. Three.js + models generated in code** | No art pipeline; tiny download; runs in any browser and on phones; easy to tweak colors and shapes | Detail is limited to what shapes can be built from code | **Chosen for mockups** |
| 2. Hand-modelled Blender assets (glTF) + Three.js | Richer hero models (a more expressive Santa or hat) | Needs modelling time or an artist; bigger downloads | Good *later* upgrade for 2–3 hero models only |
| 3. 2D canvas with painted sprites (how the site's plaza works) | Cheapest to run; matches the site exactly | Loses depth, which the hat bouncing and flying mechanics rely on | No |
| 4. Full engine export (Godot or Unity WebGL) | Editor, physics, tooling | 10–30 MB downloads, slow on phones, awkward to embed in the site | No |
| 5. Phaser (2D game framework) | Great for flat arcade games | No 3D look | No |

**Tricks that keep it fast** (measured in headless Chrome: about 30–180 draw calls per scene, well within phone budgets):
- Each prop is **merged into one mesh** with its colors baked in, so a whole tree or house costs one draw call.
- Repeated props (forest, fences, snowbanks) use **instancing**: one draw call for all of them.
- Outlines use the "inverted hull" trick: a slightly larger black copy seen from behind. There's no post-processing.
- Glow comes from **cheap additive sprites**. Each scene has at most two real point lights, since many lights washed the scene out when we tested with everything on screen.
- Scrolling worlds recycle objects instead of creating new ones, and fog hides where things spawn.
- One shared kit (`kit.js`) plus two shared scenes (`plaza.js`, `village.js`) serve all four games.

## The four mockups

| | Game | Core loop | Why it keeps people playing |
| --- | --- | --- | --- |
| A | **Snowball Square** | Grab the hat, wear it for points; elves knock it off; catch it on your head | 90-second rounds; the "header" catch is a highlight moment; ready-made for real multiplayer (the site already runs a live plaza) |
| B | **Be the Hat** | You are the hat, bouncing head to head: villager, elf, reindeer, snowman | Most distinctive idea; combo chains reward route planning; endless mode with a personal best |
| C | **Sleigh Night** | Time present drops down chimneys; skip Naughty houses; dodge pines | The village lighting up behind you is the payoff; perfect drops add time |
| D | **Hat Chase** | Gusts blow hats off; chase them; stack spares for a score multiplier | The wobbling hat tower creates a risk/reward pull |

## Ideas for keeping it fun, stimulating, and active

Built into the mockups already:
- **Game feel:** squash-and-stretch on landings, particle bursts, pop-up score numbers, houses lighting up, a wobbling hat tower, wind streaks.
- **Readability:** landing rings and shadows show where the hat will come down; colored rings mark head types; a gold marker shows when a drop is lined up.
- **Short sessions with instant restarts**, plus a personal best saved on the device.

Recommended next, in rough order of value for the effort:
1. **Daily Hat Challenge:** the same level seed for everyone each day, with a daily leaderboard. This is the strongest reason to come back tomorrow.
2. **Seasonal calendar:** a new mode, modifier, or cosmetic each day of December (fits the brand; the site already has Advent draws). Keep an anniversary event for Christmas 2002 lore.
3. **Weekly modifiers:** "Blizzard week" (low visibility), "Reindeer rush" (more reindeer heads), "Low-gravity hats".
4. **Clan totals:** the site already has clans, so team scores give people a reason to recruit and play together.
5. **Cosmetic hats earned through play** (patterns, colors, trails). Keep them cosmetic only, never pay-to-win.
6. **Sound:** a jingle on catches, a thump on landings, wind whoosh. The mockups have no audio yet.
7. **Share card:** a score image with your hat tower or combo, for X/Twitter.

## Honest gaps in these mockups

- **No audio**, and no online leaderboard (bests are stored only on the player's own device).
- **No wallet or token hookup**, on purpose (see the real-money note at the top).
- Tested in a headless browser without a GPU, which ran at about 8 frames a second. Game logic was verified (rounds start, score, end), but **how it feels at a full 60 fps on a real phone hasn't been checked yet**. That's the next thing to test.
- Balance numbers (speeds, gust timing, points) are first guesses.
