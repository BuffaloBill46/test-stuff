// Play credits: buy 1–10 plays in one payment, each play spends one (Cody, 2026-09-30). Game rules only, no graphics.
// DEMO: the ledger lives in this browser. In the real version it lives ONLY in the database and only the server changes it.
// Rules (DESIGN_NOTES → "Paying: play credits"):
//  - Credits are per game and size. Spin credits paid the Spin pool; Slots credits paid the Slots pool. Nothing crosses over.
//  - The money moves at purchase: 10% burned, the rest (after SANTA's 3% tax) lands in that game's pool right away.
//  - No cash-out, no expiry, no bulk discount.
// Invariant (checked by audit): for every kind, bought = used + left, and each payment buys credits exactly once.
import { IN_PER_DOLLAR } from './slots.js';

export const KINDS = {
  spin10: { game: 'spin', bet: 0.10, one: '10¢ spin', many: '10¢ spins' },
  spin100: { game: 'spin', bet: 1.00, one: '$1 spin', many: '$1 spins' },
  big: { game: 'slots', bet: 1.00, one: 'Big Hat pull', many: 'Big Hat pulls' },
};
export const MAX_BUY = 10;
const zero = () => Object.fromEntries(Object.keys(KINDS).map((k) => [k, 0]));
export const newLedger = () => ({ credits: zero(), bought: zero(), used: zero(), refunded: zero(), payments: {}, plays: 0 });
export const costOf = (kind, n) => Math.round(n * KINDS[kind].bet * 100) / 100;

// A confirmed payment for n plays. `pools` is { spin: {pool}, slots: {pool} }. Refuses bad counts and reused payments.
export function buy(ledger, pools, kind, n, paymentId) {
  const K = KINDS[kind];
  if (!K) return { ok: false, why: 'unknown kind' };
  if (!Number.isInteger(n) || n < 1 || n > MAX_BUY) return { ok: false, why: `buy 1 to ${MAX_BUY}` };
  if (!paymentId || ledger.payments[paymentId]) return { ok: false, why: 'payment already used' };
  const cost = costOf(kind, n);
  ledger.payments[paymentId] = { kind, n, cost };
  ledger.credits[kind] += n; ledger.bought[kind] += n;
  pools[K.game].pool += cost * IN_PER_DOLLAR; // this game's pool only
  return { ok: true, cost, left: ledger.credits[kind] };
}

// Spend one credit. False (and nothing changes) when there's none left. The server does this as one locked database
// update ("take one if more than zero"), so two taps or two tabs can never spend the same credit.
export function spend(ledger, kind) {
  if (!(ledger.credits[kind] >= 1)) return false;
  ledger.credits[kind] -= 1; ledger.used[kind] += 1;
  return true;
}
// Give a spent credit back (a play the pool refused after all). Keeps bought = used + left.
export function refund(ledger, kind) { ledger.credits[kind] += 1; ledger.used[kind] -= 1; ledger.refunded[kind] += 1; }

// Every rule that must hold. Returns a list of problems (empty = all good).
export function audit(ledger) {
  const bad = [], paid = zero();
  for (const p of Object.values(ledger.payments)) paid[p.kind] += p.n;
  for (const k of Object.keys(KINDS)) {
    const c = ledger.credits[k];
    if (!Number.isInteger(c) || c < 0) bad.push(`${k}: credits ${c}`);
    if (ledger.bought[k] !== ledger.used[k] + c) bad.push(`${k}: bought ${ledger.bought[k]} ≠ used ${ledger.used[k]} + left ${c}`);
    if (paid[k] !== ledger.bought[k]) bad.push(`${k}: payments add up to ${paid[k]}, bought says ${ledger.bought[k]}`);
  }
  return bad;
}
