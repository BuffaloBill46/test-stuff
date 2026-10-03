// Builds the ONE purchase transaction from the server's quote: a burn straight from the player's wallet + a send straight to
// the pool (no in-between wallet; DESIGN_NOTES → SANTA's 3% tax). Proven on the real Token-2022 program in
// tests/solana/pay.test.mjs. The Solana toolkit is passed in (`lib`), so the page can load it from a CDN and the tests from npm.
// What's NOT here (no wallet in the build workspace): the wallet popup that signs and sends it. See FOR_MAIN_CLAUDE.md.
import { splitPayment } from './market.js?v=19f08d50c0';

// lib: { TOKEN_2022_PROGRAM_ADDRESS, findAssociatedTokenPda, getBurnCheckedInstruction, getTransferCheckedWithFeeInstruction }
// quote: the server's { santaRaw, mint, pool, fee, burnBps }. player: the wallet's transaction signer ({ address, ... }).
export async function purchaseInstructions(lib, quote, player, decimals = 6) {
  if (!quote?.pool || !quote?.mint) throw new Error('payments are not open yet');
  const s = splitPayment(quote.santaRaw, quote.burnBps, quote.fee);
  const ata = async (owner) => (await lib.findAssociatedTokenPda({ owner, tokenProgram: lib.TOKEN_2022_PROGRAM_ADDRESS, mint: quote.mint }))[0];
  const [from, to] = [await ata(player.address), await ata(quote.pool)];
  return {
    split: s,
    instructions: [
      lib.getBurnCheckedInstruction({ account: from, mint: quote.mint, authority: player, amount: BigInt(s.burn), decimals }),
      lib.getTransferCheckedWithFeeInstruction({ source: from, mint: quote.mint, destination: to, authority: player, amount: BigInt(s.send), decimals, fee: BigInt(s.tax) }),
    ],
  };
}
