// THE $30 FLOOR (Cody 2026-10-05: "it should pause if the santa balance gets below $30"; server/games.js MIN_POOL_USD): no NEW
// Arcade run while the Game pool really holds under $30 of SANTA (its books minus any top-off still waiting for Cody's deposit),
// open again above it, and Cody's Telegram says so. Real game server code on real SQL (PGlite, every migration).
// Run: node tests/db/pool-floor-db.test.mjs
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { makeDb } from './setup.mjs';
import { createGameServer, MIN_POOL_USD } from '../../server/games.js';
import { createAlerts } from '../../server/alerts.js';
import { BETS } from '../../mockups/plinko.js';

const FILES = readdirSync(new URL('../../supabase/', import.meta.url)).filter((f) => /^0\d\d_.*\.sql$/.test(f) && f !== '031_games_role.sql').sort();
const db = await makeDb(FILES);
const W = 'FLooRwa11et'.padEnd(44, '1').replace(/[0OIl]/g, '9'), me = await db.player(W, 'Ann');
const USD = 0.001, raw = (dollars) => Math.round((dollars / USD) * 1e6); // SANTA at $0.001: $1 = 1,000 SANTA
const gs = createGameServer({ retired: [], db, chain: {}, livePrice: async () => ({ usd: USD }), liveFee: async () => ({ bps: 300, max: 1e15 }), poolWallets: {} });
const setPool = (dollars) => db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', $1, '{}') on conflict (game) do update set santa_raw = $1`, [raw(dollars)]);
const tryRun = async () => { await db.query('delete from public.quotes where profile_id = $1', [me]); return gs.quote(me, 'drop', 1, BETS[0]); };

await setPool(100);
let q = await tryRun();
assert.ok(q.id && !q.refused, '$100 in the pool: runs are taken ' + JSON.stringify(q).slice(0, 120));
await setPool(29.99);
q = await tryRun();
assert.deepEqual([q.refused, q.low, q.id], [true, true, undefined], 'under $30: no new run (nothing to pay, nothing charged)');
await setPool(30);
assert.ok((await tryRun()).id, 'exactly $30: open');
// the books say $300, but $280 of that is a top-off still waiting for Cody's deposit: the pool really holds $20
await setPool(300);
const [{ id: top }] = await db.query(`insert into public.pool_transfers (game, kind, amount_raw, status) values ('spin', 'top-off', $1, 'needs_approval') returning id`, [raw(280)]);
q = await tryRun();
assert.ok(q.refused && q.low, 'a top-off not yet deposited does not count: $300 booked − $280 waiting = $20 → refused');
const alerts = [];
await createAlerts({ db, telegram: { send: async (x) => { alerts.push(x); } }, games: [], livePrice: async () => ({ usd: USD }) }).run();
assert.ok(alerts.some((x) => /ARCADE PAUSED: the Game pool holds only \$20\.00 of SANTA \(under \$30\)/.test(x) && /Winnings already won still pay/.test(x)), 'Cody is told: ' + alerts.filter((x) => /ARCADE/.test(x)));
await db.query(`update public.pool_transfers set status = 'sent' where id = $1`, [top]); // Cody deposited it
assert.ok((await tryRun()).id, 'once the deposit is in, runs open again by themselves');
const quiet = [];
await db.query('delete from public.alerts_sent');
await createAlerts({ db, telegram: { send: async (x) => { quiet.push(x); } }, games: [], livePrice: async () => ({ usd: USD }) }).run();
assert.ok(!quiet.some((x) => /ARCADE PAUSED/.test(x)), 'and the alert stops');
// MY WINNINGS NOT SENT YET (Cody 2026-10-05: the "send a ticket" pop-up, only if it happens; server/games.js waiting)
{ const Bw = 'BeNwa11et'.padEnd(44, '1').replace(/[0OIl]/g, '9'), ben = await db.player(Bw, 'Ben');
  let k = 0;
  const win = async (who, wallet, usd) => {
    const qq = (await db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'drop', 1, 1, 1, 1000000, 0.001) returning id`, [who]))[0].id;
    const run = +(await db.query('select public.buy_run($1, $2, 1000000, 100000, 873000) as id', [qq, 'WaitRun' + String(++k) + '5'.repeat(80)]))[0].id;
    await db.query(`update public.plays set state = 'settled', commit = $2, secret = 's', player_seed = 'p', result = '{"mult":1}', pay = $3, pay_raw = 1000000, price_usd = 0.001, settled_at = now() where run_id = $1`, [run, 'f'.repeat(64), usd]);
    return (await db.query('select public.finish_run($1, $2, 1000) as id', [run, wallet]))[0].id; };
  const a1 = await win(me, W, 2.5), a2 = await win(me, W, 4), a3 = await win(me, W, 1), b1 = await win(ben, Bw, 9);
  assert.deepEqual((await gs.waiting(me)).waiting, [], 'just won, going out normally: nothing to say (no pop-up)');
  await db.query(`update public.payouts set status = 'sending', attempts = 2 where id = $1`, [a1]);   // failing: the pool can't cover it
  await db.query(`update public.payouts set created_at = now() - interval '10 minutes' where id = $1`, [a2]); // 10 minutes and not sent
  await db.query(`update public.payouts set status = 'held' where id = $1`, [a3]);                    // held: its own message
  await db.query(`update public.payouts set status = 'sending', attempts = 3 where id = $1`, [b1]);   // Ben's, not Ann's
  const w = (await gs.waiting(me)).waiting;
  assert.deepEqual(w.map((x) => [x.id, x.usd, x.kind]), [[+a1, 2.5, 'drop'], [+a2, 4, 'drop']], 'my failing + my late winnings only (not held, not Ben\'s) ' + JSON.stringify(w));
  // Cody's Telegram: "WE OWE <wallet> x SANTA", one line per winner (Ann: her 2 stuck winnings together; Ben: his own)
  const owe = []; await db.query('delete from public.alerts_sent');
  await createAlerts({ db, telegram: { send: async (x) => { owe.push(x); } }, games: [] }).run();
  const rawOf = async (ids) => +(await db.query('select sum(amount_raw)::bigint as s from public.payouts where id = any($1)', [ids]))[0].s;
  const fmt = (raw) => (raw / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const annRaw = await rawOf([a1, a2]);
  assert.ok(owe.some((x) => x.includes(`WE OWE ${W} `) && x.includes(fmt(annRaw) + ' SANTA') && /≈ \$6\.50, 2 winnings/.test(x)), 'Ann: WE OWE her wallet the SANTA of both, ≈ $6.50 ' + owe.filter((x) => /OWE/.test(x)));
  assert.ok(owe.some((x) => x.includes(`WE OWE ${Bw} `) && /≈ \$9\.00, 1 winning /.test(x)), "Ben's own line");
  assert.equal(owe.filter((x) => /WE OWE/.test(x)).length, 2, 'one line per winner (the held one is not owed-by-mistake: it has its own HELD alert)');
  await db.query(`update public.payouts set status = 'sent' where id in ($1, $2)`, [a1, a2]);
  assert.deepEqual((await gs.waiting(me)).waiting, [], 'once sent: nothing');
}
console.log(`OK: the $${MIN_POOL_USD} floor: new Arcade runs refused while the Game pool really holds under $${MIN_POOL_USD} (books minus undeposited top-offs), open at $${MIN_POOL_USD} and above, Cody alerted, reopens by itself; my stuck winnings listed for the pop-up (not held, not others'); WE OWE <wallet> x SANTA per winner`);
