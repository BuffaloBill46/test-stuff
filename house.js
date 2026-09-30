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
import { KINDS, spend, refund } from './credits.js';
import { spin, canSpin, SLICES, SLICE_MULT } from './spin.js';
import { pull, canPull, MACHINES } from './slots.js';
import * as fair from './fair.js';
import { randFrom } from './fair.js';

export const NUMS = 8; // numbers drawn per play (Slots uses 6: the jackpot draw + 5 reel stops; Spin uses 1)

// If anything fails after the credit is spent and before a result exists, the credit goes back (never a lost play).
// `f` swaps the fair functions (tests only, to make them fail).
export function createHouse(ledger, pools, f = fair) {
  const open_ = new Map(), steps = [];
  const can = (K, kind) => (K.game === 'spin' ? canSpin(pools.spin, K.bet) : canPull(pools.slots, kind));

  async function open(kind) {
    const K = KINDS[kind];
    const c = can(K, kind);
    if (!c.ok) return { refused: true, stopped: !!c.stopped };
    if (!spend(ledger, kind)) return { noCredit: true };
    steps.push('spent');
    let secret, commit;
    try { secret = f.newSeed(); commit = await f.fingerprint(secret); }
    catch (e) { refund(ledger, kind); steps.push('refunded'); return { failed: true, why: e.message }; }
    const playNo = ++ledger.plays;
    steps.push('locked');
    const ticket = `${playNo}-${fair.newSeed(4)}`;
    open_.set(ticket, { kind, secret, commit, playNo });
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
      r = K.game === 'spin' ? spin(pools.spin, K.bet, rand, forced) : pull(pools.slots, t.kind, rand, forced);
    } catch (e) { refund(ledger, t.kind); steps.push('refunded'); return { failed: true, why: e.message }; }
    if (r.paused) { refund(ledger, t.kind); steps.push('refunded'); return { refused: true, stopped: !!r.stopped }; }
    steps.push('revealed');
    return { r, proof: { kind: t.kind, commit: t.commit, secret: t.secret, playerSeed, playNo: t.playNo, forced: forced !== undefined } };
  }
  return { open, settle, steps, pending: () => open_.size };
}

// What a play's numbers must produce, worked out from the numbers alone (anyone can re-run this).
// cfg (optional): the settings the play ran on (settings.js build()); without it, the built-in game.
export function outcomeFrom(kind, nums, cfg = null) {
  const K = KINDS[kind];
  if (K.game === 'spin') { const slice = Math.floor(nums[0] * SLICES); return { slice, mult: (cfg?.wheel.sliceMult || SLICE_MULT)[slice] }; }
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
