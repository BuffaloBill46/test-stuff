// SERVER: the payout worker's LIVE chain adapter (a real Solana network over RPC). Same shape as the rehearsal's stand-in
// (tests/solana/rehearsal.mjs), which server/payouts.js expects:
//   sign(row) → { signature, tx, blockhash }    send(tx)    status(signature, blockhash) → 'landed' | 'pending' | 'expired' | 'failed'
// The libraries are passed in (kit = @solana/kit, T22 = @solana-program/token-2022) so this file has no install of its own.
//
// Never pay twice rests on 'expired' being TRUE: the worker re-signs only an expired payout, so 'expired' must mean "this
// transaction can never land". The order below makes that so: FIRST ask whether its blockhash is still valid, THEN look the
// transaction up. If the blockhash was already dead at the first question, nothing using it can land afterwards, so a
// lookup made after it sees everything that ever landed. (Asked the other way round, it could land between the two.)
// A transaction seen but only 'processed' (not yet confirmed by the network) is 'pending', never 'expired'.
//
// Every payout also creates the winner's token account if it's missing (free when it exists): a wallet that has never held
// the token has nowhere to receive it, and a plain transfer would fail. The pool wallet pays that small rent.
const MEMO = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const memo = (text) => ({ programAddress: MEMO, accounts: [], data: new TextEncoder().encode(text) });

// keyFor(row) → the signer of the pool wallet that pays this row; to(row) → the destination wallet address;
// feeOf() → { bps, max } of the token now (server: liveFee(mint, [rpcUrl])); label(row) → the unique memo text.
export function makeSolanaChain({ kit, T22, rpcUrl, mint, decimals = 6, keyFor, to, feeOf, label }) {
  const rpc = kit.createSolanaRpc(rpcUrl);
  const ata = async (owner) => (await T22.findAssociatedTokenPda({ owner, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS, mint }))[0];
  const confirmed = (s) => s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized';
  async function lookup(signature) {
    const [s] = (await rpc.getSignatureStatuses([signature], { searchTransactionHistory: true }).send()).value;
    if (!s) return null;
    if (s.err) return 'failed';
    return confirmed(s) ? 'landed' : 'pending';
  }
  return {
    async sign(row) {
      const from = await keyFor(row), dest = await to(row), amount = BigInt(row.amount_raw), fee = await feeOf();
      const feeRaw = BigInt(Math.min(Math.ceil((Number(amount) * fee.bps) / 10000), fee.max)); // the token's own rounding (market.js feeOn)
      const [source, destination] = [await ata(from.address), await ata(dest)];
      const { value: bh } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
      const m = kit.pipe(kit.createTransactionMessage({ version: 0 }), (x) => kit.setTransactionMessageFeePayerSigner(from, x),
        (x) => kit.setTransactionMessageLifetimeUsingBlockhash(bh, x),
        (x) => kit.appendTransactionMessageInstructions([
          T22.getCreateAssociatedTokenIdempotentInstruction({ payer: from, ata: destination, owner: dest, mint, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS }),
          T22.getTransferCheckedWithFeeInstruction({ source, mint, destination, authority: from, amount, decimals, fee: feeRaw }),
          memo(label(row))], x));
      const tx = await kit.signTransactionMessageWithSigners(m);
      return { signature: kit.getSignatureFromTransaction(tx), tx, blockhash: bh.blockhash };
    },
    async send(tx) {
      await rpc.sendTransaction(kit.getBase64EncodedWireTransaction(tx), { encoding: 'base64', preflightCommitment: 'confirmed' }).send();
    },
    async status(signature, blockhash) {
      const alive = (await rpc.isBlockhashValid(blockhash, { commitment: 'confirmed' }).send()).value; // FIRST (see top)
      const seen = await lookup(signature);
      if (seen) return seen;
      return alive ? 'pending' : 'expired';
    },
  };
}
