// Santa Hat Slots rules: invariants asserted, plus the payback of the current (placeholder) paytable.
// Run: node tests/slots.test.mjs
import { PAYTABLE, MACHINES, REELS, SYMBOLS, STRIP_LEN, IN_PER_DOLLAR, MAX_FIXED, START_POOL, pull, readLine, stopsFor, pickResult } from '../mockups/slots.js';
import { rng } from './rng.mjs';

const fail = (m) => { console.error('FAIL:', m); process.exit(1); };
const rand = rng(12345);

// Every reel has every symbol, and the strip length is right.
REELS.forEach((r, i) => { if (r.length !== STRIP_LEN) fail(`reel ${i} length ${r.length}`); SYMBOLS.forEach((_, s) => { if (!r.includes(s)) fail(`reel ${i} missing ${SYMBOLS[s].id}`); }); });
const totalP = PAYTABLE.reduce((s, r) => s + r.p, 0);
if (totalP >= 1) fail('win chances add up to 100% or more');

// Display always matches the result: 200k results, each turned into reel stops and read back.
for (let i = 0; i < 200000; i++) {
  const res = pickResult(rand()), shown = readLine(stopsFor(res, rand));
  if ((res && res.sym) !== (shown && shown.sym)) fail(`result ${res && res.sym} displayed as ${shown && shown.sym}`);
}

// Fixed-win payback per $1 (jackpot pays back the rest over time).
const fixedBack = PAYTABLE.filter((r) => r.x !== 'JACKPOT').reduce((s, r) => s + r.x * r.p, 0);
const jpP = PAYTABLE.find((r) => r.x === 'JACKPOT').p;
console.log(`placeholder paytable: wins ${(totalP * 100).toFixed(1)}% of pulls; fixed wins pay back ${(fixedBack * 100).toFixed(1)}¢ per $1; pool takes in ${(IN_PER_DOLLAR * 100).toFixed(2)}¢`);

// Pool invariants over long runs of both machines (30% Big Hat pulls).
let paused = 0, jackpots = 0; const ends = [];
for (let run = 0; run < 400; run++) {
  const st = { pool: START_POOL };
  for (let i = 0; i < 20000; i++) {
    const mid = rand() < 0.3 ? 'big' : 'mini', before = st.pool;
    const r = pull(st, mid, rand);
    if (r.paused) { paused++; continue; }
    if (r.jackpot) { jackpots++; if (r.pay > before + MACHINES[mid].bet * IN_PER_DOLLAR + 1e-9) fail('jackpot paid more than the pool held'); }
    if (st.pool < -1e-9) fail('pool went negative');
    if (Math.abs(r.received - r.pay * 0.97) > 1e-9) fail('winner should receive the pay minus 3%');
  }
  ends.push(st.pool);
}
ends.sort((a, b) => a - b);
// Level-off: the pool settles where jackpots pay out exactly what fixed wins leave behind.
const levelOff = (IN_PER_DOLLAR - fixedBack) / (jpP * MACHINES.big.jackpotPct / MACHINES.big.bet);
console.log(`pool levels off near $${levelOff.toFixed(0)} (Big Hat jackpot there ≈ $${(levelOff * MACHINES.big.jackpotPct).toFixed(2)}, Mini Hat ≈ $${(levelOff * MACHINES.mini.jackpotPct).toFixed(2)})`);
console.log(`400 runs × 20,000 pulls from $${START_POOL}: median end $${ends[200].toFixed(0)}, lowest $${ends[0].toFixed(0)}, ${jackpots} jackpots, ${paused} paused pulls (pool must cover ${MAX_FIXED}× the bet)`);
console.log('OK: display always matched the result; the pool never went negative; no jackpot exceeded the pool');
