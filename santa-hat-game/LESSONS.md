# Lessons learned: Santa Hat Arcade

Read this before starting new work on the game. Add to it whenever something real is learned.

## Rules that must not drift

> - **Every mode needs a tested way to lose AND a tested way to win.** Two mockups shipped
>   first drafts that could never end (see below). Force the losing state in a test; don't assume it.
> - **Check lighting and glow with the scene fully populated**, never a sparse demo.
> - **No wallet, token or GP payouts without Cody's explicit sign-off.** That's real money.
> - **SANTA has a transfer tax (3% today, changeable by the token team).** Read the live fee from the token;
>   never hardcode it. Tax first, then burn, treasury, pool; the last split gets the remainder. Never route
>   SANTA through an in-between wallet (each hop costs the tax again).
> - **Linking logins never erases progress.** A login with its own points, level or items is refused, not merged.

## Bug classes seen (and how they were caught)

- **Unlosable loops.** In Hat Chase, knocked-off hats were instantly re-catchable because they
  were still next to Santa's head. In Be the Hat, you could bounce on the pedestal forever.
  Both were caught by driving the game with no input and checking that it ended. Fix: a
  no-catch window plus a stronger knock-back, and a second pedestal bounce shoves you off.
- **Silent input swallowing.** Snowball Square's round-start throw cooldown applied to the
  player too, so the first click did nothing and nothing said why. Found by checking the ammo
  count after a click.
- **Glow washout.** Point lights at intensity 28–30 plus six overlapping lantern glow sprites
  turned the plaza centre into a pink-white blob. Keep real lights at 2 or fewer per scene, at
  around 5–6 intensity, and keep glow sprites small.
- **Fog tints glowing objects.** The moon rendered dark blue because materials take fog by
  default. Glow materials use `fog: false`.
- **Padding overflow on phones.** The published page has no global `box-sizing: border-box`,
  so padded cards spilled off-screen. Now set explicitly.

- **Referee handover dropped state.** Loading a snapshot on a new host silently reset "knocked
  down" timers and the hat's landing spot. Caught by a round-trip test: snapshot, load, and
  snapshot again must match exactly.
- **Message budget blew past the free limit on paper.** Every receiver counts on Supabase, so
  8 players at the first-draft rates was about 190 messages/second against a limit of 100. Do the
  multiplication before shipping any network change, and send on change, not on a timer.

- **Bigger hat hid every face.** Enlarging the hat put its brim over the eyes, so face items
  (including paid ones) were invisible in-game. Caught by rendering all faces side by side with the
  hat on. Any change to the hat or head must be checked against the face lineup.

- **New overlay panel sat behind the page.** The sign-in panel had no fixed position, so it rendered
  under the tab pages and its buttons couldn't be clicked. Caught only because the test clicks for real.
  Every new overlay: give it a position and z-order, and click it in a test.
- **Built-in email only reaches the Supabase team.** Friends' sign-in emails fail until a custom SMTP
  service (e.g. Resend) is connected.

- **Test tools kept outside the repo vanish with the session.** The browser tests lived in a temporary
  scratch folder for weeks; a new Claude would have lost them. Anything worth rerunning goes in the repo.

- **Burned money isn't pool income.** A first jackpot simulation counted the 10% burn as money
  arriving in the pool and overstated the level-off point by 60%. Caught by checking the formula against
  the worked example (87.59¢ per $1). The test now asserts that number.

- **Class-name clash.** The avatar editor already used `.slots`, so the new Slots panel silently picked up its layout.
  Check `grep` for a class name before reusing a short one. Also: a `@media` block placed *above* a base rule of the same
  strength gets overridden; put responsive overrides after the rules they change.
- **Check the test's arithmetic too.** A Slots check "failed" because the test expected $28.40; $9.90 − $1.00 + $19.40 is $28.30,
  which the game showed. A red test needs checking in both directions.

- **A pool that only its own game refills can lock itself.** With the Mini Hat gone, a Slots pool under the $100 top prize
  refused every pull, so nothing could ever refill it: a silent permanent lock. Caught by simulating long runs and counting
  paused pulls. Any pool with a "must cover the top prize" rule needs a refill path.

- **A stray comment silently switched off a money setting.** Inserting a `//` note mid-line in `slots.js` commented out
  `hatBonus: 0.05`; payback dropped 9% with no error. Caught only because the number looked wrong. The Slots test now
  fails if the hat bonus or pool jackpot settings are missing, or payback leaves 76–83%. Put notes on their own line.

- **A failure after a credit is spent must give the credit back.** The first play-credits version spent the credit, then hit an
  error making the secret, and the machine stayed locked with the play lost. Found only by clicking through in a real browser.
  Now every step after the spend refunds on failure, and a test forces each failure.
- **Browser hashing (crypto.subtle) only works on secure pages** (https, or http://localhost). The live site is https; tests that
  play the games must load `http://localhost/…`, not `http://local.test/…`.
- **Full-screen label raced the browser.** The button read the state 60 ms after asking; under load the browser took longer, so it
  said "Full screen" while full screen was on. The label now follows the browser's own fullscreenchange report.
- **The stray-comment bug struck again (three times now), in tests:** a `//` note typed mid-line swallowed the rest of the line. Notes go on their own line.
  **Fourth time (2026-10-01), in the page:** a scripted edit put `// the Spin balance's two sizes` before the rest of a line,
  so the Spin chips stopped following the admin price. No error anywhere; only the settings browser test caught it. When a
  script inserts a comment into existing code, it goes on a NEW line above, never before code on the same line.
- **Rounded constants multiply their error.** A test's pool-income figure rounded to 7 digits was fine for 1 pull and failed for 5.
  Use the exact formula, `(1 - 0.10 * 0.97) * 0.97`.
- **When a new test fails, check the test's bookkeeping before the game.** The bot-emote check failed three times; every time it
  was the test (event numbers restarting per match, two games sharing labels, warm-up events stamped late). The game was right.
- **The in-process Postgres (PGlite) runs one transaction at a time,** so it can't catch a missing row lock. Proven by removing the
  lock: the test still passed. Locks must be checked on a real multi-connection Postgres.
- **Fake Solana addresses in tests must be valid base58** (no 0, O, I or l). The live database rule rejects them otherwise.
- **The publish script now refuses a build with a missing file** (any `./x.js` a page imports must be copied). A forgotten file
  would otherwise break the live site with no warning.

- **A crash test must really crash.** The payout worker's "crash after sending" scenario was absorbed by the worker's own error
  handling, so the test passed even with the recovery check deleted. Fixed by making the fake crash escape the worker; now
  deleting the check fails the test (double payment caught). Always break the code on purpose once to see the test go red.

- **"On screen" must mean "not under the bottom tab bar".** On phones the fixed tab bar covers the page, so a result line can be
  inside the screen and still hidden. A check measured against the screen edge passed while the screenshot showed the problem.
  Look at the screenshot, and measure against the bar.
- **A "must fail" check has to actually run the old code.** A `git stash` with a path that didn't match set nothing aside, so the
  "old code" run was the new code. Back the files up, restore the old versions, run, restore; confirm with `git diff --stat`.

- **Identical transactions are deduplicated by the chain.** Two payouts of the same amount to the same wallet with the same
  blockhash are byte-identical; Solana drops the second and its signature reports "landed". The payout crash test never saw it
  (its amounts all differed); the end-to-end rehearsal did. Every money transaction gets a unique memo, and one signature can
  never be recorded for two payouts.
- **A dress rehearsal finds seams unit tests miss.** It also caught the server quoting the real SANTA mint during a test-token run.

- **Anything rebuilt from stored settings must not depend on key order.** Postgres jsonb reorders object keys, so reels built
  by iterating `Object.entries(counts)` came out differently for anyone rebuilding them from the published numbers. The server
  and page agreed (both read the same reordered copy), so only an independent rebuild caught it. Iterate in a fixed order.

## Multiplayer notes

- This workspace can't open WebSockets (proxy limit), so live Supabase play can't be tested here.
  Use `?net=local` (tabs on one computer share a room) for automated tests, and a real device for the live check.
- The page's built-in live "room" feature only works for signed-in Claude users, so it's not an
  option for friends without Claude.
- GitHub Pages turned on by itself when the `gh-pages` branch was pushed (the repo is public).
  Republish with `santa-hat-game/deploy-pages.sh`.

## Accounts

- One account (profile) can be opened by an email login and a wallet login (`logins` table).
  Link codes last 15 minutes and must be created on one login and redeemed on the other.
- Email accounts can play and rank but can't buy; buying needs a linked wallet.
- Player emails are never stored on profiles or shown anywhere.

## Engine and pipeline notes

- Low-poly "jitter" must offset vertices **by position**, not by index, or faces crack apart.
- Outline hulls need **smoothed normals** (averaged by position) or they split open at hard corners.
- Three.js r186 marks `THREE.Clock` deprecated; the loop uses `performance.now()` instead.
- Headless Chromium (software rendering) runs about 8 fps. The game clamps each frame to
  1/20 s, so tests run in slow motion. Use headless runs to check logic, not game feel.
- **Several 3D windows at once can starve a slow workspace.** On a 4-core machine, the lobby and link tests' 3rd/4th
  window took over 30 s to finish loading (every file had arrived; the page was just CPU-starved), so they timed out.
  Not a game bug (the Arcade tab loads only when opened). Those tests now allow 90 s per page load.

## Research access notes

- `WebFetch` gets 403 errors from dexscreener.com, solscan.io and birdeye.so (anti-bot).
  `https://api.dexscreener.com/latest/dex/tokens/<mint>` works over curl and confirmed the
  token: SANTA/SANTA, website santahat.gold, X account @santahatgp.

## A deposit is booked by what ARRIVED, never by what was meant to be sent (2026-09-30)
Cody pays top-offs by sending SANTA himself. The token takes 3% on the way and he may send more or less than asked, so the
server reads the arrival from the chain's own balance record and books that exact amount: top-offs first (they were already
in the book when the play settled, so they're marked paid, not added again), extra into the pool. Test it with the
reconciliation rule as an assertion after every step (short deposit, extra deposit, recorded twice), not a spot-check.

## Test the page at the real phone's size, both ways up (2026-09-30)
Cody's Galaxy S22+ screenshots showed what the 390×844 checks never did. Sideways, Chrome's in-app browser leaves only about
300 px of height, so the match's top bar and stats covered 39% of the screen. Upright, the Avatar camera cut the hat off.
And an early exit in `renderChrome` cleared the HUD but not the scoreboard, so after Leave the old scores sat over the Avatar
tab. `tests/browser/phone-shots.mjs` now checks five sizes, sideways included, for how much of the screen the UI covers,
UI that overlaps, a top bar running off the edge, and a match scoreboard left on screen. The Avatar camera no longer uses
fixed spots: it measures the free area (below the bar; above or beside the panel) and frames the whole character in it.

## Rare prizes need visible real estate, not thinner slices (2026-09-30)
The 400-slice wheel was exactly right on paper, but its 4× and 5× were 1-slice slivers nobody could see, so Cody said
"you can't even see half the prizes". Make rarity come from a SECOND step instead (a gold star → a bonus wheel), so that
every segment you can see is a real, equal-size chance. Keep equal segments: a wheel whose sizes don't match its odds would
mislead players. When the draw gets a second step, the proof re-check must replay the same numbers in the same order (the
first fair number for the main wheel, the second for the bonus). `tests/credits.test.mjs` compares both segments.

## "Done" must come after the screen shows the new state (2026-09-30)
The admin screen said "Done: pause" and only then re-read the pools, so for a moment it said Done beside "Running".
A browser test caught it intermittently. An intermittent failure is a timing gap to find, not a flake to re-run away.
Rule: refresh, then confirm.

## Hold nothing: a run beats a balance (2026-10-01)
Cody went from credits per game, to dollar balances, to RUNS (buy 1/5/10, they play at once, winnings sent automatically at
the end). Each step removed money we hold for players: a balance is a liability that needs its own rules (expiry, cash-out,
stuck credit), while a finished run holds nothing. When a design keeps growing rules to protect a stored balance, ask whether
the balance needs to exist at all. Invariant for runs: paid exactly once, exactly winnings + refunds, never before the last play.

## Keep money exact until the screen (2026-10-01)
Rounding each play's prize to cents while summing a run made the books disagree with the pool by a fraction of a cent (a pool
jackpot is a share of the pool, not whole cents). Keep sums exact (or in the token's smallest units); round only for display.

## Headless browsers draw about 3 frames a second (2026-10-01)
A run of 10 animated spins with a bonus wheel took minutes in the test browser (swiftshader) and looked like a hang. Tests
press Skip ahead (the same button players have) instead of raising timeouts. Related: a canvas that keeps drawing while off
screen costs every phone; the Snowball Drop board rests unless it's visible or snowballs are still falling.

## A flex row splits mixed text into columns (2026-10-01)
The result line is `display: flex` (to centre it vertically), so a summary made of bold text + plain text + a span became three
squashed columns on a phone. Wrap rich text in ONE element when its parent is flex. Caught only by looking at a phone screenshot.

## "Biggest seen" is not "biggest possible" (2026-10-01)
The payout safety cap was $205 a pull: the biggest Big Hat pull a simulation had SEEN. Several lines can pay at once, so a
real pull could pass it, and a genuine winner would have been frozen (Cody: never hold a winner). A safety limit must come
from the structure (every line at the top prize + every square's bonus), not from a sample. Then prove it as an assertion,
including against bigger prize settings Cody might publish (`tests/payoutcap.test.mjs`). The same check found that a frozen
payout had no way out (no Release) and the player would have been told "sent": a safety net needs its exit built with it.

## `tests/solana` needs WSL on Windows — and `--no-save`, or it corrupts the shared lockfile (2026-10-01)
Found moving the project to Cody's actual Windows machine: `npm install` under plain Windows installs fine, but
`node split.test.mjs` fails with `Cannot find module './litesvm.win32-x64-msvc.node'`. Checked `litesvm`'s own
`optionalDependencies` — it ships native binaries for `darwin-x64/arm64` and `linux-x64/arm64-gnu/musl`, nothing
for `win32` at all. The cloud workspace that built and proved this suite ran on Linux, so this never showed up
there. **Fix: run `tests/solana` (and anything else depending on `litesvm`) through WSL** — same pattern already
used for this machine's other Solana/Anchor work.

**⚠️ The first attempt at this fix broke something else.** Running a bare `npm install` from inside WSL
recalculated `package-lock.json` for Linux and silently DROPPED two Windows-relevant optional/peer entries
(`bufferutil`, `fastestsmallesttextencoderdecoder` — part of the `ws`/websocket chain) that a later plain-Windows
`npm install` would then no longer know to install. A lockfile is shared across whoever runs `npm install` next,
on whatever OS they're on — recalculating it from a different platform than the one that last touched it can
narrow what EVERYONE ELSE gets, not just add what the current platform needs. **Correct command: `npm install
--no-save`** — installs the Linux-native `litesvm` binary into WSL's own `node_modules` (gitignored, never
shared) without touching the committed lockfile at all. Re-verified clean: `git status` shows no lockfile change,
and the test still passes. From the repo root:
`wsl -d Ubuntu -- bash -c "cd /mnt/c/test-stuff/santa-hat-game/tests/solana && npm install --no-save && node split.test.mjs"`.
One related, non-blocking warning: `@solana/kit` (or something in its chain) wants Node ≥22.12.0; WSL Ubuntu here
has v20.20.2, which prints an `EBADENGINE` warning but every test still runs and passes correctly — worth
upgrading WSL's Node before relying on anything that might actually need the newer runtime, but not urgent.
**The general rule this generalizes to: never run a bare `npm install` from a DIFFERENT platform than the one
that owns the lockfile — use `--no-save` (or a separate lockfile) whenever testing cross-platform.**

## An escrow must book what ARRIVED, never what was sent: the tax breaks "sent" books (2026-10-01)
Checked before plugging the Santa Lottery into Cody's `green-lottery` program (GREEN LIFE, devnet): its `buy_tickets` adds
the `transfer_checked` amount to the books, but a Token-2022 transfer fee comes out of what lands in the vault. With SANTA
(3%) the vault would hold 3% less than the books promise, its own "pot is funded" check compares books to books (so it
passes), and the failure would only show up at the end: a winner's claim or the last refunds bouncing. Same rule as the
top-off deposits above: for any token with a transfer fee, book the vault's balance change (or the fee-adjusted amount),
and check books against the WALLET, not against themselves. Also: this Windows machine has no Python; script edits with
Node or the Edit tool.

## "Recover after a crash" looks exactly like "another worker is busy" (2026-10-01)
The payout worker starts by re-sending anything left mid-send, assuming the last run crashed. Two runs overlapping (a cron
every minute, a slow chain) made it re-send a payout the other run was still sending: a double payment. Proven only on a real
multi-connection Postgres (`tests/db/lock.test.mjs`); every single-worker test passed. Any recovery step must be safe when
the "crashed" party is actually still alive: claim with a compare-and-set (save only if the row still holds what you saw),
and send only if your claim won. Never trust "nobody else is running" unless something enforces it.

## A timing check must stamp the moment that matters, not the reply (2026-10-01)
The lock test first failed now and then WITH the lock: it stamped "committed" when the commit's reply reached Node, but the
database frees the lock at the commit itself, so the next play's read could arrive first. Stamp just before COMMIT is sent.
Found by looping the test 25 times instead of calling it a flake; then 30 runs clean.

## A docs claim like "checked in the database" must be found in the database (2026-10-01)
TODO and AUDIT said "one play at a time per player (checked at the quote and in the database)". Only the quote checked it:
two quotes before paying gave two open runs. Here that turned out safe (and refusing a PAID run would be worse), so the docs
were corrected, not the code. Grep for the check before repeating the claim.

## "Type-checked" is a claim with a date on it (2026-10-01)
HANDOFF said the Edge Function was "type-checked and smoke-run with Deno". It hadn't passed since record-deposit handed the
admin a chain: Deno read `chain = null` as "chain may only ever be null". No test runs `deno check`, so nothing went red. Re-run
`deno check supabase/functions/games/index.ts` after any server change, and run the real function (`tests/db/edge-limit.mjs`).

## A guard that's optional gets forgotten; make "off" explicit (2026-10-01)
The web door refuses to start without a speed limiter unless given `limiter: null` on purpose. On the first run it caught the
security test building a door with no limit. A protection that silently switches off when someone forgets to pass it looks
done while it isn't.

## `pkill -f <name>` can match its own shell (2026-10-01)
Killing a background test server with `pkill -f _pgserve.mjs` also matched the shell running the command (its command line
contains the name) and stopped it. Use a pattern that can't match itself: `pgrep -f "node [_]pgserve"`.

## On Windows, the real-Postgres tests skip unless run through WSL (2026-10-01)
`tests/db/lock.test.mjs` and `edge-limit.mjs` print SKIP (exit 0) on plain Windows: `realpg.mjs` needs Linux Postgres
binaries. A skip is not a pass; read the last line, not the exit code. WSL Ubuntu now has `postgresql` (14) installed, and a
Linux Deno lives in `/tmp/denolx` (re-install with `npm install deno` there if /tmp was cleared). From Git Bash:
`MSYS_NO_PATHCONV=1 wsl -d Ubuntu -- bash -c "cd /mnt/c/test-stuff/santa-hat-game/tests/db && node lock.test.mjs && DENO=/tmp/denolx/node_modules/.bin/deno node edge-limit.mjs"`
(without `MSYS_NO_PATHCONV=1`, Git Bash rewrites `/mnt/c/...` into a Windows path and WSL can't find it). Never `npm install`
inside WSL here without `--no-save` (see the lockfile lesson above).

## The test database must have the live database's grants, or it's stricter than the real thing (2026-10-01)
Supabase grants anon and signed-in users ALL rights on every new table, view, function and sequence in `public`; files must
revoke what they don't want. The PGlite tests created bare roles with no rights, so "the website can't do X" checks passed
for the wrong reason. A view with owner rights (`my_plays`) turned out writable by players on the live project. Found only
because Supabase's security advisor was run right after applying the file. Rules: (1) the test setup copies Supabase's
grants (`SUPABASE_GRANTS` in `tests/db/setup.mjs`); (2) run `get_advisors` (security) after every live database change;
(3) prove a "refused" claim on the live database as the real role (`set local role authenticated` inside a block that
rolls back), not by reading the SQL file.

## A "must fail" check on a NEW file can't be confirmed with git diff (2026-10-01)
Breaking `server/solanachain.js` on purpose: `git diff --stat` printed nothing before AND after, because the file was new and
untracked, so it proved nothing about the restore. Back up with `cp`, restore, and confirm with `cmp backup file`.
Also from that check: the payout crash test must restart the worker while the payout is STILL IN FLIGHT. Waiting for it to
land first made the test pass even with an adapter that said "expired" too early (which would pay twice).

## A scripted text replace can silently eat `$` (2026-10-01)
JavaScript's `s.replace(find, replacement)` treats `$$`, `$&`, `` $` ``, `$'` and `$1` in the REPLACEMENT as codes: an edit that
inserted SQL turned the function opener `as $$` into `as $`, and only the test database's syntax error caught it. When a
replacement contains `$` (SQL, templates, money), use `s.replace(find, () => replacement)` or `split(find).join(replacement)`.

## A setup script must never change a wallet the books track (2026-10-01)
`devnet-setup.mjs` "topped up" the pool wallets to $50 / $500 at the LIVE price; re-run after SANTA's price fell, it minted
~16% more test SANTA into both pools, and the live database's pool books silently stopped matching the wallets. Caught only
because the printed balances looked different. Rule: once a pool's wallet is booked, only booked actions move its money
(plays, payouts, skims, Cody's recorded deposits). The setup now funds a pool once, when empty, and never again.

## Measure what the referee did, not what the page sent (2026-10-01)
A special-snowball browser test failed now and then: "no Ice Ball thrown". I suspected a real silent-swallow bug (two cooldowns out of
step) and added a refusal reason to the referee to prove it; the data said otherwise: nothing was refused, the page had sent the
throw and the referee had not READ it yet (it reads once per frame; test browsers draw ~3 a second). A wrong theory with a
plausible story is the expensive kind: record the actual state on failure first, then explain it. Tests wait for the referee's
throw counter (lastTh) to catch up, never for a fixed time.

## A client-side allow-list must be tested against the server it mirrors (2026-10-01)
The page skipped the server for signed-out players unless the action was on its own short public list (winners, settings,
pools). The server had since made lottery, lottery-tickets and stats public too, so a guest's lottery cards and draw
re-checks silently never asked; both halves looked right on their own. The list is now one export (PUBLIC_ACTIONS) and
`tests/public-actions.test.mjs` fails if it differs from the actions server/http.js answers before its sign-in check.

## A trailing comment can swallow the rest of a one-line statement (2026-10-01)
Adding `// at the run's locked price` to the end of a refund call in server/games.js commented out the `finishRun(...)` that
followed on the SAME line: a stuck run would have been refunded but never paid. Only the stuck-run test caught it. In this
codebase several statements share a line; put a new comment on its own line above, never at the end of an existing one.

## A smaller target needs a path check, not an end-point check (2026-10-01)
Elf Hat (half-size player) was first built by halving the hit distance. The gear test's long aimed throw then missed: at a slow
host's 1/20 s step a snowball moves 0.9, more than a half-size player is wide, so checking only where the ball ENDED a step
let it fly straight through. The referee now measures to the path the ball took that step. Whenever a target shrinks or a
ball speeds up (a Fire Ball moves 1.8 a step), check the worst frame rate, not the test's tidy one.

## A "reload" to the same URL with a new hash isn't a reload (2026-10-01)
The plaza theme test checked "still Halloween after a reload" and passed, but nothing had reloaded: the Avatar tab rewrites the
hash to `#avatar`, so the test's `goto('…#play')` was a same-page hash change and the old page answered. Caught only because the
storage-throws case ("Christmas again after a reload") failed. A test that means reload calls `page.reload()`.

## Added light cannot show red on white snow (2026-10-01)
The first special-snowball tracers were all additive glow (light ADDED to the picture). On the bright snow plaza a red flame
trail turned pink and the split ball's red/green ribbon nearly vanished; overlapping Giant Ball halos whited out the middle of
a phone screen. Only the maxed-out screenshot showed it. Tracers now pick per point: glow (added light) for halos, SOLID colour
(painted over) for flames, ribbons and chips, and a crisp star for twinkles (kit.js Sparks). Colour that must read on snow is solid.

## Before asking Cody to unblock something, look for the route that needs nobody (2026-10-02)
For two days the game server's deploy waited on Cody typing `npx supabase login`, because the first plan said so. The Supabase
connector could deploy all along: a one-line Edge Function importing the server from the public repo at a pinned commit (Deno
fetches and bundles it; `deno check` on the one-liner proves the whole graph first). Cody: "why didn't you do that in the first
place." When a step is blocked on a person, list the other routes first (connectors, a different host, a pinned remote import).

## A serverless function must reach Postgres through the pooler (2026-10-02)
The first burst test of the deployed game server failed ~1 in 7 requests: every copy of the Edge Function opened its own DIRECT
database connections, and ~70 requests at once used up the free plan's slots ("remaining connection slots are reserved"). Worse,
the speed limit fails open by design, so under that error it counted nothing. Fix: the transaction pooler (DB_POOLER_HOST; port
6543, user postgres.<project>); only transaction-scoped locks work through it. Always burst-test a deployed server, and read
the function logs, not just the status codes.

## Playwright request interception breaks WebSockets (2026-10-02)
With Playwright 1.63, ANY `context.route(...)` (even one whose filter skips the WebSocket's address, and even with a
`routeWebSocket` pass-through) made every page WebSocket fail (close 1006), while the same page with no routes connected
fine. Found by a 3-way experiment, after two blind retries that changed nothing: test the smallest difference first.
Tests that need a real WebSocket (the referee server) serve the game's files from a plain local web server instead
(`tests/browser/referee-server-test.mjs`), and wait with `waitUntil: 'domcontentloaded'` (fonts from the internet can hold
the 'load' event for over a minute when 3 test browsers start at once).

## After money is sent, nothing may throw it away (2026-10-02)
`wallet.js` waited for a sent payment to become final by polling the network, and a single failed poll THREW, so the page
never got the signature: the player paid and the run never reached the server (nothing to resume either: the signature was
only ever returned). Found while checking whether a new "Nothing was charged" message was true. Rule: once a transaction is
sent, only a confirmed on-chain failure is an error; every other problem (network, timeouts) retries and hands the signature
on, because the server verifies payments itself. And never write "nothing was charged" unless the code path makes it certain.

## "It worked for me" isn't proof for everyone (2026-10-02)
Cody's sign-in email arrived, so email sign-in was marked done; it wasn't: custom SMTP had never been saved, so it came from
Supabase's built-in test sender (a few an hour, not for players). Then Claude explained it as 'team-only delivery' without
checking; the team list showed Cody's address isn't on it. Twice the same mistake: check the setting itself, the provider's
send log, and any premise used to explain a result, before stating it.

## The same two slips, again (2026-10-02): write them down where they bite
1. A "// was 90" note added mid-line in sim.js's settings swallowed BREAK_TIME, END_TIME, INTRO_TIME, COUNT_TIME, MAX_HUMANS
   and MIN_BODIES (the 2026-10-01 lesson, repeated). node --check can't see it (still valid code); the rule tests caught it at
   once. Rule: a comment goes on ITS OWN LINE above, never inside a line of settings; run the rule tests after any sim.js edit.
2. `pkill -f <name>` inside `bash -lc "... <name> ..."` kills that very shell (its command line matches). Twice now. Rule: never
   pkill by a pattern your own command contains; stop a background task with TaskStop, or match on a PID.

## A canvas that only draws while "active" can sit blank at rest (2026-10-02, Stocking Stuffer)
The new mantel board drew only while visible or animating (to spare phones). Every test of PLAYING passed, but the screenshot at
rest showed an empty box: resizing a canvas (any layout shift) clears it, and the idle loop never painted it again. Opening a
stocking woke the loop, so it looked fine once played. Rule: a board that rests must paint a still frame whenever it is resized
or reset; and a browser test samples the canvas pixels at rest (stocking-test.mjs; it fails on the old code).

## Half-cent prizes and a cents column (2026-10-02)
1.75 × 10¢ = 17.5¢. `plays.pay` is numeric(12,2), so it stores 18¢; the SANTA sent (pay_raw) is the exact 17.5¢. The public
winners list read the cents column and said "+80%" for a +75% win. Anything shown to players reads the exact prize (multiplier ×
price); the cents column is for books at a glance only.

## A test counter that resets late reads the previous turn (2026-10-02)
The "decided before it was shown" check waited for "4 turns done and 1 stocking shown", but the shown-counter still held turn 4's
value until turn 5 reset it, so it read turn 4's board. Wait on a counter that changes at the START of the thing you mean
(`live.started`), not on one that is reset somewhere inside it.

## The Avatar preview always wears the Santa hat (2026-10-02, costumes)
The Avatar screen puts the Santa hat on every preview, so a tall costume hat (the Nutcracker's shako) showed only as a plume
poking through it, while the Hats-tab picture looked fine. Only the full-page screenshot showed it. The preview now shows a
costume hat instead of the Santa hat; the older cosmetic hats are unchanged (Cody's call whether they should do the same).
Any new hat or head piece: check the Avatar page screenshot AND the faces lineup (tests/browser/faces.mjs) with the hat on.

## A server error is not a refusal: never forget a PAID run (2026-10-03, fake players with devnet money on the live site)
Three test players bought Big Hat pulls in the same second. The server checks each payment and also looks up the token tax
on Solana. The public devnet node answered "too many requests" (429), and the server replied 500. The page's retry loop
only retried "not finalized / not found", so it took the 500 as "refused for good", cleared the remembered payment, and
2 paid pulls were never played. Nothing showed it except the run count. Single-player tests never hit it.
Fixed three ways:
- the server's 500 says retry: true;
- the page (runs, Store, lottery) treats any server-side failure as "keep the payment, ask again";
- the tax lookup is remembered for a minute (market.js keptFee).
Rules:
- Any "paid but not yet accepted" state is only dropped on a definite refusal from the server.
- Test money paths with SEVERAL players at once, not one.
- Free public RPCs rate-limit: cache what can be cached.
tests/browser/live-money-test.mjs is the several-players check. live-resume.mjs hands a stranded payment back through the
page's own recovery.

## A rule change must update every test that encodes the old rule (QA pass, 2026-10-03)
The full QA after the server move found 6 browser tests still checking rules Cody had changed:
- shirts for sale (now level rewards);
- 10 gear (the Heated Coat was retired);
- the old special-snowball order;
- "SB2" letters on the match buttons (now the ball's picture);
- the weekly draw at Sunday midnight UTC (now 9 PM Indiana);
- Drop's "100×" (now the pool jackpot).
These tests aren't in the per-change set, so nobody saw them fail. Two test servers also lacked actions the real one always has
(the Store's ticket count, market), so the page got 400/500 answers that the real site never gives.
Rules:
- When Cody changes a rule, grep tests/ for the old value: numbers, names, wording, times.
- Keep a test's stand-in server in step with server/http.js.
- On a slow machine, run the browser suite with nothing else running (page loads time out otherwise).
Also learned this pass:
- Chrome never retries a failed dynamic import() for the life of the page, so a "try again" message after one has to say
  "reload".
- The worker's payout memo is "Santa Hat payouts #<id>" (plural).

## `node --check file.js` is not the browser's check (2026-10-03)
A `//` note put in the middle of a line in online.js swallowed the code after it, and the game page stopped loading.
`node --check online.js` passed anyway, because Node read the .js file as an old-style script, not as a module.
Every browser test then timed out on the page load.
Rules:
- Check page code as a module: `node --input-type=module --check < file.js`.
- deploy-pages.sh now runs this on every file and refuses to publish if one fails.
- Put notes on their own line, or at the very end of a line (the third time this exact slip has bitten).

## 2026-10-03: GitHub's 10-minute cache can serve a MIX of old and new code after a publish
Right after publishing the season card, the live page showed the NEW card with the OLD item list ("a costume piece" for every
Pumpkin King piece): the browser fetched the new seasonui.js but reused its cached catalog.js. Worse is possible: new code
importing something an old cached file doesn't export stops the whole page loading, for up to 10 minutes per player.
Rules:
- deploy-pages.sh stamps every file reference with `?v=<build>` and the page + buildcheck.js with the same id (old page meeting
  new code reloads once). Never publish by copying files by hand; never import a page file in a way the stamp doesn't cover
  (`from './x.js'`, `import('./x.js')`, `import './x.js'`, `<script type="module" src>` are covered; the script refuses others).
- Check a publish on a NORMAL visit of a browser that had the old site open, not only a hard refresh.

## 2026-10-03: a script that stops on any error also stops on a grep that finds nothing
deploy-pages.sh runs with stop-on-error; `left=$(grep … )` for "anything left unstamped?" finds nothing in the GOOD case, grep
returns 1, and the script quietly stopped before publishing (no message). Rule: a grep whose "no match" is success gets `|| true`.

## 2026-10-03: a duplicate-key error is not always a reused payment
shop_buy re-raises "duplicate key" as "payment already used" (nothing owed). A second $5 pass for the same season hit the
season_passes primary key, so a REAL second payment would have been treated as reused and never refunded. Rule: anything a
purchase can refuse (already owned, already has the pass) is checked by name and raised in words, never left to a unique key.

## 2026-10-03: new UI code must never be able to stop the page loading
The season card read the calendar's first day wrongly (an object, not its date); the error ran during start-up and the whole
game page failed to load (season-test caught it). Rule: an optional card renders inside try/catch and hides itself on error.

## 2026-10-03: `$'` in a JavaScript replace string inserts the rest of the text
`s.replace(x, "...$'...")`: `$'` means "everything after the match", so a quote-dollar in the new text pasted the rest of tabs.js
into itself. Rule: edit files with the Edit tool; in a replace string, write `$$` for a literal `$`, or pass a function.

## 2026-10-03: anything drawn over the playing field must let taps through
The first-match tips box sat over the top of the field; on a phone you throw by tapping ANYWHERE, so taps on the box threw
nothing (controls-test caught it). Rule: an overlay during a match gets `pointer-events: none`, and only its own buttons take
taps (`pointer-events: auto`). Test it with a real tap on the overlay that must still throw.
## 2026-10-03: "doesn't block the camera" can be a check, and a ray test on a merged mesh is too slow for it
The Halloween folk (skeletons, cats, zombies) are merged into one mesh that spans the whole plaza, so casting rays at it tested
every triangle for every ray: the first version ran over 10 minutes and never finished. The check now works per vertex: from
every match camera (player and watcher; computer, phone upright and sideways; zoom 0.6 to 4; following a player anywhere on the
field), does the line through any new-prop vertex carry on INTO the field (inside 13.2, below hat height)? About 77 million lines
in seconds. Broken on purpose (a zombie moved onto the field), it went red. Also learned: the match camera looks down so steeply
that even a figure right outside the south wall can't hide the field, so "keep the south side clear" is a safety margin, not
the reason nothing blocks. (tests/browser/halloween-spooky-shots.mjs)

## 2026-10-03: a new table that holds anything bought or earned must go into the mainnet reset
supabase/ops/mainnet_reset.sql was written before the season system; it cleared inventory but not season_passes /
season_grants / season_progress / season_days. On mainnet a pass bought with TEST SANTA would have kept granting costume
pieces, and a grant record without its item would have blocked that reward for good. Rule: every new table that records a
purchase, a reward or progress gets added to mainnet_reset.sql (and a planted row in tests/db/mainnet-reset.test.mjs) in the
same change that creates it.

## 2026-10-03: the test database (PGlite) and the live driver (postgres.js) disagree about JSON sent as text
All server code passes jsonb values as JSON.stringify(...) text. PGlite parses that as JSON; postgres.js (the Droplet's driver)
stored it as a quoted JSON *string*. Since the move to the Droplet: every plays.result, some pool_log.details and a
reward_claims.found were strings, so jackpot alerts and the jackpot banner could never see `jackpot`, the winners list lost its
"1.5×" notes, and season_record refused every live match ("bad tasks") while every database test passed. Found only by playing a
real match on the live server and checking the table. Fix: worker/pgjson.mjs on every postgres(...) connection; 208 rows repaired.
Rules: (1) a new database feature isn't done until a REAL live action wrote the row and the row was read back; (2) any new
postgres(...) connection spreads ...JSONB; (3) jsonb_typeof(...) = 'object'/'array' is a cheap live check after a deploy.

## 2026-10-04: code that runs while a file is still loading can't use names defined lower in that file
gameserver.js loads the published settings at load time (settingsReady). Moving the "always ask the live server" list and the
public-actions check BEFORE the first await in call() made that load read two names defined further down; the error was
swallowed by a catch, and in server mode the page quietly kept the built-in prices and odds. settings-mode-test caught it, but
only because the FULL browser suite was run (it isn't in the usual per-change set). Rules: anything run at load time sits below
everything it uses (the note in gameserver.js says so); a catch that hides an error logs it; run the whole suite after a day of
changes, not just the tests near the change.


**A simulation at real crowd size finds what one-player tests can't (2026-10-04).** Every test had a handful of players; 50
at once showed Auto match sending everyone to the same room while their sign-in checks ran (the choice was made before an
await), and that 5 rooms per kind meant the 41st player was turned away. Rules: pick shared resources AFTER the last await; size
limits get tested at the expected crowd, not at 2. And: a new tab in a fixed bar is a layout change. Adding Home pushed Sign in off
small sideways phones; run phone-shots after any top-bar change.


**Check a mix by numbers, not by ear (2026-10-04).** Claude can't hear the videos. The first intro mix sat at about -21 dB
(Cody: "can't really hear it") while its hits peaked at 1.69 (over full scale: crackle). compose.html now reports loudness per
second and the peak, and ends in a limiter + soft clip. Aim: title about -12, build climbing to -8, drop/gameplay -10 to -12, peak
under 1. Make the payoff at least as loud as the build.


**Never record with screen capture (2026-10-04).** For the arcade jackpot clips Claude tried getDisplayMedia with Chrome's
auto-accept test switches: it recorded Cody's WHOLE MONITOR (other windows included), and a failed file write let the old
script run again, so it happened 4 times. Every capture was deleted at once (local only, never sent). Rules: record pages with
the canvas (captureStream) or the DevTools page screencast, never getDisplayMedia; never chain "write a script" and "run it" in
one step, so a failed write cannot run the old version; check a first frame before trusting a new recorder.


**Two classes named the same thing collide silently (2026-10-04).** The season doors used class "tag" for their labels; `.tag`
was already the in-match name tag (absolutely positioned top-left), so every label sat in a corner. Check a new class name
isn't already used site-wide (grep "^\.name" online.html). Same for test ports: run-suite.mjs PORTS lists who shares one.

**A test's pretend wallet must pay what the quote asks, not a copied constant (2026-10-04).** full-sim paid every Store buy
with SHOP_BURN_BPS (50% burned); when the pass went 100% to the treasury, the server rightly refused those payments and the
sim failed. Test payers read q.burnBps from the quote, like the real page does.

**One public Solana server is a single point of failure for every payment (2026-10-04).** The page read Solana only from
publicnode; it is blocked on some home networks (ERR_SSL_PROTOCOL_ERROR in Chrome and curl from Cody's PC, fine from the
Droplet), and api.mainnet-beta refuses browsers (403). Found only by driving the real page path in a browser. The page now falls
back to the game server's read-only relay (server/relay.js).

**Browser test gotchas found building pay-with-SOL (2026-10-04).** (1) Serve test pages from https://local.test, not http: on
http the Solana toolkit can't use the browser's crypto (Solana error #3610000, insecure context). (2) page.goto to the SAME
address ending in #tab only scrolls, it does not reload: add a changing ?t= to really reload. (3) Jupiter's quoted SANTA is
what LANDS after SANTA's 3% tax: grossing it up again overbought 3% (seen in the mainnet simulation).
**An error message can carry a secret (2026-10-04).** Surfpool, forking mainnet through Cody's Helius URL, answered a failed
fetch with an error that quoted the whole URL, key included; the test printed it into a local log (deleted; never committed or
sent; Cody told to rotate). Any tool given a secret URL can echo it in an error: print errors through a redactor
(fork-sol-qa.mjs `hide`), and check server logs for it (journalctl … | grep -c "api-key": 0 on 2026-10-04).

**A books-vs-wallet check must allow for payments on their way (2026-10-04).** A payment lands in the pool wallet seconds after
approval; the server records it only after it is FINAL (~15-30 s). The 5-minute check caught that gap during busy play and
alerted "wallet has MORE" (Cody's Telegram). Allow MORE up to what open quotes could bring (reconcile.js inFlightRaw); LESS,
or more than that, still alarms. A check that cries wolf gets ignored.

**A private copy of mainnet drifts from mainnet as you trade on it (2026-10-04).** Test swaps move the copy's own pool prices
while Jupiter keeps quoting real mainnet, so after ~$1,000 of test buys every swap would fail its slippage limit. Reset the
accounts each swap touched back to mainnet (Surfpool surfnet_resetAccount) after every transaction. Accounts made with
surfnet_setTokenAccount lack Token-2022 extensions (a SANTA transfer INTO one fails "invalid account state"): create token
accounts with the real ATA instruction, and get SANTA with a real swap.

**Reset only what the market owns on a mainnet copy (2026-10-04).** Resetting every writable account a swap touched also wiped
the PLAYER's token account for Jupiter's in-between token, so the copy charged its ~0.002 SOL deposit again on every swap (looked
like players paying rent each time). Skip accounts our own wallets own; then the deposit is paid once, as on mainnet.

**A page on our site cannot read Solana directly (2026-10-04).** Solana's public node answers 403 to a browser on
santahatgames.com, so anything the PAGE asks Solana for (the coin's tax, balances) fails quietly there, even though it worked in
the local test. Get it from the game server (its 'market' answer, or the read-only relay) and check it on the LIVE site.

**Never grep a secrets file for a word; print only named keys (2026-10-05).** `grep -i POOL games.env` to show wallet
addresses also matched DATABASE_URL (its host is a "pooler") and printed the database password. It was rotated at once (new random
password set on the Droplet, never displayed; old one refused). Read env files with an exact list of key names, e.g.
`grep -E "^(SPIN_POOL_WALLET|TREASURY_WALLET)="`, and treat any secret that reached output as exposed: rotate it.

**Read every Solana transaction format (2026-10-05).** Phantom now sends some transfers as "version 1". The server asked for
version 0 at most, so Solana refused those and the server read the refusal as "not finalized yet", forever and silently. Found on
Cody's real deposits before recording them. getTransaction asks for version 1 and logs any refusal (tests/txversion).

**The page must READ the real numbers on load in server mode (GO day, 2026-10-05).** The Game pool readouts only updated after the
player's own play, so on the live site they showed the browser's demo pool ($125) instead of the real $139. Every server-mode test had
played first, so none caught it; only opening the LIVE site before playing did. games.js syncServerPool reads it on load + every 30 s.

**Test money code under the login that will really run it (2026-10-05).** The fast-payment gate read public.runs as the payout
worker, whose limited login (020) may not read that column; every test ran as the database owner, so all passed, and live every
payout pass failed "permission denied for table runs" for ~50 minutes until Cody asked why his winnings had not arrived. Fixed
by 051 (worker reads run id + signature); worker-role-db now runs the real gate as santa_worker and fails without 051. Also: a
watch that only logs "payouts pass failed" is not an alert; WE OWE caught it (Cody), the 15-minute watch was not yet approved.

**A "miss" in a crowd still hits somebody: measure the miss, don't assume it (2026-10-05).** To spread house bots' hit % from 10%
to 48% (Cody), scattering their aim did almost nothing (8x the scatter still hit 31%), and even throwing EVERY ball 60-110 degrees
off still hit 21%: bots crowd the hat, and a snowball starts 0.45 m in front of the thrower, right beside the next player. Only
a wide throw into the most open direction really missed (0.9%). Each try was measured on 400 simulated matches, not reasoned
about; tests/botaim.test.mjs holds each bot on its own target.

**A test that passes on a lucky seed is not a property (2026-10-05).** housebots-db asserted "some bot reached level 2" after 10
games, which needs one bot in the top 3 in all 10. Renaming the bots (053) changed their order and the luck ran out. It now checks
the real invariant: every match gives exactly 3 level ticks. Also: house bots must never reuse practice-bot names (players have
seen those as bots); housebots-db checks it.

**A try-on must not outlive the screen it was tried on (2026-10-05).** On the Avatar screen a Special Gear item Cody didn't own
(Santa Costume) stayed in the draft when he changed tab, and since the costume covers the shirt and pants, every shirt and pants
he then tried looked the same: "I can't preview anything". Now changing tab takes off anything not wearable (any slot) back to
the saved look. tests/browser/avatar-tryon-test.mjs fails on the old code exactly as he saw it.

**Don't judge a timing-tight test while something heavy runs beside it (2026-10-05).** friends-test failed 2 of 3 on the
tournament build and passed 3 of 3 on the old code, which looked like a regression; but every failing run had the full test
suite running in the background on the same machine. Run quietly, the new build passed 5 of 5. Compare like with like.

**A payment the page never reports is still the player's play (2026-10-05).** Cody's page froze; he refreshed, then approved
the OLD screen's wallet popup: the SANTA reached the pool, but the page that would report it was gone, so no play existed (the
page's own "finish it next visit" only works if the page got the signature). The game server now looks for these itself
(server/games.js recoverUnreported, once a minute: an unused quote's wallet, its transactions around the quote, each tried
through buy() so every payment check applies), plays them out, pays as usual and tells Cody. "Your last turns" now come from
the server (my-turns), so a recovered play shows there and a refresh no longer empties them. Test: db/recover-db.
