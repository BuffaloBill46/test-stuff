// SERVER: the payout worker. Sends queued winnings from the pool wallets. NOT DEPLOYED (needs the pool keys; see FOR_MAIN_CLAUDE).
// The one rule: NEVER PAY TWICE. The order per payout:
//   1. claim it (queued → sending)
//   2. sign the transfer and SAVE its signature + blockhash in the row
//   3. only then send it
// After any crash, a 'sending' payout is checked on the chain by its saved signature:
//   landed  → mark sent (never resent)          pending → leave it (it may still land)
//   expired → its blockhash is dead, so the old transaction can never land: clear it and sign a fresh one
// A 'sending' payout with no saved signature was never sent (step 2 comes before step 3), so it's safe to sign fresh.
// chain = { sign(payout) → { signature, tx, blockhash }, send(tx), status(signature, blockhash) → 'landed'|'pending'|'expired'|'failed' }
export const MAX_ATTEMPTS = 5;

export async function runPayouts({ db, chain, limit = 20 }) {
  const report = { sent: 0, pending: 0, resigned: 0, failed: 0 };
  // Recover anything a previous run left half-done.
  for (const p of await db.query(`select * from public.payouts where status = 'sending' order by id`)) {
    if (!p.tx) { await signAndSend(p); continue; }
    const st = await chain.status(p.tx, p.blockhash);
    if (st === 'landed') { await db.query(`update public.payouts set status = 'sent' where id = $1 and status = 'sending'`, [p.id]); report.sent++; }
    else if (st === 'expired' || st === 'failed') { report.resigned++; await signAndSend(p); } // failed on-chain can never succeed later either
    else report.pending++;
  }
  // New payouts ('held' ones wait for Cody and are never touched here).
  for (let i = 0; i < limit; i++) {
    const [p] = await db.query(`update public.payouts set status = 'sending', tx = null, blockhash = null
      where id = (select id from public.payouts where status = 'queued' order by id limit 1 for update skip locked) returning *`);
    if (!p) break;
    await signAndSend(p);
  }
  return report;

  async function signAndSend(p) {
    if (p.attempts >= MAX_ATTEMPTS) { await db.query(`update public.payouts set status = 'failed' where id = $1`, [p.id]); report.failed++; return; }
    const s = await chain.sign(p);
    await db.query(`update public.payouts set tx = $2, blockhash = $3, attempts = attempts + 1 where id = $1 and status = 'sending'`, [p.id, s.signature, s.blockhash]);
    try { await chain.send(s.tx); } catch { /* not sent or unknown: the next run checks the saved signature */ }
    const st = await chain.status(s.signature, s.blockhash);
    if (st === 'landed') { await db.query(`update public.payouts set status = 'sent' where id = $1`, [p.id]); report.sent++; }
    else report.pending++;
  }
}
