// CLAIM REWARDS on real Postgres (PGlite), every live file 001–024 in order (supabase/024_reward_claims.sql; Cody 2026-10-02):
// as the payout worker's own login, the REAL claim step (server/rewards.js) and the REAL never-pay-twice loop (server/payouts.js)
// turn Cody's claim into sweeps of every NON-SANTA token in the three pools, and the database itself refuses what must never
// happen: sweeping SANTA, sweeping from anything but a pool, a sweep nobody asked for, a worker-made claim, a changed amount.
// Run: node rewards-db.test.mjs
import assert from 'node:assert/strict';
import { makeDb } from './setup.mjs';
import { runPayouts } from '../../server/payouts.js';
import { queueRewardClaims } from '../../server/rewards.js';
import { createAdmin, adminMessage, b58encode } from '../../server/admin.js';

const FILES = ['001_profiles.sql', '002_items_seed.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql', '006_ranked_tickets.sql', '007_rate_limits.sql',
  '008_hats_backpacks.sql', '009_lock_my_plays.sql', '010_levels.sql', '011_lottery.sql', '012_special_snowballs.sql', '013_match_stats.sql', '014_run_sizes.sql',
  '015_special_gear.sql', '016_shop.sql', '017_referee_role.sql', '018_ranked_results.sql', '019_ranked_board.sql', '020_worker_role.sql', '021_alerts.sql',
  '022_ticket_cap.sql', '023_item_prices.sql', '024_reward_claims.sql', '025_stocking.sql', '026_shared_pool.sql'];
const db = await makeDb(FILES);
const SANTA_DEV = 'Jx95so9XYhtSJJoqup7Xb3T9Ptr9ZuUTXSgPcu6uttg', SANTA_MAIN = '3c7mmVSyEH8jfZXgxvpLsETtko1Y16DyRJ5XYB4snhGt';
const GP = 'HTmQz7My6MehV7bjhJ6jde8nDND1yvsz68d24LP7YgUQ', GLDX = 'Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re', OLD = 'OLDtokenMint1111111111111111111111111111111';
const T22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', TKG = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const pools = { spin: 'SPINpool', slots: 'SLOTSpool', lottery: 'LOTTERYpool' };
// what each pool wallet holds (as the chain would answer): SANTA everywhere, rewards in some, an empty GP account in the lottery
const held = {
  SPINpool: [{ mint: SANTA_DEV, program: T22, decimals: 6, amount_raw: 5_000_000_000n }, { mint: GP, program: T22, decimals: 6, amount_raw: 1_000_000n }, { mint: OLD, program: TKG, decimals: 9, amount_raw: 77n }],
  SLOTSpool: [{ mint: SANTA_DEV, program: T22, decimals: 6, amount_raw: 9n }, { mint: GLDX, program: T22, decimals: 8, amount_raw: 50_000_000n }],
  LOTTERYpool: [{ mint: SANTA_DEV, program: T22, decimals: 6, amount_raw: 1n }, { mint: GP, program: T22, decimals: 6, amount_raw: 0n }],
};
const balances = async (owner) => held[owner] || [];
const isSanta = (m) => m === SANTA_DEV || m === SANTA_MAIN;
const claim = async (n) => (await db.query(`insert into public.reward_claims (by_wallet, nonce, message, signature) values ('CODY', $1, 'm', 's') returning id`, ['n' + n]))[0].id; // what server/admin.js does

// 1. Cody claims (the game server's login); the worker turns it into sweeps
const c1 = await claim(1);
await db.query('set role santa_worker');
await assert.rejects(() => db.query(`insert into public.reward_claims (by_wallet, nonce, message, signature) values ('W', 'x', 'm', 's')`), /permission denied/, 'the worker can never make a claim');
const r1 = await queueRewardClaims({ db, pools, balances, isSanta });
const sweeps = await db.query('select game, mint, token_program, decimals, amount_raw::text as raw, status from public.reward_sweeps order by id');
assert.deepEqual(sweeps.map((w) => [w.game, w.mint, w.raw]), [['spin', GP, '1000000'], ['spin', OLD, '77'], ['slots', GLDX, '50000000']],
  'every non-SANTA token with a balance, per pool: GP and an old-program token from the Drop pool, GLDX from Slots; never SANTA, never an empty one');
assert.deepEqual(sweeps.map((w) => [w.token_program, w.decimals]), [[T22, 6], [TKG, 9], [T22, 8]], 'each with its own token program and decimals');
assert.equal((await db.query('select status from public.reward_claims where id = $1', [c1]))[0].status, 'queued'); assert.equal(r1[0].found.length, 3);

// 2. what the database refuses, whoever asks
await assert.rejects(() => db.query(`insert into public.reward_sweeps (claim_id, game, mint, token_program, decimals, amount_raw) values ($1, 'spin', $2, $3, 6, 5)`, [c1, GP, T22]),
  /row-level security|policy/, 'no sweep without an OPEN claim (this one was already turned into sweeps)');
await db.query('reset role');
const c2 = await claim(2); // a second claim while the first sweeps are still on their way
for (const [mint, game, why] of [[SANTA_DEV, 'spin', 'devnet SANTA'], [SANTA_MAIN, 'spin', 'mainnet SANTA'], [GP, 'treasury', 'from the treasury'], [GP, 'player', 'from anywhere else']])
  await assert.rejects(() => db.query(`insert into public.reward_sweeps (claim_id, game, mint, token_program, decimals, amount_raw) values ($1, $2, $3, $4, 6, 5)`, [c2, game, mint, T22]), /check constraint/, `refused even by the owner: ${why}`);
await db.query('set role santa_worker');
await assert.rejects(() => db.query(`insert into public.reward_sweeps (claim_id, game, mint, token_program, decimals, amount_raw, status) values ($1, 'spin', $2, $3, 6, 5, 'sent')`, [c2, OLD, T22]), /permission denied/, 'the worker sets no status of its own');
const r2 = await queueRewardClaims({ db, pools, balances, isSanta });
assert.deepEqual(r2[0].found, [], 'a claim while the same tokens are still on their way adds nothing (never swept twice)');
assert.equal((await db.query('select count(*)::int as n from public.reward_sweeps'))[0].n, 3);
await assert.rejects(() => db.query(`update public.reward_sweeps set amount_raw = 999999999`), /permission denied/, 'the worker can never change an amount');
await assert.rejects(() => db.query(`update public.reward_sweeps set mint = $1`, [SANTA_DEV]), /permission denied/, 'or the token');

// 3. the REAL sending loop: each sent once, from its pool, to the treasury (the adapter has no other destination)
const sent = [];
const chain = { async sign(w) { sent.push([w.game, w.mint, String(w.amount_raw)]); return { signature: 'Sweep' + w.id + 'x'.repeat(80), tx: 'tx', blockhash: 'bh' + w.id }; },
  async send() {}, async status() { return 'landed'; } };
assert.equal((await runPayouts({ db, chain, table: 'reward_sweeps' })).sent, 3);
assert.deepEqual(sent, [['spin', GP, '1000000'], ['spin', OLD, '77'], ['slots', GLDX, '50000000']]);
assert.equal((await runPayouts({ db, chain, table: 'reward_sweeps' })).sent, 0, 'never twice');
await db.query('reset role');

// 4. the admin screen's signed actions (server/admin.js): only Cody's wallet, once per signature, one waiting claim at a time,
// and the message carries nothing to choose (no token, amount or destination)
const wallet = async () => { const k = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  return { k, address: b58encode(new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey))) }; };
const hexNonce = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
async function signed(w, fields) {
  const message = adminMessage({ at: new Date().toISOString(), nonce: hexNonce(), settings: {}, ...fields });
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', w.k.privateKey, new TextEncoder().encode(message)));
  return { wallet: w.address, message, signature: [...sig].map((b) => b.toString(16).padStart(2, '0')).join('') };
}
const cody = await wallet(), stranger = await wallet(), admin = createAdmin({ db, adminWallets: [cody.address] });
const before = (await db.query('select count(*)::int as n from public.reward_claims'))[0].n;
assert.equal((await admin.run(await signed(stranger, { action: 'claim-rewards', game: 'all' }))).error, 'not an admin wallet');
assert.equal((await admin.run(await signed(cody, { action: 'claim-rewards', game: 'spin' }))).error, 'unknown action or game', 'game must be "all"');
const ok = await signed(cody, { action: 'claim-rewards', game: 'all' }), r = await admin.run(ok);
assert.ok(r.ok && r.claim > 0, JSON.stringify(r));
assert.equal((await admin.run(ok)).error, 'this signed message was already used', 'a copied signature can\'t be replayed');
assert.match((await admin.run(await signed(cody, { action: 'claim-rewards', game: 'all' }))).error, /already waiting/, 'one waiting claim at a time');
assert.equal((await db.query('select count(*)::int as n from public.reward_claims'))[0].n, before + 1);
const st = await admin.run(await signed(cody, { action: 'rewards-status', game: 'all' }));
assert.deepEqual([st.sweeps.length, st.sweeps.every((w) => w.status === 'sent'), st.claims[0].status], [3, true, 'requested'], 'the status list: 3 sent, the new claim waiting');
console.log('OK: claim rewards on real Postgres (001–024): signed by Cody\'s wallet only (replays, strangers, a 2nd waiting claim refused); Cody\'s claim → every non-SANTA token in the three pools, each once, with its own program and decimals; refused by the database: SANTA (both networks), any non-pool source, a sweep with no open claim, a worker-made claim, a changed amount or token; a second claim while the first is on its way adds nothing');
