// Game settings Cody can change from the admin screen (prices, odds, prizes, store), as ONE versioned record.
// Every change is a new version, wallet-signed and logged; every play records the version it used, so "Check this result"
// works on old plays after odds change. build() turns settings into the game rules' shapes; check() is the guard rail:
// it refuses anything that could hurt players or drain a pool, and reports what a change does BEFORE it's signed.
import { MACHINES, SYMBOLS, SYM, stats, POOL_RULES, pull } from './slots.js?v=6272e38358';
import { ITEMS, SLOTS, BY_ID } from './catalog.js?v=6272e38358';
// SANTA HAT SPIN REMOVED (Cody, 2026-10-04): its prices (spin10/spin100) and wheel (spin) are gone from new settings; records
// published before still carry them, and they are simply ignored. rules.spin below is the shared Game POOL's key, not the wheel.
// ONE GAME POOL (Cody, 2026-10-02): Big Hat, Snowball Drop and Stocking Stuffer all play from the shared pool (rules.spin), and
// each has a pool jackpot (a % of that pool, scaled by the play's size). Their payback depends on the pool, so it is reported
// as fixed prizes + the jackpot at a stated pool size, and the guard rails check it at BOTH ends of the pool's normal range:
// the top-off point (topOffBelow, $200: a play never starts below it) and the skim point (skimAt, $1,025: the pool never stays
// at or above it). The headline figure is at the pool's start (start, $500).
import { MAX_MULT as DROP_TOP, BETS as DROP_BETS, JP as DROP_JP, paybackAt as dropPaybackAt, payback as dropFixedPayback, jackpotOdds as dropJackpotOdds, realWin as dropWinOf } from './plinko.js?v=6272e38358';
import { KINDS } from './credits.js?v=6272e38358';
// Stocking Stuffer (Cody, 2026-10-02): its pay table (× the turn price, by gifts 0–7; 8 gifts = the pool jackpot) is editable
import { DEFAULT_PAYS as STOCK_PAYS, BOARD1_PAYS, PAYS as STOCK_LIVE, JP as STOCK_JP, BETS as STOCK_BETS, MAX_OPEN as STOCK_OPEN, payback as stockPaybackOf, paybackAt as stockPaybackAt, jackpotOdds as stockJackpotOdds, realWin as stockWinOf, topMult as stockTopOf } from './stocking.js?v=6272e38358';
import { JACKPOT_PCT } from './slots.js?v=6272e38358';

const big = MACHINES.big;
// The built-in items, captured before applyToGame() can change the shared ones.
const ORIGINAL_ITEMS = ITEMS.map((x) => ({ ...x }));
// Version 0 = the game exactly as built (Cody's decided numbers).
export const DEFAULT_SETTINGS = Object.freeze({
  version: 0,
  prices: { big: 1.00, ticket: 0.10 },
  big: { counts: { ...big.counts }, pays: structuredClone(big.pays), hatBonus: big.hatBonus, jackpotPct: big.jackpotPct, jackpotOdds: 1 / big.poolJackpotOdds },
  store: { items: [] },                                                   // additions / changes on top of catalog.js
  stocking: { pays: [...BOARD1_PAYS] },                                   // Stocking Stuffer BOARD 1 (8 gifts; old turns re-check on it)
  stocking2: { pays: [...STOCK_PAYS], jackpotPct: JACKPOT_PCT },          // Stocking Stuffer board 2: × the turn price for 0–7 gifts; 8 = jackpot
  drop: { jackpotPct: JACKPOT_PCT },                                      // Snowball Drop board 3: the centre present's share of the pool
});
// Settings published before Stocking Stuffer existed have no `stocking`: their (board 1) re-checks use Cody's board-1 table.
export const stockPays = (s) => s.stocking?.pays || [...BOARD1_PAYS];
// Settings published before 2026-10-02's shared pool have no `stocking2` / `drop`: new plays on them use Cody's tables and 25%.
export const stock2Of = (s) => ({ pays: s.stocking2?.pays || [...STOCK_PAYS], jackpotPct: s.stocking2?.jackpotPct ?? JACKPOT_PCT });
export const dropOf = (s) => ({ jackpotPct: s.drop?.jackpotPct ?? JACKPOT_PCT });

// The machine and game tables the rules use, from a settings record.
export function build(s) {
  const m = { ...big, bet: s.prices.big, counts: s.big.counts, pays: s.big.pays, hatBonus: s.big.hatBonus, jackpotPct: s.big.jackpotPct, poolJackpotOdds: 1 / s.big.jackpotOdds };
  m.strips = Array.from({ length: m.reels }, (_, i) => spreadStrip(m.counts, 1000 * m.reels + 17 * i + 3));
  m.stripLen = m.strips[0].length; m.lineBet = m.bet / m.lines.length;
  return { machine: m, prices: s.prices, stocking: { pays: stockPays(s) }, stocking2: stock2Of(s), drop: dropOf(s) };
}
// Payback of each Game-pool game at a given pool size (dollars): fixed prizes + its pool jackpot (pct × pool, × the play's size
// for Drop and Stocking, whose jackpot share of what's played is the same at any size; Big Hat is $1 a pull: pct × pool ÷ price).
// override: Cody's pool rule `jackpotPct` on the Game pool, which every game's jackpot uses instead of its published % (as play does).
export function paybacksAt(b, pool, bigFixed = stats(b.machine).payback, override) {
  const m = b.machine, pct = (own) => override ?? own;
  return { big: bigFixed + m.poolJackpotOdds * pct(m.jackpotPct) * pool / m.bet, drop: dropPaybackAt(pool, pct(b.drop.jackpotPct)), stocking: stockPaybackAt(pool, pct(b.stocking2.jackpotPct), b.stocking2.pays) };
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

// What a settings record does, and whether it's allowed. { ok, problems: [...], report: {...} }
export const LIMITS = { price: [0.01, 100], payback: [0.5, 0.98], jackpotPct: [0.01, 0.5], jackpotOdds: [1000, 10_000_000] };
export function check(s, rules = { spin: POOL_RULES, slots: POOL_RULES }) {
  const p = [], num = (v) => typeof v === 'number' && Number.isFinite(v);
  for (const [k, v] of Object.entries(s.prices || {})) if (!['spin10', 'spin100'].includes(k) && (!num(v) || v < LIMITS.price[0] || v > LIMITS.price[1])) p.push(`price ${k} must be $0.01–$100`);
  const c = s.big?.counts || {};
  if (SYMBOLS.some((x) => !Number.isInteger(c[x.id]) || c[x.id] < 0) || Object.keys(c).some((k) => !(k in SYM))) p.push('Big Hat symbol counts must be whole numbers for the 10 symbols');
  const len = Object.values(c).reduce((a, b) => a + b, 0); if (len < 20 || len > 400) p.push('a Big Hat reel must hold 20–400 symbols');
  for (const [sym, byN] of Object.entries(s.big?.pays || {})) { if (!(sym in SYM) || sym === 'coal') p.push(`no prizes for ${sym}`);
    for (const [n, x] of Object.entries(byN)) if (!['3', '4', '5'].includes(n) || !num(x) || x < 0 || x > 1000) p.push(`${sym} ${n} in a row: prize must be 0–1000×`); }
  if (!num(s.big?.hatBonus) || s.big.hatBonus < 0 || s.big.hatBonus > 1) p.push('hat bonus must be 0–1× (of the pull price)');
  if (!num(s.big?.jackpotPct) || s.big.jackpotPct < LIMITS.jackpotPct[0] || s.big.jackpotPct > LIMITS.jackpotPct[1]) p.push('pool jackpot must be 1%–50% of the pool');
  if (!num(s.big?.jackpotOdds) || s.big.jackpotOdds < LIMITS.jackpotOdds[0] || s.big.jackpotOdds > LIMITS.jackpotOdds[1]) p.push('pool jackpot odds must be 1 in 1,000 to 1 in 10,000,000');
  for (const it of s.store?.items || []) p.push(...checkItem(it));
  // Stocking Stuffer board 1's table (old turns re-check on it; no longer played): 9 prizes (0 to 8 gifts), never less for more
  const sp1 = stockPays(s);
  if (!Array.isArray(sp1) || sp1.length !== STOCK_OPEN + 1 || sp1.some((x) => !num(x) || x < 0 || x > 1000)) p.push(`Stocking Stuffer's old (8-gift) table needs ${STOCK_OPEN + 1} prizes, each 0–1000×`);
  else if (sp1.some((x, k) => k > 0 && x < sp1[k - 1])) p.push('Stocking Stuffer\'s old (8-gift) table: more gifts must never pay less than fewer gifts');
  // Stocking Stuffer (board 2, played now): 8 fixed prizes (0 to 7 gifts), each 0–1000×, never less for more; 8 gifts = jackpot
  const s2 = stock2Of(s), sp = s2.pays;
  if (!Array.isArray(sp) || sp.length !== STOCK_OPEN || sp.some((x) => !num(x) || x < 0 || x > 1000)) p.push(`Stocking Stuffer needs ${STOCK_OPEN} prizes (0 to ${STOCK_OPEN - 1} gifts; ${STOCK_OPEN} gifts is the pool jackpot), each 0–1000×`);
  else if (sp.some((x, k) => k > 0 && x < sp[k - 1])) p.push('Stocking Stuffer: more gifts must never pay less than fewer gifts');
  const pctOk = (v) => num(v) && v >= LIMITS.jackpotPct[0] && v <= LIMITS.jackpotPct[1];
  if (!pctOk(s2.jackpotPct)) p.push('Stocking Stuffer\'s pool jackpot must be 1%–50% of the pool');
  if (!pctOk(dropOf(s).jackpotPct)) p.push('Snowball Drop\'s pool jackpot must be 1%–50% of the pool');
  if (p.length) return { ok: false, problems: p };
  const b = build(s), { machine: m } = b, st = stats(m), G = rules.spin; // G: the shared Game pool's rules (its key is 'spin')
  const topFixed = Math.max(...Object.values(m.pays).flatMap((q) => Object.values(q))) * m.bet;
  const allowed = LIMITS.payback.map((x) => x * 100 + '%').join('–'), pc = (x) => (x * 100).toFixed(1) + '%';
  // Payback of the three Game-pool games, fixed prizes + pool jackpot, at the LOW end (the top-off point) and the HIGH end (the
  // skim point) of the pool: both must be inside the limits, so no pool size in between can break them (the payback rises
  // steadily with the pool). Reported at the start ($500) as the headline.
  const lo = G.topOffBelow, hi = G.skimAt, ov = G.jackpotPct;
  const at = { lo: paybacksAt(b, lo, st.payback, ov), start: paybacksAt(b, G.start ?? G.topOffTo, st.payback, ov), hi: paybacksAt(b, hi, st.payback, ov) };
  for (const [k, name] of [['big', 'Big Hat'], ['drop', 'Snowball Drop'], ['stocking', 'Stocking Stuffer']]) {
    for (const [end, pool] of [['lo', lo], ['hi', hi]]) if (!(at[end][k] >= LIMITS.payback[0] && at[end][k] <= LIMITS.payback[1])) p.push(`${name} would pay back ${pc(at[end][k])} with the jackpot at a $${pool} Game pool (allowed ${allowed})`);
  }
  // a pool must be able to cover every game's biggest FIXED prize after a top-off, or a game locks itself (LESSONS). One pool.
  if (G.topOffTo < topFixed) p.push(`the Game pool top-off ($${G.topOffTo}) must cover Big Hat's top prize ($${topFixed}), or the game can lock`);
  const dropTop = DROP_TOP * Math.max(...DROP_BETS);
  if (G.topOffTo < dropTop) p.push(`the Game pool top-off ($${G.topOffTo}) must cover Snowball Drop's top prize ($${dropTop})`);
  const stockTop = stockTopOf(sp) * Math.max(...STOCK_BETS);
  if (G.topOffTo < stockTop) p.push(`the Game pool top-off ($${G.topOffTo}) must cover Stocking Stuffer's top fixed prize ($${stockTop})`);
  // real-win rate for Big Hat: simulated (lines interact), 20,000 pulls on a throwaway pool
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); let ahead = 0; const pool = { pool: 1e9, prepaid: true };
  for (let i = 0; i < 20000; i++) if (pull(pool, m, rnd).ahead) ahead++;
  const range = (k) => ({ payback: at.start[k], at: G.start ?? G.topOffTo, low: at.lo[k], lowPool: lo, high: at.hi[k], highPool: hi });
  const report = {
    big: { ...range('big'), fixed: st.payback, realWin: ahead / 20000, topPrize: topFixed, top100: st.each['hat:5'] ? 1 / (st.each['hat:5'] * st.lines) : null, jackpot: `${+((ov ?? s.big.jackpotPct) * 100).toFixed(2)}% of the pool${ov !== undefined ? " (the Game pool override)" : ""}, 1 in ${Math.round(s.big.jackpotOdds).toLocaleString()}` },
    drop: { ...range('drop'), fixed: dropFixedPayback(), realWin: dropWinOf(), top: DROP_TOP, jackpot: `${+((ov ?? b.drop.jackpotPct) * 100).toFixed(2)}% of the pool × the drop's size, 1 in ${Math.round(1 / dropJackpotOdds()).toLocaleString()}` },
    prices: s.prices,
    stocking: { ...range('stocking'), fixed: stockPaybackOf(sp), realWin: stockWinOf(sp), top: stockTopOf(sp), jackpot: `${+((ov ?? s2.jackpotPct) * 100).toFixed(2)}% of the pool × the turn's size, 1 in ${Math.round(1 / stockJackpotOdds()).toLocaleString()}` },
  };
  return p.length ? { ok: false, problems: p, report } : { ok: true, problems: [], report };
}
export function checkItem(it) {
  const p = [], one = (it.level !== undefined) !== (it.price !== undefined);
  if (!/^[a-z0-9_]{3,40}$/.test(it.id || '')) p.push(`item id "${it.id}" must be 3–40 lowercase letters, digits or _`);
  // Cody, 2026-10-01: the editor prices special snowballs and special gear too, and keeps the looks (sold on the Avatar screen
  // or given away in season passes). A NEW special snowball or gear is refused below: what it does in a match needs code.
  if (![...SLOTS, 'sball', 'gear'].includes(it.slot)) p.push(`item ${it.id}: slot must be one of ${[...SLOTS, 'sball', 'gear'].join(', ')}`);
  if (!it.name || String(it.name).length > 24) p.push(`item ${it.id}: name 1–24 characters`);
  if (!one) p.push(`item ${it.id}: unlocks at a level OR has a price, not both`);
  if (it.level !== undefined && !(Number.isInteger(it.level) && it.level >= 1 && it.level <= 100)) p.push(`item ${it.id}: level 1–100`);
  if (it.price !== undefined && !(it.price >= 0.01 && it.price <= 100)) p.push(`item ${it.id}: price $0.01–$100`);
  const base = ITEMS.find((x) => x.id === it.id);
  if (!base) { // a NEW item: only looks the game can already draw (a colour on shirts, pants, snowballs; or an existing face)
    if (['shirt', 'pants', 'snow'].includes(it.slot)) { if (!Number.isInteger(it.color) || it.color < 0 || it.color > 0xffffff) p.push(`new item ${it.id}: needs a colour`); }
    else if (it.slot === 'face') { if (!ITEMS.some((x) => x.slot === 'face' && x.face === it.face)) p.push(`new face ${it.id}: must reuse an existing face look (a brand-new shape needs code)`); }
    else if (it.slot === 'hat' || it.slot === 'pack') { // a new colour of a hat or backpack the game can already draw
      const k = it.slot; if (!ITEMS.some((x) => x.slot === k && x[k] === it[k] && it[k] !== 'none')) p.push(`new ${k === 'hat' ? 'hat' : 'backpack'} ${it.id}: must reuse an existing shape (a brand-new shape needs code)`);
      if (!Number.isInteger(it.color) || it.color < 0 || it.color > 0xffffff) p.push(`new item ${it.id}: needs a colour`); }
    else if (it.slot === 'sball' || it.slot === 'gear') p.push(`new ${it.slot === 'sball' ? 'special snowball' : 'special gear'} ${it.id}: what it does in a match needs code (you can change the price of the existing ones)`);
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

// The PAGE in server mode: make the shared game data match the published settings, in place, BEFORE the machine,
// paytable, buy counter and store are drawn (they all read these). Otherwise the page could draw old prizes while the
// server decides on the new ones.
export function applyToGame(s) {
  const b = build(s);
  Object.assign(MACHINES.big, b.machine);
  for (const k of Object.keys(KINDS)) if (s.prices[k]) KINDS[k].bet = s.prices[k];
  STOCK_LIVE.splice(0, STOCK_LIVE.length, ...b.stocking2.pays); // Stocking Stuffer's pay table as published (board 2)
  STOCK_JP.pct = b.stocking2.jackpotPct; DROP_JP.pct = b.drop.jackpotPct; // the pool jackpots' shares as published
  const items = itemsWith(s); ITEMS.splice(0, ITEMS.length, ...items); BY_ID.clear(); for (const i of items) BY_ID.set(i.id, i);
  return b;
}
