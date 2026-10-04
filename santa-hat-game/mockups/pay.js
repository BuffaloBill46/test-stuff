// Builds the ONE purchase transaction from the server's quote: a burn straight from the player's wallet + a send straight to
// the pool (no in-between wallet; DESIGN_NOTES → SANTA's 3% tax). Proven on the real Token-2022 program in
// tests/solana/pay.test.mjs. The Solana toolkit is passed in (`lib`), so the page can load it from a CDN and the tests from npm.
// What's NOT here (no wallet in the build workspace): the wallet popup that signs and sends it. See FOR_MAIN_CLAUDE.md.
import { splitPayment } from './market.js';

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

// PAYING WITH SOL (Cody, 2026-10-04: "I dont want them to have to do extra steps"). Still ONE transaction, ONE approval: Jupiter
// (Solana's swap router) swaps the player's SOL for SANTA inside the same transaction, then SANTA goes its usual way.
//   games, lottery (no quote.solLamports): swap enough SOL for the whole SANTA amount, then pay exactly as with SANTA
//     (burn + send to the pool) — the pool only ever receives SANTA;
//   the Store (quote.solLamports from the server): swap only enough SOL for the burn, burn it, and send quote.solLamports of SOL
//     straight to the treasury (Cody: "buy 50% santa then burn it and send the remaining sol to treasury"). The pass burns
//     nothing, so it is a plain SOL transfer, no swap at all.
// A swap can't buy an EXACT amount of SANTA (Jupiter finds no "exact out" route for it), so a little more is bought; the few
// SANTA left over stay in the player's wallet. Checked against the real mainnet routes without spending anything:
// tests/solana/sol-pay-sim.mjs.
export const WSOL = 'So11111111111111111111111111111111111111112', JUP = 'https://lite-api.jup.ag/swap/v1';
const SYSTEM = '11111111111111111111111111111111', COMPUTE = 'ComputeBudget111111111111111111111111111111';
export const SOL_SLIPPAGE_BPS = 100, SOL_CU_LIMIT = 300_000; // measured on mainnet: ~66k for a swap + pay (sol-pay-sim)

// What a SOL payment has to buy and send (pure). gross: the SANTA the swap must guarantee. Jupiter's amounts are what LANDS in the
// player's wallet, SANTA's own 3% tax already taken (seen on mainnet, sol-pay-sim: grossing up for the tax again overbought 3%).
// If a swap ever delivered less, the burn/send after it would fail and the WHOLE transaction with it: nothing is taken.
export function solPlan(quote) {
  const split = splitPayment(quote.santaRaw, quote.burnBps, quote.fee), store = quote.solLamports != null;
  const need = store ? split.burn : split.total;
  const gross = need > 0 ? need + 1 : 0;
  return { split, store, need, gross, lamportsTo: store ? Number(quote.solLamports) : 0 };
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
// lookup tables the swap needs (address lists that keep the transaction small), and how much SOL goes into the swap.
export async function solPurchaseInstructions(lib, quote, player, decimals = 6) {
  if (!quote?.pool || !quote?.mint) throw new Error('payments are not open yet');
  const plan = solPlan(quote), out = [cuLimitIx(SOL_CU_LIMIT)];
  let lookupTables = [], solIn = 0;
  if (plan.gross > 0) {
    const ask = (lamports) => lib.get(`${JUP}/quote?inputMint=${WSOL}&outputMint=${quote.mint}&amount=${lamports}&slippageBps=${SOL_SLIPPAGE_BPS}&maxAccounts=40`);
    // first a small probe for the rate, then aim at the SANTA needed (the guaranteed minimum, after slippage, must cover it)
    const probe = await ask(10_000_000), rate = +probe.otherAmountThreshold / 10_000_000;
    if (!(rate > 0)) throw new Error('no SOL → SANTA swap available right now; pay with SANTA');
    let jq; solIn = Math.ceil((plan.gross / rate) * 1.005);
    for (let i = 0; i < 3; i++) {
      jq = await ask(solIn);
      if (+jq.otherAmountThreshold >= plan.gross) break;
      solIn = Math.ceil(solIn * (plan.gross / Math.max(1, +jq.otherAmountThreshold)) * 1.005);
    }
    if (!(+jq?.otherAmountThreshold >= plan.gross)) throw new Error('the SOL price moved too fast; try again');
    const sw = await lib.post(`${JUP}/swap-instructions`, { quoteResponse: jq, userPublicKey: player.address, wrapAndUnwrapSol: true });
    if (sw.error) throw new Error('the swap could not be prepared: ' + sw.error);
    out.push(...(sw.setupInstructions || []).map(fromJup), fromJup(sw.swapInstruction), ...(sw.cleanupInstruction ? [fromJup(sw.cleanupInstruction)] : []));
    lookupTables = sw.addressLookupTableAddresses || [];
  }
  if (plan.store) {
    const from = (await lib.findAssociatedTokenPda({ owner: player.address, tokenProgram: lib.TOKEN_2022_PROGRAM_ADDRESS, mint: quote.mint }))[0];
    if (plan.split.burn > 0) out.push(lib.getBurnCheckedInstruction({ account: from, mint: quote.mint, authority: player, amount: BigInt(plan.split.burn), decimals }));
    out.push(solTransferIx(player.address, quote.pool, plan.lamportsTo));
  } else out.push(...(await purchaseInstructions(lib, quote, player, decimals)).instructions);
  return { plan, instructions: out, lookupTables, solIn };
}

// The transaction message, shared by the page (wallet.js) and the mainnet simulation, so both build exactly the same thing.
export async function purchaseMessage(kit, rpc, payer, { instructions, lookupTables = [] }) {
  const { value: bh } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  let msg = kit.pipe(kit.createTransactionMessage({ version: 0 }), (x) => kit.setTransactionMessageFeePayer(payer, x),
    (x) => kit.setTransactionMessageLifetimeUsingBlockhash(bh, x), (x) => kit.appendTransactionMessageInstructions(instructions, x));
  if (lookupTables.length) msg = kit.compressTransactionMessageUsingAddressLookupTables(msg, await kit.fetchAddressesForLookupTables(lookupTables, rpc));
  return msg;
}
