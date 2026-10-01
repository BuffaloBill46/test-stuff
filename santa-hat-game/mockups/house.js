// The house: a stand-in for the game server, running Cody's safety ORDER for every play (DESIGN_NOTES → "Fair results: the order").
//   (payment confirmed → credits added: credits.buy)
//   open():   1. the pool can take the play (a refused play never touches the credit)
//             2. spend one credit
//             3. ONLY NOW make a fresh secret and lock in its fingerprint, which goes to the player
//   settle(): 4. the player's own random number arrives (sent after seeing the fingerprint, so the house can't pick a secret
//                to beat it), the numbers are drawn and the play runs
//             5. the result is paid, THEN the secret is revealed so anyone can check it
// DEMO: this runs in the browser. For real money the same steps run on the server and the secret never reaches the page
// before step 5. `steps` records the order for the tests.
import { KINDS, isSize, spend, refund, unitsFor } from './credits.js';
import { spin, canSpin, STAR, DEFAULT_WHEEL } from './spin.js';
import { pull, canPull, MACHINES } from './slots.js';
import { play as dropPlay, canPlay as canDrop, PAYS as DROP_PAYS, ROWS as DROP_ROWS } from './plinko.js';
import * as fair from './fair.js';
import { randFrom } from './fair.js';

export const NUMS = 8; // numbers drawn per play (Slots uses 6: the jackpot draw + 5 reel stops; Spin 1, or 2 on a bonus star;
                        // Snowball Drop 8: one bounce per row of pegs)

// If anything fails after the credit is spent and before a result exists, the credit goes back (never a lost play).
// `f` swaps the fair functions (tests only, to make them fail).
export function createHouse(ledger, pools, f = fair) {
  const open_ = new Map(), steps = [];
  const can = (K, kind, bet) => (kind === 'drop' ? canDrop(pools.spin, bet) : K.game === 'spin' ? canSpin(pools.spin, bet) : canPull(pools.slots, kind));

  // bet: the play's size, for a balance kind (Spin, Snowball Drop: 10¢ or $1 from the same balance).
  async function open(kind, bet) {
    const K = KINDS[kind];
    if (K.balance) { if (!isSize(kind, bet)) return { failed: true, why: 'unknown size' }; } else bet = K.bet;
    const units = unitsFor(kind, bet);
    const c = can(K, kind, bet);
    if (!c.ok) return { refused: true, stopped: !!c.stopped };
    if (!spend(ledger, kind, units)) return { noCredit: true };
    steps.push('spent');
    let secret, commit;
    try { secret = f.newSeed(); commit = await f.fingerprint(secret); }
    catch (e) { refund(ledger, kind, units); steps.push('refunded'); return { failed: true, why: e.message }; }
    const playNo = ++ledger.plays;
    steps.push('locked');
    const ticket = `${playNo}-${fair.newSeed(4)}`;
    open_.set(ticket, { kind, bet, units, secret, commit, playNo });
    return { ticket, commit, playNo };
  }

  // forced: tests only (a slice or reel stops); the proof then says so.
  async function settle(ticket, playerSeed, forced) {
    const t = open_.get(ticket);
    if (!t) throw new Error('unknown or already settled play');
    open_.delete(ticket);
    const K = KINDS[t.kind];
    let r;
    try {
      const nums = await f.numbers(t.secret, playerSeed, t.playNo, NUMS);
      steps.push('drawn');
      const rand = randFrom(nums);
      r = t.kind === 'drop' ? dropPlay(pools.spin, t.bet, rand, forced) : K.game === 'spin' ? spin(pools.spin, t.bet, rand, forced) : pull(pools.slots, t.kind, rand, forced);
    } catch (e) { refund(ledger, t.kind, t.units); steps.push('refunded'); return { failed: true, why: e.message }; }
    if (r.paused) { refund(ledger, t.kind, t.units); steps.push('refunded'); return { refused: true, stopped: !!r.stopped }; }
    steps.push('revealed');
    return { r, proof: { kind: t.kind, bet: t.bet, commit: t.commit, secret: t.secret, playerSeed, playNo: t.playNo, forced: forced !== undefined } };
  }
  return { open, settle, steps, pending: () => open_.size };
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
