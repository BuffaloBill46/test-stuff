// Builds the ONE purchase transaction from the server's quote: a burn straight from the player's wallet + a send straight to
// the pool (no in-between wallet; DESIGN_NOTES → SANTA's 3% tax). Proven on the real Token-2022 program in
// tests/solana/pay.test.mjs. The Solana toolkit is passed in (`lib`), so the page can load it from a CDN and the tests from npm.
// What's NOT here (no wallet in the build workspace): the wallet popup that signs and sends it. See FOR_MAIN_CLAUDE.md.
import { splitPayment, solShares, SOL_FLOOR } from './market.js?v=555bd3a989';

// lib: { TOKEN_2022_PROGRAM_ADDRESS, findAssociatedTokenPda, getBurnCheckedInstruction, getTransferCheckedWithFeeInstruction }
// quote: the server's { santaRaw, mint, pool, fee, burnBps }. player: the wallet's transaction signer ({ address, ... }).
export async function purchaseInstructions(lib, quote, player, decimals = 6) {
  if (!quote?.pool || !quote?.mint) throw new Error('payments are not open yet');
  const s = splitPayment(quote.santaRaw, quote.burnBps, quote.fee);
  const ata = async (owner) => (await lib.findAssociatedTokenPda({ owner, tokenProgram: lib.TOKEN_2022_PROGRAM_ADDRESS, mint: quote.mint }))[0];
  const [from, to] = [await ata(player.address), await ata(quote.pool)];
  return {
    split: s,
    // nothing to burn (the season pass: 100% treasury): no burn step at all
    instructions: [
      ...(s.burn > 0 ? [lib.getBurnCheckedInstruction({ account: from, mint: quote.mint, authority: player, amount: BigInt(s.burn), decimals })] : []),
      lib.getTransferCheckedWithFeeInstruction({ source: from, mint: quote.mint, destination: to, authority: player, amount: BigInt(s.send), decimals, fee: BigInt(s.tax) }),
    ],
  };
}

// PAYING WITH SOL (Cody, 2026-10-04): ONE transaction, ONE approval, and the player pays EXACTLY the price ("they are only
// charged $1 and whatever makes it to the pool is what it gets"). Jupiter (Solana's swap router) swaps the SOL for SANTA inside
// the same transaction:
//   games, lottery: ALL of the price's SOL is swapped; what the swap gives is burned 10% and sent to the pool, as with SANTA;
//   the Store (quote.solStore): exactly the burn share (50%) of the price is swapped and ALL of it burned; the rest of the price
//     goes to the treasury AS SOL; the pass burns nothing: a plain SOL transfer.
// The SANTA used is the swap's GUARANTEED minimum (after slippage), so the steps after it can never come up short; on a good
// fill the swap gives a hair more, which stays in the player's wallet. Swap and pool fees come out of what reaches the pool (the
// house absorbs them, ~8-10% today), never out of the player's pocket. If the route is so poor that what would arrive falls
// under SOL_FLOOR (85%) of what the quote's SANTA gives, the page refuses BEFORE the wallet opens (the server would refuse
// it): "pay with SANTA". Checked against the real mainnet routes without spending anything: tests/solana/sol-pay-sim.mjs.
export const WSOL = 'So11111111111111111111111111111111111111112', JUP = 'https://lite-api.jup.ag/swap/v1';
const SYSTEM = '11111111111111111111111111111111', COMPUTE = 'ComputeBudget111111111111111111111111111111';
export const SOL_SLIPPAGE_BPS = 50, SOL_CU_LIMIT = 300_000; // measured on mainnet: ~66k for a swap + pay (sol-pay-sim)
export const SOL_TOO_COSTLY = 'Paying with SOL costs too much in swap fees right now. Pay with SANTA, or try again in a minute. Nothing was charged.';

// What a SOL payment swaps and sends (pure): the price in lamports split as the server checks it (market.js solShares), and the
// least SANTA the swap must guarantee so what arrives clears the server's floor (with 1% to spare).
export function solPlan(quote) {
  const store = !!quote.solStore, sh = solShares(Number(quote.solLamports), quote.burnBps, store);
  const share = store ? (quote.santaRaw * quote.burnBps) / 10000 : quote.santaRaw;
  return { store, swap: sh.swap, treasury: sh.treasury, minSanta: Math.ceil(share * (SOL_FLOOR + 0.01)) };
}
const u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
const u64 = (n) => { let b = BigInt(n); const o = []; for (let i = 0; i < 8; i++) { o.push(Number(b & 255n)); b >>= 8n; } return o; };
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
// Jupiter's JSON instruction → the toolkit's shape (role: 0 read, 1 write, 2 sign, 3 sign + write)
const fromJup = (i) => ({ programAddress: i.programId, data: b64(i.data), accounts: i.accounts.map((a) => ({ address: a.pubkey, role: (a.isSigner ? 2 : 0) + (a.isWritable ? 1 : 0) })) });
export const cuLimitIx = (units) => ({ programAddress: COMPUTE, data: new Uint8Array([2, ...u32(units)]), accounts: [] });
export const solTransferIx = (from, to, lamports) => ({ programAddress: SYSTEM, data: new Uint8Array([...u32(2), ...u64(lamports)]),
  accounts: [{ address: from, role: 3 }, { address: to, role: 1 }] });

// lib: as purchaseInstructions, plus `get(url)` / `post(url, body)` → JSON (fetch on the page). Returns the instructions, the
// lookup tables the swap needs (address lists that keep the transaction small), and the SANTA the swap guarantees.
export async function solPurchaseInstructions(lib, quote, player, decimals = 6) {
  if (!quote?.pool || !quote?.mint) throw new Error('payments are not open yet');
  if (!(quote.solLamports > 0)) throw new Error('this price has no SOL price; pay with SANTA');
  const plan = solPlan(quote), out = [cuLimitIx(SOL_CU_LIMIT)];
  let lookupTables = [], santa = 0;
  if (plan.swap > 0) {
    const jq = await lib.get(`${JUP}/quote?inputMint=${WSOL}&outputMint=${quote.mint}&amount=${plan.swap}&slippageBps=${SOL_SLIPPAGE_BPS}&maxAccounts=40`);
    santa = Math.floor(+jq?.otherAmountThreshold || 0); // what the swap guarantees (after slippage and SANTA's own tax)
    if (!(santa >= plan.minSanta)) throw new Error(SOL_TOO_COSTLY);
    const sw = await lib.post(`${JUP}/swap-instructions`, { quoteResponse: jq, userPublicKey: player.address, wrapAndUnwrapSol: true });
    if (sw.error) throw new Error('the swap could not be prepared: ' + sw.error);
    out.push(...(sw.setupInstructions || []).map(fromJup), fromJup(sw.swapInstruction), ...(sw.cleanupInstruction ? [fromJup(sw.cleanupInstruction)] : []));
    lookupTables = sw.addressLookupTableAddresses || [];
  }
  if (plan.store) {
    const from = (await lib.findAssociatedTokenPda({ owner: player.address, tokenProgram: lib.TOKEN_2022_PROGRAM_ADDRESS, mint: quote.mint }))[0];
    if (santa > 0) out.push(lib.getBurnCheckedInstruction({ account: from, mint: quote.mint, authority: player, amount: BigInt(santa), decimals }));
    if (plan.treasury > 0) out.push(solTransferIx(player.address, quote.pool, plan.treasury));
  } else out.push(...(await purchaseInstructions(lib, { ...quote, santaRaw: santa }, player, decimals)).instructions); // burn 10% + the rest to the pool
  return { plan, instructions: out, lookupTables, santa, solIn: plan.swap };
}

// The transaction message, shared by the page (wallet.js) and the mainnet simulation, so both build exactly the same thing.
export async function purchaseMessage(kit, rpc, payer, { instructions, lookupTables = [] }) {
  const { value: bh } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  let msg = kit.pipe(kit.createTransactionMessage({ version: 0 }), (x) => kit.setTransactionMessageFeePayer(payer, x),
    (x) => kit.setTransactionMessageLifetimeUsingBlockhash(bh, x), (x) => kit.appendTransactionMessageInstructions(instructions, x));
  if (lookupTables.length) msg = kit.compressTransactionMessageUsingAddressLookupTables(msg, await kit.fetchAddressesForLookupTables(lookupTables, rpc));
  return msg;
}
