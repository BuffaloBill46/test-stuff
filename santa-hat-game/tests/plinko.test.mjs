// Snowball Drop (Plinko preview): the odds are exact, the payback is what the page says, and a drop lands where its path says.
import assert from 'node:assert/strict';
import { ROWS, BINS, PAYS, WAYS, TOTAL, odds, payback, realWin, drop } from '../mockups/plinko.js';

assert.deepEqual(WAYS, [1, 8, 28, 56, 70, 56, 28, 8, 1]);
assert.equal(WAYS.reduce((a, b) => a + b, 0), TOTAL, 'every path lands in exactly one bin');
assert.equal(PAYS.length, BINS);
assert.deepEqual(PAYS, [...PAYS].reverse(), 'prizes are mirror-image');
assert.ok(Math.abs(payback() - 204.4 / 256) < 1e-12, 'pays back 79.84%');
assert.ok(payback() > 0.79 && payback() < 0.81, 'around 80%, like Spin and Big Hat (Cody)');
assert.equal(realWin(), 74 / 256, 'more back than it cost: 1.2×, 2× and 5× bins');
assert.equal(odds(0) + odds(8), 2 / 256, '5× either edge: 1 in 128');

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
console.log(`OK: Snowball Drop: exact odds (all 256 paths), pays back ${(payback() * 100).toFixed(2)}%, real win 1 in ${(1 / realWin()).toFixed(2)}, 5× 1 in 128`);
