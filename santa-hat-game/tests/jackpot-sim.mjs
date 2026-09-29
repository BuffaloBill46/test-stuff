// Spin pool where the top result is a JACKPOT paying a % of the pool instead of a fixed 5x.
// Invariant checked as an assertion every spin: the pool never goes below zero, and no spin starts
// unless the pool covers the biggest FIXED win (4x the bet). Pool income is after the 3% tax and 10% burn.
const FEE = 0.03, IN_PER_DOLLAR = (1 - 0.10 * (1 - FEE)) * (1 - FEE); // 87.59c per $1 lands in the pool (burn is not pool income)
if (Math.abs(IN_PER_DOLLAR - 0.8759) > 1e-4) throw new Error("pool income per $1 should be 87.59c, got " + IN_PER_DOLLAR);
const FIXED = [[0, .505], [1, .33], [2, .10], [3, .05], [4, .01]], JP_ODDS = .005; // jackpot keeps the old 5x odds
function run({ jpPct, spins, start = 50, mix }) {
  let pool = start, paused = 0, jpWins = [], biggest = 0;
  for (let i = 0; i < spins; i++) {
    const bet = Math.random() < mix ? 1 : 0.10;
    if (pool < 4 * bet) { paused++; continue; }
    pool += bet * IN_PER_DOLLAR;
    let u = Math.random(), m = null;
    for (const [k, p] of FIXED) { if ((u -= p) < 0) { m = k; break; } }
    let pay = m === null ? pool * jpPct * bet : m * bet; // jackpot scales with bet: $1 wins the full %, $0.10 a tenth
    if (m === null && bet === 1) jpWins.push(pay);
    pool -= pay; biggest = Math.max(biggest, pay);
    if (pool < 0) throw new Error('INVARIANT BROKEN: pool went negative');
  }
  return { pool, paused, jpWins, biggest };
}
const pct = (a, q) => a.slice().sort((x, y) => x - y)[Math.floor(q * (a.length - 1))];
for (const jpPct of [0.05, 0.10, 0.20]) {
  const ends = [], jps = [], pauses = [];
  for (let r = 0; r < 2000; r++) { const o = run({ jpPct, spins: 20000, mix: 0.3 }); ends.push(o.pool); jps.push(...o.jpWins.slice(-20)); pauses.push(o.paused); }
  // Level-off point: pool gain per $1 from fixed wins = income - fixed payback; jackpot takes jpPct of pool at 0.5%.
  const fixedBack = FIXED.reduce((s, [k, p]) => s + k * p, 0), level = (IN_PER_DOLLAR - fixedBack) / (JP_ODDS * jpPct);
  console.log(`jackpot ${jpPct * 100}% of pool: pool levels off near $${level.toFixed(0)} | after 20k spins median $${pct(ends, .5).toFixed(0)} (worst 1% $${pct(ends, .01).toFixed(0)}) | a $1 jackpot at level-off ≈ $${(jpPct * level).toFixed(2)}, late-run median $${pct(jps, .5).toFixed(2)} | spins paused (all runs) ${pauses.reduce((a, b) => a + b, 0)}`);
}
console.log('invariant held: pool never went negative in any run');
