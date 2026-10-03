// Stocking Stuffer: game rules only (no graphics). Cody's brief, 2026-10-02; new layout and prizes the same day (BOARD 2).
// A fireplace mantel with 20 Christmas stockings in two rows of 10. 9 hide a gift, 11 hide a lump of coal (the Naughty List).
// Each turn opens stockings one at a time, up to 8. The first coal ends the turn; finding 8 gifts ends it too.
// The turn pays by how many gifts were found before the coal:
//   coal first 0 · 1 gift 0.5× (less than it cost) · 2 → 1.5× · 3 → 3× · 4 → 7× · 5 → 15× · 6 → 25× · 7 → 50× · 8 → THE POOL JACKPOT
// THE POOL JACKPOT (Cody, 2026-10-02): finding 8 gifts pays 25% of the shared Game pool at that moment, scaled by the turn's
// size: a $1 turn wins 25% of the pool, a 10¢ turn 2.5%. About 1 turn in 13,997.
// THE ODDS ARE EXACT (no table, no rounding): with G gifts among 20 stockings (G = 9 now),
//   P(exactly k gifts, k < 8) = (G·(G−1)·…·(G−k+1)) · (20−G) / (20·19·…·(20−k)),   P(8 gifts) = (G·…·(G−7)) / (20·…·13)
// Over the common denominator 20·19·…·12 (9 stockings deep) every chance is a whole number of WAYS (out of TOTAL), so anyone can
// check them with a calculator. Fixed prizes alone pay back exactly 72.37%; the jackpot adds 1 in 13,997 × 25% × the pool in
// dollars (about 0.36% at a $200 pool, 0.89% at $500, 1.83% at $1,025). Cody chose this knowing it's about 73%, below the
// other games. All computed from the tables below (paybackAt), never typed in as text.
// BOARD 1 (2026-10-02, before the change): 8 gifts, 12 coal, 0 · 0.5 · 2.5 · 6 · 10 · 20 · 40 · 90 · 250× for all 8. Kept so
// turns played on it re-check as played (results carry `board`; none = board 1).
// FAIR NUMBERS (the house's order, house.js): 38 numbers per turn. The first 19 shuffle the gifts and coals into the
// 20 stockings (Fisher–Yates, one fair number per swap); the next 19 shuffle the 20 stockings into the order they open
// (the same way). Two shuffles so a different set of stockings opens each turn; the chances above are the same either way.
// "Check this result" re-runs both shuffles from the revealed secret and shows where every lump of coal was.
// POOL: Stocking Stuffer plays from the shared Game pool (SPIN_RULES = slots.js POOL_RULES). A turn only starts if the pool
// covers the biggest FIXED prize (50×: $50 on a $1 turn); the top-off ($200 → $500) always does, so turns are never refused
// for lack of pool. The jackpot is a share of the pool, so it can always be paid.
import { SPIN_RULES, topOff } from './spin.js?v=a80c15b94d';
import { FEE, IN_PER_DOLLAR, JACKPOT_PCT, poolJackpot } from './slots.js?v=a80c15b94d';

export const BOARD = 2; // results carry it, so "Check this result" re-runs the layout the turn was played on
export const STOCKINGS = 20, ROW = 10, MAX_OPEN = 8;
export const GIFTS_ON = { 1: 8, 2: 9 }; // gifts per board
export const GIFTS = GIFTS_ON[BOARD], COAL = STOCKINGS - GIFTS;
export const BETS = [0.10, 1.00];
// What a turn pays (× its price) by gifts found before the coal: index = gifts 0–7 (Cody, 2026-10-02). 8 gifts = the pool
// jackpot (not in this table). 1 gift stays 0.5× (an honest loss). The admin settings can publish another (settings.js
// `stocking2.pays`, with guard rails); the page swaps it in place (applyToGame).
export const DEFAULT_PAYS = Object.freeze([0, 0.5, 1.5, 3, 7, 15, 25, 50]);
export const PAYS = [...DEFAULT_PAYS];
// The jackpot's share of the pool (Cody: 25%); settings `stocking2.jackpotPct` can publish another (applyToGame sets the page's).
export const JP = { pct: JACKPOT_PCT };
// Board 1's table (index = gifts 0–8; 8 = all 8 gifts, 250×). Settings `stocking.pays` (from before this change) are board 1's.
export const BOARD1_PAYS = Object.freeze([0, 0.5, 2.5, 6, 10, 20, 40, 90, 250]);
const fall = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r *= n - i; return r; }; // n·(n−1)·…·(n−k+1)
export const TOTAL = fall(STOCKINGS, MAX_OPEN + 1); // 20·19·…·12 = 60,949,324,800
// WAYS[k]: turns (out of TOTAL) that find exactly k gifts. k < 8: k gifts then a coal; k = 8: 8 gifts in a row.
export const waysFor = (G) => Array.from({ length: MAX_OPEN + 1 }, (_, k) => (k < MAX_OPEN ? fall(G, k) * (STOCKINGS - G) * fall(STOCKINGS - k - 1, MAX_OPEN - k) : fall(G, MAX_OPEN) * (STOCKINGS - MAX_OPEN)));
export const WAYS = waysFor(GIFTS);
export const WAYS_ON = { 1: waysFor(GIFTS_ON[1]), 2: WAYS };
export const odds = (k) => WAYS[k] / TOTAL;
export const atLeast = (k) => fall(GIFTS, k) / fall(STOCKINGS, k);
export const jackpotOdds = () => WAYS[MAX_OPEN] / TOTAL; // 1 in 13,997 (8 gifts in a row)
// Fixed prizes only (72.37% with Cody's table). Board 1 tables (9 prizes) pay all of their table, the 250× included.
export const payback = (pays = PAYS, board = BOARD) => pays.reduce((a, p, k) => a + p * WAYS_ON[board][k], 0) / TOTAL;
// With the pool jackpot at a given Game pool size (dollars): fixed + 1 in 13,997 × pct × pool (the jackpot pays pct × pool ×
// the turn's price, so its share of what's played doesn't depend on the turn's size).
export const paybackAt = (pool, pct = JP.pct, pays = PAYS) => payback(pays) + jackpotOdds() * pct * pool;
export const realWin = (pays = PAYS) => (pays.reduce((a, p, k) => a + (p > 1 ? WAYS[k] : 0), 0) + WAYS[MAX_OPEN]) / TOTAL; // more back than it cost (the jackpot always is)
export const topMult = (pays = PAYS) => Math.max(...pays); // the biggest FIXED prize
export const NUMS_USED = 2 * (STOCKINGS - 1); // 38

// Fisher–Yates with fair numbers: for i from the last place down to 1, swap place i with place floor(u × (i + 1)).
export function shuffle(items, nums) {
  const a = [...items];
  for (let i = a.length - 1, n = 0; i > 0; i--, n++) { const j = Math.floor(nums[n] * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// What a turn's numbers give (anyone can re-run this), on the layout it was played on (board 1: 8 gifts; board 2: 9).
// gifts: true per stocking that holds a gift (stockings 0–9 the top row left to right, 10–19 the bottom row); order: the
// stockings in the order they open; opened: the ones that did open. Board 2: 8 gifts = `jackpot: true` (its amount comes from
// the pool at that moment); otherwise `mult` from the pay table. pays: that board's table (board 1: 9 prizes, board 2: 8).
export function outcome(nums, pays = PAYS, board = BOARD) {
  if (nums.length < NUMS_USED) throw new Error('stocking: needs ' + NUMS_USED + ' numbers');
  const G = GIFTS_ON[board]; if (!G) throw new Error('stocking: unknown board ' + board);
  const gifts = shuffle([...Array(G).fill(true), ...Array(STOCKINGS - G).fill(false)], nums.slice(0, STOCKINGS - 1));
  const order = shuffle(Array.from({ length: STOCKINGS }, (_, i) => i), nums.slice(STOCKINGS - 1, NUMS_USED));
  return settleOrder(gifts, order, pays, board);
}
function settleOrder(gifts, order, pays, board) {
  const opened = [];
  let found = 0;
  for (const s of order) { opened.push(s); if (!gifts[s]) break; if (++found === MAX_OPEN) break; }
  const coal = gifts.flatMap((g, s) => (g ? [] : [s]));
  if (board === 1) return { gifts, order, opened, found, mult: pays[found], coal, board: 1 };
  return found === MAX_OPEN ? { gifts, order, opened, found, jackpot: true, coal, board } : { gifts, order, opened, found, mult: pays[found], coal, board };
}
// TAP TO OPEN (Cody, 2026-10-02): the player taps the stockings. The turn is still decided before the first tap: the fair
// numbers fix the SEQUENCE (what the 1st, 2nd, 3rd… stocking opened holds: o.order's contents); the tap only picks WHERE each
// one appears, so the chances and payback are exactly the same. asTapped(o, taps) lays the turn out as played: the k-th
// stocking tapped holds the k-th item of the sequence, the ones never tapped hold the rest of it in order (left to right,
// top row first). Still exactly the board's gifts and coals (9 and 11; it only moves the fair contents around). taps: 0–19.
export function asTapped(o, taps) {
  if (taps.length !== o.opened.length || new Set(taps).size !== taps.length || taps.some((d) => !(Number.isInteger(d) && d >= 0 && d < STOCKINGS)))
    throw new Error('taps must be one different stocking per stocking opened');
  const show = Array(STOCKINGS).fill(null), rest = o.order.slice(taps.length).map((s) => o.gifts[s]);
  taps.forEach((d, i) => { show[d] = o.gifts[o.opened[i]]; });
  for (let d = 0, k = 0; d < STOCKINGS; d++) if (show[d] === null) show[d] = rest[k++];
  return show;
}
// One turn's stockings (the pay is worked out by play(): the jackpot needs the pool). `rand` gives uniform numbers in [0,1)
// (the fair numbers in the real version): 38 of them.
export function deal(bet, rand = Math.random, pays = PAYS) {
  if (!BETS.includes(bet)) throw new Error('unknown bet ' + bet);
  return { ...outcome(Array.from({ length: NUMS_USED }, () => rand()), pays), bet };
}

export const MAX_MULT = topMult(DEFAULT_PAYS); // 50× (7 gifts): the biggest FIXED prize
// One turn against the shared Game pool (the same steps as Snowball Drop's play()): stop check, top-off, cover the top fixed
// prize, the turn, pay, skim, top-off. forced (tests only): how many gifts are found before the coal (0–8; 8 = the jackpot).
// pct: the jackpot's share of the pool (the play's settings; Cody's pool rule `jackpotPct` overrides it, like Big Hat's).
export function play(state, bet, rand = Math.random, forced, pays = PAYS, pct = JP.pct) {
  const R = { ...SPIN_RULES, ...(state.rules || {}) };
  if (!BETS.includes(bet)) throw new Error('unknown bet ' + bet);
  if (R.paused) return { paused: true, stopped: true };
  const before = topOff(state, R);
  if (state.pool < topMult(pays) * bet) return { paused: true, topOff: before };
  if (!state.prepaid) state.pool += bet * IN_PER_DOLLAR; // with runs the entry already reached the pool at purchase
  const o = forced !== undefined ? forcedTurn(bet, forced, pays) : deal(bet, rand, pays);
  let r;
  if (o.jackpot) { // the pool jackpot: pct × the pool at this moment × (bet ÷ $1), exact (a share of the pool, not whole cents)
    const p = R.jackpotPct ?? pct, jackpotPool = state.pool, pay = poolJackpot(jackpotPool, p, bet);
    r = { ...o, jackpotPool, pct: p, mult: pay / bet, pay, ahead: pay > bet + 1e-9 };
  } else {
    // Exact money: no rounding here (1.5 × 10¢ = 15¢; 0.5 × 10¢ = 5¢); screens round for display (LESSONS)
    const pay = o.mult * bet; r = { ...o, pay, ahead: pay > bet + 1e-9 };
  }
  state.pool -= r.pay;
  const res = { ...r, received: r.pay * (1 - FEE) };
  if (state.pool >= R.skimAt) { state.pool -= R.skim; res.skim = R.skim; state.treasury = (state.treasury || 0) + R.skim * (1 - FEE); }
  const add = before + topOff(state, R); if (add) res.topOff = add;
  return res;
}
// tests only: the gifts in the first k stockings opened (in order 0, 1, 2…), the coal right after (the other gifts after it).
function forcedTurn(bet, k, pays) {
  if (!(Number.isInteger(k) && k >= 0 && k <= MAX_OPEN)) throw new Error('forced gifts must be 0–8');
  const order = Array.from({ length: STOCKINGS }, (_, i) => i), gifts = order.map((s) => s < k || (s > k && s <= GIFTS));
  return { ...settleOrder(gifts, order, pays, BOARD), bet };
}
export function canPlay(state, bet, pays = PAYS) {
  const R = { ...SPIN_RULES, ...(state.rules || {}) };
  if (R.paused) return { ok: false, stopped: true };
  return { ok: (state.pool < R.topOffBelow ? R.topOffTo : state.pool) >= topMult(pays) * bet };
}
