# Focus group: 100 simulated players (2026-09-30)

**Read this first: these are simulated players, not real people.** There was no way to recruit 100 real players from the
build workspace. What was done instead, in three honest layers:

1. **Hard numbers (real):** 100 simulated players (10 types × 10, each with their own budget, favourite game, buying habit and
   quitting rule) played through the **actual game rules** (`tests/focus/players.mjs`). Everything in "What the numbers say" is
   what the game math really does to players like these.
2. **Walkthroughs (real):** each of the 10 player types **actually used the page** in a browser, on their own screen size, with
   the real live SANTA price (`tests/focus/walkthrough.mjs`). What they saw and where they got stuck is recorded, with screenshots.
3. **Feedback (judgment):** what those players would likely say, written from 1 and 2. This part is Claude's judgment, not
   anyone's opinion. It points at what to test with **real people**, and doesn't replace them. Cody's friends on real phones are
   still the real check.

The 10 player types: crypto regular, phone newcomer, careful budgeter, high roller, skeptic ("is it rigged?"), competitive gamer,
collector (cosmetics), small-phone player (320 px), grinder, returning daily player. Plus a keyboard-only walkthrough.

## What the numbers say (100 players, real game rules)

| | Result |
|---|---|
| Walked away ahead | **1 of 100** |
| Were ever 20%+ up during their session | 10 of 100 |
| Went **15+ plays in a row** without a real win (a win worth more than the play) | **36 of 100** |
| Saw the 100× top line or the pool jackpot | 0 of 100 (expected: 1 in 11,054 and 1 in 25,000 plays) |
| Typical session | about 7 minutes |
| Real-win rate | Big Hat about 1 play in 3; Spin about 1 in 6 |

Longest dry runs by type (median): phone newcomer 17 plays, small-phone player 18, returning daily player 18, careful budgeter
14. Those are the types most likely to feel "this never pays". Big Hat players (about 1 real win in 3) had it much easier.

**Why:** the games pay back 74.5% (Spin; 75.0% with the two-wheel Spin since) and 75.5% (Big Hat) of what's played. Typical online slots return 94–97%, and casino
floors 85–92%. That's Cody's economy call; it's here so it's made knowingly (see "Decisions for Cody").

## What the walkthroughs found, and what was fixed

| Player type | What happened | Status |
|---|---|---|
| Phone newcomer | After a spin, **the result and credits line were hidden under the bottom tab bar**: they saw the wheel stop but not what they won or how many spins were left. | **Fixed:** the result scrolls just into view above the bar (checked on a 390 px phone; the old code fails the same check). |
| Phone newcomer | "**Money back**: $0.10 (you get $0.09 after the 3% tax)" reads as a small loss labelled "money back". | **Fixed:** "Money back, less SANTA's 3% tax: you get $0.09." |
| Keyboard-only | Reached Pull in 11 Tab presses (fine), but the buy counter opened with focus on "+", which looked pre-selected. | **Fixed:** focus starts on Buy. |
| Skeptic | Could verify a result, but the check ran inside our own page ("trust our button"). | **Fixed:** the panel now explains how to check it with any SHA-256 tool. It fully convinces only once the house runs on the server. |
| Careful budgeter | Found the odds legend clear, and the buy counter shows dollars and SANTA (≈137 SANTA for a 10¢ spin at that moment's price). | Fine. |
| High roller | Can't buy more than 10 plays at once (by design); 10 pulls with tap-to-stop go quickly. | Fine (Cody's rule). |
| Competitive gamer | The ranked lobby clearly says "opening soon" and "sign-in needed"; the leaderboard is empty until sign-ins exist. | Fine until ranked opens. |
| Collector | Can try on items in the Store; buying says "payments open soon". | Fine until payments open. |
| Crypto regular | The live price line works (1 SANTA = $0.000728 at the time; it was $0.00085 that morning, so the pools' dollar values floated about 14% down that day, as Cody decided). | Fine. |
| Returning daily player | Credits and balance were still there after coming back. | Fine. |
| Small-phone (320 px) | Every tab fits; the bigger touch targets fit too. | Fine (see AUDIT.md). |

## What these players would likely say (Claude's judgment from the above)

- **"It never pays."** The biggest risk, from the numbers: about a third go 15+ plays with no real win, and almost nobody walks
  away ahead. Likeliest from newcomers, budgeters and daily players (the Spin-heavy types).
- **"Is it rigged?"** Answered well on paper (fingerprint, re-check, now self-check instructions), and fully once the server runs it.
- **"What's SANTA / why demo money?"** The buy counter explains itself; newcomers may still not know what SANTA is. A one-line
  "What's SANTA?" link on the Games intro would help (not built: needs Cody's wording and where to buy).
- **"The big prizes never happen."** True for almost everyone. A visible "biggest wins this week" (the shared winners list
  does this once the server runs) helps show they're real.
- **"It looks great."** The 3D wheel and machine, the sounds and the stamps gave clear feedback in every walkthrough.

## Decisions for Cody (not changed; they're economy and tone calls)

1. **Payback level.** 74.5–75.5% is low next to real slots (85–97%). Options: (a) keep it (the pools grow faster, more is burned);
   (b) raise it toward 85–90% (players last longer and win more often; pools grow slower); (c) keep the rate but add more small
   real wins. Claude's view: (b) or (c) will feel much better to players; the pool math would need re-running either way.
2. **Spin's dry runs.** 50.5% of spins pay nothing and 33% pay back exactly the stake; a real win is 1 in 6. Moving a few
   "no win" slices to 2× would shorten dry runs noticeably (and raise payback).
3. **A "What's SANTA?" line** for newcomers: the wording and where to send them to buy.
4. **Free daily spin** (still open): the numbers say it would help the newcomer and daily types most.

## Re-running it

`node tests/focus/players.mjs` (the 100-player numbers), `node tests/focus/walkthrough.mjs` (10 walkthroughs; screenshots in
`tests/focus/out/`), `node tests/focus/recheck.mjs` (the fixes above).
