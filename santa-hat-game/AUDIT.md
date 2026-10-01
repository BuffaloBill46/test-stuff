# Audit: Santa Hat Arcade (2026-09-30; second pass 2026-10-01)

Done by the building Claude before the hand-over to the blockchain Claude. Scope: the server code (security and money), the
page (phones, accessibility, errors), the money math, and whether the docs still match the code. Everything marked **Fixed**
has a test that fails if the fix is undone. Re-run: see HANDOFF → How to test (`tests/db/security.test.mjs`,
`tests/reconcile.test.mjs`, `tests/db/price.test.mjs`, `tests/browser/audit-ux.mjs`).

## Money and security (server)

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | **Skims and top-offs only happened in the database.** The books subtracted the $25 skim and added top-offs, but nothing moved SANTA on the chain, so the books would silently drift from the wallets. | High | **Fixed:** every skim/top-off is queued as a real transfer (`pool_transfers`); skims are sent like payouts; top-offs are paid by Cody sending SANTA himself (decided 2026-09-30) and recorded from the chain on the admin screen (`record-deposit`). New reconciliation check (`server/reconcile.js`): books + everything still owed must equal the wallet, to the smallest unit. Sending them live: FOR_MAIN_CLAUDE. |
| 2 | **Price manipulation.** SANTA's main pool holds ~$93k, so a brief pump while buying credits (pay less SANTA) and a dump while winning (get more SANTA) could pay off. | Medium | **Fixed:** plays are priced at the 10-minute median of once-a-minute samples (`server/price.js`); 1–3 minute pumps to 2× change nothing. |
| 3 | Game names like `toString` / `constructor` (built into every JavaScript object) passed the name check and crashed requests. No money at risk (the database refused), but 500 errors. | Low | **Fixed** (real names only). |
| 4 | Junk play numbers or payment signatures became server errors instead of clean refusals. | Low | **Fixed** (format checks). |
| 5 | An email-only account could start a play it can't be paid for (not reachable today, but a free daily spin would reach it). | Low | **Fixed:** playing for SANTA needs a linked wallet. |
| 6 | Unlimited price quotes per player (database spam). | Low | **Fixed:** 30 an hour. |
| 7 | The public winners list hit the database on every request. | Low | **Fixed:** cached 10 seconds. |
| 9 | **Equal payouts could be silently lost.** Two same-size wins to one wallet, signed moments apart, were byte-identical transactions; the chain drops the second as a duplicate, and the worker marked both paid. Found by the dress rehearsal (a third of the winnings went missing while the books said paid). | High | **Fixed:** every payout carries a unique memo ("Santa Hat payout #id", also readable on the chain), and the database refuses one signature for two payouts, so a worker that forgets fails loudly. Rehearsal now reconciles to zero drift. |
| 8 | Two plays settling on one pool at once could overwrite each other's balance change. | Medium | **Fixed earlier today:** balances only add/subtract. The row lock itself still needs proving on real Postgres (FOR_MAIN_CLAUDE). |

Checked and fine: the fairness order (payment → credit (since 2026-10-01: the run's plays are made) → secret → player's number → reveal) can't be skipped or reordered
(mutation-tested); a player can't see or influence a result before it's final, or settle twice; one play at a time per player;
payments used once; other websites refused; admin actions need a fresh wallet signature and can't be replayed; the website
can only read (row security); server errors never reach players; payouts never go out twice, even through crashes.

## The page

| Finding | Status |
|---|---|
| Buttons and tabs 26–36 px tall on phones/tablets (thumbs need ~44). | **Fixed:** 44 px on touch screens; desktop unchanged. |
| "Demo" / "Coming soon" stamps at 3:1 contrast (standard: 4.5:1). | **Fixed:** 6:1, using the site's existing lighter red. |
| A player-hosted match could inject code through scores? | **Checked, safe:** every number from the host is forced to a number; names are escaped everywhere. |
| Full-screen label could be wrong on slow devices. | **Fixed earlier today.** |

Checked and fine at 320, 360, 390, 768 and 1366 px wide: nothing spills sideways (the Store's item rows scroll sideways on
purpose), both popups fit even a 320 px phone and close with Escape, every button has a name for screen readers, no
errors. The page downloads about 2.5 MB (mostly the 3D engine and fonts).

## Money math and docs

- `PAYTABLE.md` regenerated from the code: unchanged, so the published odds match the game (Big Hat 75.5%, Spin 74.5%). Spin later became two wheels, and every game was set to about 80% (both 2026-09-30, Cody).
- All 20+ test suites pass (the list is in HANDOFF).

## Second pass: runs with automatic payouts (2026-10-01)

Cody replaced play credits with RUNS: buy 1, 5 or 10 plays, they play at once, and the run's winnings are sent automatically
when its last play lands (no claim, no player signature). That changes how money leaves the pools, so it was audited again.
Saved reports and screenshots: `audits/2026-10-01/` (index in `audits/README.md`).

| Finding / check | Status |
|---|---|
| **Run sums rounded to cents** while adding up a run's prizes: a pool jackpot is a share of the pool, not whole cents, so the books disagreed with the pool by a fraction of a cent. | **Fixed:** sums stay exact; rounding only on screen. The ledger audit in `tests/credits.test.mjs` fails if it comes back. |
| A run must be paid **exactly once, exactly what it won + refunded, never before its last play**. | **Checked as assertions** in the demo ledger (`tests/credits.test.mjs`), on real Postgres (`tests/db/server.test.mjs`, `credits-db.test.mjs`) and on the real token program (`tests/solana/rehearsal.mjs`: one payout per run, books = wallets). |
| A single payout can't exceed what a run could possibly win. | **Checked:** the database refuses a run payout above 205 × plays + jackpots (`finish_run`). |
| One payment buys one run, once; plays (and their secrets) are made only after the payment is confirmed. | **Checked** (same tests; the fairness order is unchanged). |
| A play the pool refuses after payment (emergency stop, pool refilling). | **Checked:** its price is added to the run's payout and taken from the pool its entry went into. |
| A player closes the tab mid-run. | **Checked:** the server finishes the run itself (`tidy`), so the payout still goes out and the player isn't blocked. |
| Refused BEFORE payment: an unfinished run, no linked wallet, or a pool that can't take the play. | **Checked** (`tests/db/server.test.mjs`, `security.test.mjs`). |
| Phone: "Pull/Spin/Drop 10" wrapped onto two lines; the end-of-run summary split into squashed columns. | **Fixed;** checked by screenshot at 320 and 390 px (`audits/2026-10-01/screens/`). No automatic test for the look. |
| The "Check this result" panel still said a play "was taken off your credits". | **Fixed** (now: the payment went through for the run). Found by the walkthrough; no automatic test for wording. |
| Page audit at 320–1366 px (`tests/browser/audit-ux.mjs`). | **Clean:** the only flags are the Store's "Try on" buttons in rows that scroll sideways on purpose. |
| 10-player walkthrough on the real page (`tests/focus/walkthrough.mjs`). | **All 10 finished;** log in `audits/2026-10-01/walkthrough.txt`. |

Still not checked (needs live systems): the payout worker sending run payouts on devnet, and `005` on the live database.

## Not checked here (can't be, from this workspace)

Real devices and real feel, real wallets, the live database and Edge Function, live chain behaviour. All listed in
`FOR_MAIN_CLAUDE.md`.
