// Snowball Drop: board 3 (Cody, 2026-10-02, one shared Game pool): board 2's 17 presents and exact odds, but the 100× centre is
// now the POOL JACKPOT (25% of the pool at that moment × the drop's size). Fixed prizes pay back exactly 76.0%, the jackpot adds
// 1 in 5,000 × 25% × the pool. A drop lands where its numbers say, every path to a present is equally likely, presents are
// drawn similar sizes, and drops played on board 1 (8 rows, 50/50 bounces) and board 2 (100× centre) still re-check as played.
import assert from 'node:assert/strict';
import { ROWS, BINS, PAYS, PAYS2, WAYS, TOTAL, WIDTHS, JACKPOT_BIN, odds, payback, paybackAt, realWin, jackpotOdds, drop, play, canPlay, binOf, pathTo, outcome, OLD, BOARD, MAX_MULT, MAX_MULT_BOARD } from '../mockups/plinko.js';

assert.equal(BOARD, 3); assert.equal(ROWS, 16); assert.equal(BINS, 17); assert.equal(JACKPOT_BIN, 8, 'the centre present');
assert.deepEqual(PAYS2, [25, 0, 10, 0, 5, 0, 2, 0, 100, 0, 2, 0, 5, 0, 10, 0, 25], "board 2: Cody's sketch, edges to middle");
assert.deepEqual(PAYS, [25, 0, 10, 0, 5, 0, 2, 0, 0, 0, 2, 0, 5, 0, 10, 0, 25], 'board 3: the same, the centre is the jackpot (no fixed prize)');
assert.deepEqual(PAYS, [...PAYS].reverse(), 'prizes are mirror-image'); assert.deepEqual(WAYS, [...WAYS].reverse(), 'odds are mirror-image');
assert.equal(WAYS.reduce((a, b) => a + b, 0), TOTAL, 'the table adds up to exactly 1,000,000');
assert.ok(WAYS.every((w) => Number.isInteger(w) && w > 0), 'whole numbers, every present reachable');
assert.equal(PAYS2.reduce((a, p, k) => a + p * WAYS[k], 0) / TOTAL, 0.78, 'board 2 paid back exactly 78.0%');
assert.equal(payback(), 0.76, 'board 3 fixed prizes pay back exactly 76.0%');
assert.equal(jackpotOdds(), 1 / 5000, 'the pool jackpot: 1 in 5,000 (same chance, same place as the old 100×)');
assert.equal(MAX_MULT, 25, 'biggest FIXED prize 25×'); assert.deepEqual(MAX_MULT_BOARD, { 1: 10, 2: 100, 3: 25 });
// payback with the jackpot: fixed + 1/5,000 × 25% × pool, at the pool's start, top-off point and skim point
for (const [pool, want] of [[200, 0.77], [500, 0.785], [1025, 0.81125]]) assert.ok(Math.abs(paybackAt(pool) - want) < 1e-12, `payback at a $${pool} pool = ${want}`);
assert.equal(odds(0) + odds(16), 0.004, '25× 1 in 250'); assert.equal(odds(2) + odds(14), 0.012, '10× 1 in 83.3');
assert.equal(odds(4) + odds(12), 0.04, '5× 1 in 25'); assert.equal(odds(6) + odds(10), 0.17, '2× 1 in 5.9');
assert.ok(Math.abs(realWin() - 0.2262) < 1e-9, 'more back than paid (the jackpot always is): 1 in 4.4');
// presents: rarer = a little narrower, never a sliver (Cody: "sized similar but with visible size difference")
const wOf = (m) => WIDTHS[PAYS2.indexOf(m)];
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
  assert.deepEqual([r.bin, r.path, r.board], [o.bin, o.path, 3], 'drop = outcome of its numbers'); assert.equal(i, 17, 'uses exactly 17 numbers'); }
// board 1 re-checks unchanged: one 50/50 bounce per row, 8 rows, its own prizes
{ const nums = [0.1, 0.9, 0.7, 0.2, 0.6, 0.3, 0.8, 0.4, 0.5]; const o = outcome(nums, 1);
  assert.deepEqual(o, { path: [0, 1, 1, 0, 1, 0, 1, 0], bin: 4, mult: OLD.PAYS[4], board: 1 }, 'board 1: same result as before'); }
// board 2 re-checks as played: the same numbers land in the same present; its centre still says 100×, board 3's says jackpot
{ const centre = Array.from({ length: 17 }, (_, k) => (k === 0 ? (WAYS.slice(0, 8).reduce((a, b) => a + b, 0) + 10) / TOTAL : r01()));
  const o2 = outcome(centre, 2), o3 = outcome(centre, 3);
  assert.deepEqual([o2.bin, o2.mult, o2.board, o2.jackpot], [8, 100, 2, undefined], 'board 2: the centre was 100×');
  assert.deepEqual([o3.bin, o3.jackpot, o3.board, o3.mult], [8, true, 3, undefined], 'board 3: the centre is the pool jackpot');
  assert.deepEqual(o2.path, o3.path, 'same numbers, same path');
  const edge = [0.5 / TOTAL, ...centre.slice(1)]; assert.deepEqual([outcome(edge, 2).mult, outcome(edge, 3).mult], [25, 25], 'every other present unchanged'); }
// THE POOL JACKPOT, forced (8 rights = the centre): pays exactly 25% × the pool at that moment × (bet ÷ $1); the pool keeps the rest
for (const [pool, bet] of [[200, 1], [500, 1], [500, 0.1], [1024, 1], [777.77, 0.1]]) {
  const st = { pool, prepaid: true }, r = play(st, bet, Math.random, [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.ok(r.jackpot && r.bin === 8 && r.board === 3, 'the centre is the jackpot');
  assert.equal(r.pay, 0.25 * pool * bet, `$${pool} pool, ${bet} drop: pays 25% × pool × bet exactly`);
  assert.equal(r.jackpotPool, pool, 'records the pool at that moment'); assert.equal(r.pct, 0.25, 'and the %');
  assert.ok(Math.abs(st.pool - (pool - r.pay - (r.skim || 0) + (r.topOff || 0))) < 1e-9, 'the pool pays exactly that'); assert.ok(st.pool >= 0, 'never negative');
}
{ const st = { pool: 500, prepaid: true, rules: { jackpotPct: 0.1 } }, r = play(st, 1, Math.random, [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], 0.25);
  assert.equal(r.pay, 50, "Cody's pool rule jackpotPct overrides the settings' %, like Big Hat's"); assert.equal(r.pct, 0.1); }
// forced loss (a coal present) and a forced fixed win
{ const st = { pool: 500, prepaid: true }, lose = play(st, 1, Math.random, [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([lose.bin, lose.mult, lose.pay, lose.ahead, !!lose.jackpot], [1, 0, 0, false, false], 'a forced loss pays nothing');
  const win = play(st, 1, Math.random, Array(16).fill(0)); assert.deepEqual([win.bin, win.mult, win.pay], [0, 25, 25], 'a forced 25× pays $25'); }
// the cover rule: a drop starts only if the pool, counting Cody's backing up to topOffTo (slots.js covers; Cody 2026-10-05: "let the
// games play"), covers the biggest FIXED prize (25×); the jackpot is a share, always payable
assert.equal(canPlay({ pool: 24.99, rules: { topOffBelow: 0, topOffTo: 0 } }, 1).ok, false, 'with no backing, a $1 drop needs $25 (25×) in the pool');
assert.equal(canPlay({ pool: 25, rules: { topOffBelow: 0, topOffTo: 0 } }, 1).ok, true);
assert.equal(canPlay({ pool: 5 }, 1).ok, true, "Cody's rules: his $125 backing covers it, so the game plays");
// a long run with real random numbers stays close to the payback at that pool (the pool kept at $500 for the test)
let paid = 0; const N = 400_000; for (let i = 0; i < N; i++) paid += play({ pool: 500, prepaid: true }, 1).pay;
assert.ok(Math.abs(paid / N - paybackAt(500)) < 0.03, `400k drops paid back ${(paid / N * 100).toFixed(2)}% (exact at a $500 pool ${(paybackAt(500) * 100).toFixed(2)}%)`);
assert.throws(() => drop(0.37), /unknown bet/);
console.log(`OK: Snowball Drop board 3: exact table (all 1,000,000 slots), fixed prizes ${(payback() * 100).toFixed(1)}% + the pool jackpot 1 in ${1 / jackpotOdds()} = ${[200, 500, 1025].map((p) => `${(paybackAt(p) * 100).toFixed(2)}% at $${p}`).join(', ')}; jackpot = 25% × pool × bet exactly; win 1 in ${(1 / realWin()).toFixed(1)}; paths end in their present and are equally likely; similar sizes; boards 1 and 2 re-check as played`);

// SHARED POOL (Cody, 2026-10-02): Snowball Drop and Stocking Stuffer pay from and into one Game pool (it mixed in the Spin
// until that game was removed, 2026-10-04). 300 runs × 20,000 plays, a mix of both games at 10¢ and $1. Asserted on every play: never negative, never pays past what the pool holds, never sits at
// or above the skim point; counted: refusals, skims, top-offs.
{
  const { play: stockPlay } = await import('../mockups/stocking.js');
  const { play } = await import('../mockups/plinko.js');
  const { IN_PER_DOLLAR, POOL_RULES: SPIN_RULES } = await import('../mockups/slots.js'); // the Game pool's rules (key 'spin')
  const { rng } = await import('./rng.mjs');
  const rand = rng(4242);
  for (const dropShare of [0.5, 0.8]) {
    let skims = 0, tops = 0, refused = 0, low = Infinity, treasury = 0, drops = 0, turns = 0;
    for (let run = 0; run < 300; run++) {
      const st = { pool: SPIN_RULES.start, treasury: 0 };
      for (let i = 0; i < 20000; i++) {
        const bet = rand() < 0.4 ? 1 : 0.1, before = st.pool, isDrop = rand() < dropShare;
        const r = isDrop ? play(st, bet, rand) : stockPlay(st, bet, rand);
        if (r.paused) { refused++; continue; }
        isDrop ? drops++ : turns++;
        assert.ok(r.pay <= before + bet * IN_PER_DOLLAR + (r.topOff || 0) + 1e-9, 'paid more than the pool held');
        assert.ok(st.pool > -1e-9, 'pool went negative');
        assert.ok(st.pool < SPIN_RULES.skimAt, 'pool sits at or above the skim point');
        if (r.skim) skims++; if (r.topOff) tops++; low = Math.min(low, st.pool);
      }
      treasury += st.treasury;
    }
    assert.equal(refused, 0, 'no play refused');
    console.log(`shared Game pool, ${Math.round(dropShare * 100)}% drops: ${drops.toLocaleString()} drops + ${turns.toLocaleString()} Stocking turns; ${skims} skims, ${tops} top-offs, lowest $${low.toFixed(2)}, 0 refused; treasury about $${(treasury / 300).toFixed(0)} per 20,000 plays`);
  }
  // emergency stop covers drops too
  const st = { pool: 3, treasury: 0, rules: { paused: true } }, r = play(st, 1, rand);
  assert.ok(r.paused && st.pool === 3, 'a stopped Game pool stops Snowball Drop too (and does not top off)');
}
console.log('OK: Snowball Drop and Stocking Stuffer share the Game pool safely');
