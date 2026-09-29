# Santa Hat: what still needs doing

Kept up to date as things get done. Details for lobbies, economy and open questions live in `DESIGN_NOTES.md`.

## Waiting on Cody (settings only Cody can change)
- [ ] **Turn on Solana sign-in:** Supabase → Authentication → Sign In / Providers → Web3 Wallet → Solana.
- [ ] **Set sign-in addresses:** Supabase → Authentication → URL Configuration. Site URL `https://buffalobill46.github.io/test-stuff/`, Redirect URL `https://buffalobill46.github.io/test-stuff/**`.
- [ ] **Email service so friends get sign-in emails:** connect Resend (free tier) to one of Cody's GoDaddy domains, then paste its SMTP settings into Supabase. Until then, email sign-in only reaches Supabase team members.
- [ ] **Confirm the Games daily limit is in dollars** ($10 per game per day at level 1, +$10 per level), not number of spins.
- [ ] **Level table:** how many rank points reach each level, and which items unlock at each.
- [ ] **Which wallet is the treasury?** It only receives (ticket and item sales). An existing wallet of Cody's, or a new one.
- [ ] **Price cushion:** proposal: the price quote is locked for 60 seconds and a payment is accepted if it's within 2% of the quoted amount.
- [ ] **Slots paytable and 10 reel symbols:** Cody drafting; Claude checks the payback % with a simulation.

## Next to build
- [ ] **Turn on ranked Auto match:** the FFA RANKED lobby is built, but its Auto match button stays off ("opening soon") until tickets and the server below exist.
- [ ] **Auto match by rank points:** close ranks, then wider, then any real players, then bots at 30 seconds. At least 2 real players; 1–3 bots; 3–8 total.
- [ ] **Ranked tickets:** 10 free a day (reset every 24 hours), spent when the match starts, refunded if you leave before.
- [ ] **Ranked payouts on the server:** 10 points per player in the pot (bots too); 3 or fewer players pays 1st only; 4+ pays 60/20/20; not placing costs −5; bots can win.
- [ ] **Match history and stats:** ranked matches, podiums, and the Today / This week / Events leaderboard tabs.
- [ ] **Levels from rank points,** with items unlocking by level (needs the level table).

## Before anything paid goes live
- [ ] **Cheat-proof referee server:** today the host player's browser runs the match and could fake scores. Paid tickets and points need a server we control. Roughly $5–10/month, ask Cody before any spending.
- [ ] **SANTA payments:** USD prices paid in SANTA at the live price, with a quote locked for about a minute.
- [ ] **Set up the 3 pool wallets (Spin, Slots, Lottery):** keys only on the server, a little SOL each for fees, balances above a cap swept to the treasury. Real money: Cody funds them ($50 Spin, $50 Slots). See DESIGN_NOTES → Pool wallets.
- [ ] **Apply SANTA's transfer tax in every payment:** read the live fee from the token; tax first, then burn, treasury, pool; last split gets the remainder; no in-between wallets.
- [ ] **Split every payment on-chain:** tickets and avatar items 50% burned / 50% to treasury; lottery 90% to winners / 10% burned.
- [ ] **Confirm payments on the server** (via Helius) before granting tickets or items.
- [ ] **Ticket refill limit:** 10 extra per 24 hours.
- [ ] **Lottery:** daily and weekly draws, provably fair, 90% to winners / 10% burned.
- [ ] **Buying needs a wallet:** email-only accounts must link one first (linking already works).

## Santa Hat Games tab
- [ ] New **Games** tab next to Play / Store / Avatar / Ranks. All games here are **single-player**.
- [ ] **Santa Hat Spin:** $0.10 and $1.00, a shared pool seeded with **$50**, the agreed odds, a 400-slice wheel (5x = 2 slices, 4x = 4), pay per spin.
- [ ] **Santa Hat Slots:** a visually stunning 3D reel with 10 symbols, $0.10 mini hat and $1.00 large hat bets, a shared pool seeded with **$50**, pay per spin.
- [ ] **Provably fair results** and a pool safety rule (a spin only starts if the pool can cover 5× the bet).
- [ ] **Entries split 90% to the pool, 10% burned** (after the 3% tax).
- [ ] **3% SANTA tax notice at the top of the Spin and Slots descriptions** (winners receive 3% less).
- [ ] **Daily spend limit per game:** $10 at level 1, +$10 per level.
- [ ] **Simulate a million spins** to prove the payback % before launch.
- [ ] More click games from the idea list (Hat Drop, Present Pick, Sleigh Climb, Advent Scratch, Naughty or Nice).

## Later
- [ ] Wager mode (players bet SANTA, FFA).
- [ ] Tournaments.
- [ ] Sound effects: catches, hits, landings, wind.
- [ ] Bots occasionally use emotes too, so they stay hard to spot.
- [ ] Merging two accounts that both have progress (linking refuses this today).
- [ ] Tune bot difficulty and the scoring and speed numbers after real play.
- [ ] Move to our own game server when real traffic arrives. The free Supabase plan carries roughly 70 full matches a month.

## Needs a real-world check (can't be tested from Claude's workspace)
- [ ] Two real devices playing a match together over the internet.
- [ ] Real Phantom wallet sign-in, and linking a real wallet to a real email.
- [ ] The game on a real phone at full speed (feel, controls, frame rate).

## Things to remember
- The free Supabase project **pauses after about a week with nobody playing**. Un-pause it from the Supabase dashboard.
- Publish updates with `santa-hat-game/deploy-pages.sh`.
- Handing over to a new Claude: see `HANDOFF.md`. Keep its "Where we are right now" section current.

## Done
- Four mockups; Snowball Square chosen and made multiplayer (rooms, codes, referee handover, idle kick).
- Play / Store / Avatar / Ranks tabs, the Santa hat logo, and the fur-trim theme.
- Wallet or email sign-in, avatars bound to the account, and email + wallet linking.
- Item catalog with 37 items, including the Gorilla, Snowman and Panda heads; save rules checked on the server.
- Bots with player names and random outfits; ranking rules written on the Play tab.
- 3% SANTA tax notice on the Play page intro, the Wager card and the Lottery block. Decided: winners absorb the tax.
- Unranked lobby (FFA or TEAM, Auto match into public games, private room code, practice) and the FFA RANKED lobby layout (Tournament greyed out, Coming soon).
- Live games list with Watch now: up to 4 watchers per game, who see the match but never play or count as players.
