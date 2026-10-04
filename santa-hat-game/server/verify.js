// SERVER: is this Solana transaction a valid payment for play credits? (Runs on the game server; pure, no network.)
// Input: the transaction as Solana's getTransaction returns it (encoding "jsonParsed", commitment "finalized").
// Checked by BALANCE CHANGES (recorded by the chain for every transaction), plus the burn instruction:
//   1. it succeeded                      5. the right pool's SANTA went up by what the split says should arrive
//   2. the player's linked wallet signed 6. a burn of SANTA from the player's account is in it (a real burn)
//   3. the mint is SANTA                 7. it landed inside the quote window (60 s, plus a little for the chain)
//   4. the player's SANTA went down by the quoted amount, within the 2% cushion
// "Each payment buys credits once" is the database's job (the signature is a unique key), not this function's.
// PAID WITH SOL (Cody 2026-10-04: "we can't upcharge them because of fees ... they are only charged $1 and whatever makes it to the
// pool is what it gets"; mockups/pay.js solPurchaseInstructions). The player spends EXACTLY the price in SOL (expect.sol.lamports,
// kept on the quote): games and the lottery swap all of it to SANTA and burn + send what the swap gave; the Store swaps exactly
// the burn share (50%) and burns ALL of what that bought, and sends the rest of the price to the treasury AS SOL; the pass is
// just SOL to the treasury. So the pool / the burn get what the market gave, a little under the quote (swap and pool fees), and
// the house absorbs that, not the player. Checked instead of 4 and 5:
//   S1. it went through Jupiter (Solana's swap router, a real market), unless nothing is swapped (the pass)
//   S2. the player's own SOL really went down by the whole price (the swap, plus the treasury's SOL for the Store)
//   S3. what arrived / was burned is at least SOL_FLOOR (85%) of what the quote's SANTA would give: a payment built to deliver
//       next to nothing is refused. The page refuses to sign one that would land under it (pay.js), so an honest player is
//       never charged for a payment refused here.
//   S4. the Store: the treasury got its SOL share in full
// A SOL payment is one where the player's SANTA did not go down (the swap's SANTA comes in and goes out in the same
// transaction). Quotes without a SOL price (devnet, the SOL price down): SANTA only, as before.
// expect: { mint, player, pool, quoteRaw, quoteAt (ms), quoteSeconds, cushion, burnBps, fee: {bps, max}, sol?: { lamports, store } }
import { splitPayment, SOL_FLOOR, solShares } from '../mockups/market.js';

export const JUPITER = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'; // Jupiter's swap program (v6)

export const CHAIN_SLACK_SECONDS = 30; // block times are approximate

const tokenDelta = (meta, mint, owner) => {
  const sum = (list) => (list || []).filter((b) => b.mint === mint && b.owner === owner).reduce((a, b) => a + Number(b.uiTokenAmount.amount), 0);
  return sum(meta.postTokenBalances) - sum(meta.preTokenBalances);
};
// SOL (in lamports, a billionth of a SOL) that reached `owner` in this transaction
const solDelta = (tx, owner) => { const i = tx.transaction.message.accountKeys.findIndex((k) => (k.pubkey ?? k) === owner);
  return i < 0 ? 0 : Number(tx.meta.postBalances?.[i] ?? 0) - Number(tx.meta.preBalances?.[i] ?? 0); };
const burnedBy = (tx, mint, player) => allInstructions(tx).filter((i) => i.program === 'spl-token' && /^burn(Checked)?$/.test(i.parsed?.type) && i.parsed.info.mint === mint && i.parsed.info.authority === player)
  .reduce((a, i) => a + Number(i.parsed.info.tokenAmount?.amount ?? i.parsed.info.amount), 0);
const allInstructions = (tx) => [...tx.transaction.message.instructions, ...(tx.meta.innerInstructions || []).flatMap((g) => g.instructions)];

export function verifyPayment(tx, expect) {
  const no = (why) => ({ ok: false, why });
  if (!tx || !tx.meta) return no('transaction not found (or not finalized yet)');
  if (tx.meta.err) return no('transaction failed on-chain');
  const keys = tx.transaction.message.accountKeys;
  if (!keys.some((k) => k.pubkey === expect.player && k.signer)) return no('not signed by the player\'s wallet');
  const left = -tokenDelta(tx.meta, expect.mint, expect.player), burned = burnedBy(tx, expect.mint, expect.player);
  let paid, arrived = 0, lamports = 0;
  const sol = left <= 0 && !!expect.sol;
  if (sol) {
    const sh = solShares(expect.sol.lamports, expect.burnBps, expect.sol.store), q = splitPayment(expect.quoteRaw, expect.burnBps, expect.fee);
    if (sh.swap > 0 && !allInstructions(tx).some((i) => (i.programId ?? i.program) === JUPITER)) return no('paid with SOL, but not through a real swap (Jupiter)');
    // S1b. the SANTA really came out of a swap: in a real swap it arrives from the swap pool's vault, whose owner no person signs
    // for. SANTA moved into the player's account by a wallet that SIGNED this transaction (their own second wallet) would let
    // someone pay ~85% of the price in their own SANTA dressed up as a SOL payment (security pass 2026-10-04): refused.
    const signers = new Set(keys.filter((k) => k.signer).map((k) => k.pubkey));
    const mine = new Set([...(tx.meta.preTokenBalances || []), ...(tx.meta.postTokenBalances || [])].filter((b) => b.mint === expect.mint && b.owner === expect.player).map((b) => keys[b.accountIndex]?.pubkey));
    const fromSigner = allInstructions(tx).some((i) => i.program === 'spl-token' && /^transfer(Checked|CheckedWithFee)?$/.test(i.parsed?.type) && mine.has(i.parsed.info.destination)
      && signers.has(i.parsed.info.authority ?? i.parsed.info.multisigAuthority));
    if (fromSigner) return no('paid with SOL, but SANTA was moved in from a wallet that signed (not a swap)');
    const spent = -solDelta(tx, expect.player) - Number(tx.meta.fee || 0);
    if (spent < expect.sol.lamports) return no(`paid ${spent} lamports of SOL, the price was ${expect.sol.lamports}`);
    if (expect.sol.store) {
      lamports = solDelta(tx, expect.pool);
      if (lamports < sh.treasury) return no(`the treasury received ${lamports} lamports of SOL, expected ${sh.treasury}`);
      const wantBurn = Math.ceil(SOL_FLOOR * expect.quoteRaw * expect.burnBps / 10000);
      if (burned < wantBurn) return no(`burned ${burned}, expected at least ${wantBurn} (${SOL_FLOOR * 100}% of the burn share)`);
      paid = expect.quoteRaw; // the price, in SANTA terms (a refund is owed at this)
    } else {
      arrived = tokenDelta(tx.meta, expect.mint, expect.pool);
      if (arrived < Math.ceil(SOL_FLOOR * q.arrives)) return no(`the pool received ${arrived}, under ${SOL_FLOOR * 100}% of ${q.arrives}`);
      if (burned < Math.ceil(SOL_FLOOR * q.burn)) return no(`burned ${burned}, under ${SOL_FLOOR * 100}% of ${q.burn}`);
      paid = burned + arrived; // the SANTA the SOL bought and used (before the transfer tax), as recorded
    }
  } else {
    paid = left;
    if (!(paid > 0)) return no('no SANTA left the player\'s wallet');
    const low = expect.quoteRaw * (1 - expect.cushion), high = expect.quoteRaw * (1 + expect.cushion);
    if (paid < low || paid > high) return no(`paid ${paid}, quote was ${expect.quoteRaw} (±${expect.cushion * 100}%)`);
    const want = splitPayment(paid, expect.burnBps, expect.fee);
    arrived = tokenDelta(tx.meta, expect.mint, expect.pool);
    if (arrived < want.arrives) return no(`the pool received ${arrived}, expected ${want.arrives}`);
    if (burned < want.burn) return no(`burned ${burned}, expected ${want.burn}`);
  }
  const t = (tx.blockTime || 0) * 1000;
  if (t < expect.quoteAt - CHAIN_SLACK_SECONDS * 1000 || t > expect.quoteAt + (expect.quoteSeconds + CHAIN_SLACK_SECONDS) * 1000) return no('paid outside the quote window');
  return { ok: true, paid, burned, arrived, sol, lamports };
}
