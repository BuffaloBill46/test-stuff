// Runs (buy 1 to 100 plays that play straight away) + fair results + claiming: every rule as an assertion.
// Cody, 2026-10-01: no stored credits; when a run's last play is done, its winnings are sent automatically.
import assert from 'node:assert/strict';
import { KINDS, SIZES, RUN_SIZES, MAX_RUN, newLedger, buyRun, audit, costOf } from '../mockups/credits.js';
import { createHouse, check, outcomeFrom, NUMS } from '../mockups/house.js';
import { numbers, newSeed, fingerprint } from '../mockups/fair.js';
import { IN_PER_DOLLAR, POOL_RULES, canPull, pull } from '../mockups/slots.js';
import { SPIN_RULES, canSpin, spin, payback } from '../mockups/spin.js';

const fresh = () => ({ ledger: newLedger(), pools: { spin: { pool: SPIN_RULES.start, prepaid: true }, slots: { pool: POOL_RULES.start, prepaid: true } } });
const close = (a, b) => Math.abs(a - b) < 1e-6;

// 1. Buying: 1 to 100 plays (was only 1, 5 or 10 until Cody's custom box, 2026-10-01), only real games and sizes, each payment once; the money lands in that game's pool only.
{
  const { ledger, pools } = fresh();
  for (const n of [0, 101, 2.5, -1, NaN]) assert.equal(buyRun(ledger, pools, 'spin', 0.1, n, 'p' + n).ok, false, `bought ${n}`);
  assert.equal(buyRun(ledger, pools, 'nope', 1, 1, 'px').ok, false);
  assert.equal(buyRun(ledger, pools, 'spin', 0.37, 5, 'py').why, 'unknown size');
  assert.equal(buyRun(ledger, pools, 'big', 0.1, 5, 'pz').why, 'unknown size', 'Big Hat is $1 a pull only');
  const s0 = pools.spin.pool, l0 = pools.slots.pool;
  assert.ok(buyRun(ledger, pools, 'spin', 1, 5, 'pay1').ok); // five $1 spins
  assert.ok(close(pools.spin.pool - s0, 5 * IN_PER_DOLLAR) && pools.slots.pool === l0, 'Spin money pays only the Spin pool');
  assert.equal(buyRun(ledger, pools, 'big', 1, 5, 'pay1').ok, false, 'a payment buys one run, once');
  assert.ok(buyRun(ledger, pools, 'drop', 0.1, 10, 'pay2').ok);
  assert.ok(close(pools.spin.pool - s0, 6 * IN_PER_DOLLAR), 'Snowball Drop pays the Spin pool too');
  assert.ok(buyRun(ledger, pools, 'big', 1, 10, 'pay3').ok);
  assert.ok(close(pools.slots.pool - l0, 10 * IN_PER_DOLLAR), 'Big Hat pays the Slots pool');
  assert.deepEqual(RUN_SIZES, [1, 5, 10]); assert.equal(costOf(10, 0.1), 1); assert.equal(costOf(5, 1), 5);
  // any run from 1 to 100 (Cody: the custom box; database 014 has the same limit), nothing else
  assert.equal(MAX_RUN, 100);
  assert.ok(buyRun(ledger, pools, 'drop', 0.1, 100, 'pay4').ok && buyRun(ledger, pools, 'big', 1, 37, 'pay5').ok, '100 and 37 plays are fine');
  for (const n of [0, 101, 2.5, -1, '10', NaN]) assert.equal(buyRun(ledger, pools, 'drop', 0.1, n, 'bad' + n).ok, false, `a run of ${n} is refused`);
  assert.equal(costOf(100, 1), 100); assert.equal(costOf(37, 0.1), 3.7);
  assert.deepEqual(audit(ledger), []);
}

// 2. The ORDER, for a whole run: payment first, then a secret locked for each play, then each play drawn and revealed.
//    Nothing is left over afterwards (no stored credit), and every result re-checks.
let plays = 0, checked = 0;
for (let session = 0; session < 40; session++) {
  const { ledger, pools } = fresh(); const house = createHouse(ledger, pools);
  for (let k = 0; k < 6; k++) {
    const kind = Object.keys(KINDS)[Math.floor(Math.random() * 3)], bet = SIZES[kind][Math.floor(Math.random() * SIZES[kind].length)];
    const n = Math.random() < 0.7 ? RUN_SIZES[Math.floor(Math.random() * 3)] : 1 + Math.floor(Math.random() * MAX_RUN), g = KINDS[kind].game; // the buttons, or any size
    const before = house.steps.length, sent0 = ledger.sent[g];
    const b = await house.buy(kind, bet, n, newSeed(8));
    assert.equal(b.plays.length, n, 'one locked play per play bought');
    assert.deepEqual(house.steps.slice(before), ['paid', 'locked'], 'payment confirmed BEFORE any secret is made');
    for (const p of b.plays) assert.match(p.commit, /^[0-9a-f]{64}$/);
    let won = 0;
    for (const [i, p] of b.plays.entries()) {
      const pool0 = pools[g].pool, s = await house.settle(p.ticket, newSeed(16));
      assert.ok(s.r, JSON.stringify(s)); won += s.r.pay;
      if (i < n - 1) assert.equal(s.sent, undefined, 'nothing is sent before the run\'s last play');
      else assert.ok(close(s.sent, won), 'the last play sends the whole run\'s winnings, once');
      // prepaid: the play itself adds nothing; the pool only pays out (plus any skim / top-off)
      assert.ok(close(pools[g].pool, pool0 - s.r.pay - (s.r.skim || 0) + (s.r.topOff || 0)), 'the pool moves by exactly the prize');
      const c = await check(s.proof); assert.ok(c.matches, 'secret matches the fingerprint shown before the play');
      if (kind === 'drop') assert.deepEqual([c.outcome.path, c.outcome.mult], [s.r.path, s.r.mult]);
      else if (g === 'spin') assert.deepEqual([c.outcome.slice, c.outcome.bonusSlice, c.outcome.mult], [s.r.slice, s.r.bonusSlice, s.r.mult]);
      else if (s.r.jackpot) assert.ok(c.outcome.jackpot); else assert.deepEqual(c.outcome.stops, s.r.stops);
      checked++; plays++;
    }
    assert.deepEqual(house.steps.slice(before + 2).filter((x, i) => i % 2 === 0), Array(n).fill('drawn'));
    assert.ok(close(ledger.sent[g], sent0 + won), 'every prize of the run was sent');
    assert.equal(house.pending(), 0, 'nothing left over: the run is fully played');
    assert.deepEqual(audit(ledger), []);
  }
}

// 3. A play the pool refuses after payment (emergency stop, or the pool refilling): its price goes back with the run's winnings.
{
  const { ledger, pools } = fresh(); const house = createHouse(ledger, pools);
  const b = await house.buy('spin', 1, 5, 'r1');
  const first = await house.settle(b.plays[0].ticket, 'x');
  pools.spin.rules = { paused: true };
  const pool0 = pools.spin.pool; let last;
  for (const p of b.plays.slice(1)) { last = await house.settle(p.ticket, 'x'); assert.deepEqual([last.refused, last.stopped, last.refunded], [true, true, 1]); }
  assert.ok(close(last.sent, first.r.pay + 4), 'the run sends its winnings + the 4 refused $1 spins');
  assert.ok(close(pools.spin.pool, pool0 - 4), '...paid from the pool their entries went into');
  assert.equal(ledger.runs[b.run].played, 1); assert.equal(ledger.runs[b.run].refused, 4);
  assert.deepEqual(audit(ledger), []);
}

// 4. canSpin / canPull say exactly what spin / pull would do (the server checks before taking a payment).
{
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 20000; i++) {
    const paused = r() < 0.05;
    const sp = { pool: r() * 60, rules: { paused } }, sl = { pool: r() * 400, rules: { paused } };
    const bet = r() < 0.5 ? 0.1 : 1;
    assert.equal(canSpin(sp, bet).ok, !spin(structuredClone(sp), bet, r).paused, `canSpin at pool ${sp.pool}`);
    assert.equal(canPull(sl, 'big').ok, !pull(structuredClone(sl), 'big', r).paused, `canPull at pool ${sl.pool}`);
  }
}

// 5. Tampering is caught; the player's number changes the result; a play settles once.
{
  const { ledger, pools } = fresh(); const house = createHouse(ledger, pools);
  const b = await house.buy('spin', 1, 1, 'a'); const { proof } = await house.settle(b.plays[0].ticket, 'abcd');
  assert.equal((await check({ ...proof, secret: newSeed() })).matches, false, 'a swapped secret fails the check');
  const x = await numbers(proof.secret, 'abcd', 1, NUMS), y = await numbers(proof.secret, 'abce', 1, NUMS);
  assert.notDeepEqual(x, y);
  await assert.rejects(() => house.settle(b.plays[0].ticket, 'abcd'), /already settled/, 'a play settles once');
}

// 6. The fair numbers are really uniform: the wheels pay back their exact 80% when driven by them.
{
  const secret = newSeed(); let paid = 0, N = 40000; const hits = new Array(40).fill(0), bonusHits = new Array(12).fill(0);
  for (let i = 0; i < N; i++) { const xs = await numbers(secret, 'seed', i, 2); const o = outcomeFrom('spin', xs); paid += o.mult; hits[o.slice]++; if (o.bonusSlice !== undefined) bonusHits[o.bonusSlice]++; }
  const pb = paid / N; assert.ok(Math.abs(pb - payback()) < 0.02, `payback from fair numbers ${pb}`);
  assert.ok(Math.min(...hits) > 800 && Math.max(...hits) < 1200, 'every main segment turns up about equally');
  assert.ok(Math.min(...bonusHits) > 150 && Math.max(...bonusHits) < 350, 'every bonus segment turns up about equally: ' + bonusHits);
  console.log(`fair numbers: ${N.toLocaleString()} spins pay back ${(pb * 100).toFixed(2)}% (exact ${(payback() * 100).toFixed(2)}%)`);
}

// 7. Something breaks (e.g. hashing unavailable): that play's price is sent back; the books still balance.
{
  const { ledger, pools } = fresh();
  const boom = () => { throw new Error('no hashing'); };
  const h1 = createHouse(ledger, pools, { newSeed, fingerprint: boom, numbers });
  const b1 = await h1.buy('big', 1, 5, 'a');
  assert.equal(b1.plays.length, 0); assert.equal(b1.sent, 5, 'all 5 prices sent back at once when no secret could be made');
  const h2 = createHouse(ledger, pools, { newSeed, fingerprint, numbers: boom });
  const b2 = await h2.buy('big', 1, 1, 'b'); const s2 = await h2.settle(b2.plays[0].ticket, 'x');
  assert.equal(s2.failed, true); assert.equal(s2.sent, 1, 'price sent back when the numbers could not be drawn');
  assert.deepEqual(audit(ledger), []);
  console.log('failures mid-run give the price back: OK');
}
console.log(`OK: ${plays} plays in runs of 1 to 100, in Cody's order (paid → secrets locked → drawn → revealed), ${checked} re-checked; each run sent once at its end; refunds and books balanced`);
