// How much a normal (non-jackpot) Big Hat pull pays: how often each range comes up, and the biggest seen.
// Run: node tests/payout-ranges.mjs
import { MACHINES, pull } from '../mockups/slots.js';
import { rng } from './rng.mjs';
const m = MACHINES.big, rand = rng(4242), N = 5_000_000, st = { pool: 1e12, skimAt: Infinity };
const bands = [[0, 0, '$0 (nothing)'], [0.01, 0.99, '5¢ to 99¢ (hat nickels, less than the pull back)'], [1, 1.99, '$1 to $1.99'], [2, 4.99, '$2 to $4.99'],
  [5, 9.99, '$5 to $9.99'], [10, 24.99, '$10 to $24.99'], [25, 49.99, '$25 to $49.99'], [50, 99.99, '$50 to $99.99'], [100, Infinity, '$100 and up']];
const count = bands.map(() => 0); let n = 0, max = 0, maxGrid = null, sum = 0;
for (let i = 0; i < N; i++) {
  const r = pull(st, 'big', rand); if (r.jackpot) continue; n++;
  const p = Math.round(r.pay * 100) / 100; sum += p;
  const b = bands.findIndex(([lo, hi]) => p >= lo - 1e-9 && p <= hi + 1e-9); count[b]++;
  if (p > max) { max = p; maxGrid = r; }
}
console.log(`Normal pulls (pool jackpot excluded): ${n.toLocaleString()} simulated, average pay $${(sum / n).toFixed(3)}`);
bands.forEach(([, , label], i) => console.log(`  ${label.padEnd(50)} ${(count[i] / n * 100).toFixed(2).padStart(6)}%  (1 in ${count[i] ? Math.round(n / count[i]).toLocaleString() : '—'})`));
console.log(`Biggest normal pull seen: $${max.toFixed(2)} (${maxGrid.wins.length} winning lines + ${maxGrid.hats} hats)`);
