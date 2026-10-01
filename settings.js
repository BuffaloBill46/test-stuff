// Game settings Cody can change from the admin screen (prices, odds, prizes, store), as ONE versioned record.
// Every change is a new version, wallet-signed and logged; every play records the version it used, so "Check this result"
// works on old plays after odds change. build() turns settings into the game rules' shapes; check() is the guard rail:
// it refuses anything that could hurt players or drain a pool, and reports what a change does BEFORE it's signed.
import { MACHINES, SYMBOLS, SYM, stats, POOL_RULES, pull } from './slots.js';
import { MAIN, BONUS, MAIN_SLICES, BONUS_SLICES, MAIN_COUNTS, BONUS_COUNTS, SPIN_RULES, layout, odds as spinOdds, payback as spinPaybackOf, topMult } from './spin.js';
import { ITEMS, SLOTS, BY_ID } from './catalog.js';
import { MAX_MULT as DROP_TOP, BETS as DROP_BETS } from './plinko.js'; // Snowball Drop shares the Spin pool (Cody, 2026-09-30)
import { KINDS, SIZES } from './credits.js';

const big = MACHINES.big;
// The built-in items, captured before applyToGame() can change the shared ones.
const ORIGINAL_ITEMS = ITEMS.map((x) => ({ ...x }));
// Version 0 = the game exactly as built (Cody's decided numbers).
export const DEFAULT_SETTINGS = Object.freeze({
  version: 0,
  prices: { spin10: 0.10, spin100: 1.00, big: 1.00, ticket: 0.10 },
  spin: { main: { ...MAIN_COUNTS }, bonus: { ...BONUS_COUNTS } },  // how many of the 40 main / 12 bonus segments show each result
  big: { counts: { ...big.counts }, pays: structuredClone(big.pays), hatBonus: big.hatBonus, jackpotPct: big.jackpotPct, jackpotOdds: 1 / big.poolJackpotOdds },
  store: { items: [] },                                                   // additions / changes on top of catalog.js
});

// The machine and wheel the rules use, from a settings record.
export function build(s) {
  const m = { ...big, bet: s.prices.big, counts: s.big.counts, pays: s.big.pays, hatBonus: s.big.hatBonus, jackpotPct: s.big.jackpotPct, poolJackpotOdds: 1 / s.big.jackpotOdds };
  m.strips = Array.from({ length: m.reels }, (_, i) => spreadStrip(m.counts, 1000 * m.reels + 17 * i + 3));
  m.stripLen = m.strips[0].length; m.lineBet = m.bet / m.lines.length;
  return { machine: m, wheel: wheelFrom(s.spin), prices: s.prices };
}
// Same spreading as slots.js (so version 0 gives the identical strips): deterministic shuffle, no symbol twice in a row.
// Symbols go in the game's fixed symbol order, NOT the order the counts happen to be listed in: the database stores settings
// with its own key order, and the reels must come out the same for anyone rebuilding them from the published numbers.
function spreadStrip(counts, seed) {
  const bag = []; for (const { id } of SYMBOLS) for (let i = 0; i < (counts[id] || 0); i++) bag.push(SYM[id]);
  let x = seed >>> 0; const r = () => { x = (Math.imul(x ^ (x >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return x / 4294967296; };
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  for (let pass = 0; pass < 50; pass++) { let fixed = true;
    for (let i = 0; i < bag.length; i++) { const j = (i + 1) % bag.length; if (bag[i] === bag[j]) { fixed = false; const k = Math.floor(r() * bag.length); [bag[j], bag[k]] = [bag[k], bag[j]]; } }
    if (fixed) break; }
  return bag;
}
// The two Spin wheels from their segment counts: every segment the same size, results spread evenly (spin.js layout()).
export function wheelFrom(spin) { return { main: layout(spin.main, MAIN_SLICES), bonus: layout(spin.bonus, BONUS_SLICES) }; }

// What a settings record does, and whether it's allowed. { ok, problems: [...], report: {...} }
export const LIMITS = { price: [0.01, 100], payback: [0.5, 0.98], jackpotPct: [0.01, 0.5], jackpotOdds: [1000, 10_000_000] };
export function check(s, rules = { spin: SPIN_RULES, slots: POOL_RULES }) {
  const p = [], num = (v) => typeof v === 'number' && Number.isFinite(v);
  for (const [k, v] of Object.entries(s.prices || {})) if (!num(v) || v < LIMITS.price[0] || v > LIMITS.price[1]) p.push(`price ${k} must be $0.01–$100`);
  if (!(s.prices?.spin10 < s.prices?.spin100)) p.push('the small spin must cost less than the big spin');
  // Spin is played from a balance kept in whole 10¢ units (Cody: one balance, either size), so its sizes must be whole 10¢s
  for (const k of ['spin10', 'spin100']) if (num(s.prices?.[k]) && Math.abs(s.prices[k] * 10 - Math.round(s.prices[k] * 10)) > 1e-9) p.push(`${k === 'spin10' ? 'the small' : 'the big'} spin must be a whole number of 10¢ (e.g. $0.10, $0.50, $2.00)`);
  const mw = s.spin?.main || {}, bw = s.spin?.bonus || {}, sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const bad = (o, star) => Object.entries(o).some(([m, n]) => !Number.isInteger(n) || n < 0 || !((star && m === 'star') || (/^\d+$/.test(m) && +m <= 100)));
  if (bad(mw, true) || bad(bw, false)) p.push('Spin segment counts must be whole numbers, for whole-number prizes (and "star" on the main wheel)');
  if (sum(mw) !== MAIN_SLICES) p.push(`the main Spin wheel must have exactly ${MAIN_SLICES} segments (has ${sum(mw)})`);
  if (sum(bw) !== BONUS_SLICES) p.push(`the bonus Spin wheel must have exactly ${BONUS_SLICES} segments (has ${sum(bw)})`);
  const c = s.big?.counts || {};
  if (SYMBOLS.some((x) => !Number.isInteger(c[x.id]) || c[x.id] < 0) || Object.keys(c).some((k) => !(k in SYM))) p.push('Big Hat symbol counts must be whole numbers for the 10 symbols');
  const len = Object.values(c).reduce((a, b) => a + b, 0); if (len < 20 || len > 400) p.push('a Big Hat reel must hold 20–400 symbols');
  for (const [sym, byN] of Object.entries(s.big?.pays || {})) { if (!(sym in SYM) || sym === 'coal') p.push(`no prizes for ${sym}`);
    for (const [n, x] of Object.entries(byN)) if (!['3', '4', '5'].includes(n) || !num(x) || x < 0 || x > 1000) p.push(`${sym} ${n} in a row: prize must be 0–1000×`); }
  if (!num(s.big?.hatBonus) || s.big.hatBonus < 0 || s.big.hatBonus > 1) p.push('hat bonus must be 0–1× (of the pull price)');
  if (!num(s.big?.jackpotPct) || s.big.jackpotPct < LIMITS.jackpotPct[0] || s.big.jackpotPct > LIMITS.jackpotPct[1]) p.push('pool jackpot must be 1%–50% of the pool');
  if (!num(s.big?.jackpotOdds) || s.big.jackpotOdds < LIMITS.jackpotOdds[0] || s.big.jackpotOdds > LIMITS.jackpotOdds[1]) p.push('pool jackpot odds must be 1 in 1,000 to 1 in 10,000,000');
  for (const it of s.store?.items || []) p.push(...checkItem(it));
  if (p.length) return { ok: false, problems: p };
  const { machine: m, wheel } = build(s), st = stats(m);
  const spinPayback = spinPaybackOf(wheel), spinWin = Object.entries(spinOdds(wheel)).reduce((a, [x, q]) => a + (x >= 2 ? q : 0), 0);
  const maxMult = topMult(wheel), topFixed = Math.max(...Object.values(m.pays).flatMap((q) => Object.values(q))) * m.bet;
  if (spinPayback < LIMITS.payback[0] || spinPayback > LIMITS.payback[1]) p.push(`Spin would pay back ${(spinPayback * 100).toFixed(1)}% (allowed ${LIMITS.payback.map((x) => x * 100 + '%').join('–')}; over 100% drains the pool)`);
  if (st.payback < LIMITS.payback[0] || st.payback > LIMITS.payback[1]) p.push(`Big Hat would pay back ${(st.payback * 100).toFixed(1)}% (allowed ${LIMITS.payback.map((x) => x * 100 + '%').join('–')})`);
  // a pool must be able to cover its biggest fixed prize after a top-off, or the game locks itself (LESSONS)
  if (rules.slots.topOffTo < topFixed) p.push(`the Slots top-off ($${rules.slots.topOffTo}) must cover the top prize ($${topFixed}), or the game can lock`);
  if (rules.spin.topOffTo < maxMult * s.prices.spin100) p.push(`the Spin top-off ($${rules.spin.topOffTo}) must cover the top prize ($${maxMult * s.prices.spin100})`);
  const dropTop = DROP_TOP * Math.max(...DROP_BETS); // Snowball Drop pays from the same pool
  if (rules.spin.topOffTo < dropTop) p.push(`the Spin top-off ($${rules.spin.topOffTo}) must cover Snowball Drop's top prize ($${dropTop}): they share the pool`);
  // real-win rate for Big Hat: simulated (lines interact), 20,000 pulls on a throwaway pool
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); let ahead = 0; const pool = { pool: 1e9, prepaid: true };
  for (let i = 0; i < 20000; i++) if (pull(pool, m, rnd).ahead) ahead++;
  const report = {
    spin: { payback: spinPayback, realWin: spinWin, top: maxMult, stars: s.spin.main.star || 0 },
    big: { payback: st.payback, realWin: ahead / 20000, topPrize: topFixed, top100: st.each['hat:5'] ? 1 / (st.each['hat:5'] * st.lines) : null, jackpot: `${Math.round(s.big.jackpotPct * 100)}% of the pool, 1 in ${Math.round(s.big.jackpotOdds).toLocaleString()}` },
    prices: s.prices,
  };
  return p.length ? { ok: false, problems: p, report } : { ok: true, problems: [], report };
}
export function checkItem(it) {
  const p = [], one = (it.level !== undefined) !== (it.price !== undefined);
  if (!/^[a-z0-9_]{3,40}$/.test(it.id || '')) p.push(`item id "${it.id}" must be 3–40 lowercase letters, digits or _`);
  if (!SLOTS.includes(it.slot)) p.push(`item ${it.id}: slot must be one of ${SLOTS.join(', ')}`);
  if (!it.name || String(it.name).length > 24) p.push(`item ${it.id}: name 1–24 characters`);
  if (!one) p.push(`item ${it.id}: unlocks at a level OR has a price, not both`);
  if (it.level !== undefined && !(Number.isInteger(it.level) && it.level >= 1 && it.level <= 100)) p.push(`item ${it.id}: level 1–100`);
  if (it.price !== undefined && !(it.price >= 0.01 && it.price <= 100)) p.push(`item ${it.id}: price $0.01–$100`);
  const base = ITEMS.find((x) => x.id === it.id);
  if (!base) { // a NEW item: only looks the game can already draw (a colour on shirts, pants, snowballs; or an existing face)
    if (['shirt', 'pants', 'snow'].includes(it.slot)) { if (!Number.isInteger(it.color) || it.color < 0 || it.color > 0xffffff) p.push(`new item ${it.id}: needs a colour`); }
    else if (it.slot === 'face') { if (!ITEMS.some((x) => x.slot === 'face' && x.face === it.face)) p.push(`new face ${it.id}: must reuse an existing face look (a brand-new shape needs code)`); }
    else p.push(`new ${it.slot} items need code (skin tones are fixed)`);
  }
  return p;
}
// The store's item list with the settings' additions/changes applied.
export function itemsWith(s) {
  const out = ORIGINAL_ITEMS.map((x) => ({ ...x }));
  for (const it of s.store?.items || []) {
    const i = out.findIndex((x) => x.id === it.id), row = { ...(i >= 0 ? out[i] : {}), ...it };
    if (it.level !== undefined) delete row.price; if (it.price !== undefined) delete row.level;
    if (i >= 0) out[i] = row; else out.push(row);
  }
  return out;
}

// The PAGE in server mode: make the shared game data match the published settings, in place, BEFORE the machine, wheel,
// paytable, buy counter and store are drawn (they all read these). Otherwise the page could draw an old wheel while the
// server decides on the new one.
export function applyToGame(s) {
  const b = build(s);
  Object.assign(MACHINES.big, b.machine);
  MAIN.splice(0, MAIN.length, ...b.wheel.main); BONUS.splice(0, BONUS.length, ...b.wheel.bonus);
  for (const k of Object.keys(KINDS)) if (s.prices[k]) KINDS[k].bet = s.prices[k];
  SIZES.spin.splice(0, SIZES.spin.length, s.prices.spin10, s.prices.spin100); // the Spin balance plays these two sizes
  const items = itemsWith(s); ITEMS.splice(0, ITEMS.length, ...items); BY_ID.clear(); for (const i of items) BY_ID.set(i.id, i);
  return b;
}
