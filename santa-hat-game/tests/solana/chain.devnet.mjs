// The payout worker on the REAL devnet with the LIVE chain adapter (server/solanachain.js): real signatures, a real RPC, real
// blockhash expiry. Uses its OWN test pool wallet, so the live pools' books stay equal to their wallets. Needs devnet-setup.mjs
// first (the test token and admin key). Takes ~2 minutes (waits for a real blockhash to expire). Run: node chain.devnet.mjs
//   1. two EQUAL payouts to a brand-new wallet (no token account yet): both arrive, once each (memo makes them unique)
//   2. crash AFTER sending (signature saved, never marked sent): the next run marks it sent and does NOT send again
//   3. crash BEFORE sending (signature saved, never sent): only once its blockhash is dead does the worker sign a fresh one
// Invariant (asserted, to the unit): the wallet received exactly sum(amount − tax) for every row, and nothing twice.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as kit from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import * as T22 from '@solana-program/token-2022';
import { makeDb } from '../db/setup.mjs';
import { runPayouts } from '../../server/payouts.js';
import { makeSolanaChain } from '../../server/solanachain.js';
import { liveFee } from '../../mockups/market.js';

const say = (...a) => console.log('  ' + a.join(' '));
const cfg = JSON.parse(readFileSync(new URL('../../devnet.json', import.meta.url), 'utf8'));
const KEYS = process.env.SANTA_KEYS || 'C:\\santa-devnet-keys', { mint } = cfg;
const rpc = kit.createSolanaRpc(cfg.rpc), confirm = kit.sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions: kit.createSolanaRpcSubscriptions(cfg.rpc.replace(/^http/, 'ws')) });
const load = async (n) => kit.createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(join(KEYS, n + '.json'), 'utf8'))));
async function keyFile(n) { const f = join(KEYS, n + '.json');
  if (!existsSync(f)) { const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const priv = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey)).slice(-32), pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    writeFileSync(f, JSON.stringify([...priv, ...pub])); } return load(n); }
async function send(payer, ixs) { const { value: bh } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  const tx = await kit.signTransactionMessageWithSigners(kit.pipe(kit.createTransactionMessage({ version: 0 }), (x) => kit.setTransactionMessageFeePayerSigner(payer, x),
    (x) => kit.setTransactionMessageLifetimeUsingBlockhash(bh, x), (x) => kit.appendTransactionMessageInstructions(ixs, x)));
  await confirm(tx, { commitment: 'confirmed' }); }
const ata = async (o) => (await T22.findAssociatedTokenPda({ owner: o, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS, mint }))[0];
const bal = async (o) => { const v = (await rpc.getTokenAccountBalance(await ata(o), { commitment: 'confirmed' }).send().catch(() => null))?.value; return v ? BigInt(v.amount) : 0n; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('Setup: a test pool wallet of its own, and a brand-new winner wallet');
const admin = await load('admin'), pool = await keyFile('chainTestPool'), winner = await kit.generateKeyPairSigner();
await send(admin, [getTransferSolInstruction({ source: admin, destination: pool.address, amount: kit.lamports(20_000_000n) }),
  T22.getCreateAssociatedTokenIdempotentInstruction({ payer: admin, ata: await ata(pool.address), owner: pool.address, mint, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS }),
  T22.getMintToInstruction({ mint, token: await ata(pool.address), mintAuthority: admin, amount: 10_000_000_000n })]);
say(`pool ${pool.address} holds ${(Number(await bal(pool.address)) / 1e6).toLocaleString()} test SANTA; winner ${winner.address} has no token account`);

const db = await makeDb();
const feeOf = () => liveFee(mint, [cfg.rpc]);
const chain = makeSolanaChain({ kit, T22, rpcUrl: cfg.rpc, mint, keyFor: async () => pool, to: async () => winner.address, feeOf,
  label: (row) => `Santa Hat chain test #${row.id}` });
const queue = async (raw) => +(await db.query(`insert into public.pool_transfers (game, kind, amount_raw) values ('spin', 'skim', $1) returning id`, [raw]))[0].id;
const work = async () => runPayouts({ db, chain, table: 'pool_transfers' });
async function untilDone(why) { for (let i = 0; i < 40; i++) { const r = await work();
  const left = await db.query(`select count(*)::int n from public.pool_transfers where status <> 'sent'`); if (!left[0].n) return; await sleep(3000); void r; } throw new Error('not all sent: ' + why); }
const fee = await feeOf(), net = (raw) => raw - BigInt(Math.min(Math.ceil((Number(raw) * fee.bps) / 10000), fee.max));
const owed = []; // every row's amount, to check the invariant at the end

console.log('1. Two equal payouts to a wallet with no token account');
for (let i = 0; i < 2; i++) owed.push(BigInt(1_000_000_000)), await queue(1_000_000_000);
await untilDone('two equal');
assert.equal(await bal(winner.address), net(1_000_000_000n) * 2n, 'both equal payouts arrived, once each');
say(`both arrived: ${(Number(await bal(winner.address)) / 1e6).toFixed(6)} test SANTA (2 × 1000 less 3%)`);

console.log('2. Crash AFTER sending: saved, sent, never marked sent');
let id = await queue(700_000_000); owed.push(700_000_000n);
let [row] = await db.query(`update public.pool_transfers set status = 'sending' where id = $1 returning *`, [id]);
let s = await chain.sign(row);
await db.query(`update public.pool_transfers set tx = $2, blockhash = $3, attempts = 1 where id = $1`, [id, s.signature, s.blockhash]);
await chain.send(s.tx); // ...and the worker "dies" here; the next run starts at once, while the payout is still in flight
await untilDone('crash after send');
assert.equal((await db.query(`select tx from public.pool_transfers where id = $1`, [id]))[0].tx, s.signature, 'kept the original transaction (no new one signed)');
say('the next run found it landed and marked it sent; nothing re-sent');

console.log('3. Crash BEFORE sending: saved, never sent (waits for the blockhash to really expire, ~1–2 min)');
id = await queue(300_000_000); owed.push(300_000_000n);
[row] = await db.query(`update public.pool_transfers set status = 'sending' where id = $1 returning *`, [id]);
s = await chain.sign(row);
await db.query(`update public.pool_transfers set tx = $2, blockhash = $3, attempts = 1 where id = $1`, [id, s.signature, s.blockhash]);
const t0 = Date.now(); let st;
while ((st = await chain.status(s.signature, s.blockhash)) === 'pending') { assert.ok(Date.now() - t0 < 240_000, 'blockhash never expired'); await sleep(5000); }
assert.equal(st, 'expired', 'an unsent transaction is reported expired, never landed');
say(`its blockhash died after ${Math.round((Date.now() - t0) / 1000)} s; the old signature can now never land`);
await untilDone('crash before send');
const after = (await db.query(`select tx, attempts from public.pool_transfers where id = $1`, [id]))[0];
assert.notEqual(after.tx, s.signature, 'a fresh transaction was signed'); assert.equal(after.attempts, 2);
assert.equal(await chain.status(s.signature, s.blockhash), 'expired', 'the dead one still never landed');

console.log('Invariant: the wallet received exactly what was owed, nothing twice');
const want = owed.reduce((a, r) => a + net(r), 0n), got = await bal(winner.address);
assert.equal(got, want, `received ${got}, owed ${want}`);
assert.equal((await work()).sent, 0, 'running again sends nothing');
const sigs = await db.query(`select tx from public.pool_transfers`); assert.equal(new Set(sigs.map((r) => r.tx)).size, sigs.length, 'one transaction per row');
console.log(`OK: live chain adapter on devnet: ${owed.length} payouts, each exactly once (incl. crash after send and crash before send); received ${(Number(got) / 1e6).toFixed(6)} = owed to the unit`);
process.exit(0);
