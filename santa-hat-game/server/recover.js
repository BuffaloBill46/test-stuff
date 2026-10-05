// UNREPORTED PAYMENTS, for every kind of purchase (Cody 2026-10-05: his page froze, he refreshed and approved the OLD screen's
// payment; it reached the wallet, but no page was left to report it, so nothing was bought; then "go ahead and make a fix" for
// lottery tickets and the Store too). Shared by the Arcade (server/games.js), the lottery (server/lottery.js) and the Store
// (server/shop.js): each has its own quote table (with used_by) and its own buy(profile, quoteId, signature), which checks the
// payment on Solana exactly as for a page (the right wallet, amount, burn, from the player, inside the quote's minute).
//
// sweepQuotes: the table's quotes nobody bought with, 3 minutes to 2 hours old (a page reports within seconds); for each, the
// player's wallet's transactions around it (signaturesOf(wallet, quoteAtMs) → signatures, oldest first) are tried through buy()
// until one is accepted; then after(quote, result) finishes the job (the Arcade plays it out). Each quote is looked at
// RECOVER_AT_MIN.length times (about 3, 10 and 30 minutes old) and then left alone, so the network is asked little.
// tries: a Map kept by the caller between sweeps (quote id → looks done). → [{ table, quote, profile, wallet, signature, ... }]
export const RECOVER_AT_MIN = [3, 10, 30];
const TABLES = new Set(['quotes', 'lottery_quotes', 'shop_quotes']); // the only tables this may read (the name goes into SQL)

export async function sweepQuotes({ db, table, buy, signaturesOf, tries = new Map(), wanted = () => true, after = async () => ({}), limit = 20 }) {
  if (!TABLES.has(table)) throw new Error('sweepQuotes: unknown table ' + table);
  const qs = await db.query(`select q.*, extract(epoch from now() - q.created_at) / 60 as age_min, p.wallet as payer
    from public.${table} q join public.profiles p on p.id = q.profile_id
    where q.used_by is null and q.created_at < now() - interval '3 minutes' and q.created_at > now() - interval '2 hours' and p.wallet is not null
    order by q.created_at limit $1`, [limit]);
  const found = [], key = (q) => table + ':' + q.id;
  for (const q of qs) {
    if (!wanted(q)) continue;
    const done = tries.get(key(q)) || 0;
    if (done >= RECOVER_AT_MIN.length || Number(q.age_min) < RECOVER_AT_MIN[done]) continue;
    tries.set(key(q), done + 1);
    let sigs = [];
    try { sigs = await signaturesOf(q.payer, new Date(q.created_at).getTime()); } catch { tries.set(key(q), done); continue; } // the network: next time
    for (const sig of sigs) {
      const b = await buy(q.profile_id, q.id, sig);
      if (b.error) continue; // not this one (another payment, one already used, or not a payment for this at all)
      found.push({ table, quote: q.id, profile: q.profile_id, wallet: q.payer, signature: sig, usd: Number(q.usd) || 0, result: b, ...(await after(q, b)) });
      break;
    }
  }
  for (const k of tries.keys()) if (k.startsWith(table + ':') && !qs.some((q) => key(q) === k)) tries.delete(k); // past 2 hours or bought
  return found;
}
