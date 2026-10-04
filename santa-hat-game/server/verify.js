// SERVER: is this Solana transaction a valid payment for play credits? (Runs on the game server; pure, no network.)
// Input: the transaction as Solana's getTransaction returns it (encoding "jsonParsed", commitment "finalized").
// Checked by BALANCE CHANGES (recorded by the chain for every transaction), plus the burn instruction:
//   1. it succeeded                      5. the right pool's SANTA went up by what the split says should arrive
//   2. the player's linked wallet signed 6. a burn of SANTA from the player's account is in it (a real burn)
//   3. the mint is SANTA                 7. it landed inside the quote window (60 s, plus a little for the chain)
//   4. the player's SANTA went down by the quoted amount, within the 2% cushion
// "Each payment buys credits once" is the database's job (the signature is a unique key), not this function's.
// PAID WITH SOL (Cody 2026-10-04; mockups/pay.js solPurchaseInstructions): the same transaction first swaps the player's SOL for
// SANTA, so their SANTA goes UP on balance (the swap always buys a little more than the payment uses). Then 4 can't be checked
// (nothing they held was spent): the quote itself is the amount, and 5 and 6 are checked against the WHOLE quote, so a SOL
// payment must still put the quoted SANTA into the pool and burn the quoted burn. The Store (expect.lamports: the quote's SOL
// price for the share that isn't burned) checks instead that this much SOL reached the treasury. The pass burns nothing, so
// its SOL payment is a plain transfer and the player's SANTA doesn't move at all.
// expect: { mint, player, pool, quoteRaw, quoteAt (ms), quoteSeconds, cushion, burnBps, fee: {bps, max}, lamports? }
import { splitPayment } from '../mockups/market.js';

export const CHAIN_SLACK_SECONDS = 30; // block times are approximate

const tokenDelta = (meta, mint, owner) => {
  const sum = (list) => (list || []).filter((b) => b.mint === mint && b.owner === owner).reduce((a, b) => a + Number(b.uiTokenAmount.amount), 0);
  return sum(meta.postTokenBalances) - sum(meta.preTokenBalances);
};
// SOL (in lamports, a billionth of a SOL) that reached `owner` in this transaction
const solDelta = (tx, owner) => { const i = tx.transaction.message.accountKeys.findIndex((k) => (k.pubkey ?? k) === owner);
  return i < 0 ? 0 : Number(tx.meta.postBalances?.[i] ?? 0) - Number(tx.meta.preBalances?.[i] ?? 0); };
const allInstructions = (tx) => [...tx.transaction.message.instructions, ...(tx.meta.innerInstructions || []).flatMap((g) => g.instructions)];

// expect: { mint, player, pool, quoteRaw, quoteAt (ms), quoteSeconds, cushion, burnBps, fee: {bps, max} }
export function verifyPayment(tx, expect) {
  const no = (why) => ({ ok: false, why });
  if (!tx || !tx.meta) return no('transaction not found (or not finalized yet)');
  if (tx.meta.err) return no('transaction failed on-chain');
  const keys = tx.transaction.message.accountKeys;
  if (!keys.some((k) => k.pubkey === expect.player && k.signer)) return no('not signed by the player\'s wallet');
  const left = -tokenDelta(tx.meta, expect.mint, expect.player), store = expect.lamports != null, solIn = store ? solDelta(tx, expect.pool) : 0;
  const sol = left < 0 || (left === 0 && store && solIn > 0); // paid with SOL (see the top)
  const paid = sol ? expect.quoteRaw : left;
  if (!(paid > 0)) return no('no SANTA left the player\'s wallet');
  const low = expect.quoteRaw * (1 - expect.cushion), high = expect.quoteRaw * (1 + expect.cushion);
  if (paid < low || paid > high) return no(`paid ${paid}, quote was ${expect.quoteRaw} (±${expect.cushion * 100}%)`);
  const want = splitPayment(paid, expect.burnBps, expect.fee);
  const arrived = sol && store ? 0 : tokenDelta(tx.meta, expect.mint, expect.pool);
  if (sol && store) { if (solIn < expect.lamports) return no(`the treasury received ${solIn} lamports of SOL, expected ${expect.lamports}`); }
  else if (arrived < want.arrives) return no(`the pool received ${arrived}, expected ${want.arrives}`);
  const burned = allInstructions(tx).filter((i) => i.program === 'spl-token' && /^burn(Checked)?$/.test(i.parsed?.type) && i.parsed.info.mint === expect.mint && i.parsed.info.authority === expect.player)
    .reduce((a, i) => a + Number(i.parsed.info.tokenAmount?.amount ?? i.parsed.info.amount), 0);
  if (burned < want.burn) return no(`burned ${burned}, expected ${want.burn}`);
  const t = (tx.blockTime || 0) * 1000;
  if (t < expect.quoteAt - CHAIN_SLACK_SECONDS * 1000 || t > expect.quoteAt + (expect.quoteSeconds + CHAIN_SLACK_SECONDS) * 1000) return no('paid outside the quote window');
  return { ok: true, paid, burned, arrived, sol, lamports: sol ? solIn : 0 };
}
