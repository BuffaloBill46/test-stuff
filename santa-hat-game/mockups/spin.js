// Santa Hat Spin: game rules only (no graphics), so it can be tested in node and later run on the server.
// The wheel has 400 equal slices. A random number picks ONE slice; the wheel then lands exactly on it. Odds are just
// "how many slices show that result", so they are exact and anyone can count them:
//   0× 202 slices (50.5%) · 1× 132 (33%) · 2× 40 (10%) · 3× 20 (5%) · 4× 4 (1%) · 5× 2 (0.5%)   → pays back 74.5%
// Neighbouring slices of the same result are drawn as one chunky segment; the 4× and 5× are thin gold slivers.
// Spin has its OWN pool (not the Slots pool). Both spin sizes ($0.10 and $1.00) share it.
import { FEE, IN_PER_DOLLAR } from './slots.js';

export const SLICES = 400;
export const BETS = [0.10, 1.00];
export const MULTS = [0, 1, 2, 3, 4, 5];
export const MAX_MULT = 5;

// Spin pool rules (all adjustable, like the Slots POOL_RULES). Cody: $25 to the treasury when the pool reaches $175.
// Top-off mirrors the Slots safety net: below $10 the treasury tops it back to the $50 start, so the wheel can't lock.
export const SPIN_RULES = { start: 50, skimAt: 175, skim: 25, topOffBelow: 10, topOffTo: 50, paused: false };

// The segments around the wheel, clockwise from the top: [multiplier, slices]. Counts must total the odds above.
export const SEGMENTS = [
  [0, 26], [1, 22], [2, 8], [0, 25], [5, 1], [3, 5], [1, 22], [0, 25], [4, 1], [2, 8], [1, 22], [0, 25], [3, 5],
  [4, 1], [2, 8], [0, 26], [1, 22], [3, 5], [0, 25], [5, 1], [2, 8], [1, 22], [0, 25], [4, 1], [3, 5], [0, 25], [2, 8], [4, 1], [1, 22],
];
// slice index -> multiplier, and each segment's first slice
export const SLICE_MULT = []; export const SEG_START = [];
for (const [mult, n] of SEGMENTS) { SEG_START.push(SLICE_MULT.length); for (let i = 0; i < n; i++) SLICE_MULT.push(mult); }
if (SLICE_MULT.length !== SLICES) throw new Error(`wheel has ${SLICE_MULT.length} slices, expected ${SLICES}`);

export const odds = () => Object.fromEntries(MULTS.map((x) => [x, SLICE_MULT.filter((m) => m === x).length / SLICES]));
export const payback = () => SLICE_MULT.reduce((a, m) => a + m, 0) / SLICES;

// One spin. `rand` gives uniform numbers in [0,1) (server seeds in the real version). forcedSlice is for tests.
export function spin(state, bet, rand = Math.random, forcedSlice) {
  const R = { ...SPIN_RULES, ...(state.rules || {}) };
  if (!BETS.includes(bet)) throw new Error('unknown bet ' + bet);
  if (R.paused) return { paused: true, stopped: true };
  const before = topOff(state, R);
  if (state.pool < MAX_MULT * bet) return { paused: true, topOff: before }; // must cover the biggest prize
  state.pool += bet * IN_PER_DOLLAR;
  const slice = forcedSlice ?? Math.floor(rand() * SLICES), mult = SLICE_MULT[slice], pay = mult * bet;
  state.pool -= pay;
  const res = { slice, mult, bet, pay, received: pay * (1 - FEE), ahead: pay > bet + 1e-9 };
  if (state.pool >= R.skimAt) { state.pool -= R.skim; res.skim = R.skim; state.treasury = (state.treasury || 0) + R.skim * (1 - FEE); }
  const add = before + topOff(state, R); if (add) res.topOff = add;
  return res;
}
function topOff(state, R) {
  if (!(state.pool < R.topOffBelow)) return 0;
  const add = R.topOffTo - state.pool; state.pool += add; state.treasury = (state.treasury || 0) - add / (1 - FEE);
  return add;
}
