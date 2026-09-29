// The SLOTS pool (its own wallet, shared by the $0.10 mini hat and $1 large hat bets). Slots has a JACKPOT that
// pays a % of the slots pool. Spin is a separate game with its own pool and no jackpot (see tax-split.mjs).
// The run() below can also mix in Spin plays (slotsShare < 1), kept only for comparison.
// The slots paytable is Cody's and not final: PLACEHOLDER below = spin's fixed
// 1x-4x table with the 0.5% top result as the jackpot. Swap in the real paytable when it arrives.
// Invariants asserted every spin: the pool never goes below zero; no spin starts unless the pool covers that
// game's biggest FIXED win. Pool income is after the 3% tax and the 10% burn; winners absorb the tax on payouts.
const FEE = 0.03, IN_PER_DOLLAR = (1 - 0.10 * (1 - FEE)) * (1 - FEE); // 87.59c per $1 lands in the pool (burn is not pool income)
if (Math.abs(IN_PER_DOLLAR - 0.8759) > 1e-4) throw new Error('pool income per $1 should be 87.59c, got ' + IN_PER_DOLLAR);
const SPIN = [[0, .505], [1, .33], [2, .10], [3, .05], [4, .01], [5, .005]];
const SLOTS_PLACEHOLDER = [[0, .505], [1, .33], [2, .10], [3, .05], [4, .01], ['JP', .005]];
const back = (t) => t.reduce((s, [k, p]) => s + (k === 'JP' ? 0 : k * p), 0);
const maxFixed = (t) => Math.max(...t.map(([k]) => (k === 'JP' ? 0 : k)));
const pick = (t) => { let u = Math.random(); for (const [k, p] of t) if ((u -= p) < 0) return k; return t.at(-1)[0]; };
function run({ jpPct, spins, slotsShare = 1, start = 50, mix = 0.3 }) {
  let pool = start, paused = 0, jpWins = [];
  for (let i = 0; i < spins; i++) {
    const slots = Math.random() < slotsShare, t = slots ? SLOTS_PLACEHOLDER : SPIN, bet = Math.random() < mix ? 1 : 0.10;
    if (pool < maxFixed(t) * bet) { paused++; continue; }
    pool += bet * IN_PER_DOLLAR;
    const k = pick(t), pay = k === 'JP' ? pool * jpPct * bet : k * bet; // jackpot scales with bet
    if (k === 'JP' && bet === 1) jpWins.push(pay);
    pool -= pay;
    if (pool < 0) throw new Error('INVARIANT BROKEN: pool went negative');
  }
  return { pool, paused, jpWins };
}
const q = (a, f) => a.slice().sort((x, y) => x - y)[Math.floor(f * (a.length - 1))];
console.log(`Spin: pays back ${(back(SPIN) * 100).toFixed(1)}c per $1, so the pool keeps ${((IN_PER_DOLLAR - back(SPIN)) * 100).toFixed(1)}c. Slots (placeholder) fixed wins keep ${((IN_PER_DOLLAR - back(SLOTS_PLACEHOLDER)) * 100).toFixed(1)}c; the jackpot pays the rest back.`);
for (const slotsShare of [1]) for (const jpPct of [0.05, 0.10, 0.20]) {
  const ends = [], jps = []; let pauses = 0;
  for (let r = 0; r < 1000; r++) { const o = run({ jpPct, spins: 20000, slotsShare }); ends.push(o.pool); jps.push(...o.jpWins.slice(-10)); pauses += o.paused; }
  // Level-off: surplus from both games per $ played = jackpot paid per $ played.
  const surplus = (1 - slotsShare) * (IN_PER_DOLLAR - back(SPIN)) + slotsShare * (IN_PER_DOLLAR - back(SLOTS_PLACEHOLDER));
  const level = surplus / (slotsShare * 0.005 * jpPct);
  console.log(`slots pool, jackpot ${jpPct * 100}%: levels off ~$${level.toFixed(0)}, $1 jackpot ~$${(level * jpPct).toFixed(0)} | after 20k spins median $${q(ends, .5).toFixed(0)}, worst 1% $${q(ends, .01).toFixed(0)} | paused ${pauses}`);
}
console.log('invariant held: pool never went negative in any run');
