// Snowball Drop (Plinko): game rules only (no graphics). PREVIEW for Cody (2026-09-30), not in the arcade yet.
// A snowball falls through 8 rows of pegs. At each row it goes left or right, 50/50, decided by ONE fair random number per
// row (the same provably-fair draw as Spin and Slots). The animation just follows that path. So the odds are exact
// and anyone can check them: landing in bin k (0–8, left to right) takes k "rights" out of 8, which happens C(8,k) ways
// out of 256:   1 · 8 · 28 · 56 · 70 · 56 · 28 · 8 · 1
// The edges are rare because few paths reach them, not because a bin is drawn thin: every bin is the same width.
// POOL (Cody, 2026-09-30): Snowball Drop shares the SPIN pool, under the same rules (SPIN_RULES: start, $25 skim at $175,
// top-off, emergency stop). A drop only starts if the pool can cover the biggest prize (10× the price).
import { SPIN_RULES, topOff } from './spin.js';
import { FEE, IN_PER_DOLLAR } from './slots.js';

export const ROWS = 8;
export const BINS = ROWS + 1;
// Prize per bin (× the drop price), mirror-image, edges to middle 10× · 5× · 1× · 0.4× · 0× (Cody, 2026-09-30; the 0.4×
// was 0.5× until he asked for 78–80%). Pays back 200.8/256 = 78.4%: the pool keeps about 9¢ of each $1 (it receives
// about 87.6¢ after the burn and tax).
export const PAYS = [10, 5, 1, 0.4, 0, 0.4, 1, 5, 10];
export const BETS = [0.10, 1.00];

const choose = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - i + 1)) / i; return r; };
export const WAYS = Array.from({ length: BINS }, (_, k) => choose(ROWS, k));        // 1, 8, 28, 56, 70, 56, 28, 8, 1
export const TOTAL = 2 ** ROWS;                                                       // 256
export const odds = (k) => WAYS[k] / TOTAL;
export const payback = () => PAYS.reduce((a, p, k) => a + p * WAYS[k], 0) / TOTAL;   // 200.8 / 256 = 78.44%
export const realWin = () => PAYS.reduce((a, p, k) => a + (p > 1 ? WAYS[k] : 0), 0) / TOTAL; // more back than it cost

// One drop. `rand` gives uniform numbers in [0,1) (server-seeded in the real version): one per row.
// path[i] is 0 (left) or 1 (right) at row i; the bin is how many rights.
export function drop(bet, rand = Math.random) {
  if (!BETS.includes(bet)) throw new Error('unknown bet ' + bet);
  const path = Array.from({ length: ROWS }, () => (rand() < 0.5 ? 0 : 1));
  const bin = path.reduce((a, b) => a + b, 0), mult = PAYS[bin], pay = Math.round(mult * bet * 100) / 100;
  return { path, bin, mult, bet, pay, ahead: pay > bet + 1e-9 };
}

export const MAX_MULT = Math.max(...PAYS);
// One drop against the shared Spin pool (the same steps as spin() in spin.js): stop check, top-off, cover the top prize,
// the path, pay, skim, top-off. forced (tests only): the path as 0/1 per row.
export function play(state, bet, rand = Math.random, forced) {
  const R = { ...SPIN_RULES, ...(state.rules || {}) };
  if (!BETS.includes(bet)) throw new Error('unknown bet ' + bet);
  if (R.paused) return { paused: true, stopped: true };
  const before = topOff(state, R);
  if (state.pool < MAX_MULT * bet) return { paused: true, topOff: before };
  if (!state.prepaid) state.pool += bet * IN_PER_DOLLAR; // with play credits the entry already reached the pool at purchase
  const r = forced ? { ...drop(bet, (() => { let i = 0; return () => (forced[i++] ? 0.75 : 0.25); })()) } : drop(bet, rand);
  state.pool -= r.pay;
  const res = { ...r, received: r.pay * (1 - FEE) };
  if (state.pool >= R.skimAt) { state.pool -= R.skim; res.skim = R.skim; state.treasury = (state.treasury || 0) + R.skim * (1 - FEE); }
  const add = before + topOff(state, R); if (add) res.topOff = add;
  return res;
}
export function canPlay(state, bet) {
  const R = { ...SPIN_RULES, ...(state.rules || {}) };
  if (R.paused) return { ok: false, stopped: true };
  return { ok: (state.pool < R.topOffBelow ? R.topOffTo : state.pool) >= MAX_MULT * bet };
}
