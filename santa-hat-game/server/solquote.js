// SERVER: the SOL price on a quote (Cody 2026-10-04: paying with SOL, the player pays EXACTLY the price). The whole price in
// lamports (a billionth of a SOL) at the live SOL price, rounded up, kept on the quote row (supabase/044, 045 sol_lamports) so
// the payment check (verify.js) holds the player to exactly what they were shown. Shared by the games, the lottery and the Store.
// Mainnet only (the swap runs on Jupiter, which isn't on devnet). No SOL price (the price service down, or the column not there
// yet): null, and the quote simply offers SANTA only; nothing else changes.
import { lamportsFor } from '../mockups/market.js';

const TABLES = ['quotes', 'lottery_quotes', 'shop_quotes'];
export function makeSolQuote({ db, liveSol, cluster }) {
  return async (table, id, usd) => {
    if (!liveSol || cluster !== 'mainnet' || !TABLES.includes(table)) return null;
    try {
      const sol = (await liveSol()).usd, lamports = lamportsFor(usd, sol);
      await db.query(`update public.${table} set sol_lamports = $2 where id = $1`, [id, lamports]);
      return { solLamports: lamports, solUsd: sol };
    } catch { return null; }
  };
}
// What verify.js checks a SOL payment against, from the quote row (none: SANTA only)
export const solExpect = (row, store = false) => (row?.sol_lamports ? { lamports: Number(row.sol_lamports), store } : undefined);
