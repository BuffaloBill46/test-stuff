// The payout worker's own database login (supabase/020_worker_role.sql) on real Postgres (PGlite), every live file 001–020 in
// order: as santa_worker, the REAL payout loop (server/payouts.js) sends a queued run payout, and the login can't redirect money
// (change an amount or a wallet), add or delete a payout, or read anything else. Run: node worker-role-db.test.mjs
import assert from 'node:assert/strict';
import { makeDb } from './setup.mjs';
import { runPayouts } from '../../server/payouts.js';
import { makePaymentGate } from '../../server/paymentgate.js';

const ALL = ['001_profiles.sql', '002_items_seed.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql', '006_ranked_tickets.sql', '007_rate_limits.sql',
  '008_hats_backpacks.sql', '009_lock_my_plays.sql', '010_levels.sql', '011_lottery.sql', '012_special_snowballs.sql', '013_match_stats.sql', '014_run_sizes.sql',
  '015_special_gear.sql', '016_shop.sql', '017_referee_role.sql', '018_ranked_results.sql', '019_ranked_board.sql', '020_worker_role.sql', '026_shared_pool.sql', '051_worker_reads_run_payment.sql'];
const db = await makeDb(ALL);
const PLAYER = 'WKwa11etAAAA'.padEnd(44, '1');
// a finished one-drop run that won 1 SANTA (as the game server leaves it), set up as the database owner
const uid = (await db.query('insert into auth.users default values returning id'))[0].id;
await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, $2, 'Tester', '{}')`, [uid, PLAYER]);
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', 100000000000, '{}'), ('slots', 100000000000, '{}')`);
const q = (await db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'drop', 1, 1, 1, 1000000, 0.001) returning id`, [uid]))[0].id;
const run = (await db.query(`select public.buy_run($1, $2, 1000000, 100000, 873000) as id`, [q, 'WorkerRoleBuy' + '5'.repeat(75)]))[0].id;
await db.query(`update public.plays set state = 'settled', commit = $2, secret = 's', player_seed = 'p', result = '{"mult":1}', pay = 1, pay_raw = 1000000, price_usd = 0.001, settled_at = now() where run_id = $1`, [run, 'f'.repeat(64)]);
const payoutId = (await db.query(`select public.finish_run($1, $2, 100) as id`, [run, PLAYER]))[0].id;

await db.query('set role santa_worker');
// the real payout loop, with a stand-in chain that records what it was asked to send
const sentTo = [];
const chain = { async sign(p) { sentTo.push([p.to_wallet, +p.amount_raw]); return { signature: 'Sig' + p.id + 'x'.repeat(80), tx: 'tx', blockhash: 'bh' + p.id }; }, async send() {}, async status() { return 'landed'; } };
// ...behind the REAL fast-payment gate, as worker/worker.mjs runs it (2026-10-05: live, the gate's read of the run's payment was
// refused for this login, "permission denied for table runs", and no winnings went out until 051 let it read run id + signature)
const gated = makePaymentGate({ db, statuses: async () => ({ confirmationStatus: 'finalized', err: null }) }).gate(chain);
const r = await runPayouts({ db, chain: gated, table: 'payouts' });
assert.equal(r.sent, 1, 'the queued payout was sent: ' + JSON.stringify(r));
assert.deepEqual(sentTo, [[PLAYER, 1000000]], 'to the player, the queued amount');
assert.equal((await db.query('select status from public.payouts where id = $1', [payoutId]))[0].status, 'sent');
assert.equal((await runPayouts({ db, chain, table: 'payouts' })).sent, 0, 'never twice');
// the other two queues work too (nothing queued there: an empty pass, no errors)
for (const t of ['pool_transfers', 'lottery_payouts']) assert.deepEqual(await runPayouts({ db, chain, table: t }), { sent: 0, pending: 0, resigned: 0, failed: 0 }, t);
assert.equal((await db.query('select kind from public.runs where id = $1', [run]))[0].kind, 'drop', 'reads which game a run is');
// refused: redirecting money, inventing or deleting payouts, reading anything else
const no = async (q, p, why) => { await assert.rejects(() => db.query(q, p), /permission denied/, why); };
await no(`update public.payouts set to_wallet = 'Thief' where id = $1`, [payoutId], 'cannot change where a payout goes');
await no(`update public.payouts set amount_raw = 999999999 where id = $1`, [payoutId], 'cannot change an amount');
await no(`update public.lottery_payouts set to_wallet = 'Thief'`, [], 'cannot redirect a lottery payout');
await no(`insert into public.payouts (run_id, to_wallet, amount_usd, amount_raw, price_usd) values ($1, 'Thief', 1, 1, 1)`, [run], 'cannot invent a payout');
await no(`delete from public.payouts`, [], 'cannot delete payouts');
await no('select * from public.profiles', [], 'cannot read profiles'); await no('select * from public.logins', [], 'cannot read logins');
await no('select profile_id from public.runs', [], 'only the run columns it needs (id, kind, and the payment signature for the fast-payment gate: 051)');
await no(`update public.pools set santa_raw = 0`, [], 'cannot touch pools');
await db.query('reset role');
console.log('OK: worker login (020): the real payout loop sends a queued payout once; it cannot change amounts or wallets, invent or delete payouts, or read anything else');
