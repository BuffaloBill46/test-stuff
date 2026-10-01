# Saved audits

The test robots write their reports and screenshots into `tests/*/out/`, which git ignores (they change on every run).
Copies worth keeping are saved here, one folder per audit, so they can be referenced later. The findings and what was done
about them are in `../AUDIT.md`; the focus-group write-up is in `../FOCUS_GROUP.md`.

## 2026-10-01: runs with automatic payouts (after credits were removed)

Taken on the code that went live on 2026-10-01.

| File | What it is | Made by |
|---|---|---|
| `walkthrough.txt` / `walkthrough.json` | 10 player types walking through the real page (phones, desktop, keyboard only): what they saw and did. All 10 finished. | `tests/focus/walkthrough.mjs` |
| `audit-ux.txt` / `audit-ux.json` | Page check at 320, 360, 390, 768 and 1366 px: things running off the screen, tap-target size, contrast, dialogs that don't fit, errors. Only flag: the Store's "Try on" buttons in rows that scroll sideways on purpose. | `tests/browser/audit-ux.mjs` |
| `screens/Phone-newcomer-*`, `Careful-budgeter-*`, `Skeptic-*`, `High-roller-*`, … | Screenshots from the walkthrough. | walkthrough |
| `screens/recheck-*.png` | The result line is visible after a play on a phone, above the tab bar. | `tests/focus/recheck.mjs` |
| `screens/phone-*.png` | Galaxy S22+-sized screens upright and sideways, small phones, tablet, desktop: matches and the Avatar tab. | `tests/browser/phone-shots.mjs` |
| `screens/server-mode.png`, `settings-mode.png` | The Games page running against the real server code and database (a run of 5 pulls, paid and auto-sent). | `tests/browser/server-mode-test.mjs`, `settings-mode-test.mjs` |
| `screens/admin-frozen.png`, `admin.png` | The admin screen's Frozen payouts box (player, short wallet, run, amount, Release) and the whole screen on a phone (added after the payout-cap fix). | `tests/browser/admin-test.mjs` |
| `screens/audit-320-games.png`, `plinko-phone.png`, `sfx-nav.png` | Games tab on a 320 px phone, the Snowball Drop preview, the phone top bar with the sound button. | audit-ux, plinko-test, sfx-test |

To make a new one: run the scripts above, then copy their `out/` files into a new dated folder here.
