// Santa Hat Spin: game rules only (no graphics), so it can be tested in node and later run on the server.
// Two wheels (Cody, 2026-09-30: "option A"; the old 400-slice wheel's 4× and 5× slivers were too thin to see).
//   MAIN wheel, 40 equal segments:  0× ×20 · 1× (money back) ×12 · 2× ×5 · gold STAR ×3
//   BONUS wheel, 12 equal segments: 3× ×9 · 4× ×2 · 5× ×1          (spun only when the main wheel lands on a star)
// Every segment on a wheel is the same size, so what you see IS the odds: count the segments. One fair number picks
// the main segment; on a star, the next fair number picks the bonus segment. The wheels land exactly there.
//   0× 50% · 1× 30% · 2× 12.5% · 3× 5.625% · 4× 1.25% · 5× 0.625%                                  → pays back 80.0%
// (Cody, 2026-09-30: "around 80%, remember we lose 16% to fees": 10% burn + 3% tax in + 3% tax out.)
// Spin (retired) played from the pool that is now the shared Game pool. Both spin sizes ($0.10 and $1.00) shared it.
import { FEE, IN_PER_DOLLAR, POOL_RULES } from './slots.js?v=f49f060705';

export const MAIN_SLICES = 40, BONUS_SLICES = 12;
export const STAR = -1;                     // a main-wheel segment that sends you to the bonus wheel
export const BETS = [0.10, 1.00];
export const MULTS = [0, 1, 2, 3, 4, 5];
export const MAIN_COUNTS = { star: 3, 2: 5, 1: 12, 0: 20 }, BONUS_COUNTS = { 5: 1, 4: 2, 3: 9 };

// Segments spread evenly around a wheel: at each position, the result that is furthest behind its fair share goes next
// (ties: the rarer one). Deterministic, and in a FIXED order (star, then the biggest prize down), never the order the counts
// happen to be listed in (a database may reorder keys, and anyone rebuilding the wheel must get the same one).
export function layout(counts, n) {
  const keys = ['star', ...Object.keys(counts).filter((k) => k !== 'star').map(Number).sort((a, b) => b - a).map(String)].filter((k) => (counts[k] || 0) > 0);
  const placed = Object.fromEntries(keys.map((k) => [k, 0])), out = [];
  for (let i = 0; i < n; i++) {
    let best = null, lag = -Infinity;
    for (const k of keys) { const due = (counts[k] * (i + 1)) / n - placed[k]; if (placed[k] < counts[k] && due > lag + 1e-9) { lag = due; best = k; } }
    placed[best]++; out.push(best === 'star' ? STAR : +best);
  }
  return out;
}
export const MAIN = layout(MAIN_COUNTS, MAIN_SLICES), BONUS = layout(BONUS_COUNTS, BONUS_SLICES);
export const DEFAULT_WHEEL = { main: MAIN, bonus: BONUS };
export const topMult = (w = DEFAULT_WHEEL) => Math.max(...w.main.filter((m) => m !== STAR), ...(w.main.includes(STAR) ? w.bonus : [0]));
export const MAX_MULT = topMult();

// Chance of each final result (× the spin price), and the payback, from the wheels themselves.
export function odds(w = DEFAULT_WHEEL) {
  const o = {}, star = w.main.filter((m) => m === STAR).length / w.main.length;
  for (const m of w.main) if (m !== STAR) o[m] = (o[m] || 0) + 1 / w.main.length;
  if (star) for (const m of w.bonus) o[m] = (o[m] || 0) + star / w.bonus.length;
  return o;
}
export const payback = (w = DEFAULT_WHEEL) => Object.entries(odds(w)).reduce((a, [m, p]) => a + m * p, 0);
export const starChance = (w = DEFAULT_WHEEL) => w.main.filter((m) => m === STAR).length / w.main.length;

// The pool rules. This pool (key 'spin') is now THE Game pool (Cody, 2026-10-02): Big Hat, Snowball Drop and Stocking Stuffer
// all play from it (Spin itself is retired). Its rules are slots.js POOL_RULES, the SAME object (one source of truth): start
// $500, $25 skim at $1,025, top-off below $200 back to $500. (Was: start $300, skim at $1,025, top-off below $100 to $300;
// before that start $50, skim at $175, top-off below $10 to $50.)
export const SPIN_RULES = POOL_RULES;

// One spin. `rand` gives uniform numbers in [0,1) (server-seeded in the real version): the first picks the main segment;
// on a star, the second picks the bonus segment. forced (tests only): a main segment, or [main, bonus].
// wheel (optional): a settings-built { main, bonus } (Cody's admin settings); without it, the built-in wheels.
export function spin(state, bet, rand = Math.random, forced, wheel = null) {
  const R = { ...SPIN_RULES, ...(state.rules || {}) }, W = wheel || DEFAULT_WHEEL, top = topMult(W);
  if (!wheel && !BETS.includes(bet)) throw new Error('unknown bet ' + bet); // with settings, prices come from the settings
  if (R.paused) return { paused: true, stopped: true };
  const before = topOff(state, R);
  if (state.pool < top * bet) return { paused: true, topOff: before }; // must cover the biggest prize
  if (!state.prepaid) state.pool += bet * IN_PER_DOLLAR; // with runs the entry already reached the pool at purchase
  const f = Array.isArray(forced) ? forced : [forced];
  const slice = f[0] ?? Math.floor(rand() * W.main.length);
  let mult = W.main[slice], bonusSlice;
  if (mult === STAR) { bonusSlice = f[1] ?? Math.floor(rand() * W.bonus.length); mult = W.bonus[bonusSlice]; }
  const pay = mult * bet;
  state.pool -= pay;
  const res = { slice, ...(bonusSlice !== undefined ? { bonusSlice } : {}), mult, bet, pay, received: pay * (1 - FEE), ahead: pay > bet + 1e-9 };
  if (state.pool >= R.skimAt) { state.pool -= R.skim; res.skim = R.skim; state.treasury = (state.treasury || 0) + R.skim * (1 - FEE); }
  const add = before + topOff(state, R); if (add) res.topOff = add;
  return res;
}
// Would the pool accept this spin right now? Changes nothing. Mirrors spin()'s own checks exactly (a top-off counts), so the
// server can ask BEFORE taking a payment: a spin refused after payment refunds its price.
export function canSpin(state, bet, wheel = null) {
  const R = { ...SPIN_RULES, ...(state.rules || {}) };
  if (R.paused) return { ok: false, stopped: true };
  const pool = state.pool < R.topOffBelow ? R.topOffTo : state.pool;
  return { ok: pool >= topMult(wheel || DEFAULT_WHEEL) * bet };
}
// Shared with Snowball Drop (plinko.js), which plays from this same pool (Cody, 2026-09-30).
export function topOff(state, R) {
  if (!(state.pool < R.topOffBelow)) return 0;
  const add = R.topOffTo - state.pool; state.pool += add; state.treasury = (state.treasury || 0) - add / (1 - FEE);
  return add;
}
