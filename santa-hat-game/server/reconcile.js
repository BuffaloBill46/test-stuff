// SERVER: do the books match the wallets? Run it on a schedule (and before any withdrawal). Pure; tested in tests/reconcile.test.mjs.
// The database's pool balance already counts every settled play; the chain catches up as the queued transfers are sent.
// So the wallet should hold: book balance + unsent payouts + unsent skims − unsent top-offs. Anything else is drift: alarm.
// Top-offs are paid by Cody sending SANTA himself; until he records the deposit (admin screen) they count as unsent, so a
// deposit he forgot to record shows up here as the wallet holding MORE than expected (positive drift).
// (The token's 3% fee withheld on arrivals isn't part of a wallet's spendable amount, so compare against `amount`.)
const UNSENT = new Set(['queued', 'held', 'sending', 'needs_approval', 'failed']);
export function reconcile({ bookRaw, walletRaw, payouts = [], transfers = [], sendingLanded = new Set() }) {
  const unsent = (r) => UNSENT.has(r.status) && !(r.status === 'sending' && sendingLanded.has(r.id));
  const owedOut = payouts.filter(unsent).reduce((a, p) => a + Number(p.amount_raw), 0)
    + transfers.filter((t) => t.kind === 'skim' && unsent(t)).reduce((a, t) => a + Number(t.amount_raw), 0);
  const owedIn = transfers.filter((t) => t.kind === 'top-off' && unsent(t)).reduce((a, t) => a + Number(t.amount_raw), 0);
  const expected = bookRaw + owedOut - owedIn, drift = walletRaw - expected;
  return { ok: drift === 0, expected, drift, owedOut, owedIn };
}
