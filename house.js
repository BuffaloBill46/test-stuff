// The house: a stand-in for the game server, running Cody's safety ORDER for every play (DESIGN_NOTES → "Fair results: the order").
//   buy():    1. the payment is confirmed → the run is recorded (credits.buyRun; the money is already in the pool)
//             2. ONLY NOW a fresh secret is made for each play of the run and its fingerprint locked and shown
//   settle(): 3. the player's own random number arrives (sent after seeing the fingerprint, so the house can't pick a secret
//                to beat it), the numbers are drawn and the play runs against the pool
//             4. the result is recorded, THEN the secret is revealed so anyone can check it
//   When the run's last play is done, its winnings (+ the price of any play the pool refused) are sent in one transfer.
// Runs, not stored credits (Cody, 2026-10-01): a run of 1, 5 or 10 plays is played straight away; nothing is left over.
// DEMO: this runs in the browser. For real money the same steps run on the server and the secret never reaches the page
// before step 4. `steps` records the order for the tests.
import { KINDS, buyRun, credit, payRun } from './credits.js';
import { spin, STAR, DEFAULT_WHEEL } from './spin.js';
import { pull, MACHINES } from './slots.js';
import { play as dropPlay, outcome as dropOutcome, BOARD as DROP_BOARD } from './plinko.js';
import { play as stockPlay, outcome as stockOutcome, DEFAULT_PAYS as STOCK_PAYS } from './stocking.js';
import * as fair from './fair.js';
import { randFrom } from './fair.js';

export const NUMS = 38; // numbers drawn per play (Slots uses 6: the jackpot draw + 5 reel stops; Spin 1, or 2 on a bonus star;
                         // Snowball Drop board 2: 17 = the present + one per row of pegs; board 1 used 8; Stocking Stuffer 38 =
                         // two shuffles of 20, 19 numbers each). The numbers come out in a fixed order, so asking for more
                         // never changes the first ones: old plays re-check the same (it was 17 before Stocking Stuffer).

// `f` swaps the fair functions (tests only, to make them fail).
export function createHouse(ledger, pools, f = fair) {
  const open_ = new Map(), steps = [];

  // A confirmed payment (paymentId) for n plays of `kind` at `bet`. Returns { run, plays: [{ ticket, commit, playNo }] }.
  async function buy(kind, bet, n, paymentId) {
    const b = buyRun(ledger, pools, kind, bet, n, paymentId);
    if (!b.ok) return { failed: true, why: b.why };
    steps.push('paid');
    const run = b.run, plays = [];
    for (let i = 0; i < n; i++) {
      let secret, commit;
      try { secret = f.newSeed(); commit = await f.fingerprint(secret); }
      catch (e) { // couldn't make a secret: that play's price comes straight back as unclaimed money (never a lost play)
        run.made++; run.refused++; credit(run, bet, true); steps.push('refunded'); continue;
      }
      const playNo = ++ledger.plays; run.made++;
      const ticket = `${playNo}-${fair.newSeed(4)}`;
      open_.set(ticket, { run, kind, bet, secret, commit, playNo });
      plays.push({ ticket, commit, playNo });
    }
    steps.push('locked');
    const sent = payRun(ledger, run); // only if no play could be made at all: all prices back at once
    return { run: run.id, plays, ...(sent !== null ? { sent } : {}) };
  }

  // forced: tests only (a slice, a path, or reel stops); the proof then says so.
  async function settle(ticket, playerSeed, forced) {
    const t = open_.get(ticket);
    if (!t) throw new Error('unknown or already settled play');
    open_.delete(ticket);
    const K = KINDS[t.kind], done = (o) => { const sent = payRun(ledger, t.run); return sent !== null ? { ...o, sent } : o; }; // the run's last play: send it
    const refuse = (why, stopped) => { t.run.refused++; credit(t.run, t.bet, true); steps.push('refunded'); return done(why ? { failed: true, why, refunded: t.bet } : { refused: true, stopped: !!stopped, refunded: t.bet }); };
    let r;
    try {
      const nums = await f.numbers(t.secret, playerSeed, t.playNo, NUMS);
      steps.push('drawn');
      const rand = randFrom(nums);
      r = t.kind === 'drop' ? dropPlay(pools.spin, t.bet, rand, forced) : t.kind === 'stocking' ? stockPlay(pools.spin, t.bet, rand, forced) : K.game === 'spin' ? spin(pools.spin, t.bet, rand, forced) : pull(pools.slots, t.kind, rand, forced);
    } catch (e) { return refuse(e.message); }
    if (r.paused) { // the pool can't take it: the price comes back (the entry already reached the pool, so it pays it)
      pools[K.game].pool -= t.bet; return refuse(null, r.stopped);
    }
    t.run.played++;
    if (r.pay > 0) credit(t.run, r.pay);
    steps.push('revealed');
    return done({ r, proof: { kind: t.kind, bet: t.bet, commit: t.commit, secret: t.secret, playerSeed, playNo: t.playNo, forced: forced !== undefined, ...(t.kind === 'drop' ? { board: r.board || DROP_BOARD } : {}) } });
  }
  return { buy, settle, steps, pending: () => open_.size };
}

// What a play's numbers must produce, worked out from the numbers alone (anyone can re-run this).
// cfg (optional): the settings the play ran on (settings.js build()); without it, the built-in game.
export function outcomeFrom(kind, nums, cfg = null) {
  const K = KINDS[kind];
  // Snowball Drop, on the board the drop was played on (cfg.board from the proof; none = board 1, the 8-row 50/50 board):
  // board 2: the first number picks the present from the published table, the next 16 draw the path to it (plinko.js)
  if (kind === 'drop') return dropOutcome(nums, cfg?.board ?? 1);
  // Stocking Stuffer: 19 numbers shuffle the gifts and coal into the stockings, 19 more the order they're opened (stocking.js),
  // paid on the pay table the play ran on (cfg.stocking from its settings version; without it, Cody's built-in table)
  if (kind === 'stocking') return stockOutcome(nums, cfg?.stocking?.pays || STOCK_PAYS);
  if (K.game === 'spin') { // the first number picks the main segment; on a star, the second picks the bonus segment
    const W = cfg?.wheel || DEFAULT_WHEEL, slice = Math.floor(nums[0] * W.main.length);
    if (W.main[slice] !== STAR) return { slice, mult: W.main[slice] };
    const bonusSlice = Math.floor(nums[1] * W.bonus.length); return { slice, bonusSlice, mult: W.bonus[bonusSlice] };
  }
  const m = cfg?.machine || MACHINES[kind];
  if (nums[0] < m.poolJackpotOdds) return { jackpot: true };
  return { stops: nums.slice(1, 1 + m.reels).map((x) => Math.floor(x * m.stripLen)) };
}
// "Check this result": does the secret match the fingerprint shown before the play, and what do its numbers give?
export async function check(proof, cfg = null) {
  const matches = (await fair.fingerprint(proof.secret)) === proof.commit;
  const nums = await fair.numbers(proof.secret, proof.playerSeed, proof.playNo, NUMS);
  return { matches, outcome: outcomeFrom(proof.kind, nums, proof.kind === 'drop' ? { ...(cfg || {}), board: proof.board ?? 1 } : cfg) };
}
