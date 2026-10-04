// SERVER: do the books match the wallets? Run it on a schedule (and before any withdrawal). Pure; tested in tests/reconcile.test.mjs.
// The database's pool balance already counts every settled play; the chain catches up as the queued transfers are sent.
// So the wallet should hold: book balance + unsent payouts + unsent skims − unsent top-offs. Anything else is drift: alarm.
// Top-offs are paid by Cody sending SANTA himself; until he records the deposit (admin screen) they count as unsent, so a
// deposit he forgot to record shows up here as the wallet holding MORE than expected (positive drift).
// (The token's 3% fee withheld on arrivals isn't part of a wallet's spendable amount, so compare against `amount`.)
// PAYMENTS IN FLIGHT (found 2026-10-04 by the 1,000-play QA, Cody's Telegram: "wallet has 59,274 SANTA MORE than the books"): a
// player's payment lands in the pool wallet seconds after they approve, but the page waits ~15-30 s for it to be FINAL before the
// server records it. A check in that gap sees the wallet ahead of the books, a false alarm on every busy minute. inFlightRaw: the
// most that can legitimately be on its way (the SANTA of price quotes from the last few minutes not yet used, server/alerts.js).
// MORE by up to that much is fine; more than that (a deposit not recorded, a payment never bought) or LESS by any amount: alarm.
const UNSENT = new Set(['queued', 'held', 'sending', 'needs_approval', 'failed']);
export function reconcile({ bookRaw, walletRaw, payouts = [], transfers = [], sendingLanded = new Set(), inFlightRaw = 0 }) {
  const unsent = (r) => UNSENT.has(r.status) && !(r.status === 'sending' && sendingLanded.has(r.id));
  const owedOut = payouts.filter(unsent).reduce((a, p) => a + Number(p.amount_raw), 0)
    + transfers.filter((t) => t.kind === 'skim' && unsent(t)).reduce((a, t) => a + Number(t.amount_raw), 0);
  const owedIn = transfers.filter((t) => t.kind === 'top-off' && unsent(t)).reduce((a, t) => a + Number(t.amount_raw), 0);
  const expected = bookRaw + owedOut - owedIn, drift = walletRaw - expected;
  return { ok: drift === 0 || (drift > 0 && drift <= inFlightRaw), expected, drift, owedOut, owedIn, inFlightRaw };
}
