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
  fails if the hat bonus or pool jackpot settings are missing, or payback leaves 70–80%. Put notes on their own line.

- **A failure after a credit is spent must give the credit back.** The first play-credits version spent the credit, then hit an
  error making the secret, and the machine stayed locked with the play lost. Found only by clicking through in a real browser.
  Now every step after the spend refunds on failure, and a test forces each failure.
- **Browser hashing (crypto.subtle) only works on secure pages** (https, or http://localhost). The live site is https; tests that
  play the games must load `http://localhost/…`, not `http://local.test/…`.
- **Full-screen label raced the browser.** The button read the state 60 ms after asking; under load the browser took longer, so it
  said "Full screen" while full screen was on. The label now follows the browser's own fullscreenchange report.
- **The stray-comment bug struck again (three times now), in tests:** a `//` note typed mid-line swallowed the rest of the line. Notes go on their own line.
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
  Not a game bug (the Games tab loads only when opened). Those tests now allow 90 s per page load.

## Research access notes

- `WebFetch` gets 403 errors from dexscreener.com, solscan.io and birdeye.so (anti-bot).
  `https://api.dexscreener.com/latest/dex/tokens/<mint>` works over curl and confirmed the
  token: SANTA/SANTA, website santahat.gold, X account @santahatgp.
