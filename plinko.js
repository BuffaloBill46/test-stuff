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
// BOARD 3 (Cody, 2026-10-02, one shared Game pool): the same board, the same chances, the same positions, but the 100× centre
// present is now the POOL JACKPOT: it pays 25% of the Game pool at that moment, scaled by the drop's size (a $1 drop wins 25%
// of the pool, a 10¢ drop 2.5%). Everything else is unchanged. Fixed prizes alone pay back exactly 76.0%; the jackpot adds
// 1 in 5,000 × 25% × the pool in dollars (about 1% at a $200 pool, 2.5% at $500, 5.1% at $1,025): see paybackAt().
// BOARD 2 (2026-10-02, 100× centre) and BOARD 1 (2026-09-30 to 2026-10-02, 8 rows, 9 bins, true 50/50 bounces) stay below for
// re-checking drops played on them.
// POOL (Cody, 2026-10-02; numbers 2026-10-05): Snowball Drop plays from the shared Game pool (slots.js POOL_RULES: starts $125, $25
// skim at $1,025, top-off request below $30, emergency stop). A drop only starts if the pool, counting Cody's backing up to the
// top-off amount (slots.js covers), can cover the biggest FIXED prize;
// the jackpot is a share of the pool, so it can always be paid.
import { FEE, IN_PER_DOLLAR, JACKPOT_PCT, poolJackpot, POOL_RULES, topOff, covers } from './slots.js?v=c2b42ea65b';

export const BOARD = 3; // results carry it, so "Check this result" re-runs the board the drop was played on
export const ROWS = 16;
export const BINS = ROWS + 1;
export const JACKPOT_BIN = 8; // the centre present (board 3: the pool jackpot)
// Board 2's prizes (× the drop's price); board 3 pays the same except the centre, which is the pool jackpot (0 fixed)
export const PAYS2 = Object.freeze([25, 0, 10, 0, 5, 0, 2, 0, 100, 0, 2, 0, 5, 0, 10, 0, 25]);
export const PAYS = PAYS2.map((p, k) => (k === JACKPOT_BIN ? 0 : p));
export const BETS = [0.10, 1.00];
// The jackpot's share of the pool (Cody: 25%); the admin settings can publish another (settings.js drop.jackpotPct). The page's
// copy is swapped in place by applyToGame; the server passes the play's own settings.
export const JP = { pct: JACKPOT_PCT };
// chance of each present, out of TOTAL (mirror-image; the 0× presents share what's left equally). Boards 2 and 3: the same.
export const TOTAL = 1_000_000;
const EACH = { 100: 200, 25: 2000, 10: 6000, 5: 20000, 2: 85000 };
const ZERO = (TOTAL - PAYS2.reduce((a, p) => a + (EACH[p] || 0), 0)) / PAYS2.filter((p) => p === 0).length; // 96,725 each
export const WAYS = PAYS2.map((p) => EACH[p] || ZERO);
// how wide each present is drawn (relative): rarer = a little narrower, never a sliver (widest ÷ narrowest under 1.5)
export const WIDTHS = PAYS2.map((p) => ({ 0: 1.12, 2: 1.04, 5: 0.96, 10: 0.9, 25: 0.84, 100: 0.76 })[p]);
export const odds = (k) => WAYS[k] / TOTAL;
// Fixed prizes only (board 3): 760,000 / 1,000,000 = 76.0%. The jackpot's part depends on the pool: paybackAt(pool).
export const payback = () => PAYS.reduce((a, p, k) => a + p * WAYS[k], 0) / TOTAL;
export const jackpotOdds = () => WAYS[JACKPOT_BIN] / TOTAL; // 1 in 5,000
// Payback with the pool jackpot at a given Game pool size (in dollars): fixed + 1 in 5,000 × pct × pool. The jackpot pays
// pct × pool × (bet ÷ $1), which is pct × pool times the bet, so its share of what's played doesn't depend on the drop's size.
export const paybackAt = (pool, pct = JP.pct) => payback() + jackpotOdds() * pct * pool;
export const realWin = () => PAYS.reduce((a, p, k) => a + (p > 1 || k === JACKPOT_BIN ? WAYS[k] : 0), 0) / TOTAL; // more back than it cost: 1 in 4.4

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
// One drop's present and path. `rand` gives uniform numbers in [0,1) (server-seeded in the real version): 1 for the present,
// then 1 per row. The pay is worked out by play() (the jackpot needs the pool).
export function drop(bet, rand = Math.random) {
  if (!BETS.includes(bet)) throw new Error('unknown bet ' + bet);
  const bin = binOf(rand()), path = pathTo(bin, Array.from({ length: ROWS }, () => rand()));
  return { path, bin, bet, board: BOARD };
}
// What a drop's numbers give, on the board it was played on (board 1: one 50/50 bounce per row; boards 2 and 3: the table +
// path; board 3's centre is the pool jackpot, `jackpot: true`, its amount from the pool at that moment).
export const OLD = { ROWS: 8, PAYS: [10, 5, 1, 0.4, 0, 0.4, 1, 5, 10] };
export function outcome(nums, board = BOARD) {
  if (board === 1) { const path = nums.slice(0, OLD.ROWS).map((x) => (x < 0.5 ? 0 : 1)), bin = path.reduce((a, b) => a + b, 0); return { path, bin, mult: OLD.PAYS[bin], board: 1 }; }
  const bin = binOf(nums[0]), path = pathTo(bin, nums.slice(1, 1 + ROWS));
  if (board === 2) return { path, bin, mult: PAYS2[bin], board: 2 };
  return bin === JACKPOT_BIN ? { path, bin, jackpot: true, board: 3 } : { path, bin, mult: PAYS[bin], board: 3 };
}

// The biggest FIXED prize (25×, the edge presents): a drop only starts if the pool covers it. (Board 2's was the 100× centre.)
export const MAX_MULT = Math.max(...PAYS);
export const MAX_MULT_BOARD = { 1: Math.max(...OLD.PAYS), 2: Math.max(...PAYS2), 3: MAX_MULT };
// One drop against the shared Game pool (the same steps as every game: slots.js pull()): stop check, top-off, cover the top fixed
// prize, the path, pay, skim, top-off. forced (tests only): the path as 0/1 per row (8 rights = the centre = the jackpot).
// pct: the jackpot's share of the pool (the play's settings; Cody's pool rule `jackpotPct` overrides it, like Big Hat's).
export function play(state, bet, rand = Math.random, forced, pct = JP.pct) {
  const R = { ...POOL_RULES, ...(state.rules || {}) };
  if (!BETS.includes(bet)) throw new Error('unknown bet ' + bet);
  if (R.paused) return { paused: true, stopped: true };
  const before = topOff(state, R);
  if (covers(state, R) < MAX_MULT * bet) return { paused: true, topOff: before };
  if (!state.prepaid) state.pool += bet * IN_PER_DOLLAR; // with runs the entry already reached the pool at purchase
  const d = forced ? forcedDrop(bet, forced) : drop(bet, rand);
  let r;
  if (d.bin === JACKPOT_BIN) { // the pool jackpot: pct × the pool at this moment × (bet ÷ $1), exact (a share, not whole cents)
    const p = R.jackpotPct ?? pct, jackpotPool = state.pool, pay = poolJackpot(jackpotPool, p, bet);
    r = { ...d, jackpot: true, jackpotPool, pct: p, mult: pay / bet, pay, ahead: pay > bet + 1e-9 };
  } else { const mult = PAYS[d.bin], pay = Math.round(mult * bet * 100) / 100; r = { ...d, mult, pay, ahead: pay > bet + 1e-9 }; }
  state.pool -= r.pay;
  const res = { ...r, received: r.pay * (1 - FEE) };
  if (state.pool >= R.skimAt) { state.pool -= R.skim; res.skim = R.skim; state.treasury = (state.treasury || 0) + R.skim * (1 - FEE); }
  const add = before + topOff(state, R); if (add) res.topOff = add;
  return res;
}
// tests only: a given path (0/1 per row) decides the present
function forcedDrop(bet, path) { const bin = path.reduce((a, b) => a + b, 0); return { path: [...path], bin, bet, board: BOARD }; }
export function canPlay(state, bet) {
  const R = { ...POOL_RULES, ...(state.rules || {}) };
  if (R.paused) return { ok: false, stopped: true };
  return { ok: covers(state, R) >= MAX_MULT * bet };
}
