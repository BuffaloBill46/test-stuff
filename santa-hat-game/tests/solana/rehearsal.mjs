// DRESS REHEARSAL of the devnet test, end to end, with no network: the REAL Token-2022 program (LiteSVM), the REAL database
// (PGlite + supabase/001–006), and the REAL server code (server/*.js) and page builder (mockups/pay.js).
// The blockchain Claude can repeat these same steps on devnet, swapping in real addresses and an RPC.
//   1. a 3%-tax test token; player, two pool wallets, treasury       5. the payout worker sends winnings and skims
//   2. the player buys credits with a real signed transaction        6. Cody pauses a pool (wallet-signed), plays stop, resume
//   3. the server checks the payment and adds credits                7. reconcile: the books match the wallets exactly
//   4. plays in Cody's order (skim forced so it's exercised)
// Stand-in (the one thing an RPC would do): the "finalized transaction" record the server reads is assembled from the chain's
// balances before/after, in Solana's jsonParsed shape. Run: cd tests/solana && node rehearsal.mjs
import assert from 'node:assert/strict';
import { LiteSVM, FailedTransactionMetadata } from 'litesvm';
import { generateKeyPairSigner, createTransactionMessage, setTransactionMessageFeePayerSigner, appendTransactionMessageInstructions, signTransactionMessageWithSigners,
  setTransactionMessageLifetimeUsingBlockhash, getSignatureFromTransaction, pipe, lamports } from '@solana/kit';
import { getCreateAccountInstruction } from '@solana-program/system';
import * as T22 from '@solana-program/token-2022';
import { makeDb } from '../db/setup.mjs';
import { createGameServer } from '../../server/games.js';
import { runPayouts } from '../../server/payouts.js';
import { reconcile } from '../../server/reconcile.js';
import { createAdmin, adminMessage, b58encode } from '../../server/admin.js';
import { purchaseInstructions } from '../../mockups/pay.js';
import { newSeed } from '../../mockups/fair.js';

const say = (...a) => console.log('  ' + a.join(' '));
const svm = new LiteSVM(), DEC = 6, FEE = { bps: 300, max: 1e15 }, PRICE = 0.00085;
const signer = async () => { const s = await generateKeyPairSigner(); svm.airdrop(s.address, lamports(10_000_000_000n)); return s; };
const send = async (payer, ixs) => { const m = pipe(createTransactionMessage({ version: 0 }), (x) => setTransactionMessageFeePayerSigner(payer, x), (x) => svm.setTransactionMessageLifetimeUsingLatestBlockhash(x), (x) => appendTransactionMessageInstructions(ixs, x));
  const tx = await signTransactionMessageWithSigners(m), r = svm.sendTransaction(tx); svm.expireBlockhash();
  if (r instanceof FailedTransactionMetadata) throw new Error(String(r.err?.())); return getSignatureFromTransaction(tx); };

console.log('1. Token and wallets');
const admin = await signer(), mintKp = await generateKeyPairSigner();
const ext = [{ __kind: 'TransferFeeConfig', transferFeeConfigAuthority: admin.address, withdrawWithheldAuthority: admin.address, withheldAmount: 0n,
  olderTransferFee: { epoch: 0n, maximumFee: 10n ** 15n, transferFeeBasisPoints: 300 }, newerTransferFee: { epoch: 0n, maximumFee: 10n ** 15n, transferFeeBasisPoints: 300 } }];
await send(admin, [getCreateAccountInstruction({ payer: admin, newAccount: mintKp, lamports: svm.minimumBalanceForRentExemption(BigInt(T22.getMintSize(ext))), space: T22.getMintSize(ext), programAddress: T22.TOKEN_2022_PROGRAM_ADDRESS }),
  T22.getInitializeTransferFeeConfigInstruction({ mint: mintKp.address, transferFeeConfigAuthority: admin.address, withdrawWithheldAuthority: admin.address, transferFeeBasisPoints: 300, maximumFee: 10n ** 15n }),
  T22.getInitializeMint2Instruction({ mint: mintKp.address, decimals: DEC, mintAuthority: admin.address, freezeAuthority: null })]);
const mint = mintKp.address, ata = async (o) => (await T22.findAssociatedTokenPda({ owner: o, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS, mint }))[0];
const [player, spinPool, slotsPool, treasury] = [await signer(), await signer(), await signer(), await signer()];
for (const w of [player, spinPool, slotsPool, treasury]) await send(admin, [T22.getCreateAssociatedTokenIdempotentInstruction({ payer: admin, ata: await ata(w.address), owner: w.address, mint, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS })]);
const give = async (w, santa) => send(admin, [T22.getMintToInstruction({ mint, token: await ata(w.address), mintAuthority: admin, amount: BigInt(Math.round(santa * 1e6)) })]);
await give(player, 100_000); await give(spinPool, 500 / PRICE); await give(slotsPool, 500 / PRICE); // the Game pool (every game, Cody 2026-10-02) and the old Slots pool (no game uses it)
const bal = async (w) => Number(T22.decodeToken(svm.getAccount(await ata(w.address))).data.amount);
say(`test SANTA (3% transfer tax); player holds ${(await bal(player) / 1e6).toLocaleString()}; the Game pool and the old Slots pool hold $500 worth each`);

console.log('2–3. Database, server, and buying runs of plays with a real signed transaction');
const db = await makeDb();
const me = await db.player(player.address, 'Cody');
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', $1, '{}'), ('slots', $2, '{}')`, [await bal(spinPool), await bal(slotsPool)]);
const finalized = new Map(); // what an RPC's getTransaction(jsonParsed, finalized) would return, by signature
const chain = { getTransaction: async (sig) => finalized.get(sig) ?? null };
const server = createGameServer({ retired: [], db, chain, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, poolWallets: { spin: spinPool.address, slots: slotsPool.address }, mint }); // the test token (SANTA_MINT on devnet)
async function buy(kind, n, bet) {
  const q = await server.quote(me, kind, n, bet); assert.ok(q.id, JSON.stringify(q));
  const pool = spinPool, before = { p: await bal(player), pool: await bal(pool) };
  const { instructions, split } = await purchaseInstructions(T22, q, player);          // the page's own builder
  const sig = await send(player, instructions);                                          // the wallet signs and sends
  const tb = (i, o, a) => ({ accountIndex: i, mint, owner: o, uiTokenAmount: { amount: String(a), decimals: 6 } });
  finalized.set(sig, { blockTime: Math.floor(Date.now() / 1000), meta: { err: null, innerInstructions: [],
    preTokenBalances: [tb(1, player.address, before.p), tb(2, pool.address, before.pool)], postTokenBalances: [tb(1, player.address, await bal(player)), tb(2, pool.address, await bal(pool))] },
    transaction: { message: { accountKeys: [{ pubkey: player.address, signer: true }], instructions: [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { mint, authority: player.address, tokenAmount: { amount: String(split.burn) } } } }] } } });
  const r = await server.buy(me, q.id, sig); assert.ok(r.ok, r.error);
  assert.equal((await server.buy(me, q.id, sig)).error, 'quote already used', 'the same payment can\'t buy twice');
  say(`bought a run of ${n} ${kind} at $${bet}: paid ${(q.santaRaw / 1e6).toFixed(2)} SANTA, ${(split.burn / 1e6).toFixed(2)} burned, ${(split.arrives / 1e6).toFixed(2)} arrived in the pool`);
  return r;
}
console.log('4. Playing each run straight away, every game on the one Game pool (a skim is forced so it gets exercised)');
let wins = 0, won = 0, plays = 0;
for (const [kind, n, bet] of [['big', 10, 1], ['spin', 10, 1], ['drop', 5, 0.1], ['drop', 5, 1]]) {
  const r = await buy(kind, n, bet);
  if (kind === 'big') { const slotsUsd = (await db.query(`select santa_raw from public.pools where game = 'spin'`))[0].santa_raw / 1e6 * PRICE;
    await db.query(`update public.pools set rules = $1 where game = 'spin'`, [JSON.stringify({ skimAt: Math.floor(slotsUsd) - 2, skim: 5 })]); }
  let last;
  for (const p of r.plays) { last = await server.settle(me, p.ticket, newSeed(16)); assert.ok(last.r, JSON.stringify(last)); plays++; if (last.r.pay > 0) { wins++; won += last.r.pay; } }
  assert.equal(last.runDone, true, 'the run\'s last play queues its payout');
}
const queued = await db.query(`select count(*)::int as n, coalesce(sum(amount_raw),0)::bigint as raw from public.payouts where status = 'queued'`);
const skims = await db.query(`select count(*)::int as n from public.pool_transfers where kind = 'skim'`);
say(`${plays} plays in 4 runs (10 Big Hat, 10 Spin, 5 + 5 Snowball Drop); ${wins} paid something ($${won.toFixed(2)} in prizes); ${queued[0].n} payouts queued; ${skims[0].n} skim(s) queued`);
assert.ok(skims[0].n >= 1, 'a skim was queued');

console.log('5. The payout worker sends winnings and skims on the chain');
// every run's payout comes from the Game pool (worker.mjs gameOfRun); a skim from the pool its row names
const poolFor = async (row) => ((row.game || 'spin') === 'slots' ? slotsPool : spinPool);
const workerChain = {}; // the payout worker's chain adapter (the live one uses an RPC: same four steps)
// A memo instruction (SPL Memo program): a short note written on the chain. Makes every payout transaction unique.
const memo = (text) => ({ programAddress: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', accounts: [], data: new TextEncoder().encode(text) });
workerChain.sign = async (row) => {
  const from = await poolFor(row), to = row.kind === 'skim' ? treasury.address : row.to_wallet, amount = BigInt(row.amount_raw), fee = (amount * 300n + 9999n) / 10000n, blockhash = svm.latestBlockhash();
  const [source, destination] = [await ata(from.address), await ata(to)];
  const m = pipe(createTransactionMessage({ version: 0 }), (x) => setTransactionMessageFeePayerSigner(from, x), (x) => setTransactionMessageLifetimeUsingBlockhash({ blockhash, lastValidBlockHeight: 1_000_000n }, x),
    (x) => appendTransactionMessageInstructions([T22.getTransferCheckedWithFeeInstruction({ source, mint, destination, authority: from, amount, decimals: DEC, fee }),
      memo(`Santa Hat ${row.kind === 'skim' ? 'skim' : 'payout'} #${row.id}`)], x)); // unique per payout (and readable on the chain)
  const tx = await signTransactionMessageWithSigners(m);
  return { signature: getSignatureFromTransaction(tx), tx, blockhash };
};
workerChain.send = async (tx) => { const r = svm.sendTransaction(tx); if (r instanceof FailedTransactionMetadata) throw new Error('rejected'); };
workerChain.status = async (sig, blockhash) => { const t = svm.getTransaction(sig); if (t && !(t instanceof FailedTransactionMetadata)) return 'landed'; if (t) return 'failed'; return blockhash === svm.latestBlockhash() ? 'pending' : 'expired'; };
const playerBefore = await bal(player), treasuryBefore = await bal(treasury);
const rp = await runPayouts({ db, chain: workerChain }), rt = await runPayouts({ db, chain: workerChain, table: 'pool_transfers' });
const sentRaw = Number((await db.query(`select coalesce(sum(amount_raw),0)::bigint as s from public.payouts where status = 'sent'`))[0].s);
const skimRaw = Number((await db.query(`select coalesce(sum(amount_raw),0)::bigint as s from public.pool_transfers where status = 'sent'`))[0].s);
say(`${rp.sent} payouts sent, ${rt.sent} skim(s) sent`);
const arrived = (await bal(player)) - playerBefore;
assert.ok(Math.abs(arrived - sentRaw * 0.97) <= rp.sent, 'the player received the prizes less the 3% tax');
assert.ok(Math.abs((await bal(treasury)) - treasuryBefore - skimRaw * 0.97) <= rt.sent, 'the treasury received the skims less the 3% tax');
say(`player received ${(arrived / 1e6).toFixed(2)} SANTA (prizes less 3%); treasury received ${((await bal(treasury) - treasuryBefore) / 1e6).toFixed(2)}`);
assert.equal((await runPayouts({ db, chain: workerChain })).sent, 0, 'running the worker again pays nothing twice');

console.log('6. Cody pauses the Game pool (wallet-signed), plays stop, then resume');
const codyKey = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const codyAddr = b58encode(new Uint8Array(await crypto.subtle.exportKey('raw', codyKey.publicKey)));
const adminSrv = createAdmin({ db, adminWallets: [codyAddr] });
const signed = async (action) => { const message = adminMessage({ action, game: 'spin', at: new Date().toISOString(), nonce: newSeed(16) });
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', codyKey.privateKey, new TextEncoder().encode(message)));
  return { wallet: codyAddr, message, signature: [...sig].map((b) => b.toString(16).padStart(2, '0')).join('') }; };
assert.ok((await adminSrv.run(await signed('pause'))).ok);
assert.deepEqual(await server.quote(me, 'big', 1, 1), { refused: true, stopped: true }); say('paused: no new run can be bought (no payment taken)');
assert.ok((await adminSrv.run(await signed('resume'))).ok);
const o = await buy('big', 1, 1); await server.settle(me, o.plays[0].ticket, newSeed(16)); await runPayouts({ db, chain: workerChain }); await runPayouts({ db, chain: workerChain, table: 'pool_transfers' });
say('resumed: played, and anything it owed was sent');

console.log('7. Reconcile: do the books match the wallets?');
for (const [game, w] of [['spin', spinPool], ['slots', slotsPool]]) {
  const book = Number((await db.query('select santa_raw from public.pools where game = $1', [game]))[0].santa_raw);
  const payouts = await db.query(`select po.id, po.status, po.amount_raw from public.payouts po join public.runs r on r.id = po.run_id where $1 = 'spin'`, [game]); // every run is paid from the Game pool
  const transfers = await db.query('select id, kind, status, amount_raw from public.pool_transfers where game = $1', [game]);
  const r = reconcile({ bookRaw: book, walletRaw: await bal(w), payouts, transfers });
  say(`${game}: books ${(book / 1e6).toFixed(2)} · wallet ${((await bal(w)) / 1e6).toFixed(2)} SANTA · drift ${r.drift}`);
  assert.ok(r.ok, `${game} drift ${r.drift}`);
}
const unpaid = await db.query(`select id from public.runs where paid_at is null`); assert.equal(unpaid.length, 0, 'every run finished and paid');
assert.equal(await bal(slotsPool), Math.round(500 / PRICE * 1e6), 'the old Slots pool wallet was never touched');
console.log('OK: dress rehearsal passed: real signed purchases, fair plays, payouts and skims sent once, admin stop/resume, books = wallets to the unit');
