// Play credits: buy 1–10 plays in one payment, each play spends one (Cody, 2026-09-30). Game rules only, no graphics.
// DEMO: the ledger lives in this browser. In the real version it lives ONLY in the database and only the server changes it.
// Rules (DESIGN_NOTES → "Paying: play credits"):
//  - Credits are per game and size. Spin credits paid the Spin pool; Slots credits paid the Slots pool. Nothing crosses over.
//  - EXCEPT Snowball Drop (Cody, 2026-10-01): a DOLLAR BALANCE, spendable on 10¢ or $1 drops in any mix ("when someone buys
//    $10.00 in tokens they can play either the 0.10 or 1.00 game"). Kept in whole 10¢ units, so it's never a fraction:
//    buying $1 adds 10 units; a 10¢ drop spends 1 unit, a $1 drop spends 10. It pays the Spin pool (shared, Cody).
//  - The money moves at purchase: 10% burned, the rest (after SANTA's 3% tax) lands in that game's pool right away.
//  - No cash-out, no expiry, no bulk discount.
// Invariant (checked by audit): for every kind, bought = used + left, and each payment buys credits exactly once.
import { IN_PER_DOLLAR } from './slots.js';

export const KINDS = {
  spin10: { game: 'spin', bet: 0.10, one: '10¢ spin', many: '10¢ spins' },
  spin100: { game: 'spin', bet: 1.00, one: '$1 spin', many: '$1 spins' },
  big: { game: 'slots', bet: 1.00, one: 'Big Hat pull', many: 'Big Hat pulls' },
  drop: { game: 'spin', bet: 0.10, step: 1.00, units: 10, balance: true, one: 'Snowball Drop balance', many: 'Snowball Drop balance' }, // bet = one unit
};
export const DROP_SIZES = [0.10, 1.00];
// How many units one play of this size spends (1 for every per-play kind).
export const unitsFor = (kind, bet) => (KINDS[kind].balance ? Math.round(bet / KINDS[kind].bet) : 1);
export const balanceOf = (ledger, kind) => Math.round(ledger.credits[kind] * KINDS[kind].bet * 100) / 100; // in dollars
export const MAX_BUY = 10;
const zero = () => Object.fromEntries(Object.keys(KINDS).map((k) => [k, 0]));
export const newLedger = () => ({ credits: zero(), bought: zero(), used: zero(), refunded: zero(), payments: {}, plays: 0 });
export const costOf = (kind, n) => Math.round(n * (KINDS[kind].step ?? KINDS[kind].bet) * 100) / 100; // n plays, or n dollars for a balance

// A confirmed payment for n plays (a balance kind: n dollars). `pools` is { spin: {pool}, slots: {pool} }. Refuses bad counts and reused payments.
export function buy(ledger, pools, kind, n, paymentId) {
  const K = KINDS[kind];
  if (!K) return { ok: false, why: 'unknown kind' };
  if (!Number.isInteger(n) || n < 1 || n > MAX_BUY) return { ok: false, why: `buy 1 to ${MAX_BUY}` };
  if (!paymentId || ledger.payments[paymentId]) return { ok: false, why: 'payment already used' };
  const cost = costOf(kind, n);
  const units = n * (K.units || 1);
  ledger.payments[paymentId] = { kind, n, units, cost };
  ledger.credits[kind] += units; ledger.bought[kind] += units;
  pools[K.game].pool += cost * IN_PER_DOLLAR; // this game's pool only
  return { ok: true, cost, left: ledger.credits[kind] };
}

// Spend one credit (a balance kind: the play's units). False (and nothing changes) when there isn't enough. The server does this as one locked database
// update ("take one if more than zero"), so two taps or two tabs can never spend the same credit.
export function spend(ledger, kind, units = 1) {
  if (!Number.isInteger(units) || units < 1 || !(ledger.credits[kind] >= units)) return false;
  ledger.credits[kind] -= units; ledger.used[kind] += units;
  return true;
}
// Give a spent credit back (a play the pool refused after all). Keeps bought = used + left.
export function refund(ledger, kind, units = 1) { ledger.credits[kind] += units; ledger.used[kind] -= units; ledger.refunded[kind] += units; }

// Every rule that must hold. Returns a list of problems (empty = all good).
export function audit(ledger) {
  const bad = [], paid = zero();
  for (const p of Object.values(ledger.payments)) paid[p.kind] += p.units ?? p.n;
  for (const k of Object.keys(KINDS)) {
    const c = ledger.credits[k];
    if (!Number.isInteger(c) || c < 0) bad.push(`${k}: credits ${c}`);
    if (ledger.bought[k] !== ledger.used[k] + c) bad.push(`${k}: bought ${ledger.bought[k]} ≠ used ${ledger.used[k]} + left ${c}`);
    if (paid[k] !== ledger.bought[k]) bad.push(`${k}: payments add up to ${paid[k]}, bought says ${ledger.bought[k]}`);
  }
  return bad;
}
