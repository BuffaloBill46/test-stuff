// Santa Hat Slots: game rules only (no graphics), so it can be tested in node and later run on the server.
// Built the way real slots are (a "PAR sheet"): each reel is a strip of symbols; a random number picks where each reel
// stops; wins are read off the visible grid along paylines. The odds come ONLY from how many of each symbol are on each
// strip, so payback is calculated exactly from the counts (see stats()). Symbol order on a strip doesn't change the odds.
//
//   Mini Hat: 3 reels × 3 rows, 5 paylines,  $0.10 a pull. 3 Santa Hats in a row on a line = 100× the price.
//   Big Hat:  5 reels × 5 rows, 15 paylines, $1.00 a pull. 5 Santa Hats in a row on a line = 100× the price.
//   Line wins count from the leftmost reel. Prizes are in "× the pull price" and every other prize scales down from the
//   100×, with lots of small ("micro") wins. Target: line wins pay back about 75% of what's played.
//
//   POOL JACKPOT (separate): its own random draw each pull, at `poolJackpotOdds`. When it hits, every square on the
//   grid shows a Santa Hat and the machine pays its % of the shared Slots pool. A full grid can't happen by accident
//   (no strip has two Santa Hats next to each other), so the two jackpots never get mixed up.
//
// !! PAYS, STRIP COUNTS, ODDS AND JACKPOT %s ARE DRAFTS. Cody decides the real ones. Change them in MACHINES below, then run
// tests/slots.test.mjs: it prints payback, hit rate and jackpot odds and checks the invariants.
// Both machines share one Slots pool. Spin is a separate game with its own pool.

export const FEE = 0.03;                       // SANTA's own transfer tax (read live from the token in the real version)
export const BURN = 0.10;                      // Games tab: 10% burned, 90% to the pool, after the tax
export const IN_PER_DOLLAR = (1 - BURN * (1 - FEE)) * (1 - FEE); // 87.59¢ of each $1 lands in the pool
export const START_POOL = 250; // demo. Must cover the Big Hat's 100× ($100) line; $250 never paused in simulation, $50 always did.

export const SYMBOLS = [
  { id: 'hat', name: 'Santa Hat' }, { id: 'star', name: 'Gold Star' }, { id: 'reindeer', name: 'Reindeer' },
  { id: 'snowman', name: 'Snowman' }, { id: 'present', name: 'Present' }, { id: 'lantern', name: 'Lantern' },
  { id: 'pine', name: 'Pine Tree' }, { id: 'bell', name: 'Sleigh Bell' }, { id: 'snowball', name: 'Snowball' },
  { id: 'coal', name: 'Coal' },
];
export const SYM = Object.fromEntries(SYMBOLS.map((s, i) => [s.id, i]));

// Paylines: for each reel (left to right), which row the line passes through (0 = top).
const LINES_3 = [[1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
const LINES_5 = [
  [2, 2, 2, 2, 2], [1, 1, 1, 1, 1], [3, 3, 3, 3, 3], [0, 0, 0, 0, 0], [4, 4, 4, 4, 4], // rows
  [0, 1, 2, 3, 4], [4, 3, 2, 1, 0],                                                   // diagonals
  [0, 1, 2, 1, 0], [4, 3, 2, 3, 4], [1, 2, 3, 2, 1], [3, 2, 1, 2, 3],                 // V shapes
  [1, 0, 1, 0, 1], [3, 4, 3, 4, 3], [2, 1, 2, 1, 2], [2, 3, 2, 3, 2],                 // zigzags
];

// DRAFT. counts: how many of each symbol on EVERY reel strip of that machine (sum = strip length).
// pays: { in-a-row count: × the pull price } for a line. Only the longest run on a line pays.
export const MACHINES = {
  mini: {
    id: 'mini', name: 'Mini Hat', bet: 0.10, reels: 3, rows: 3, lines: LINES_3, jackpotPct: 0.01, poolJackpotOdds: 1 / 2500,
    counts: { hat: 2, star: 1, reindeer: 1, snowman: 2, present: 2, lantern: 3, pine: 5, bell: 7, snowball: 9, coal: 1 },
    pays: {
      hat: { 3: 100 }, star: { 3: 45 }, reindeer: { 3: 23 }, snowman: { 3: 14 }, present: { 3: 9 }, lantern: { 3: 5.5 },
      pine: { 3: 3.5, 2: 0.55 }, bell: { 3: 2.5, 2: 0.45 }, snowball: { 3: 2, 2: 0.25 },
    },
  },
  big: {
    id: 'big', name: 'Big Hat', bet: 1.00, reels: 5, rows: 5, lines: LINES_5, jackpotPct: 0.10, poolJackpotOdds: 1 / 2500,
    counts: { hat: 4, star: 1, reindeer: 2, snowman: 2, present: 2, lantern: 3, pine: 6, bell: 10, snowball: 14, coal: 1 },
    pays: {
      hat: { 5: 100, 4: 35, 3: 5 }, star: { 5: 90, 4: 23, 3: 4 }, reindeer: { 5: 58, 4: 14, 3: 3 }, snowman: { 5: 35, 4: 9.5, 3: 2 },
      present: { 5: 23, 4: 6, 3: 1.5 }, lantern: { 5: 14, 4: 3.5, 3: 0.95 }, pine: { 5: 9.5, 4: 2.5, 3: 0.7 },
      bell: { 5: 7, 4: 2, 3: 0.45 }, snowball: { 5: 4.5, 4: 1.5, 3: 0.3 },
    },
  },
};

// Build each machine's reel strips from its counts: the same counts on every reel, spread out and in a different order
// per reel (order is only for looks; it doesn't change the odds).
function spread(counts, seed) {
  const bag = []; for (const [id, n] of Object.entries(counts)) for (let i = 0; i < n; i++) bag.push(SYM[id]);
  let s = seed >>> 0; const r = () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return s / 4294967296; };
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  for (let pass = 0; pass < 50; pass++) { // avoid the same symbol twice in a row on a strip (reads better)
    let fixed = true;
    for (let i = 0; i < bag.length; i++) { const j = (i + 1) % bag.length; if (bag[i] === bag[j]) { fixed = false; const k = Math.floor(r() * bag.length); [bag[j], bag[k]] = [bag[k], bag[j]]; } }
    if (fixed) break;
  }
  return bag;
}
for (const m of Object.values(MACHINES)) {
  m.strips = Array.from({ length: m.reels }, (_, i) => spread(m.counts, 1000 * m.reels + 17 * i + 3));
  m.stripLen = m.strips[0].length;
  m.lineBet = m.bet / m.lines.length;
}

export const jackpotAmount = (machineId, pool) => pool * MACHINES[machineId].jackpotPct;

// The visible grid for a set of reel stops: grid[reel][row]. A stop is the strip index shown in the TOP row.
export function gridFor(m, stops) {
  return stops.map((s, r) => Array.from({ length: m.rows }, (_, row) => m.strips[r][(s + row) % m.stripLen]));
}

// Every winning line: { line (index), sym, count, pay (in $), jackpot }. Counts from the leftmost reel.
export function evaluate(m, grid) {
  const wins = [];
  m.lines.forEach((rows, li) => {
    const first = grid[0][rows[0]]; let n = 1;
    while (n < m.reels && grid[n][rows[n]] === first) n++;
    const x = (m.pays[SYMBOLS[first].id] || {})[n]; if (x === undefined) return;
    wins.push({ line: li, sym: first, count: n, x, pay: x * m.bet, top: first === SYM.hat && n === m.reels });
  });
  return wins;
}

// Exact numbers from the strip counts (what a PAR sheet lists). Per line, then × lines.
// (Line wins only; the pool jackpot is paid from its own draw and grows with the pool.)
export function stats(m) {
  const L = m.stripLen, f = (id) => (m.counts[id] || 0) / L;
  let back = 0, lineHit = 0, topLine = 0;
  for (const [id, p] of Object.entries(m.pays)) {
    for (const [n, x] of Object.entries(p).map(([n, x]) => [+n, x])) {
      const prob = Math.pow(f(id), n) * (n < m.reels ? 1 - f(id) : 1);
      lineHit += prob; back += prob * x;
      if (id === 'hat' && n === m.reels) topLine += prob;
    }
  }
  const lines = m.lines.length;
  return { payback: back * lines, lineHitRate: lineHit, topPerLine: topLine, lines };
}

// Biggest fixed prize in $ (the 100× line). A pull only starts if the pool covers it; the pay is also capped at the pool
// and flagged `capped` if that ever happens, so it can't fail silently.
export const MAX_FIXED = (m) => Math.max(...Object.values(m.pays).flatMap((p) => Object.values(p))) * m.bet;

// One pull. `rand` gives uniform numbers in [0,1) (server seeds in the real version). Changes state.pool.
// forcedStops (tests only) sets the reel stops directly.
export function pull(state, machineId, rand = Math.random, forcedStops) {
  const m = MACHINES[machineId];
  if (state.pool < MAX_FIXED(m)) return { paused: true };
  state.pool += m.bet * IN_PER_DOLLAR;
  // Pool jackpot: its own draw. When it hits, the whole grid shows Santa Hats and only the jackpot is paid.
  const jackpot = forcedStops === 'JACKPOT' || (!forcedStops && rand() < m.poolJackpotOdds);
  if (jackpot) {
    const grid = Array.from({ length: m.reels }, () => Array(m.rows).fill(SYM.hat));
    const pay = Math.min(jackpotAmount(machineId, state.pool), state.pool);
    state.pool -= pay;
    return { stops: null, grid, wins: [], pay, jackpot: true, capped: false, received: pay * (1 - FEE), ahead: pay > m.bet + 1e-9 };
  }
  const stops = forcedStops || Array.from({ length: m.reels }, () => Math.floor(rand() * m.stripLen));
  const grid = gridFor(m, stops), wins = evaluate(m, grid);
  let pay = wins.reduce((s, w) => s + w.pay, 0);
  const capped = pay > state.pool;
  pay = Math.min(pay, state.pool); // can never pay more than the pool holds
  state.pool -= pay;
  return { stops, grid, wins, pay, jackpot: false, capped, received: pay * (1 - FEE), ahead: pay > m.bet + 1e-9 };
}

// Tests/demo: reel stops that put `sym` on `count` reels of a given line (the rest random).
export function stopsShowing(machineId, lineIdx, sym, count, rand = Math.random) {
  const m = MACHINES[machineId], rows = m.lines[lineIdx];
  return Array.from({ length: m.reels }, (_, r) => {
    const idxs = []; m.strips[r].forEach((s, i) => { if (r < count ? s === SYM[sym] : s !== SYM[sym]) idxs.push(i); });
    const i = idxs[Math.floor(rand() * idxs.length)];
    return (i - rows[r] + m.stripLen) % m.stripLen;
  });
}
