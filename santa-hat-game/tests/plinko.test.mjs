// Snowball Drop: board 2 (Cody, 2026-10-02: 17 presents, 100× centre, mix B): the odds table is exact and pays back 78.0%,
// a drop lands where its numbers say, every path to a present is equally likely, presents are drawn similar sizes, and drops
// played on board 1 (8 rows, 50/50 bounces) still re-check exactly as before.
import assert from 'node:assert/strict';
import { ROWS, BINS, PAYS, WAYS, TOTAL, WIDTHS, odds, payback, realWin, jackpotOdds, drop, binOf, pathTo, outcome, OLD, BOARD } from '../mockups/plinko.js';

assert.equal(BOARD, 2); assert.equal(ROWS, 16); assert.equal(BINS, 17);
assert.deepEqual(PAYS, [25, 0, 10, 0, 5, 0, 2, 0, 100, 0, 2, 0, 5, 0, 10, 0, 25], "Cody's sketch, edges to middle");
assert.deepEqual(PAYS, [...PAYS].reverse(), 'prizes are mirror-image'); assert.deepEqual(WAYS, [...WAYS].reverse(), 'odds are mirror-image');
assert.equal(WAYS.reduce((a, b) => a + b, 0), TOTAL, 'the table adds up to exactly 1,000,000');
assert.ok(WAYS.every((w) => Number.isInteger(w) && w > 0), 'whole numbers, every present reachable');
assert.equal(payback(), 0.78, 'pays back exactly 78.0%');
assert.equal(jackpotOdds(), 1 / 5000, '100× 1 in 5,000');
assert.equal(odds(0) + odds(16), 0.004, '25× 1 in 250'); assert.equal(odds(2) + odds(14), 0.012, '10× 1 in 83.3');
assert.equal(odds(4) + odds(12), 0.04, '5× 1 in 25'); assert.equal(odds(6) + odds(10), 0.17, '2× 1 in 5.9');
assert.ok(Math.abs(realWin() - 0.2262) < 1e-9, 'more back than paid: 1 in 4.4');
// presents: rarer = a little narrower, never a sliver (Cody: "sized similar but with visible size difference")
const wOf = (m) => WIDTHS[PAYS.indexOf(m)];
assert.ok(wOf(0) > wOf(2) && wOf(2) > wOf(5) && wOf(5) > wOf(10) && wOf(10) > wOf(25) && wOf(25) > wOf(100), 'rarer presents are narrower');
assert.ok(Math.max(...WIDTHS) / Math.min(...WIDTHS) < 1.5, 'widest ÷ narrowest under 1.5: similar sizes');
// every value of the first number picks the right present: walk all 1,000,000 table slots
const seen = Array(BINS).fill(0); for (let x = 0; x < TOTAL; x++) seen[binOf((x + 0.5) / TOTAL)]++;
assert.deepEqual(seen, WAYS, 'all 1,000,000 table slots, counted by present');
// paths: always end in their present; every path to a present equally likely (chi-square over all C(16,k) paths for k = 2)
let rs = 1; const r01 = () => ((rs = (rs * 48271) % 2147483647) / 2147483647);
for (let k = 0; k < BINS; k++) for (let n = 0; n < 200; n++) { const p = pathTo(k, Array.from({ length: ROWS }, r01)); assert.equal(p.length, ROWS); assert.equal(p.reduce((a, b) => a + b, 0), k, 'the path ends in its present'); }
{ const counts = new Map(), N = 120 * 400; for (let n = 0; n < N; n++) { const key = pathTo(2, Array.from({ length: ROWS }, r01)).join(''); counts.set(key, (counts.get(key) || 0) + 1); }
  assert.equal(counts.size, 120, 'all 120 paths to present 3 appear'); const e = N / 120, chi = [...counts.values()].reduce((a, c) => a + (c - e) ** 2 / e, 0);
  assert.ok(chi < 175, `paths equally likely (chi-square ${chi.toFixed(0)} for 119 degrees of freedom)`); }
// a drop = the first number picks, the next 16 draw the path (what "Check this result" re-runs)
{ const nums = Array.from({ length: 17 }, r01); let i = 0; const r = drop(1, () => nums[i++]); const o = outcome(nums);
  assert.deepEqual([r.bin, r.path, r.mult, r.board], [o.bin, o.path, o.mult, 2], 'drop = outcome of its numbers'); assert.equal(i, 17, 'uses exactly 17 numbers'); }
// board 1 re-checks unchanged: one 50/50 bounce per row, 8 rows, its own prizes
{ const nums = [0.1, 0.9, 0.7, 0.2, 0.6, 0.3, 0.8, 0.4, 0.5]; const o = outcome(nums, 1);
  assert.deepEqual(o, { path: [0, 1, 1, 0, 1, 0, 1, 0], bin: 4, mult: OLD.PAYS[4], board: 1 }, 'board 1: same result as before'); }
// a long run with real random numbers stays close to 78%
let paid = 0; const N = 400_000; for (let i = 0; i < N; i++) paid += drop(1).pay;
assert.ok(Math.abs(paid / N - payback()) < 0.03, `400k drops paid back ${(paid / N * 100).toFixed(2)}%`);
assert.throws(() => drop(0.37), /unknown bet/);
console.log(`OK: Snowball Drop board 2: exact table (all 1,000,000 slots), pays back ${(payback() * 100).toFixed(1)}%, 100× 1 in ${1 / jackpotOdds()}, win 1 in ${(1 / realWin()).toFixed(1)}, paths end in their present and are equally likely, similar sizes, board 1 re-checks unchanged`);

// SHARED POOL (Cody, 2026-09-30): Spin and Snowball Drop pay from and into one Spin pool. 300 runs × 20,000 plays, a mix of
// both games at 10¢ and $1. Asserted on every play: never negative, never pays past what the pool holds, never sits at
// or above the skim point; counted: refusals, skims, top-offs.
{
  const { spin, SPIN_RULES } = await import('../mockups/spin.js');
  const { play } = await import('../mockups/plinko.js');
  const { IN_PER_DOLLAR } = await import('../mockups/slots.js');
  const { rng } = await import('./rng.mjs');
  const rand = rng(4242);
  for (const dropShare of [0.5, 0.8]) {
    let skims = 0, tops = 0, refused = 0, low = Infinity, treasury = 0, drops = 0, spins = 0;
    for (let run = 0; run < 300; run++) {
      const st = { pool: SPIN_RULES.start, treasury: 0 };
      for (let i = 0; i < 20000; i++) {
        const bet = rand() < 0.4 ? 1 : 0.1, before = st.pool, isDrop = rand() < dropShare;
        const r = isDrop ? play(st, bet, rand) : spin(st, bet, rand);
        if (r.paused) { refused++; continue; }
        isDrop ? drops++ : spins++;
        assert.ok(r.pay <= before + bet * IN_PER_DOLLAR + (r.topOff || 0) + 1e-9, 'paid more than the pool held');
        assert.ok(st.pool > -1e-9, 'pool went negative');
        assert.ok(st.pool < SPIN_RULES.skimAt, 'pool sits at or above the skim point');
        if (r.skim) skims++; if (r.topOff) tops++; low = Math.min(low, st.pool);
      }
      treasury += st.treasury;
    }
    assert.equal(refused, 0, 'no play refused');
    console.log(`shared Spin pool, ${Math.round(dropShare * 100)}% drops: ${drops.toLocaleString()} drops + ${spins.toLocaleString()} spins; ${skims} skims, ${tops} top-offs, lowest $${low.toFixed(2)}, 0 refused; treasury about $${(treasury / 300).toFixed(0)} per 20,000 plays`);
  }
  // emergency stop covers drops too
  const st = { pool: 3, treasury: 0, rules: { paused: true } }, r = play(st, 1, rand);
  assert.ok(r.paused && st.pool === 3, 'a stopped Spin pool stops Snowball Drop too (and does not top off)');
}
console.log('OK: Snowball Drop shares the Spin pool safely');
