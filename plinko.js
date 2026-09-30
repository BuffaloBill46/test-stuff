// Snowball Drop (Plinko): game rules only (no graphics). PREVIEW for Cody (2026-09-30), not in the arcade yet.
// A snowball falls through 8 rows of pegs. At each row it goes left or right, 50/50, decided by ONE fair random number per
// row (the same provably-fair draw as Spin and Slots). The animation just follows that path. So the odds are exact
// and anyone can check them: landing in bin k (0–8, left to right) takes k "rights" out of 8, which happens C(8,k) ways
// out of 256:   1 · 8 · 28 · 56 · 70 · 56 · 28 · 8 · 1
// The edges are rare because few paths reach them, not because a bin is drawn thin: every bin is the same width.
export const ROWS = 8;
export const BINS = ROWS + 1;
// Prize per bin (× the drop price), mirror-image. 0.4× in the middle instead of nothing: most drops give something back.
export const PAYS = [5, 2, 1.2, 0.6, 0.4, 0.6, 1.2, 2, 5]; // pays back 79.8% (Cody: around 80%)
export const BETS = [0.10, 1.00];

const choose = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - i + 1)) / i; return r; };
export const WAYS = Array.from({ length: BINS }, (_, k) => choose(ROWS, k));        // 1, 8, 28, 56, 70, 56, 28, 8, 1
export const TOTAL = 2 ** ROWS;                                                       // 256
export const odds = (k) => WAYS[k] / TOTAL;
export const payback = () => PAYS.reduce((a, p, k) => a + p * WAYS[k], 0) / TOTAL;   // 204.4 / 256 = 79.84%
export const realWin = () => PAYS.reduce((a, p, k) => a + (p > 1 ? WAYS[k] : 0), 0) / TOTAL; // more back than it cost

// One drop. `rand` gives uniform numbers in [0,1) (server-seeded in the real version): one per row.
// path[i] is 0 (left) or 1 (right) at row i; the bin is how many rights.
export function drop(bet, rand = Math.random) {
  if (!BETS.includes(bet)) throw new Error('unknown bet ' + bet);
  const path = Array.from({ length: ROWS }, () => (rand() < 0.5 ? 0 : 1));
  const bin = path.reduce((a, b) => a + b, 0), mult = PAYS[bin], pay = Math.round(mult * bet * 100) / 100;
  return { path, bin, mult, bet, pay, ahead: pay > bet + 1e-9 };
}
