// Snowball Drop (Plinko preview): the odds are exact, the payback is what the page says, and a drop lands where its path says.
import assert from 'node:assert/strict';
import { ROWS, BINS, PAYS, WAYS, TOTAL, odds, payback, realWin, drop } from '../mockups/plinko.js';

assert.deepEqual(WAYS, [1, 8, 28, 56, 70, 56, 28, 8, 1]);
assert.equal(WAYS.reduce((a, b) => a + b, 0), TOTAL, 'every path lands in exactly one bin');
assert.equal(PAYS.length, BINS);
assert.deepEqual(PAYS, [...PAYS].reverse(), 'prizes are mirror-image');
assert.deepEqual(PAYS, [10, 5, 1, 0.4, 0, 0.4, 1, 5, 10], "Cody's prizes, edges to middle");
assert.ok(Math.abs(payback() - 200.8 / 256) < 1e-12, 'pays back 78.44%');
assert.ok(payback() >= 0.78 && payback() <= 0.80, "inside Cody's 78–80%");
assert.ok(payback() < 0.876 - 0.04, 'the pool keeps at least 4¢ of each $1 (it receives about 87.6¢)');
assert.equal(realWin(), 18 / 256, 'more back than it cost: the 10× and 5× presents, 1 in 14.2');
assert.equal(odds(0) + odds(8), 2 / 256, '10× either edge: 1 in 128');

// Every one of the 256 paths, fed in as the random numbers: each lands in the bin its rights count says, exactly WAYS times.
const seen = Array(BINS).fill(0);
for (let p = 0; p < TOTAL; p++) {
  const bits = Array.from({ length: ROWS }, (_, i) => (p >> i) & 1); let i = 0;
  const r = drop(1, () => (bits[i++] ? 0.75 : 0.25));
  assert.deepEqual(r.path, bits); assert.equal(r.bin, bits.reduce((a, b) => a + b, 0)); assert.equal(r.mult, PAYS[r.bin]);
  seen[r.bin]++;
}
assert.deepEqual(seen, WAYS, 'all 256 paths, counted by bin');

// A long run with the real random numbers stays close to the exact payback.
let paid = 0; const N = 400_000; for (let i = 0; i < N; i++) paid += drop(1).pay;
assert.ok(Math.abs(paid / N - payback()) < 0.01, `400k drops paid back ${(paid / N * 100).toFixed(2)}%`);
assert.throws(() => drop(0.37), /unknown bet/);
console.log(`OK: Snowball Drop: exact odds (all 256 paths), pays back ${(payback() * 100).toFixed(2)}%, real win 1 in ${(1 / realWin()).toFixed(2)}, 10× 1 in 128`);

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
