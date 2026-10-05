// SERVER: the payout worker. Sends queued winnings from the pool wallets. NOT DEPLOYED (needs the pool keys; see FOR_MAIN_CLAUDE).
// The one rule: NEVER PAY TWICE. The order per payout:
//   1. claim it (queued → sending)
//   2. sign the transfer and SAVE its signature + blockhash in the row
//   3. only then send it
// After any crash, a 'sending' payout is checked on the chain by its saved signature:
//   landed  → mark sent (never resent)          pending → leave it (it may still land)
//   expired → its blockhash is dead, so the old transaction can never land: clear it and sign a fresh one
// A 'sending' payout with no saved signature was never sent (step 2 comes before step 3), so it's safe to sign fresh.
// EVERY transaction must be unique: two equal payouts to the same wallet in the same blockhash window would otherwise be
// byte-identical, the chain would drop the second as a duplicate, and both would look "landed" (found by the dress
// rehearsal, tests/solana/rehearsal.mjs). So the chain adapter adds a memo "Santa Hat <table> #<id>", and the database
// refuses to save one signature for two rows (unique tx), which stops the worker loudly if an adapter ever forgets.
// chain = { sign(payout) → { signature, tx, blockhash }, send(tx), status(signature, blockhash) → 'landed'|'pending'|'expired'|'failed' }
export const MAX_ATTEMPTS = 5;
// PAYOUTS NEVER GIVE UP (Cody 2026-10-05: "make sure payouts never pause. That is a big no no"). After MAX_ATTEMPTS tries a send
// used to be marked 'failed' and never tried again, so a few minutes of Solana trouble, or a pool short of SANTA or SOL until it
// was topped up, stranded winnings for good. Now it keeps trying, once every RETRY_EVERY_MS, until it lands (the alert says so
// from the 5th try). Never paying twice is unchanged: a retry signs fresh only when the saved transaction can never land.
// When it was last tried is kept in memory: a worker restart just means one try sooner.
export const RETRY_EVERY_MS = 120_000;
const lastTry = new Map();

// table: 'payouts' (winners), 'pool_transfers' (skims, and top-offs once approved) or 'lottery_payouts' (lottery
// winners and refunds, when the lottery pays automatically) or 'reward_sweeps' (reward tokens from the pools to the treasury,
// when Cody claims them: supabase/024). Same rules for all.
export async function runPayouts({ db, chain, limit = 20, table = 'payouts', now = Date.now, tries = lastTry }) {
  const T = { payouts: 'public.payouts', pool_transfers: 'public.pool_transfers', lottery_payouts: 'public.lottery_payouts', reward_sweeps: 'public.reward_sweeps' }[table];
  if (!T) throw new Error('unknown table ' + table);
  const report = { sent: 0, pending: 0, resigned: 0, failed: 0 };
  // Recover anything a previous run left half-done.
  for (const p of await db.query(`select * from ${T} where status = 'sending' order by id`)) {
    if (!p.tx) { await signAndSend(p); continue; }
    const st = await chain.status(p.tx, p.blockhash);
    if (st === 'landed') { await db.query(`update ${T} set status = 'sent' where id = $1 and status = 'sending'`, [p.id]); report.sent++; }
    else if (st === 'expired' || st === 'failed') { report.resigned++; await signAndSend(p); } // failed on-chain can never succeed later either
    else report.pending++;
  }
  // New payouts ('held' ones wait for Cody and are never touched here).
  for (let i = 0; i < limit; i++) {
    const [p] = await db.query(`update ${T} set status = 'sending', tx = null, blockhash = null
      where id = (select id from ${T} where status = 'queued' order by id limit 1 for update skip locked) returning *`);
    if (!p) break;
    await signAndSend(p);
  }
  return report;

  async function signAndSend(p) {
    if (p.attempts >= MAX_ATTEMPTS) { // past the 5th try: keep trying, spaced out (never 'failed', never given up)
      const key = table + ':' + p.id, at = tries.get(key);
      if (at !== undefined && now() - at < RETRY_EVERY_MS) { report.waiting = (report.waiting || 0) + 1; return; }
      tries.set(key, now()); report.retried = (report.retried || 0) + 1;
    }
    const s = await chain.sign(p);
    // the adapter refused to sign this one (solanachain.js rent-drain guard): park it for Cody, never block the others
    // (each table's own "waits for Cody" status: winnings 'held' (admin release), lottery prizes 'manual' (paid by hand), anything
    // else 'failed' (an alert); reward sweeps never hold)
    if (s?.hold) { const parked = { payouts: 'held', lottery_payouts: 'manual' }[table] || 'failed';
      await db.query(`update ${T} set status = '${parked}' where id = $1 and status = 'sending'`, [p.id]); console.error(`payout ${table} #${p.id} ${parked}: ${s.hold}`); report.held = (report.held || 0) + 1; return; }
    // every money table that exists here (the lottery's only once supabase/011 is applied): one transaction, one row, anywhere
    const tables = (await db.query(`select t from unnest(array['public.payouts', 'public.pool_transfers', 'public.lottery_payouts', 'public.reward_sweeps']) t where to_regclass(t) is not null`)).map((r) => r.t);
    const clash = await db.query(tables.map((t) => `select 1 from ${t} where tx = $1`).join(' union all '), [s.signature]);
    if (clash.length) throw new Error(`payout ${table} #${p.id} built the same transaction as another one: the chain adapter must add a unique memo`);
    // Save it ONLY if the row still holds the transaction we saw when we decided to sign (none, or the expired one). If
    // another worker got there first (two scheduled runs overlapping), it owns this payout now: we must not send ours.
    const mine = await db.query(`update ${T} set tx = $2, blockhash = $3, attempts = attempts + 1
      where id = $1 and status = 'sending' and tx is not distinct from $4 returning id`, [p.id, s.signature, s.blockhash, p.tx ?? null]);
    if (!mine.length) return;
    try { await chain.send(s.tx); } catch { /* not sent or unknown: the next run checks the saved signature */ }
    const st = await chain.status(s.signature, s.blockhash);
    if (st === 'landed') { await db.query(`update ${T} set status = 'sent' where id = $1`, [p.id]); report.sent++; }
    else report.pending++;
  }
}
