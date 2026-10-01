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

## Slot machines: how the good ones are built (researched 2026-09-29)

**How the odds work (PAR sheets).** Real slots are defined by a "PAR sheet": the symbols on each reel strip plus a
paytable. A random number picks where each reel stops; the odds come from how many of each symbol sit on each strip.
Payback (RTP) and hit frequency are calculated exactly from those counts. Makers change payback by changing symbol
counts, not the look. ([CDS Press / Harrigan & Dixon](https://cdspress.ca/wp-content/uploads/2022/08/Kevin-A.-Harrigan-Mike-Dixon-.pdf),
[Easy Vegas](https://easy.vegas/games/slots/par-sheets), [Know Your Slots](https://www.knowyourslots.com/understanding-par-sheets-and-payback/))
- Symbol order on a strip doesn't change the odds, only the counts do.
- More paylines don't change payback if the bet is split across them.
- Frequent small wins cost payback elsewhere (smaller mid-tier prizes).

**Paylines.** Classic 3×3: 1 line (middle), 5 lines (3 rows + 2 diagonals), or 8 (adding columns). 5×5 grids use rows,
diagonals and V / zigzag shapes. Wins usually count left to right from the first reel; pays are multiples of the bet.
Alternatives: "ways to win" (any position on consecutive reels) and "cluster pays" (groups of 5+ touching symbols,
usually with cascades), both common on 5×5 grids.
([PokerNews](https://www.pokernews.com/casino/slots/slot-paylines-explained.htm), [VegasSlotsOnline](https://www.vegasslotsonline.com/features/paylines/),
[Casinos.com cluster pays](https://www.casinos.com/slots/cluster-pays), [Bonus.com](https://www.bonus.com/slots/paylines/))

**Feel.** Reels stop one at a time, left to right, each with its own landing. 250–500 ms micro-pauses before reveals
build anticipation; too fast and there's no build-up, too slow and it drags. Wins are shown by drawing the line and
lighting the winning symbols, with celebrations scaled to the win size. Web engines: flat reels that scroll a symbol
strip, blur at speed, stop with a small bounce. ([On: Yorkshire](https://www.on-magazine.co.uk/stuff/gaming/how-millisecond-level-timing-in-slot-animations-shapes-player-emotion-and-perceived-luck/),
[pixi-reels](https://pixi-reels.schmooky.dev/), [HTML5GameDevs](https://www.html5gamedevs.com/topic/37799-help-slot-game-how-to-spin-the-reels/))

**Honesty: "losses disguised as wins".** On multi-line slots, many "wins" pay back less than the bet, but the lights and
sounds make players remember them as wins. Research (Dixon et al.) shows players over-count their wins because of it.
**Our rule: only celebrate when the player actually comes out ahead.**
([Dixon et al. 2010, Addiction](https://onlinelibrary.wiley.com/doi/10.1111/j.1360-0443.2010.03050.x), [PMC6209046](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6209046/))

**Provably fair.** The server commits to a hidden seed (publishes its hash), mixes in the player's seed and a counter,
and derives the reel stops from them. Afterwards anyone can re-run it and check.
([provablysmart](https://provablysmart.com/provably-fair-server-seed-client-seed-nonce/), [DeucesCracked](https://www.deucescracked.com/crypto-gambling/casino/provably-fair))

## Always-on game servers, and other services that would help (researched 2026-10-01)

Prices change often: check the provider's page at sign-up. **Signing up for any of these is real money: Cody's call.**
What the server has to do: run the multiplayer referee for Snowball Square (WebSockets, ~10 updates a second, rooms of up
to 8) and, later, the paid games instead of the Edge Function (then the speed limit's counts move into its memory:
`server/ratelimit.js`). Both are plain Node.js, so any host that runs Node.js all the time works.

| Host | Cheapest always-on | Good | Watch out for |
|---|---|---|---|
| **Fly.io** (Claude's pick) | shared-cpu-1x 256 MB **$1.94/mo**, 512 MB **$3.89**, 1 GB **$7.78**; data out $0.02/GB (N. America/Europe) | Managed (no server upkeep), regions near players, secrets store, cheap bandwidth | Pay-as-you-go, no free tier; `fly launch` can start 2 machines, so run ONE (the memory speed limit needs a single program) |
| **DigitalOcean Droplet** | **$4/mo** (512 MB, 500 GB data), **$6/mo** (1 GB, 1 TB data) | Flat, predictable bill; US regions | A whole small server to keep updated (Claude can set it up; it still needs patching) |
| **Hetzner Cloud** | EU: CX23 **€5.49/mo** (2 vCPU, 4 GB, 20 TB data): best value | Most server for the money | US regions are pricier and sources disagree on the US price; EU is ~80–120 ms from US players |
| **Railway** | Hobby **$5/mo** incl. $5 usage; ~$10 per GB of memory a month, data out $0.05/GB | Easiest deploys (from GitHub), never sleeps | Usage bill; bandwidth costs more than Fly |
| **Render** | Free tier **sleeps after 15 min idle** (no good for a game); paid plans not confirmed (their page didn't load) | Simple | Free tier unusable here |
| **Colyseus Cloud** | from **$15/mo** | Built for multiplayer games (rooms, matchmaking) | Over budget, and our networking would be rewritten around Colyseus |
| **Cloudflare Durable Objects** | Workers Paid **$5/mo** base | One object per room fits our design | Not plain Node.js (rewrite); a room with a live game loop is billed while it runs |

Sources: fly.io/pricing, railway.com/pricing, render.com/docs/free, digitalocean.com/pricing/droplets, costgoat.com/pricing/hetzner,
colyseus.io/pricing, developers.cloudflare.com/workers/platform/pricing (all read 2026-10-01).

### Other things that would help
- **A gaming lawyer before real money (most important).** Spin, Big Hat and Snowball Drop take SANTA for a chance at a SANTA
  prize: prize + chance + payment is how most places define gambling. US states are actively banning sweepstakes-style casino
  games (14 states as of July 2026; California's AB 831 from 2026-01-01 also reaches those who promote them). Likely needs:
  terms, an age gate, blocking some locations. RESEARCH.md said this from the start; it's still open. (Not legal advice.)
- **Helius** (Solana connection, Cody already has it): free plan 1M credits a month, 10 requests a second: enough for the devnet
  test; Developer $49/mo for launch traffic.
- **Squads multisig** for the treasury and the emergency-withdrawal safe wallet: money moves only with more than one approval.
  Basic is a one-time 0.05 SOL (not for the pool wallets: their payouts are automatic).
- **Cloudflare Turnstile**: free, usually invisible "are you human" check; could guard Buy. Pairs with the speed limit and bot signals.
- **Sentry**: error alerts; free plan 5,000 errors a month.
- **Uptime monitor** (tells Cody when the server is down): UptimeRobot's free plan no longer allows commercial use; Solo is ~$7/mo.
- **Turnkey** (pool keys in secure hardware instead of a server secret): 25 free signatures a month, then $0.10 each: too
  costly per payout for now. Keeping pool wallets small (the top-off design) is the cheaper protection.
