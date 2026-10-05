// EARLY WARNINGS so payouts never pause (Cody 2026-10-05; server/alerts.js): URGENT when the Game pool wallet holds less SANTA
// than the winnings waiting to go out (the moment sends would start failing), and LOW SOL when a wallet that pays winners drops
// under 0.1 SOL (fees + opening new winners' accounts). Neither fires when things are fine; a wallet the chain doesn't answer for
// is skipped, not an alarm. Real SQL (PGlite). Run: node tests/db/alerts-short-db.test.mjs
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { makeDb } from './setup.mjs';
import { createAlerts, LOW_SOL } from '../../server/alerts.js';

const FILES = readdirSync(new URL('../../supabase/', import.meta.url)).filter((f) => /^0\d\d_.*\.sql$/.test(f) && f !== '031_games_role.sql').sort();
const db = await makeDb(FILES);
const W = 'SHoRTwa11et'.padEnd(44, '1').replace(/[0OIl]/g, '9'), me = await db.player(W, 'Ann');
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', 500000000, '{}') on conflict (game) do update set santa_raw = 500000000`);
const q = (await db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'drop', 1, 1, 1, 1000000, 0.001) returning id`, [me]))[0].id;
const run = +(await db.query('select public.buy_run($1, $2, 1000000, 100000, 873000) as id', [q, 'ShortRun' + '5'.repeat(80)]))[0].id;
await db.query(`update public.plays set state = 'settled', commit = $2, secret = 's', player_seed = 'p', result = '{"mult":1}', pay = 1, pay_raw = 40000000, price_usd = 0.001, settled_at = now() where run_id = $1`, [run, 'f'.repeat(64)]);
await db.query('select public.finish_run($1, $2, 100)', [run, W]);
const owed = +(await db.query(`select coalesce(sum(amount_raw), 0)::bigint as s from public.payouts where status <> 'sent'`))[0].s;
assert.ok(owed > 0, 'a winning is waiting to be sent');

const check = async ({ wallet, sol }) => {
  const out = [];
  await createAlerts({ db, telegram: { send: async (x) => { out.push(x); } }, games: ['spin'], walletRaw: async () => wallet,
    solRaw: async (a) => { if (sol[a] instanceof Error) throw sol[a]; return sol[a]; }, solWallets: { 'Game pool': 'POOLaddr', Lottery: 'LOTaddr' } }).run();
  await db.query('delete from public.alerts_sent').catch(() => {}); // each case on its own (alerts are sent once)
  return out;
};
let out = await check({ wallet: owed + 5_000_000, sol: { POOLaddr: 300_000_000, LOTaddr: 100_000_000 } });
assert.ok(!out.some((x) => /URGENT|LOW SOL/.test(x)), 'enough SANTA and SOL: no warning ' + out.filter((x) => /URGENT|LOW SOL/.test(x)));
out = await check({ wallet: owed - 1, sol: { POOLaddr: 300_000_000, LOTaddr: 100_000_000 } });
assert.ok(out.some((x) => /URGENT: the Game pool wallet holds .* SANTA but .* SANTA of winnings are waiting/.test(x)), 'short by even 1 unit: URGENT ' + out);
out = await check({ wallet: owed + 5_000_000, sol: { POOLaddr: 60_000_000, LOTaddr: new Error('no answer') } });
assert.ok(out.some((x) => /LOW SOL: the Game pool wallet has 0\.0600 SOL/.test(x) && x.includes('POOLaddr')), 'Game pool at 0.06 SOL: LOW SOL, with its address ' + out);
assert.ok(!out.some((x) => /LOW SOL: the Lottery/.test(x)), "a wallet the chain didn't answer for is skipped, not an alarm");
assert.equal(LOW_SOL, 0.1);
console.log(`OK: early warnings: URGENT when the Game pool holds less SANTA than the winnings waiting; LOW SOL under ${LOW_SOL} SOL (with the address); quiet when fine; no false alarm when the chain doesn't answer`);
