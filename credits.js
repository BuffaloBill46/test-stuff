// Buying plays: RUNS, not stored credits (Cody, 2026-10-01: "remove the credit system. Leave the 3 options to buy 1, 5, 10 on
// each game. Whatever they buy auto plays ... This way we don't really hold player funds." Then: no claim button, "just after
// their 1, 5 or 10 roll it auto sends", with no player signature). Game rules only, no graphics.
// DEMO: the ledger lives in this browser. In the real version it lives ONLY in the database and only the server changes it.
// Rules:
//  - One payment buys a RUN: 1 to 100 plays (buttons for 1, 5, 10; any number in the box) of one game at one size (Snowball Drop, Stocking Stuffer: 10¢ or $1; Big Hat: $1).
//  - The money moves at purchase: 10% burned, the rest (after SANTA's 3% tax) lands in that game's pool right away
//    (every game: the one shared Game pool, Cody 2026-10-02; it was Spin/Drop: Spin pool, Big Hat: Slots pool).
//  - The plays are made right after the payment is confirmed (each gets its secret locked then) and play straight away.
//    Nothing is left over: a run has no balance to keep.
//  - When the run's last play is done, its winnings (plus the price of any play the pool refused: emergency stop, pool
//    refilling) are SENT to the player's wallet automatically, in one transfer. Nothing waits on the player.
//  - No bulk discount.
// Invariants (audit): every run: plays made = played + refused ≤ n; every payment buys one run, once;
//   a finished run is paid exactly once, exactly what it won + refunded; an unfinished run is paid nothing.
import { IN_PER_DOLLAR } from './slots.js?v=0e9b2ea718';

// kind → the pool it pays, and the sizes it can be played at (fixed here). The retired Santa Hat Spin (kind 'spin') was
// removed on 2026-10-04; 'spin' as a POOL key (game: 'spin') is the shared Game pool and stays.
// ONE GAME POOL (Cody, 2026-10-02): every game pays into and out of the shared pool, key 'spin' (shown as "Game pool"). The
// old 'slots' pool is no longer used by any game. (`game` is the POOL; to tell the games apart, test the kind itself.)
// Every game entry: 10% of the payment burned, the rest to the Game pool (server/games.js quotes and checks it; the money strip shows it)
export const GAME_BURN_BPS = 1000;
export const KINDS = {
  big: { game: 'spin', bet: 1.00, name: 'Big Hat', one: 'pull', many: 'pulls' },
  drop: { game: 'spin', bet: 0.10, name: 'Snowball Drop', one: 'drop', many: 'drops' },
  // Stocking Stuffer (Cody, 2026-10-02) plays from the Game pool too; a "turn" = opening stockings until the first coal
  stocking: { game: 'spin', bet: 0.10, name: 'Stocking Stuffer', one: 'turn', many: 'turns' },
};
export const SIZES = { drop: [0.10, 1.00], big: [1.00], stocking: [0.10, 1.00] };
export const RUN_SIZES = [1, 5, 10]; // the quick buttons
// Any run from 1 to MAX_RUN plays can be bought (Cody, 2026-10-01: the custom box under the buttons; database 014 says the same).
export const MAX_RUN = 100;
export const isRunSize = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_RUN;
export const isSize = (kind, bet) => (SIZES[kind] || []).some((x) => Math.abs(x - bet) < 1e-9);
export const costOf = (n, bet) => Math.round(n * bet * 100) / 100;
export const newLedger = () => ({ runs: {}, payments: {}, plays: 0, sent: { spin: 0, slots: 0 } });

// A confirmed payment for a run of n plays of `kind` at `bet`. `pools` is { spin: {pool}, slots: {pool} }.
// Refuses unknown games or sizes, run sizes other than 1/5/10, and reused payments. Returns the run.
export function buyRun(ledger, pools, kind, bet, n, paymentId) {
  const K = KINDS[kind];
  if (!K) return { ok: false, why: 'unknown game' };
  if (!isSize(kind, bet)) return { ok: false, why: 'unknown size' };
  if (!isRunSize(n)) return { ok: false, why: `buy 1 to ${MAX_RUN} plays` };
  if (!paymentId || ledger.payments[paymentId]) return { ok: false, why: 'payment already used' };
  const cost = costOf(n, bet), id = 'run' + (Object.keys(ledger.runs).length + 1);
  ledger.payments[paymentId] = { run: id, cost };
  const run = { id, kind, bet, n, made: 0, played: 0, refused: 0, cost, won: 0, refunded: 0, paid: null };
  ledger.runs[id] = run;
  pools[K.game].pool += cost * IN_PER_DOLLAR; // this game's pool only
  return { ok: true, run };
}
// A play's prize, or the price of a play the pool refused, adds to what the run will send.
// Exact amounts (no rounding here: a pool jackpot is a share of the pool, not whole cents); screens round for display.
export function credit(run, usd, refund = false) { if (refund) run.refunded += usd; else run.won += usd; }
export const runDone = (run) => run.made === run.n && run.played + run.refused === run.n;
// The run's last play is done: send what it won + refunded, once. Returns the amount sent (0 if nothing to send).
export function payRun(ledger, run) {
  if (!runDone(run) || run.paid !== null) return null;
  const amount = run.won + run.refunded, g = KINDS[run.kind].game;
  run.paid = amount; ledger.sent[g] += amount;
  return amount;
}

// Every rule that must hold. Returns a list of problems (empty = all good).
export function audit(ledger) {
  const bad = [];
  for (const r of Object.values(ledger.runs)) {
    if (r.made > r.n) bad.push(`${r.id}: ${r.made} plays made from a run of ${r.n}`);
    if (r.played + r.refused > r.made) bad.push(`${r.id}: ${r.played} played + ${r.refused} refused > ${r.made} made`);
  }
  if (Object.keys(ledger.payments).length !== Object.keys(ledger.runs).length) bad.push('a payment without its run (or a run without its payment)');
  for (const g of ['spin', 'slots']) {
    const runs = Object.values(ledger.runs).filter((r) => KINDS[r.kind].game === g);
    const due = Math.round(runs.reduce((a, r) => a + (r.paid !== null ? r.won + r.refunded : 0), 0) * 100);
    if (Math.abs(Math.round(ledger.sent[g] * 100) - due) > 1) bad.push(`${g}: sent ${ledger.sent[g]} ≠ what the finished runs won + refunded ${due / 100}`);
  }
  for (const r of Object.values(ledger.runs)) if (r.paid !== null && !runDone(r)) bad.push(`${r.id}: paid before its last play`);
  return bad;
}
