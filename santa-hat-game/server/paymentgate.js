// FAST ARCADE PAYMENTS, the money side (Cody 2026-10-05: "the arcade games take a long time to process the payment"). The game
// server starts a run once its payment is CONFIRMED (~1-2 s, server/games.js fast) instead of FINALIZED (~13 s). So the run's
// WINNINGS wait here until that payment is finalized: no money ever goes out on a payment that could still be dropped. A payment
// that failed on the network, or still isn't final 10 minutes after the payout was queued, HOLDS the winnings for Cody.
// db: { query }; statuses(signature) → Solana's status object ({ err, confirmationStatus }) or null; now(): ms.
export const FINAL_WAIT_MS = 600_000;
export function makePaymentGate({ db, statuses, now = () => Date.now() }) {
  async function check(row) {
    const r = (await db.query('select signature from public.runs where id = $1', [row.run_id]))[0];
    if (!r?.signature) return 'ok'; // no payment to wait for
    let s; try { s = await statuses(r.signature); } catch { return 'wait'; } // couldn't ask: ask again next pass
    if (s?.err) return 'bad';
    if (s?.confirmationStatus === 'finalized') return 'ok';
    return now() - new Date(row.created_at).getTime() > FINAL_WAIT_MS ? 'bad' : 'wait';
  }
  // wrap a payout chain: sign only once the payment is final
  const gate = (chain) => ({ ...chain, async sign(row) {
    const f = await check(row);
    if (f === 'wait') return { wait: true };
    if (f === 'bad') return { hold: "the run's payment failed or never finalized: check it before paying" };
    return chain.sign(row);
  } });
  return { check, gate };
}
