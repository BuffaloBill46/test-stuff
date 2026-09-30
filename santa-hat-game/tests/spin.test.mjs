// Santa Hat Spin rules: two wheels (main 40 + bonus 12, Cody's option A), exact odds, payback, pool invariants.
// Run: node tests/spin.test.mjs
import { MAIN, BONUS, MAIN_SLICES, BONUS_SLICES, STAR, SPIN_RULES, BETS, MAX_MULT, odds, payback, spin, layout } from '../mockups/spin.js';
import { IN_PER_DOLLAR } from '../mockups/slots.js';
import { rng } from './rng.mjs';

const fail = (m) => { console.error('FAIL:', m); process.exit(1); };
const rand = rng(777);
const count = (list, m) => list.filter((x) => x === m).length;

// The decided wheels, exactly: every segment the same size, so the counts ARE the odds.
if (MAIN.length !== MAIN_SLICES || BONUS.length !== BONUS_SLICES) fail('wheel sizes');
for (const [m, n] of [[0, 21], [1, 12], [2, 4], [STAR, 3]]) if (count(MAIN, m) !== n) fail(`main wheel: ${m} should have ${n} segments`);
for (const [m, n] of [[3, 9], [4, 2], [5, 1]]) if (count(BONUS, m) !== n) fail(`bonus wheel: ${m}× should have ${n} segments`);
// exact chances (in 480ths: 40 main segments × 12 bonus segments)
const want = { 0: 252, 1: 144, 2: 48, 3: 27, 4: 6, 5: 3 }, o = odds();
for (const [m, n] of Object.entries(want)) if (Math.abs(o[m] * 480 - n) > 1e-9) fail(`${m}×: ${o[m] * 480}/480, should be ${n}/480`);
if (Math.abs(payback() - 0.75) > 1e-12) fail(`payback ${payback()} should be 75.0%`);
if (MAX_MULT !== 5) fail('top prize 5×');
// stars spread out (never side by side, and not bunched)
const starAt = MAIN.map((m, i) => (m === STAR ? i : -1)).filter((i) => i >= 0);
starAt.forEach((a, k) => { const gap = (starAt[(k + 1) % starAt.length] - a + MAIN_SLICES) % MAIN_SLICES; if (gap < 10) fail(`stars bunched: ${starAt}`); });
// the layout ignores the order the counts are listed in (a database may reorder keys)
if (layout({ 0: 21, 1: 12, 2: 4, star: 3 }, 40).join() !== layout({ star: 3, 2: 4, 1: 12, 0: 21 }, 40).join()) fail('layout depends on key order');

// Every path, fed in: main segment i (and bonus segment j on a star) gives exactly the segment's result.
{
  const st = { pool: 1e9, prepaid: true };
  for (let i = 0; i < MAIN_SLICES; i++) for (let j = 0; j < BONUS_SLICES; j++) {
    const nums = [(i + 0.5) / MAIN_SLICES, (j + 0.5) / BONUS_SLICES]; let k = 0;
    const r = spin(st, 1, () => nums[k++]);
    if (r.slice !== i) fail('main segment');
    if (MAIN[i] === STAR) { if (r.bonusSlice !== j || r.mult !== BONUS[j]) fail('bonus segment'); } else if (r.bonusSlice !== undefined || r.mult !== MAIN[i]) fail('no bonus without a star');
  }
}
// Fair random numbers: 2 million spins, each result within a whisker of its odds.
{
  const st = { pool: 1e12, rules: { skimAt: Infinity } }, seen = {}, N = 2_000_000; let back = 0;
  for (let i = 0; i < N; i++) { const r = spin(st, 1, rand); seen[r.mult] = (seen[r.mult] || 0) + 1; back += r.pay; }
  for (const [m, n] of Object.entries(want)) { const got = (seen[m] || 0) / N, exp = n / 480; if (Math.abs(got - exp) > 4 * Math.sqrt(exp * (1 - exp) / N) + 1e-4) fail(`${m}×: ${got} vs ${exp}`); }
  console.log(`2,000,000 spins: payback ${(back / N * 100).toFixed(2)}% (exact 75.00%); ` + Object.keys(want).map((m) => `${m}× ${((seen[m] || 0) / N * 100).toFixed(2)}%`).join(', '));
}

// Pool over time (mixed 10¢ / $1 spins): never negative, skims $25 at $175, never locks, never pays past the pool.
{
  let skims = 0, tops = 0, refused = 0, low = Infinity, treasury = 0;
  for (let run = 0; run < 300; run++) {
    const st = { pool: SPIN_RULES.start, treasury: 0 };
    for (let i = 0; i < 20000; i++) {
      const bet = rand() < 0.4 ? 1 : 0.10, before = st.pool, r = spin(st, bet, rand);
      if (r.paused) { refused++; continue; }
      if (r.pay > before + bet * IN_PER_DOLLAR + (r.topOff || 0) + 1e-9) fail('paid more than the pool held');
      if (st.pool < -1e-9) fail('pool went negative');
      if (st.pool >= SPIN_RULES.skimAt) fail('pool should never sit at or above the skim point');
      if (r.skim) skims++; if (r.topOff) tops++; low = Math.min(low, st.pool);
      if (Math.abs(r.received - r.pay * 0.97) > 1e-9) fail('winner receives the pay minus 3%');
    }
    treasury += st.treasury;
  }
  if (refused) fail(`${refused} spins refused`);
  console.log(`Spin pool, 300 runs × 20,000 spins from $${SPIN_RULES.start}: ${skims} skims of $${SPIN_RULES.skim}, ${tops} top-offs, lowest $${low.toFixed(2)}, 0 refused; treasury about $${(treasury / 300).toFixed(0)} per 20,000 spins`);
}

// Top-off and emergency stop.
{
  const st = { pool: 3, treasury: 0 }, r = spin(st, 1, rand);
  if (r.paused || !r.topOff) fail('a nearly empty pool should be topped off before the spin, then play');
  const st2 = { pool: 3, treasury: 0, rules: { paused: true } }, r2 = spin(st2, 1, rand);
  if (!r2.paused || st2.pool !== 3 || st2.treasury !== 0) fail('paused: no spin and no top-off');
  const st3 = { pool: 100 }; let bad = false; try { spin(st3, 0.5, rand); } catch { bad = true; } if (!bad) fail('only $0.10 and $1.00 spins allowed');
  console.log('Top-off, emergency stop and bet sizes: OK');
}
console.log(`OK: main wheel ${MAIN_SLICES} + bonus wheel ${BONUS_SLICES} equal segments, exact odds (every path), pool invariants (bets ${BETS.join(' / ')}, biggest prize ${MAX_MULT}×)`);
