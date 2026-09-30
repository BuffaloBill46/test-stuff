// Santa Hat Spin rules: exact odds, payback, pool invariants. Run: node tests/spin.test.mjs
import { SLICES, SEGMENTS, SLICE_MULT, SPIN_RULES, BETS, MAX_MULT, odds, payback, spin } from '../mockups/spin.js';
import { IN_PER_DOLLAR } from '../mockups/slots.js';
import { rng } from './rng.mjs';

const fail = (m) => { console.error('FAIL:', m); process.exit(1); };
const rand = rng(777);

// The decided odds, exactly (slices out of 400).
const want = { 0: 202, 1: 132, 2: 40, 3: 20, 4: 4, 5: 2 }, o = odds();
for (const [m, n] of Object.entries(want)) if (Math.round(o[m] * SLICES) !== n) fail(`${m}× has ${o[m] * SLICES} slices, should be ${n}`);
if (Math.abs(payback() - 0.745) > 1e-12) fail(`payback ${payback()} should be 74.5%`);
SEGMENTS.forEach((s, i) => { if (s[0] === SEGMENTS[(i + 1) % SEGMENTS.length][0]) fail(`segments ${i} and ${i + 1} are the same result side by side`); });
SEGMENTS.filter(([m]) => m >= 4).forEach(([m, n]) => { if (n !== 1) fail(`the ${m}× should be a single thin sliver`); });

// Every slice is equally likely: 2 million spins, each result within a whisker of its odds.
{
  const st = { pool: 1e12, rules: { skimAt: Infinity } }, count = {}, N = 2_000_000; let back = 0;
  for (let i = 0; i < N; i++) { const r = spin(st, 1, rand); count[r.mult] = (count[r.mult] || 0) + 1; back += r.pay; }
  for (const [m, n] of Object.entries(want)) { const got = (count[m] || 0) / N, exp = n / SLICES; if (Math.abs(got - exp) > 4 * Math.sqrt(exp * (1 - exp) / N) + 1e-4) fail(`${m}×: ${got} vs ${exp}`); }
  console.log(`2,000,000 spins: payback ${(back / N * 100).toFixed(2)}% (exact 74.50%); ` + Object.keys(want).map((m) => `${m}× ${((count[m] || 0) / N * 100).toFixed(2)}%`).join(', '));
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
console.log(`OK: ${SEGMENTS.length} segments on a ${SLICES}-slice wheel, exact odds, pool invariants (bets ${BETS.join(' / ')}, biggest prize ${MAX_MULT}×)`);
