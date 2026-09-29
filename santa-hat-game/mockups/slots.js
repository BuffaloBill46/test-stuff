// Santa Hat Slots: game rules only (no graphics), so it can be tested in node and later run on the server.
// Built the way real slots are (a "PAR sheet"): each reel is a strip of symbols; a random number picks where each reel
// stops; wins are read off the visible grid along paylines. The odds come ONLY from how many of each symbol are on each
// strip, so payback is calculated exactly from the counts (see stats()). Symbol order on a strip doesn't change the odds.
//
//   Mini Hat: 3 reels × 3 rows, 5 paylines,  $0.10 a pull. 3 in a row on a line wins; 3 Santa Hats = Mini jackpot.
//   Big Hat:  5 reels × 5 rows, 15 paylines, $1.00 a pull. 3, 4 or 5 in a row from the left wins; 5 Santa Hats = Big jackpot.
//
// !! PAYS, STRIP COUNTS AND JACKPOT %s ARE DRAFTS. Cody decides the real ones. Change them in MACHINES below, then run
// tests/slots.test.mjs: it prints payback, hit rate and jackpot odds and checks the invariants.
// Both machines share one Slots pool. Spin is a separate game with its own pool.

export const FEE = 0.03;                       // SANTA's own transfer tax (read live from the token in the real version)
export const BURN = 0.10;                      // Games tab: 10% burned, 90% to the pool, after the tax
export const IN_PER_DOLLAR = (1 - BURN * (1 - FEE)) * (1 - FEE); // 87.59¢ of each $1 lands in the pool
export const START_POOL = 50;

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
// pays: [3 in a row, 4 in a row, 5 in a row] as multiples of the LINE bet (bet ÷ lines). 'JACKPOT' = that machine's % of the pool.
export const MACHINES = {
  mini: {
    id: 'mini', name: 'Mini Hat', bet: 0.10, reels: 3, rows: 3, lines: LINES_3, jackpotPct: 0.01,
    counts: { hat: 2, star: 1, reindeer: 1, snowman: 2, present: 2, lantern: 3, pine: 5, bell: 6, snowball: 8, coal: 2 },
    pays: { hat: ['JACKPOT'], star: [700], reindeer: [400], snowman: [200], present: [150], lantern: [75], pine: [40], bell: [25], snowball: [15] },
  },
  big: {
    id: 'big', name: 'Big Hat', bet: 1.00, reels: 5, rows: 5, lines: LINES_5, jackpotPct: 0.10,
    counts: { hat: 4, star: 2, reindeer: 2, snowman: 3, present: 3, lantern: 4, pine: 6, bell: 7, snowball: 8, coal: 1 },
    pays: {
      hat: [100, 300, 'JACKPOT'], star: [80, 300, 450], reindeer: [60, 220, 400], snowman: [45, 170, 350], present: [35, 120, 300],
      lantern: [30, 90, 250], pine: [24, 60, 170], bell: [20, 50, 140], snowball: [16, 40, 115],
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
    const p = m.pays[SYMBOLS[first].id]; if (!p) return;
    const pay = p[n - 3]; if (n < 3 || pay === undefined) return;
    wins.push({ line: li, sym: first, count: n, jackpot: pay === 'JACKPOT', pay: pay === 'JACKPOT' ? 0 : pay * m.lineBet });
  });
  return wins;
}

// Exact numbers from the strip counts (what a PAR sheet lists). Per line, then × lines.
export function stats(m) {
  const L = m.stripLen, f = (id) => (m.counts[id] || 0) / L;
  let fixed = 0, lineHit = 0, jackLine = 0;
  for (const [id, p] of Object.entries(m.pays)) {
    for (let n = 3; n <= m.reels; n++) {
      const pay = p[n - 3]; if (pay === undefined) continue;
      const prob = Math.pow(f(id), n) * (n < m.reels ? 1 - f(id) : 1);
      lineHit += prob;
      if (pay === 'JACKPOT') jackLine += prob; else fixed += prob * pay * m.lineBet;
    }
  }
  const lines = m.lines.length;
  return { fixedPerDollar: (fixed * lines) / m.bet, lineHitRate: lineHit, jackpotPerLine: jackLine, lines };
}

// Biggest single-line fixed prize in $. A pull only starts if the pool covers it (the pay is also capped at the pool,
// and flagged `capped` if that ever happens, so it can't fail silently).
export const MAX_FIXED = (m) => Math.max(...Object.values(m.pays).flat().filter((x) => x !== 'JACKPOT')) * m.lineBet;

// One pull. `rand` gives uniform numbers in [0,1) (server seeds in the real version). Changes state.pool.
// forcedStops (tests only) sets the reel stops directly.
export function pull(state, machineId, rand = Math.random, forcedStops) {
  const m = MACHINES[machineId];
  if (state.pool < MAX_FIXED(m)) return { paused: true };
  state.pool += m.bet * IN_PER_DOLLAR;
  const stops = forcedStops || Array.from({ length: m.reels }, () => Math.floor(rand() * m.stripLen));
  const grid = gridFor(m, stops), wins = evaluate(m, grid);
  const jackpot = wins.some((w) => w.jackpot); // at most one jackpot per pull, even on several lines
  let pay = wins.reduce((s, w) => s + w.pay, 0);
  if (jackpot) pay += jackpotAmount(machineId, state.pool);
  const capped = pay > state.pool;
  pay = Math.min(pay, state.pool); // can never pay more than the pool holds
  state.pool -= pay;
  return { stops, grid, wins, pay, jackpot, capped, received: pay * (1 - FEE), ahead: pay > m.bet + 1e-9 };
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
