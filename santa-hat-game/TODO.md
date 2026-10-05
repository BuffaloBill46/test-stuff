# Santa Hat Legends — the to-do list

One list for everything (Cody, 2026-10-04: "one visible to-do list"). Cody sets the order; Claude works top to bottom, one item at
a time, and ticks each off only when it is **built, tested, live and noted**. New asks go in **Inbox** first, then Cody places
them. Last updated: 2026-10-04.

## Now (in this order)
1. [ ] **Publish-list test** — a test that fails if any file a page loads isn't in the publish list. (The publish script already
   refuses to publish a missing file, checked 2026-10-04; this makes it a test the automatic runs check too.)
2. [ ] **Tests run automatically on every change** (GitHub Actions: the unit and database tests on every push).
3. [ ] **Hear about errors players hit** — the page reports its errors to the game server; a list on the admin screen.
4. [ ] **Mini games: "Play at your own risk"** at the top of the Games page.
5. [ ] **End of match: snowballs thrown, hit, and hit %** on the results card.
6. [ ] **Player Progress + Ranked board: thrown / hit / % / SANTA spent / SANTA won.** (Flag for Cody: spent/won on the PUBLIC
   ranked board shows everyone's money; Progress is private. Building it as asked; easy to hide later.)
7. [ ] **Share buttons:** big wins, getting a costume, and the score after a match.
8. [ ] **Money dashboard** on the admin screen, under its own button.
9. [ ] **Money flow chart** (SOL and SANTA): where every payment goes.
10. [ ] **Version number + copyright** at the bottom of every page, with the X and Support links.
11. [ ] **Staging site** at test.santahatgames.com (test money, changes go there first); santahatgames.com stays the main site.
    **Needs Cody:** one DNS record at your domain registrar (Claude will say exactly what to type).
12. [ ] **Jupiter fix** — SOL payments use Jupiter's new address with the old one as a backup, and retry when busy (the free
    address is being retired; found 2026-10-04).

## Waiting on Cody
- [ ] **Legal review** of the paid games and lottery before real money (a lawyer who knows crypto gaming).
- [ ] **Fund the game wallets** (amounts and addresses in LAUNCH_CHECKLIST.md).
- [ ] **GO**, then the 10¢ SANTA dry run and one ~$1 SOL purchase from your Phantom.
- [ ] **DNS record** for the staging site (item 11).

## Later (ideas, not started; Cody decides)
- Per-wallet daily limit on the mini games (e.g. $50/day at first).
- Alert when SANTA moves more than ~20% in an hour (and pause sales on extreme moves).
- Real cheap-Android phone test (frame rate, battery, load time).
- Daily "prime time" so real players meet each other.
- Colorblind-friendly special snowballs (shapes, not only colour).
- Friends / party invites; a reward for bringing a friend.
- A "door ready" / "ticket resolved" dot on the tabs.
- A one-page "what to do if…" plan (payout stuck, SANTA crash, books don't match, server down); practise a backup restore.
- Split the handoff notes: a short current-state page + a history log + a box of never-break rules.
- Retire the test admin wallet after launch.
- A free Jupiter key held on the server (no limits).

## Done (2026-10-04)
- [x] Pay with SOL (exact price), live, tested on a copy of mainnet · [x] 10 ticks a level · [x] Season pass 100% treasury
- [x] Match points 10 / 25 · [x] Support tickets (Pending / Resolved / ×) + @Santahatgame · [x] Final launch QA
- [x] Alert false alarm fixed · [x] Guide, Store text, docs brought up to date · [x] X logo, banner, posts, Frost King still
