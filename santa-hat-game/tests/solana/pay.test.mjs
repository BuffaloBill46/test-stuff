// The page's purchase builder (mockups/pay.js) on the REAL Token-2022 program: from a server quote to one transaction; the
// money lands exactly as the split says, and the server's payment checker accepts it. Only the wallet popup is missing
// (a test key signs here instead of Phantom).
import assert from 'node:assert/strict';
import { LiteSVM, FailedTransactionMetadata } from 'litesvm';
import { generateKeyPairSigner, createTransactionMessage, setTransactionMessageFeePayerSigner, appendTransactionMessageInstructions, signTransactionMessageWithSigners, pipe, lamports } from '@solana/kit';
import { getCreateAccountInstruction } from '@solana-program/system';
import * as T22 from '@solana-program/token-2022';
import { purchaseInstructions } from '../../mockups/pay.js';
import { verifyPayment } from '../../server/verify.js';
import { splitPayment } from '../../mockups/market.js';

const svm = new LiteSVM(), DEC = 6, FEE = { bps: 300, max: 1e15 };
const signer = async () => { const s = await generateKeyPairSigner(); svm.airdrop(s.address, lamports(10_000_000_000n)); return s; };
const run = async (payer, ixs) => { const m = pipe(createTransactionMessage({ version: 0 }), (x) => setTransactionMessageFeePayerSigner(payer, x), (x) => svm.setTransactionMessageLifetimeUsingLatestBlockhash(x), (x) => appendTransactionMessageInstructions(ixs, x));
  const r = svm.sendTransaction(await signTransactionMessageWithSigners(m)); svm.expireBlockhash(); return r instanceof FailedTransactionMetadata ? String(r.err?.()) : null; };
const admin = await signer(), mintKp = await generateKeyPairSigner(), player = await signer(), pool = await signer();
const ext = [{ __kind: 'TransferFeeConfig', transferFeeConfigAuthority: admin.address, withdrawWithheldAuthority: admin.address, withheldAmount: 0n,
  olderTransferFee: { epoch: 0n, maximumFee: 10n ** 15n, transferFeeBasisPoints: 300 }, newerTransferFee: { epoch: 0n, maximumFee: 10n ** 15n, transferFeeBasisPoints: 300 } }];
assert.equal(await run(admin, [getCreateAccountInstruction({ payer: admin, newAccount: mintKp, lamports: svm.minimumBalanceForRentExemption(BigInt(T22.getMintSize(ext))), space: T22.getMintSize(ext), programAddress: T22.TOKEN_2022_PROGRAM_ADDRESS }),
  T22.getInitializeTransferFeeConfigInstruction({ mint: mintKp.address, transferFeeConfigAuthority: admin.address, withdrawWithheldAuthority: admin.address, transferFeeBasisPoints: 300, maximumFee: 10n ** 15n }),
  T22.getInitializeMint2Instruction({ mint: mintKp.address, decimals: DEC, mintAuthority: admin.address, freezeAuthority: null })]), null);
const mint = mintKp.address, ata = async (o) => (await T22.findAssociatedTokenPda({ owner: o, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS, mint }))[0];
for (const w of [player, pool]) assert.equal(await run(admin, [T22.getCreateAssociatedTokenIdempotentInstruction({ payer: admin, ata: await ata(w.address), owner: w.address, mint, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS })]), null);
assert.equal(await run(admin, [T22.getMintToInstruction({ mint, token: await ata(player.address), mintAuthority: admin, amount: 1_000_000n * 10n ** 6n })]), null);
const bal = async (o) => Number(T22.decodeToken(svm.getAccount(await ata(o))).data.amount);

// A quote exactly as the server sends it (server/games.js → quote): 10 $1 spins at $0.00085.
const quote = { id: 'q1', kind: 'spin100', n: 10, usd: 10, santaRaw: Math.round(10 / 0.00085 * 1e6), mint, pool: pool.address, fee: FEE, burnBps: 1000, expiresAt: Date.now() + 60_000 };
const { instructions, split } = await purchaseInstructions(T22, quote, player);
assert.equal(instructions.length, 2, 'one transaction: a burn and a send, nothing else');
const before = { p: await bal(player.address), pool: await bal(pool.address) };
assert.equal(await run(player, instructions), null, 'the player signs and it goes through');
const after = { p: await bal(player.address), pool: await bal(pool.address) };
assert.equal(before.p - after.p, quote.santaRaw, 'exactly the quoted SANTA leaves the wallet');
assert.equal(after.pool - before.pool, split.arrives, 'the pool receives exactly what the split says');
assert.deepEqual(split, splitPayment(quote.santaRaw, 1000, FEE));

// The server's payment checker, given this payment as Solana reports it (balances before/after + the burn instruction), accepts it.
const tb = (i, o, a) => ({ accountIndex: i, mint, owner: o, uiTokenAmount: { amount: String(a), decimals: 6 } });
const reported = { blockTime: Math.floor(Date.now() / 1000), meta: { err: null, innerInstructions: [],
    preTokenBalances: [tb(1, player.address, before.p), tb(2, pool.address, before.pool)], postTokenBalances: [tb(1, player.address, after.p), tb(2, pool.address, after.pool)] },
  transaction: { message: { accountKeys: [{ pubkey: player.address, signer: true }], instructions: [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { mint, authority: player.address, tokenAmount: { amount: String(split.burn) } } } }] } } };
const v = verifyPayment(reported, { mint, player: player.address, pool: pool.address, quoteRaw: quote.santaRaw, quoteAt: Date.now(), quoteSeconds: 60, cushion: 0.02, burnBps: 1000, fee: FEE });
assert.ok(v.ok, v.why);

// Without a pool wallet in the quote (payments not open), the builder refuses instead of guessing.
await assert.rejects(() => purchaseInstructions(T22, { ...quote, pool: null }, player), /not open/);
// A player with too little SANTA: the whole transaction fails and nothing moves (not even the burn).
const poor = await signer();
assert.equal(await run(admin, [T22.getCreateAssociatedTokenIdempotentInstruction({ payer: admin, ata: await ata(poor.address), owner: poor.address, mint, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS }), T22.getMintToInstruction({ mint, token: await ata(poor.address), mintAuthority: admin, amount: 1000n })]), null);
assert.notEqual(await run(poor, (await purchaseInstructions(T22, quote, poor)).instructions), null);
assert.equal(await bal(poor.address), 1000, 'nothing burned, nothing sent');
console.log(`OK: purchase builder on the real token program: ${(quote.santaRaw / 1e6).toFixed(2)} SANTA paid → ${(split.arrives / 1e6).toFixed(2)} in the pool; the server's checker accepts it; no pool → refused; too poor → nothing moves`);
