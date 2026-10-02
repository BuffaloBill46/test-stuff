# Button audit, 2026-10-02

Robot: `tests/browser/button-audit.mjs` (both modes + admin.html, ~46 min in WSL; `node button-audit.mjs [demo|server]`).
Ran on `7c89171` (before the referee server, ranked and the tickets line, which came later the same day).

**Result:** 210 controls on the published site (no server) and 212 with the server connected, plus admin.html. **Zero dead
ends.** All 8 purchases complete with the server connected (Big Hat Pull 1, Snowball Drop 1, a lottery ticket, a ranked
ticket pack, Buy level, a special snowball, a special gear, an Avatar look): price → server quote → wallet pays (stand-in) →
server checks → given, each confirmed in the database afterwards (3 items, level 2, 1 extra ticket, 2 lottery buys, 2 runs,
no refunds owed). On today's site each purchase stops at an honest "payments open soon" or "sign in first".

The table of every control (screen, label, selector, mode, result, notes) is in `controls.md`; raw data in `results.json`.

## Incomplete paths found (most important first), and what was done

1. **The page has no game server address built in** (only `?server=`), and starting/leaving a match rewrote the address and
   dropped `server=`, so a reload after a match fell back to demo. → see "Fixes" below.
2. **Fixed page text contradicts server mode:** Store "Nothing can be bought yet and the lottery isn't running", Play
   "ranked tickets aren't switched on yet", Games "pretend money". → see "Fixes" below.
3. **Ranked tickets could be bought but not used** (ranked Auto match "opening soon"; top-bar ticket chip "—/10"). Ranked now
   runs on the referee server (same day); the chip → see "Fixes".
4. **A technical wallet error** ("Failed to fetch dynamically imported module: https://cdn.jsdelivr.net/…") when the wallet
   libraries can't load. → see "Fixes".
5. **Unchecked: bought items showing as Owned** (the page re-reads ownership from the account system; stand-in accounts here
   aren't written by the server). Needs the devnet check (HANDOFF list #2).
6. **Minor:** the Avatar Buy button offers the first locked item in the preview, not necessarily the one just tapped.
7. Disabled buttons that each say why (not dead ends): Wager, Tournament, the three Ranks tabs, level-locked SB2/SB3/G2.

**Not bugs:** real-mouse click time-outs on the Avatar tabs (slow test browser drawing item pictures) and "How to win" right
after Full screen (clicks fine on a fresh page); the 17 hidden Games-tab controls are the retired Spin's.

**Couldn't test:** a real Phantom payment (covered by `devnet-pay-test.mjs`), the deployed Edge Function, real multiplayer
between devices, phone sizes, the live SANTA price (blocked here).

## Fixes (Claude, after reviewing the report)
Recorded below as they land.
