# Snowball Square Multiplayer: plan

Status: **Phases 1–2 built and live for friends to test** at https://buffalobill46.github.io/test-stuff/
(free Supabase project `santa-hat-arcade`, free GitHub Pages hosting). Tested with 3 browser windows on one
computer; **not yet tested between real devices** (this workspace can't open live connections).

What changed from the plan below while building:
- Each player's own browser moves them (no input lag). The referee checks every report: speed limit,
  no teleporting, nothing from an old respawn, nothing while knocked down.
- Each player's moves go on their own channel that only the referee listens to, and are sent only when
  they change direction or drift, plus a heartbeat. Snapshots slow down as the room fills.
  Estimated full 8-player room: roughly 90 messages/second, just under the free limit of 100.
- Supabase counts every delivery (confirmed). The free plan has 2 million messages a month and
  **never charges**. Over the limit, it warns and pauses the live service instead. That's roughly 6+ hours
  of full-room play per month.
- The free project pauses after about a week with no activity; un-pause it from the Supabase dashboard.
- Idle players are sent home to save messages: after 3 minutes with no input (with a 20-second
  "still there?" countdown), or after 3 minutes with the game in the background. The room code
  stays filled in, so rejoining is one tap.
- **Agreed scaling path:** when real traffic arrives, move to our own game server (roughly $5–10/month,
  no per-message billing, and it becomes the cheat-proof referee). Ask Cody before any spending.
- Phase 3 is partly done: Quick Play, room codes and share links, names, and 4 emotes are built.

> **Money rules for this plan**
> - Everything below runs on Supabase's **free plan ($0)**. The one known paid step is
>   Supabase Pro at **$25/month**, which is only needed if testing shows free can't carry enough matches.
>   Ask Cody before upgrading.
> - **No prizes, token or GP payouts.** Scores are for fun. Rewards need the cheat-proof server in Phase 4 first.
> - Everything is undoable: the Supabase project can be deleted, and all code is in git.

## What players get

- A public web page (its own address, not santahat.gold) with **Quick Play** and **Private Room** (a 4-letter code to share with friends).
- The room creator picks **Free-for-all** or **Nice vs Naughty teams**.
- Up to **8 players**. Elf bots fill empty spots up to 4 so a match never feels empty.
- Players type a display name. **No wallet login.**
- Quick emotes (wave, laugh, "nice throw") instead of typed chat, so there's nothing to moderate.

## Match rules and points

| Action | Points |
| --- | --- |
| Wearing the hat | 10 per second |
| Catching the flying hat on your head ("Header") | 50 |
| Knocking the hat off the wearer | 25 |
| Any snowball hit | 5 |

- A match is **3 rounds of 90 seconds**. The most points at the end wins.
- **Free-for-all:** whoever wears the hat is everyone's target. The winner is the top individual score.
- **Teams:** points add up per team, and the winning team's top scorer gets MVP.
- A short results screen shows between rounds. At the end: the winner, MVP, and a "play again" button that keeps the room together.

## How it works (plain English)

- **One player's browser is the referee** (the "host") for each match. It runs the hat, the snowballs, the bots and the score, and sends everyone a snapshot of the game about 10 times a second.
- **Everyone else sends only their controls** (move direction, aim, throw), about 10 times a second.
- **Your own character moves instantly** on your screen. Everyone else is shown smoothly by blending between snapshots, so the game feels responsive even with some lag.
- **If the host leaves**, the next player in the room becomes the host and carries on from the last snapshot. The match doesn't end.
- **Supabase Realtime** carries the messages: one channel per room, plus a lobby channel that lists open rooms. It needs no database tables to start.

### Known tradeoff: cheating

The host could fake the score. That's acceptable while scores are just for fun. If scores ever earn anything real, Phase 4 moves the referee onto a server we control. That costs roughly a few dollars a month, and Cody gets asked first.

## Cost and capacity

| Supabase plan | Price | Live connections | Messages per second (whole project) |
| --- | --- | --- | --- |
| Free (current) | $0 | 200 | 100 |
| Pro | $25/month | 500 | 500 |

- **Not yet verified:** whether Supabase counts a message once when it's sent, or once for every player who receives it. That decides whether free carries about 1 match at a time or several.
- **Phase 1 measures this on the real project** before anything else is built on top of it.
- Hosting the page itself is free (GitHub Pages). Pointing one of Cody's GoDaddy domains at it is optional, and changing DNS needs his OK.

## Build phases

1. **Foundation (test only).** Create the free Supabase project (with Cody's go-ahead), get 2 browsers seeing each other move, and measure message usage in the Supabase dashboard. Result: real numbers for how many matches free can carry.
2. **Full match.** Referee logic, both modes, 3 rounds, points, bots filling in, host handover, results screens. Tested with 4–8 automated browsers plus a real phone.
3. **Public launch.** Lobby with Quick Play and room codes, display names, emotes, mobile controls, the free public page, and a basic score sanity check (for example, "no more than 10 hat points per second").
4. **Later, only if wanted.** A leaderboard, and a cheat-proof referee server if scores ever tie to rewards.

## How it gets tested (before Cody plays it)

- Automated browsers join the same room and play real matches. Each test checks that every player's screen agrees on the score and that the match actually ends.
- Kill the host mid-round: the game must continue.
- Throttle the network to phone speeds and confirm it stays playable.
- Watch the Supabase usage graph during an 8-player match to get the real capacity number.

## Questions for Cody (none block Phase 1)

1. The name and address for the public page. A subdomain of one of your GoDaddy domains, or a free GitHub Pages address to start?
2. Is 8 players per room right, or do you want bigger chaos?
3. Emotes only, or typed chat too? Typed chat means we'd need a word filter and a way to report players.
