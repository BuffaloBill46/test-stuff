// Snowball Drop (Plinko): game rules only (no graphics).
// BOARD 2 (Cody, 2026-10-02: "more fun with bigger prizes and more risks"; his sketch, mix B): 16 rows of pegs, 17 presents,
// mirror-image, edges to middle   25× · 0 · 10× · 0 · 5× · 0 · 2× · 0 · 100× (centre) · 0 · 2× · 0 · 5× · 0 · 10× · 0 · 25×
// THE ODDS COME FROM A TABLE, not from the bounces: on a real 50/50 peg board the centre is the MOST likely present (about 1
// drop in 5), so a rare 100× centre needs a table, like the slot reels' symbol counts. One fair random number picks the present
// from the table below (WAYS out of TOTAL = 1,000,000: exact, anyone can check), then 16 more draw the path the snowball takes
// to reach it (at each row it goes right with chance rights-still-needed ÷ rows-left, so every path to that present is equally
// likely). The animation follows that path. Presents are drawn a little narrower the rarer they are (Cody: "sized similar but
// with visible size difference"); the width is a picture of the odds, the table is what decides.
// Pays back exactly 78.0% (the same edge as board 1): 100× 1 in 5,000 · 25× 1 in 250 · 10× 1 in 83.3 · 5× 1 in 25 · 2× 1 in 5.9.
// BOARD 1 (2026-09-30 to 2026-10-02, 8 rows, 9 bins, true 50/50 bounces) stays below for re-checking drops played on it.
// POOL (Cody, 2026-09-30 / 2026-10-02): Snowball Drop shares the SPIN pool (SPIN_RULES: starts $300, $25 skim at $1,025,
// top-off, emergency stop), so a $1 drop's 100× ($100) is covered and both sizes play the same board. A drop only starts if
// the pool can cover the biggest prize.
import { SPIN_RULES, topOff } from './spin.js';
import { FEE, IN_PER_DOLLAR } from './slots.js';

export const BOARD = 2; // results carry it, so "Check this result" re-runs the board the drop was played on
export const ROWS = 16;
export const BINS = ROWS + 1;
export const PAYS = [25, 0, 10, 0, 5, 0, 2, 0, 100, 0, 2, 0, 5, 0, 10, 0, 25];
export const BETS = [0.10, 1.00];
// chance of each present, out of TOTAL (mirror-image; the 0× presents share what's left equally)
export const TOTAL = 1_000_000;
const EACH = { 100: 200, 25: 2000, 10: 6000, 5: 20000, 2: 85000 };
const ZERO = (TOTAL - PAYS.reduce((a, p) => a + (EACH[p] || 0), 0)) / PAYS.filter((p) => p === 0).length; // 96,725 each
export const WAYS = PAYS.map((p) => EACH[p] || ZERO);
// how wide each present is drawn (relative): rarer = a little narrower, never a sliver (widest ÷ narrowest under 1.5)
export const WIDTHS = PAYS.map((p) => ({ 0: 1.12, 2: 1.04, 5: 0.96, 10: 0.9, 25: 0.84, 100: 0.76 })[p]);
export const odds = (k) => WAYS[k] / TOTAL;
export const payback = () => PAYS.reduce((a, p, k) => a + p * WAYS[k], 0) / TOTAL;   // 780,000 / 1,000,000 = 78.0%
export const realWin = () => PAYS.reduce((a, p, k) => a + (p > 1 ? WAYS[k] : 0), 0) / TOTAL; // more back than it cost: 1 in 4.4
export const jackpotOdds = () => PAYS.reduce((a, p, k) => a + (p === 100 ? WAYS[k] : 0), 0) / TOTAL; // 1 in 5,000

// The present a number u in [0,1) picks (left to right through the table).
export function binOf(u) {
  let x = Math.floor(u * TOTAL);
  for (let k = 0; k < BINS; k++) { if (x < WAYS[k]) return k; x -= WAYS[k]; }
  return BINS - 1;
}
// The path to present `bin` (`bin` rights out of ROWS), from ROWS numbers: right with chance rights-left ÷ rows-left.
export function pathTo(bin, nums) {
  let need = bin; const path = [];
  for (let i = 0; i < ROWS; i++) { const right = nums[i] < need / (ROWS - i); path.push(right ? 1 : 0); need -= right ? 1 : 0; }
  return path;
}
// One drop. `rand` gives uniform numbers in [0,1) (server-seeded in the real version): 1 for the present, then 1 per row.
export function drop(bet, rand = Math.random) {
  if (!BETS.includes(bet)) throw new Error('unknown bet ' + bet);
  const bin = binOf(rand()), path = pathTo(bin, Array.from({ length: ROWS }, () => rand()));
  const mult = PAYS[bin], pay = Math.round(mult * bet * 100) / 100;
  return { path, bin, mult, bet, pay, ahead: pay > bet + 1e-9, board: BOARD };
}
// What a drop's numbers give, on the board it was played on (board 1: one 50/50 bounce per row; board 2: the table + path).
export const OLD = { ROWS: 8, PAYS: [10, 5, 1, 0.4, 0, 0.4, 1, 5, 10] };
export function outcome(nums, board = BOARD) {
  if (board === 1) { const path = nums.slice(0, OLD.ROWS).map((x) => (x < 0.5 ? 0 : 1)), bin = path.reduce((a, b) => a + b, 0); return { path, bin, mult: OLD.PAYS[bin], board: 1 }; }
  const bin = binOf(nums[0]); return { path: pathTo(bin, nums.slice(1, 1 + ROWS)), bin, mult: PAYS[bin], board: 2 };
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
  if (!state.prepaid) state.pool += bet * IN_PER_DOLLAR; // with runs the entry already reached the pool at purchase
  const r = forced ? forcedDrop(bet, forced) : drop(bet, rand);
  state.pool -= r.pay;
  const res = { ...r, received: r.pay * (1 - FEE) };
  if (state.pool >= R.skimAt) { state.pool -= R.skim; res.skim = R.skim; state.treasury = (state.treasury || 0) + R.skim * (1 - FEE); }
  const add = before + topOff(state, R); if (add) res.topOff = add;
  return res;
}
// tests only: a given path (0/1 per row) decides the present
function forcedDrop(bet, path) { const bin = path.reduce((a, b) => a + b, 0), mult = PAYS[bin], pay = Math.round(mult * bet * 100) / 100; return { path: [...path], bin, mult, bet, pay, ahead: pay > bet + 1e-9, board: BOARD }; }
export function canPlay(state, bet) {
  const R = { ...SPIN_RULES, ...(state.rules || {}) };
  if (R.paused) return { ok: false, stopped: true };
  return { ok: (state.pool < R.topOffBelow ? R.topOffTo : state.pool) >= MAX_MULT * bet };
}
