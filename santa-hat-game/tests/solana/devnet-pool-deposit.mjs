// DEVNET ONLY: bring a pool up to a dollar amount the proper way (as Cody does on mainnet): new test SANTA goes into the pool
// wallet, then the deposit is RECORDED through the live game server's admin action (record-deposit, signed by the devnet
// stand-in for Cody's admin wallet), which reads the transaction on the chain and books exactly what arrived. Books and wallet
// stay equal (LESSONS: never put SANTA in a booked wallet without booking it).
// Used 2026-10-02: the Drop pool (shared "spin" pool) up to $300 for Snowball Drop board 2 (a $1 drop's 100× needs $100).
// Run: cd tests/solana && node devnet-pool-deposit.mjs <spin|slots> <dollars>      (SERVER=<games function URL> to change)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSolanaRpc, createSolanaRpcSubscriptions, sendAndConfirmTransactionFactory, createKeyPairSignerFromBytes, createTransactionMessage,
  setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstructions, signTransactionMessageWithSigners,
  getSignatureFromTransaction, pipe, signBytes } from '@solana/kit';
import * as T22 from '@solana-program/token-2022';
import { adminMessage } from '../../mockups/adminmsg.js';

// <dollars> = bring the pool up to that much; 'topoff' = pay a top-off the game booked and is waiting for (books ahead of the wallet
// by exactly that; new runs are refused until it's recorded: server/games.js), so books = wallet again (2026-10-03)
const [game, dollarsArg] = process.argv.slice(2), TOPOFF = dollarsArg === 'topoff', dollars = Number(dollarsArg);
if (!['spin', 'slots'].includes(game) || !(TOPOFF || (dollars > 0 && dollars <= 2000))) throw new Error('usage: node devnet-pool-deposit.mjs <spin|slots> <dollars, up to 2000 | topoff>');
const cfg = JSON.parse(readFileSync(new URL('../../devnet.json', import.meta.url), 'utf8'));
const RPC = cfg.rpc; if (!/devnet/.test(RPC)) throw new Error('devnet only');
const SERVER = process.env.SERVER || 'https://api.santahatgames.com';
const KEYS = process.env.SANTA_KEYS || 'C:\\santa-devnet-keys';
const keyOf = (n) => createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(join(KEYS, n + '.json'), 'utf8'))));
const rpc = createSolanaRpc(RPC), confirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions: createSolanaRpcSubscriptions(RPC.replace(/^http/, 'ws')) });
const post = async (body, admin) => (await fetch(SERVER, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://buffalobill46.github.io', ...(admin ? { 'x-santa-admin': '1' } : {}) }, body: JSON.stringify(body) })).json();

const walletOf = { spin: cfg.wallets.spinPool, slots: cfg.wallets.slotsPool }[game], mint = cfg.mint;
const ata = (await T22.findAssociatedTokenPda({ owner: walletOf, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS, mint }))[0];
const onChain = async () => BigInt((await rpc.getTokenAccountBalance(ata, { commitment: 'finalized' }).send()).value.amount);
const booked = async () => BigInt((await post({ action: 'pools' })).pools.find((p) => p.game === game).santaRaw);
// the price the server values pools at (its 10-minute median), so "$300" means what the game means by it
const price = (await post({ action: 'market' })).usd; if (!(price > 0)) throw new Error('no SANTA price from the server');
const before = { book: await booked(), wallet: await onChain() };
if (!TOPOFF && before.book !== before.wallet) throw new Error(`books ${before.book} ≠ wallet ${before.wallet}: fix that first, nothing done`);
if (TOPOFF && !(before.book > before.wallet)) throw new Error(`no top-off waiting (books ${before.book}, wallet ${before.wallet}): nothing done`);
const want = TOPOFF ? before.book : BigInt(Math.round((dollars / price) * 1e6)), need = TOPOFF ? before.book - before.wallet : want - before.book;
console.log(TOPOFF ? `${game} pool: books ${before.book} raw, wallet ${before.wallet} raw: paying the waiting top-off (${need} raw)` : `${game} pool: $${((Number(before.book) / 1e6) * price).toFixed(2)} now (books = wallet = ${before.book} raw) at $${price}; target $${dollars} = ${want} raw`);
if (need <= 0n) { console.log('already there: nothing to do'); process.exit(0); }

// 1. the test SANTA into the pool wallet (minting adds no transfer tax: exactly `need` arrives)
const admin = await keyOf('admin');
const { value: bh } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
const tx = await signTransactionMessageWithSigners(pipe(createTransactionMessage({ version: 0 }), (x) => setTransactionMessageFeePayerSigner(admin, x),
  (x) => setTransactionMessageLifetimeUsingBlockhash(bh, x),
  (x) => appendTransactionMessageInstructions([T22.getMintToInstruction({ mint, token: ata, mintAuthority: admin, amount: need }, { programAddress: T22.TOKEN_2022_PROGRAM_ADDRESS })], x)));
await confirm(tx, { commitment: 'confirmed' }); const sig = getSignatureFromTransaction(tx);
console.log(`1. sent ${need} raw test SANTA into the pool wallet: ${sig}`);
// 2. wait until it's final (the server only counts finalized transactions), then record it, signed by the admin stand-in
for (let i = 0; i < 60 && (await onChain()) < before.wallet + need; i++) await new Promise((r) => setTimeout(r, 2000));
const cody = await keyOf('codyAdmin');
let out;
for (let i = 0; i < 20; i++) {
  const message = adminMessage({ action: 'record-deposit', game, settings: { tx: sig }, at: new Date().toISOString(), nonce: [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('') });
  const signature = Buffer.from(await signBytes(cody.keyPair.privateKey, new TextEncoder().encode(message))).toString('hex');
  out = await post({ wallet: cody.address, message, signature }, true);
  if (!/finalized/.test(out.error || '')) break;
  await new Promise((r) => setTimeout(r, 3000));
}
console.log('2. recorded:', JSON.stringify(out));
const after = { book: await booked(), wallet: await onChain() };
console.log(`3. books ${after.book} · wallet ${after.wallet} · ${after.book === after.wallet ? 'EQUAL' : 'DIFFERENT (check!)'} · pool now $${((Number(after.book) / 1e6) * price).toFixed(2)}`);
if (after.book !== after.wallet) process.exit(1);
