// CLAIM REWARDS end to end on REAL DEVNET (Cody, 2026-10-02; supabase/024, server/rewards.js, worker/worker.mjs): two pretend
// reward tokens like the real ones (one Token-2022 with a 1% transfer fee, like GP; one on the original token program) are put in
// a pool wallet that also holds test SANTA. Cody's claim is a row; the REAL worker (a separate process with its settings in the
// environment, as on the Droplet) finds both rewards, sends them to the treasury once each, and leaves the SANTA where it is.
// SAFETY: the pool is the throwaway chainTestPool key (never the booked devnet pools; LESSONS); the treasury is a brand-new
// address made here, so what arrives there is exactly what the claim sent. Devnet only.
// Needs: WSL (Postgres), npm install in worker/ and tests/db. Run: node rewards.devnet.mjs
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, copyFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import * as kit from '@solana/kit';
import * as T22 from '@solana-program/token-2022';
import * as TK from '@solana-program/token';
import { getCreateAccountInstruction, getTransferSolInstruction } from '@solana-program/system';
import { startPostgres, makeRealDb } from '../db/realpg.mjs';

const cfg = JSON.parse(readFileSync(new URL('../../devnet.json', import.meta.url), 'utf8')), SANTA = cfg.mint, RPC = cfg.rpc;
if (!/devnet/.test(RPC)) throw new Error('devnet only');
const KEYS = process.env.SANTA_KEYS || '/mnt/c/santa-devnet-keys';
const load = (n) => kit.createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(path.join(KEYS, n + '.json'), 'utf8'))));
const [funder, pool] = [await load('funder'), await load('chainTestPool')];
const rpc = kit.createSolanaRpc(RPC), confirm = kit.sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions: kit.createSolanaRpcSubscriptions(RPC.replace(/^http/, 'ws')) });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn) { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= 6 || !/429|Too Many/i.test(String(e?.message) + JSON.stringify(e?.context || {}))) throw e; await pause(2000 * 2 ** i); } } }
const send = async (payer, ixs) => { await pause(1200); return retry(async () => { const { value: bh } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  const tx = await kit.signTransactionMessageWithSigners(kit.pipe(kit.createTransactionMessage({ version: 0 }), (x) => kit.setTransactionMessageFeePayerSigner(payer, x), (x) => kit.setTransactionMessageLifetimeUsingBlockhash(bh, x), (x) => kit.appendTransactionMessageInstructions(ixs, x)));
  await confirm(tx, { commitment: 'confirmed' }); }); };
const ataOf = async (owner, mint, program) => (await T22.findAssociatedTokenPda({ owner, mint, tokenProgram: program }))[0];
// a wallet's balance of a token (0 when it has no account for it yet)
const bal = async (owner, mint, program) => { const a = await ataOf(owner, mint, program);
  try { return BigInt((await retry(() => rpc.getTokenAccountBalance(a, { commitment: 'confirmed' }).send())).value.amount); } catch (e) { if (/could not find|Invalid param/i.test(String(e?.message) + JSON.stringify(e?.context || {}))) return 0n; throw e; } };

// 1. fees for the throwaway pool (it pays the treasury's new token accounts and the sends)
const solNow = (await retry(() => rpc.getBalance(pool.address, { commitment: 'confirmed' }).send())).value;
if (solNow < 30_000_000n) await send(funder, [getTransferSolInstruction({ source: funder, destination: pool.address, amount: kit.lamports(50_000_000n - solNow) })]);
// 2. two pretend reward tokens, made by the funder, each with some sent to the pool
const gp = await kit.generateKeyPairSigner(), old = await kit.generateKeyPairSigner(), treasury = (await kit.generateKeyPairSigner()).address;
const T22P = T22.TOKEN_2022_PROGRAM_ADDRESS, TKP = TK.TOKEN_PROGRAM_ADDRESS;
const ext = [{ __kind: 'TransferFeeConfig', transferFeeConfigAuthority: funder.address, withdrawWithheldAuthority: funder.address, withheldAmount: 0n,
  olderTransferFee: { epoch: 0n, maximumFee: 10n ** 15n, transferFeeBasisPoints: 100 }, newerTransferFee: { epoch: 0n, maximumFee: 10n ** 15n, transferFeeBasisPoints: 100 } }];
const gpSpace = T22.getMintSize(ext), oldSpace = TK.getMintSize();
const rent = async (n) => retry(() => rpc.getMinimumBalanceForRentExemption(BigInt(n)).send());
await send(funder, [getCreateAccountInstruction({ payer: funder, newAccount: gp, lamports: await rent(gpSpace), space: gpSpace, programAddress: T22P }),
  T22.getInitializeTransferFeeConfigInstruction({ mint: gp.address, transferFeeConfigAuthority: funder.address, withdrawWithheldAuthority: funder.address, transferFeeBasisPoints: 100, maximumFee: 10n ** 15n }),
  T22.getInitializeMint2Instruction({ mint: gp.address, decimals: 6, mintAuthority: funder.address, freezeAuthority: null }),
  getCreateAccountInstruction({ payer: funder, newAccount: old, lamports: await rent(oldSpace), space: oldSpace, programAddress: TKP }),
  TK.getInitializeMint2Instruction({ mint: old.address, decimals: 9, mintAuthority: funder.address, freezeAuthority: null })]);
const GP_AMT = 2_500_000n, OLD_AMT = 7_000_000_000n;
await send(funder, [T22.getCreateAssociatedTokenIdempotentInstruction({ payer: funder, ata: await ataOf(pool.address, gp.address, T22P), owner: pool.address, mint: gp.address, tokenProgram: T22P }),
  T22.getMintToInstruction({ mint: gp.address, token: await ataOf(pool.address, gp.address, T22P), mintAuthority: funder, amount: GP_AMT }),
  TK.getCreateAssociatedTokenIdempotentInstruction({ payer: funder, ata: await ataOf(pool.address, old.address, TKP), owner: pool.address, mint: old.address }),
  TK.getMintToInstruction({ mint: old.address, token: await ataOf(pool.address, old.address, TKP), mintAuthority: funder, amount: OLD_AMT })]);
console.log(`pretend rewards in the pool: ${GP_AMT} raw "GP" (Token-2022, 1% fee) ${gp.address}, ${OLD_AMT} raw old-program token ${old.address}`);
const santaBefore = await bal(pool.address, SANTA, T22P);
assert.ok(santaBefore > 0n, 'the pool also holds test SANTA (so "never SANTA" is really tested)');

// 3. the database (every live file through 024) and Cody's claim
const server = await startPostgres({ tcp: true });
if (!server) { console.log('SKIP: Postgres is not installed here (run in WSL)'); process.exit(0); }
const FILES = ['001_profiles.sql', '002_items_seed.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql', '006_ranked_tickets.sql', '007_rate_limits.sql',
  '008_hats_backpacks.sql', '009_lock_my_plays.sql', '010_levels.sql', '011_lottery.sql', '012_special_snowballs.sql', '013_match_stats.sql', '014_run_sizes.sql',
  '015_special_gear.sql', '016_shop.sql', '017_referee_role.sql', '018_ranked_results.sql', '019_ranked_board.sql', '020_worker_role.sql', '021_alerts.sql',
  '022_ticket_cap.sql', '023_item_prices.sql', '024_reward_claims.sql'];
const db = await makeRealDb(server, { files: FILES }), port = server.pool.options.port;
await db.query(`insert into public.reward_claims (by_wallet, nonce, message, signature) values ('CODY', 'devnet-test', 'm', 's')`);

// 4. the REAL worker, configured like the Droplet: the throwaway pool as the Drop pool, the new address as the treasury
const keysDir = mkdtempSync(path.join(tmpdir(), 'santa-reward-keys-')); copyFileSync(path.join(KEYS, 'chainTestPool.json'), path.join(keysDir, 'spinPool.json')); chmodSync(path.join(keysDir, 'spinPool.json'), 0o600);
const worker = () => new Promise((res) => execFile('node', [new URL('../../worker/worker.mjs', import.meta.url).pathname], { env: { ...process.env, ONCE: '1',
  DATABASE_URL: `postgres://postgres@127.0.0.1:${port}/postgres`, SOLANA_RPC_URL: RPC, SANTA_MINT: SANTA, KEYS_DIR: keysDir, TREASURY_WALLET: treasury, SPIN_POOL_WALLET: pool.address } },
  (err, out, errOut) => res(out + errOut)));
let out = '', rows;
for (let i = 0; i < 20; i++) {
  out += await worker();
  rows = await db.query('select game, mint, amount_raw::text as raw, status, tx from public.reward_sweeps order by id');
  if (rows.length && rows.every((r) => r.status === 'sent')) break;
  await pause(4000);
}
console.log(out.trim().split('\n').filter((l) => /reward|failed|error/i.test(l)).slice(0, 6).join('\n'));
assert.deepEqual(rows.map((r) => [r.game, r.mint, r.raw, r.status]).sort(), [['spin', gp.address, String(GP_AMT), 'sent'], ['spin', old.address, String(OLD_AMT), 'sent']].sort(), 'both rewards swept, once each: ' + JSON.stringify(rows));
assert.equal((await db.query(`select status from public.reward_claims`))[0].status, 'queued');

// 5. on the chain: the rewards are in the treasury (GP less its own 1% fee), the pool's rewards are empty, its SANTA untouched
await pause(3000);
const gpGot = await bal(treasury, gp.address, T22P), oldGot = await bal(treasury, old.address, TKP);
assert.equal(gpGot, GP_AMT - GP_AMT / 100n, `"GP" arrived less its own 1% transfer fee: ${gpGot}`);
assert.equal(oldGot, OLD_AMT, 'the old-program token arrived in full');
assert.equal(await bal(pool.address, gp.address, T22P), 0n); assert.equal(await bal(pool.address, old.address, TKP), 0n);
assert.equal(await bal(pool.address, SANTA, T22P), santaBefore, 'the pool\'s SANTA was NOT touched');
// a second pass and a second claim send nothing more
await worker();
await db.query(`insert into public.reward_claims (by_wallet, nonce, message, signature) values ('CODY', 'devnet-test-2', 'm', 's')`);
await worker();
assert.equal((await db.query('select count(*)::int as n from public.reward_sweeps'))[0].n, 2, 'nothing swept twice; the 2nd claim found nothing left');
assert.equal(await bal(treasury, gp.address, T22P), gpGot);
console.log(`OK: Claim rewards on real devnet: the worker swept a Token-2022 reward with a transfer fee and an old-program token from the pool to the treasury (tx ${rows[0].tx.slice(0, 10)}…), once each, and left the pool's SANTA alone`);
await server.stop(); process.exit(0);
