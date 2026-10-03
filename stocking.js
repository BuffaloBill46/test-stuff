// Stocking Stuffer: game rules only (no graphics). Cody's brief, 2026-10-02.
// A fireplace mantel with 20 Christmas stockings in two rows of 10. 8 hide a gift, 12 hide a lump of coal (the Naughty List).
// Each turn Santa opens stockings one at a time, up to 8. The first coal ends the turn; finding all 8 gifts ends it too.
// The turn pays by how many gifts were found before the coal. Nothing to choose: every stocking opened is the tension.
// THE ODDS ARE EXACT (no table, no rounding): with 8 gifts among 20 stockings,
//   P(at least k gifts) = (8·7·…·(8−k+1)) / (20·19·…·(20−k+1)),   P(exactly k) = P(at least k) − P(at least k+1)
// Over the common denominator 20·19·…·12 (9 stockings deep) every chance is a whole number of WAYS (out of TOTAL), so anyone can
// check them with a calculator. Pays back exactly 78.146% (computed from the table below, never typed in as text).
// FAIR NUMBERS (the house's order, house.js): 38 numbers per turn. The first 19 shuffle the 8 gifts and 12 coals into the
// 20 stockings (Fisher–Yates, one fair number per swap); the next 19 shuffle the 20 stockings into the order Santa opens them
// (the same way). Two shuffles so a different set of stockings opens each turn; the chances above are the same either way.
// "Check this result" re-runs both shuffles from the revealed secret and shows where every lump of coal was.
// POOL: Stocking Stuffer plays from the Drop pool (the old Spin pool; SPIN_RULES), like Snowball Drop. A turn only starts if
// the pool covers the biggest prize. NOTE FOR CODY (not decided): 250× on a $1 turn is $250, so a $1 turn is refused while
// that pool sits between $100 and $250 (below $100 it is topped back up to $300 first). 10¢ turns ($25 top prize) always
// fit. Options before real money: 10¢ only, its own pool, or a bigger pool / higher top-off. Pool rules are unchanged here.
import { SPIN_RULES, topOff } from './spin.js';
import { FEE, IN_PER_DOLLAR } from './slots.js';

export const STOCKINGS = 20, ROW = 10, GIFTS = 8, COAL = STOCKINGS - GIFTS, MAX_OPEN = GIFTS;
export const BETS = [0.10, 1.00];
// What a turn pays (× its price) by gifts found before the coal: index = gifts. Cody's table; payback raised to ~78% (Cody,
// 2026-10-02, from 60.5%): 2 gifts 1.75→2.5×, 3 gifts 4→6×, 4 gifts 8→10×, 5 gifts 16→20×; 1 gift stays 0.5× (an honest loss),
// the top prize stays 250× (the pool-coverage question is unchanged). The admin settings can publish
// another (settings.js `stocking.pays`, with guard rails); the page swaps it in place (applyToGame).
export const DEFAULT_PAYS = Object.freeze([0, 0.5, 2.5, 6, 10, 20, 40, 90, 250]);
export const PAYS = [...DEFAULT_PAYS];
const fall = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r *= n - i; return r; }; // n·(n−1)·…·(n−k+1)
export const TOTAL = fall(STOCKINGS, GIFTS + 1); // 20·19·…·12 = 60,949,324,800
// WAYS[k]: turns (out of TOTAL) that find exactly k gifts. k < 8: k gifts then a coal; k = 8: all 8 gifts.
export const WAYS = Array.from({ length: GIFTS + 1 }, (_, k) => (k < GIFTS ? fall(GIFTS, k) * COAL * fall(STOCKINGS - k - 1, GIFTS - k) : fall(GIFTS, GIFTS) * COAL));
export const odds = (k) => WAYS[k] / TOTAL;
export const atLeast = (k) => fall(GIFTS, k) / fall(STOCKINGS, k);
export const payback = (pays = PAYS) => pays.reduce((a, p, k) => a + p * WAYS[k], 0) / TOTAL;   // 78.146% with Cody's table
export const realWin = (pays = PAYS) => pays.reduce((a, p, k) => a + (p > 1 ? WAYS[k] : 0), 0) / TOTAL; // more back than it cost
export const topMult = (pays = PAYS) => Math.max(...pays);
export const NUMS_USED = 2 * (STOCKINGS - 1); // 38

// Fisher–Yates with fair numbers: for i from the last place down to 1, swap place i with place floor(u × (i + 1)).
export function shuffle(items, nums) {
  const a = [...items];
  for (let i = a.length - 1, n = 0; i > 0; i--, n++) { const j = Math.floor(nums[n] * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// What a turn's numbers give (anyone can re-run this). gifts: true per stocking that holds a gift (stockings 0–9 the top row
// left to right, 10–19 the bottom row); order: the stockings in the order Santa opens them; opened: the ones he did open.
export function outcome(nums, pays = PAYS) {
  if (nums.length < NUMS_USED) throw new Error('stocking: needs ' + NUMS_USED + ' numbers');
  const gifts = shuffle([...Array(GIFTS).fill(true), ...Array(COAL).fill(false)], nums.slice(0, STOCKINGS - 1));
  const order = shuffle(Array.from({ length: STOCKINGS }, (_, i) => i), nums.slice(STOCKINGS - 1, NUMS_USED));
  return settleOrder(gifts, order, pays);
}
function settleOrder(gifts, order, pays) {
  const opened = [];
  let found = 0;
  for (const s of order) { opened.push(s); if (!gifts[s]) break; if (++found === GIFTS) break; }
  return { gifts, order, opened, found, mult: pays[found], coal: gifts.flatMap((g, s) => (g ? [] : [s])) };
}
// TAP TO OPEN (Cody, 2026-10-02): the player taps the stockings. The turn is still decided before the first tap: the fair
// numbers fix the SEQUENCE (what the 1st, 2nd, 3rd… stocking opened holds: o.order's contents); the tap only picks WHERE each
// one appears, so the chances and payback are exactly the same. asTapped(o, taps) lays the turn out as played: the k-th
// stocking tapped holds the k-th item of the sequence, the ones never tapped hold the rest of it in order (left to right,
// top row first). Still exactly 8 gifts and 12 coals (it only moves the fair contents around). taps: stocking numbers 0–19.
export function asTapped(o, taps) {
  if (taps.length !== o.opened.length || new Set(taps).size !== taps.length || taps.some((d) => !(Number.isInteger(d) && d >= 0 && d < STOCKINGS)))
    throw new Error('taps must be one different stocking per stocking opened');
  const show = Array(STOCKINGS).fill(null), rest = o.order.slice(taps.length).map((s) => o.gifts[s]);
  taps.forEach((d, i) => { show[d] = o.gifts[o.opened[i]]; });
  for (let d = 0, k = 0; d < STOCKINGS; d++) if (show[d] === null) show[d] = rest[k++];
  return show;
}
// One turn. `rand` gives uniform numbers in [0,1) (the fair numbers in the real version): 38 of them.
export function deal(bet, rand = Math.random, pays = PAYS) {
  if (!BETS.includes(bet)) throw new Error('unknown bet ' + bet);
  const o = outcome(Array.from({ length: NUMS_USED }, () => rand()), pays);
  return result(o, bet);
}
// Exact money: no rounding here (1.75 × 10¢ = 17.5¢); screens round for display (LESSONS: keep money exact until the screen).
const result = (o, bet) => { const pay = o.mult * bet; return { ...o, bet, pay, ahead: pay > bet + 1e-9 }; };

export const MAX_MULT = topMult(DEFAULT_PAYS);
// One turn against the shared Drop pool (the same steps as spin() / Snowball Drop's play()): stop check, top-off, cover the
// top prize, the turn, pay, skim, top-off. forced (tests only): how many gifts are found before the coal (0–8).
export function play(state, bet, rand = Math.random, forced, pays = PAYS) {
  const R = { ...SPIN_RULES, ...(state.rules || {}) };
  if (!BETS.includes(bet)) throw new Error('unknown bet ' + bet);
  if (R.paused) return { paused: true, stopped: true };
  const before = topOff(state, R);
  if (state.pool < topMult(pays) * bet) return { paused: true, topOff: before };
  if (!state.prepaid) state.pool += bet * IN_PER_DOLLAR; // with runs the entry already reached the pool at purchase
  const r = forced !== undefined ? forcedTurn(bet, forced, pays) : deal(bet, rand, pays);
  state.pool -= r.pay;
  const res = { ...r, received: r.pay * (1 - FEE) };
  if (state.pool >= R.skimAt) { state.pool -= R.skim; res.skim = R.skim; state.treasury = (state.treasury || 0) + R.skim * (1 - FEE); }
  const add = before + topOff(state, R); if (add) res.topOff = add;
  return res;
}
// tests only: the gifts in the first k stockings Santa opens (in order 0, 1, 2…), the coal right after.
function forcedTurn(bet, k, pays) {
  if (!(Number.isInteger(k) && k >= 0 && k <= GIFTS)) throw new Error('forced gifts must be 0–8');
  const order = Array.from({ length: STOCKINGS }, (_, i) => i), gifts = order.map((s) => s < k || (s > k && s <= GIFTS));
  return result(settleOrder(gifts, order, pays), bet);
}
export function canPlay(state, bet, pays = PAYS) {
  const R = { ...SPIN_RULES, ...(state.rules || {}) };
  if (R.paused) return { ok: false, stopped: true };
  return { ok: (state.pool < R.topOffBelow ? R.topOffTo : state.pool) >= topMult(pays) * bet };
}
