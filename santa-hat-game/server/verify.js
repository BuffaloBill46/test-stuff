// SERVER: is this Solana transaction a valid payment for play credits? (Runs on the game server; pure, no network.)
// Input: the transaction as Solana's getTransaction returns it (encoding "jsonParsed", commitment "finalized").
// Checked by BALANCE CHANGES (recorded by the chain for every transaction), plus the burn instruction:
//   1. it succeeded                      5. the right pool's SANTA went up by what the split says should arrive
//   2. the player's linked wallet signed 6. a burn of SANTA from the player's account is in it (a real burn)
//   3. the mint is SANTA                 7. it landed inside the quote window (60 s, plus a little for the chain)
//   4. the player's SANTA went down by the quoted amount, within the 2% cushion
// "Each payment buys credits once" is the database's job (the signature is a unique key), not this function's.
import { splitPayment } from '../mockups/market.js';

export const CHAIN_SLACK_SECONDS = 30; // block times are approximate

const tokenDelta = (meta, mint, owner) => {
  const sum = (list) => (list || []).filter((b) => b.mint === mint && b.owner === owner).reduce((a, b) => a + Number(b.uiTokenAmount.amount), 0);
  return sum(meta.postTokenBalances) - sum(meta.preTokenBalances);
};
const allInstructions = (tx) => [...tx.transaction.message.instructions, ...(tx.meta.innerInstructions || []).flatMap((g) => g.instructions)];

// expect: { mint, player, pool, quoteRaw, quoteAt (ms), quoteSeconds, cushion, burnBps, fee: {bps, max} }
export function verifyPayment(tx, expect) {
  const no = (why) => ({ ok: false, why });
  if (!tx || !tx.meta) return no('transaction not found (or not finalized yet)');
  if (tx.meta.err) return no('transaction failed on-chain');
  const keys = tx.transaction.message.accountKeys;
  if (!keys.some((k) => k.pubkey === expect.player && k.signer)) return no('not signed by the player\'s wallet');
  const paid = -tokenDelta(tx.meta, expect.mint, expect.player);
  if (!(paid > 0)) return no('no SANTA left the player\'s wallet');
  const low = expect.quoteRaw * (1 - expect.cushion), high = expect.quoteRaw * (1 + expect.cushion);
  if (paid < low || paid > high) return no(`paid ${paid}, quote was ${expect.quoteRaw} (±${expect.cushion * 100}%)`);
  const want = splitPayment(paid, expect.burnBps, expect.fee);
  const arrived = tokenDelta(tx.meta, expect.mint, expect.pool);
  if (arrived < want.arrives) return no(`the pool received ${arrived}, expected ${want.arrives}`);
  const burned = allInstructions(tx).filter((i) => i.program === 'spl-token' && /^burn(Checked)?$/.test(i.parsed?.type) && i.parsed.info.mint === expect.mint && i.parsed.info.authority === expect.player)
    .reduce((a, i) => a + Number(i.parsed.info.tokenAmount?.amount ?? i.parsed.info.amount), 0);
  if (burned < want.burn) return no(`burned ${burned}, expected ${want.burn}`);
  const t = (tx.blockTime || 0) * 1000;
  if (t < expect.quoteAt - CHAIN_SLACK_SECONDS * 1000 || t > expect.quoteAt + (expect.quoteSeconds + CHAIN_SLACK_SECONDS) * 1000) return no('paid outside the quote window');
  return { ok: true, paid, burned, arrived };
}
