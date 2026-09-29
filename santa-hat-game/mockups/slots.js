// Santa Hat Slots: game rules only (no graphics), so it can be tested in node and later run on the server.
// Two machines, one shared Slots pool (Spin has its own, separate pool).
//
// !! PAYTABLE IS A PLACEHOLDER. Cody is deciding the real payouts; replace PAYTABLE (and nothing else) when they arrive,
// then run tests/slots.test.mjs to check payback and the pool invariants.
//
// How a pull works: the result is picked FIRST from the odds table, then the reels are stopped on a display that shows
// that result. That keeps the odds exact, and it's how a server-picked (provably fair) result will plug in later.
// Losing pulls show plain random reels; there are no staged "near misses".

export const FEE = 0.03;                       // SANTA's own transfer tax (read live from the token in the real version)
export const BURN = 0.10;                      // Games tab: 10% burned, 90% to the pool, after the tax
export const IN_PER_DOLLAR = (1 - BURN * (1 - FEE)) * (1 - FEE); // 87.59¢ of each $1 lands in the pool

export const SYMBOLS = [
  { id: 'hat', name: 'Santa Hat' },
  { id: 'star', name: 'Gold Star' },
  { id: 'reindeer', name: 'Reindeer' },
  { id: 'snowman', name: 'Snowman' },
  { id: 'present', name: 'Present' },
  { id: 'lantern', name: 'Lantern' },
  { id: 'pine', name: 'Pine Tree' },
  { id: 'bell', name: 'Sleigh Bell' },
  { id: 'snowball', name: 'Snowball' },
  { id: 'coal', name: 'Coal' },
];
export const SYM = Object.fromEntries(SYMBOLS.map((s, i) => [s.id, i]));

// PLACEHOLDER: three of a symbol on the middle line. `x` = times the bet; 'JACKPOT' = the machine's % of the pool.
// `p` = chance per pull. Everything else (including three Coal) pays nothing.
export const PAYTABLE = [
  { sym: 'hat', x: 'JACKPOT', p: 0.002 },
  { sym: 'star', x: 20, p: 0.003 },
  { sym: 'reindeer', x: 10, p: 0.005 },
  { sym: 'snowman', x: 8, p: 0.008 },
  { sym: 'present', x: 5, p: 0.015 },
  { sym: 'lantern', x: 4, p: 0.02 },
  { sym: 'pine', x: 3, p: 0.03 },
  { sym: 'bell', x: 2, p: 0.05 },
  { sym: 'snowball', x: 1, p: 0.15 },
];

// PLACEHOLDER jackpot %s. The Mini Hat's is a tenth of the Big Hat's because its bet is a tenth.
export const MACHINES = {
  mini: { id: 'mini', name: 'Mini Hat', bet: 0.10, jackpotPct: 0.01 },
  big: { id: 'big', name: 'Big Hat', bet: 1.00, jackpotPct: 0.10 },
};

export const START_POOL = 50;
export const MAX_FIXED = Math.max(...PAYTABLE.filter((r) => r.x !== 'JACKPOT').map((r) => r.x));

// Each reel is a looped strip; every symbol appears at least once on every reel.
export const STRIP_LEN = 20;
export const REELS = [
  ['hat', 'coal', 'snowball', 'bell', 'pine', 'snowball', 'present', 'coal', 'lantern', 'snowball', 'star', 'bell', 'snowman', 'coal', 'pine', 'snowball', 'reindeer', 'bell', 'lantern', 'present'],
  ['snowball', 'star', 'coal', 'pine', 'bell', 'snowball', 'lantern', 'hat', 'coal', 'present', 'snowball', 'reindeer', 'bell', 'pine', 'coal', 'snowman', 'snowball', 'lantern', 'bell', 'present'],
  ['bell', 'snowball', 'reindeer', 'coal', 'present', 'pine', 'snowball', 'snowman', 'bell', 'coal', 'lantern', 'hat', 'snowball', 'pine', 'star', 'coal', 'bell', 'snowball', 'present', 'lantern'],
].map((r) => r.map((id) => SYM[id]));

export const jackpotAmount = (machine, pool) => pool * MACHINES[machine].jackpotPct;

// Pick a result from the odds table. `u` is a uniform random number in [0, 1).
export function pickResult(u) {
  for (const row of PAYTABLE) { if ((u -= row.p) < 0) return row; }
  return null; // no win
}

// Reel stops (strip index on the middle line) that SHOW the given result.
export function stopsFor(result, rand) {
  const idx = (reel, sym) => { const c = []; REELS[reel].forEach((s, i) => { if (s === sym) c.push(i); }); return c[Math.floor(rand() * c.length)]; };
  if (result) { const s = SYM[result.sym]; return [0, 1, 2].map((r) => idx(r, s)); }
  for (;;) { // a losing display: anything that isn't three of a paying symbol
    const st = [0, 1, 2].map((r) => Math.floor(rand() * STRIP_LEN));
    const line = st.map((i, r) => REELS[r][i]);
    if (!(line[0] === line[1] && line[1] === line[2] && line[0] !== SYM.coal)) return st;
  }
}

// What the middle line shows, as a result (for checking that display and result always agree).
export function readLine(stops) {
  const line = stops.map((i, r) => REELS[r][i]);
  if (line[0] === line[1] && line[1] === line[2]) return PAYTABLE.find((row) => SYM[row.sym] === line[0]) || null;
  return null;
}

// One pull. Changes `state.pool`. Returns what happened; `paused` if the pool can't cover this machine's biggest fixed win.
export function pull(state, machineId, rand = Math.random, forced) {
  const m = MACHINES[machineId];
  if (state.pool < MAX_FIXED * m.bet) return { paused: true };
  state.pool += m.bet * IN_PER_DOLLAR;
  const result = forced !== undefined ? forced : pickResult(rand());
  const stops = stopsFor(result, rand);
  let pay = 0, jackpot = false;
  if (result) {
    if (result.x === 'JACKPOT') { pay = jackpotAmount(machineId, state.pool); jackpot = true; }
    else pay = result.x * m.bet;
  }
  state.pool -= pay;
  return { result, stops, pay, jackpot, received: pay * (1 - FEE) };
}
