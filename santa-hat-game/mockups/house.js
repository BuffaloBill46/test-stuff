// The house: a stand-in for the game server, running Cody's safety ORDER for every play (DESIGN_NOTES → "Fair results: the order").
//   buy():    1. the payment is confirmed → the run is recorded (credits.buyRun; the money is already in the pool)
//             2. ONLY NOW a fresh secret is made for each play of the run and its fingerprint locked and shown
//   settle(): 3. the player's own random number arrives (sent after seeing the fingerprint, so the house can't pick a secret
//                to beat it), the numbers are drawn and the play runs against the pool
//             4. the result is recorded (winnings wait as UNCLAIMED money), THEN the secret is revealed so anyone can check it
//   A play the pool refuses at step 3 (emergency stop, pool refilling) gives its price back, as unclaimed money.
// Runs, not stored credits (Cody, 2026-10-01): a run of 1, 5 or 10 plays is played straight away; nothing is left over.
// DEMO: this runs in the browser. For real money the same steps run on the server and the secret never reaches the page
// before step 4. `steps` records the order for the tests.
import { KINDS, buyRun, credit } from './credits.js';
import { spin, STAR, DEFAULT_WHEEL } from './spin.js';
import { pull, MACHINES } from './slots.js';
import { play as dropPlay, PAYS as DROP_PAYS, ROWS as DROP_ROWS } from './plinko.js';
import * as fair from './fair.js';
import { randFrom } from './fair.js';

export const NUMS = 8; // numbers drawn per play (Slots uses 6: the jackpot draw + 5 reel stops; Spin 1, or 2 on a bonus star;
                        // Snowball Drop 8: one bounce per row of pegs)

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
        run.made++; run.refused++; credit(ledger, kind, bet, true); steps.push('refunded'); continue;
      }
      const playNo = ++ledger.plays; run.made++;
      const ticket = `${playNo}-${fair.newSeed(4)}`;
      open_.set(ticket, { run, kind, bet, secret, commit, playNo });
      plays.push({ ticket, commit, playNo });
    }
    steps.push('locked');
    return { run: run.id, plays };
  }

  // forced: tests only (a slice, a path, or reel stops); the proof then says so.
  async function settle(ticket, playerSeed, forced) {
    const t = open_.get(ticket);
    if (!t) throw new Error('unknown or already settled play');
    open_.delete(ticket);
    const K = KINDS[t.kind], refuse = (why, stopped) => { t.run.refused++; credit(ledger, t.kind, t.bet, true); steps.push('refunded'); return why ? { failed: true, why, refunded: t.bet } : { refused: true, stopped: !!stopped, refunded: t.bet }; };
    let r;
    try {
      const nums = await f.numbers(t.secret, playerSeed, t.playNo, NUMS);
      steps.push('drawn');
      const rand = randFrom(nums);
      r = t.kind === 'drop' ? dropPlay(pools.spin, t.bet, rand, forced) : K.game === 'spin' ? spin(pools.spin, t.bet, rand, forced) : pull(pools.slots, t.kind, rand, forced);
    } catch (e) { return refuse(e.message); }
    if (r.paused) { // the pool can't take it: the price comes back (the entry already reached the pool, so it pays it)
      pools[K.game].pool -= t.bet; return refuse(null, r.stopped);
    }
    t.run.played++;
    if (r.pay > 0) credit(ledger, t.kind, r.pay);
    steps.push('revealed');
    return { r, proof: { kind: t.kind, bet: t.bet, commit: t.commit, secret: t.secret, playerSeed, playNo: t.playNo, forced: forced !== undefined } };
  }
  return { buy, settle, steps, pending: () => open_.size };
}

// What a play's numbers must produce, worked out from the numbers alone (anyone can re-run this).
// cfg (optional): the settings the play ran on (settings.js build()); without it, the built-in game.
export function outcomeFrom(kind, nums, cfg = null) {
  const K = KINDS[kind];
  if (kind === 'drop') { // one number per row of pegs: under ½ bounces left, otherwise right; the bin is how many rights
    const path = nums.slice(0, DROP_ROWS).map((x) => (x < 0.5 ? 0 : 1)), bin = path.reduce((a, b) => a + b, 0);
    return { path, bin, mult: DROP_PAYS[bin] };
  }
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
  return { matches, outcome: outcomeFrom(proof.kind, nums, cfg) };
}
