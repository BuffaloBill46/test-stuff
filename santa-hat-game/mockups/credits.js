// Buying plays: RUNS, not stored credits (Cody, 2026-10-01: "remove the credit system. Leave the 3 options to buy 1, 5, 10 on
// each game. Whatever they buy auto plays and at the end a transaction pops up to claim their winnings. This way we don't
// really hold player funds."). Game rules only, no graphics.
// DEMO: the ledger lives in this browser. In the real version it lives ONLY in the database and only the server changes it.
// Rules:
//  - One payment buys a RUN: 1, 5 or 10 plays of one game at one size (Spin / Snowball Drop: 10¢ or $1; Big Hat: $1).
//  - The money moves at purchase: 10% burned, the rest (after SANTA's 3% tax) lands in that game's pool right away
//    (Spin and Snowball Drop: the Spin pool; Big Hat: the Slots pool).
//  - The plays are made right after the payment is confirmed (each gets its secret locked then) and play straight away.
//    Nothing is left over: a run has no balance to keep.
//  - Winnings are UNCLAIMED until the player presses Claim; then they're paid to the player's wallet in one transfer
//    per pool. A play the pool refuses (emergency stop, pool refilling) gives its price back as unclaimed money.
//  - No cash-out of anything but winnings, no expiry, no bulk discount.
// Invariants (audit): every run: plays made = played + refused; every payment buys one run, once;
//   unclaimed + claimed = everything won + refunded.
import { IN_PER_DOLLAR } from './slots.js';

// kind → the pool it pays, and the sizes it can be played at. Spin's sizes come from the game settings (settings.js
// applyToGame keeps SIZES.spin in step with the prices spin10 / spin100); Snowball Drop's and Big Hat's are fixed here.
export const KINDS = {
  spin: { game: 'spin', bet: 0.10, name: 'Santa Hat Spin', one: 'spin', many: 'spins' },
  big: { game: 'slots', bet: 1.00, name: 'Big Hat', one: 'pull', many: 'pulls' },
  drop: { game: 'spin', bet: 0.10, name: 'Snowball Drop', one: 'drop', many: 'drops' },
};
export const SIZES = { spin: [0.10, 1.00], drop: [0.10, 1.00], big: [1.00] };
export const RUN_SIZES = [1, 5, 10];
export const isSize = (kind, bet) => (SIZES[kind] || []).some((x) => Math.abs(x - bet) < 1e-9);
export const costOf = (n, bet) => Math.round(n * bet * 100) / 100;
export const newLedger = () => ({ runs: {}, payments: {}, plays: 0, unclaimed: { spin: 0, slots: 0 }, claimed: { spin: 0, slots: 0 }, won: { spin: 0, slots: 0 }, refunded: { spin: 0, slots: 0 } });

// A confirmed payment for a run of n plays of `kind` at `bet`. `pools` is { spin: {pool}, slots: {pool} }.
// Refuses unknown games or sizes, run sizes other than 1/5/10, and reused payments. Returns the run.
export function buyRun(ledger, pools, kind, bet, n, paymentId) {
  const K = KINDS[kind];
  if (!K) return { ok: false, why: 'unknown game' };
  if (!isSize(kind, bet)) return { ok: false, why: 'unknown size' };
  if (!RUN_SIZES.includes(n)) return { ok: false, why: 'buy 1, 5 or 10' };
  if (!paymentId || ledger.payments[paymentId]) return { ok: false, why: 'payment already used' };
  const cost = costOf(n, bet), id = 'run' + (Object.keys(ledger.runs).length + 1);
  ledger.payments[paymentId] = { run: id, cost };
  const run = { id, kind, bet, n, made: 0, played: 0, refused: 0, cost };
  ledger.runs[id] = run;
  pools[K.game].pool += cost * IN_PER_DOLLAR; // this game's pool only
  return { ok: true, run };
}
// Winnings and refunds wait as unclaimed money in that pool's column until claimed.
export function credit(ledger, kind, usd, refund = false) {
  const g = KINDS[kind].game; ledger.unclaimed[g] = Math.round((ledger.unclaimed[g] + usd) * 100) / 100;
  if (refund) ledger.refunded[g] = Math.round((ledger.refunded[g] + usd) * 100) / 100; else ledger.won[g] = Math.round((ledger.won[g] + usd) * 100) / 100;
}
export const unclaimedTotal = (ledger) => Math.round((ledger.unclaimed.spin + ledger.unclaimed.slots) * 100) / 100;
// Claim everything: returns what's paid out per pool (the real version queues one transfer per pool to the player's wallet).
export function claim(ledger) {
  const out = { ...ledger.unclaimed };
  for (const g of Object.keys(out)) { ledger.claimed[g] = Math.round((ledger.claimed[g] + out[g]) * 100) / 100; ledger.unclaimed[g] = 0; }
  return out;
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
    const a = Math.round((ledger.unclaimed[g] + ledger.claimed[g]) * 100), b = Math.round((ledger.won[g] + ledger.refunded[g]) * 100);
    if (a !== b) bad.push(`${g}: unclaimed + claimed ${a / 100} ≠ won + refunded ${b / 100}`);
    if (ledger.unclaimed[g] < 0) bad.push(`${g}: unclaimed below zero`);
  }
  return bad;
}
