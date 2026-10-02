// THE PAYOUT WORKER as it will run on the Droplet (worker/worker.mjs), end to end on REAL DEVNET with a real Postgres: a finished
// Snowball Drop run that won 1 test SANTA is queued in the database; the worker (a separate process, its settings in the
// environment like on the Droplet) sends it from the pool's key; the SANTA lands in the player's devnet wallet (3% lighter: the
// token's tax); the row is 'sent' with its transaction; a second pass pays nothing more.
// SAFETY: the worker gets a KEYS_DIR whose spinPool.json is the throwaway chainTestPool key, never the real devnet Spin pool (the
// live database's books track that wallet; LESSONS: setup must never change booked wallets).
// Needs: WSL (Postgres 14), npm install in worker/ and tests/db, devnet test SANTA in chainTestPool. Run: node worker.devnet.mjs
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, copyFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import * as kit from '@solana/kit';
import * as T22 from '@solana-program/token-2022';
import { startPostgres, makeRealDb } from '../db/realpg.mjs';

const cfg = JSON.parse(readFileSync(new URL('../../devnet.json', import.meta.url), 'utf8')), mint = cfg.mint, RPC = cfg.rpc || 'https://api.devnet.solana.com';
const KEYS = process.env.SANTA_KEYS || '/mnt/c/santa-devnet-keys';
const keyBytes = (n) => new Uint8Array(JSON.parse(readFileSync(path.join(KEYS, n + '.json'), 'utf8')));
const player = await kit.createKeyPairSignerFromBytes(keyBytes('player')), pool = await kit.createKeyPairSignerFromBytes(keyBytes('chainTestPool'));
const rpc = kit.createSolanaRpc(RPC);
const ata = async (o) => (await T22.findAssociatedTokenPda({ owner: o, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS, mint }))[0];
const bal = async (o) => BigInt((await rpc.getTokenAccountBalance(await ata(o), { commitment: 'finalized' }).send()).value.amount);

const server = await startPostgres({ tcp: true });
if (!server) { console.log('SKIP: Postgres is not installed here (run in WSL)'); process.exit(0); }
const db = await makeRealDb(server);
const port = server.pool.options.port;
// a player, the Spin pool's books, and a finished one-drop run that won 1 SANTA (as the game server leaves it)
const uid = (await db.query('insert into auth.users default values returning id'))[0].id;
await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, $2, 'Tester', '{}')`, [uid, player.address]);
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', 100000000000, '{}'), ('slots', 100000000000, '{}')`);
const q = (await db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'drop', 1, 1, 1, 1000000, 0.001) returning id`, [uid]))[0].id;
const run = (await db.query(`select public.buy_run($1, $2, 1000000, 100000, 873000) as id`, [q, 'WorkerTestBuy' + '5'.repeat(75)]))[0].id;
await db.query(`update public.plays set state = 'settled', commit = $2, secret = 's', player_seed = 'p', result = '{"mult":1}', pay = 1, pay_raw = 1000000, price_usd = 0.001, settled_at = now() where run_id = $1`, [run, 'f'.repeat(64)]);
const payoutId = (await db.query(`select public.finish_run($1, $2, 100) as id`, [run, player.address]))[0].id;
const due = (await db.query('select status, amount_raw, to_wallet from public.payouts where id = $1', [payoutId]))[0];
assert.deepEqual([due.status, +due.amount_raw, due.to_wallet], ['queued', 1000000, player.address], 'one payout queued: 1 SANTA to the player');

// the worker's key folder: the throwaway test pool stands in for the Spin pool
const keysDir = mkdtempSync(path.join(tmpdir(), 'santa-worker-keys-')); copyFileSync(path.join(KEYS, 'chainTestPool.json'), path.join(keysDir, 'spinPool.json')); chmodSync(path.join(keysDir, 'spinPool.json'), 0o600);
const before = await bal(player.address);
const worker = () => new Promise((res) => execFile('node', [new URL('../../worker/worker.mjs', import.meta.url).pathname], { env: { ...process.env, ONCE: '1',
  DATABASE_URL: `postgres://postgres@127.0.0.1:${port}/postgres`, SOLANA_RPC_URL: RPC, SANTA_MINT: mint, KEYS_DIR: keysDir, TREASURY_WALLET: cfg.wallets.treasury } }, (err, out, errOut) => res({ err, out: out + errOut })));
let out = '', st;
for (let i = 0; i < 20; i++) { // the first pass sends; later passes confirm it once it's final on devnet
  out += (await worker()).out;
  st = (await db.query('select status, tx from public.payouts where id = $1', [payoutId]))[0];
  if (st.status === 'sent') break;
  await new Promise((r) => setTimeout(r, 4000));
}
console.log(out.trim().split('\n').slice(0, 6).join('\n'));
assert.equal(st.status, 'sent', 'the worker sent it: ' + JSON.stringify(st));
const after = await bal(player.address), got = after - before;
assert.ok(got >= 960000n && got <= 1000000n, `the player received ${got} raw (1 SANTA less the 3% tax)`);
const once = (await worker()).out;
assert.equal((await db.query('select count(*)::int as n from public.payouts where status = \'sent\'', []))[0].n, 1);
assert.equal(await bal(player.address), after, 'a second pass pays nothing more');
console.log(`OK: the Droplet's payout worker sent a real devnet payout (tx ${st.tx.slice(0, 12)}…): +${got} raw to the player, row 'sent', nothing paid twice`);
await server.stop(); process.exit(0);
