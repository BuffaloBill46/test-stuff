// REHEARSAL of the mainnet switch-over (supabase/ops/mainnet_reset.sql) on a COPY of the live data: every live file 001–031 on
// PGlite, then every row from the latest backup (C:\santa-devnet-keys\backups\db-before-mainnet-*.json, made on the Droplet),
// then the script. Proves on the real rows, with the real code: nothing is left that the payout worker, the lottery runner or
// the reward sweeper would PAY; the books are zero; accounts, the catalogue and settings are kept; a second run is harmless.
// Run: node mainnet-reset.test.mjs [backup file]
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs'; import path from 'node:path';
import { makeDb } from './setup.mjs';
import { runPayouts } from '../../server/payouts.js';
import { queueRewardClaims } from '../../server/rewards.js';
import { createLottery } from '../../server/lottery.js';

const DIR = process.env.BACKUPS || (process.platform === 'win32' ? 'C:/santa-devnet-keys/backups' : '/mnt/c/santa-devnet-keys/backups');
const file = process.argv[2] || path.join(DIR, readdirSync(DIR).filter((f) => f.startsWith('db-before-mainnet-')).sort().pop());
const backup = JSON.parse(readFileSync(file, 'utf8')), T = backup.tables;
const FILES = readdirSync(new URL('../../supabase/', import.meta.url)).filter((f) => /^0\d\d_.*\.sql$/.test(f) && f !== '031_games_role.sql').sort();
const db = await makeDb(FILES);

// the copy: auth users for every profile, then every table's rows as they are live (constraint triggers off while loading)
await db.pg.exec('set session_replication_role = replica');
for (const p of T.profiles) await db.query('insert into auth.users (id) values ($1) on conflict do nothing', [p.id]);
const cols = async (t) => (await db.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`, [t])).map((r) => r.column_name);
let loaded = 0;
for (const [t, rows] of Object.entries(T)) {
  if (!rows.length) continue;
  const have = new Set(await cols(t)); assert.ok(have.size, `table ${t} exists in the files 001–030 (the live database has nothing the files don't)`);
  await db.query(`delete from public.${t}`); // some files seed rows (items, lottery settings): the live rows replace them exactly
  for (const r of rows) {
    const keys = Object.keys(r).filter((k) => have.has(k));
    await db.query(`insert into public.${t} (${keys.map((k) => `"${k}"`).join(', ')}) select ${keys.map((k) => `x."${k}"`).join(', ')} from json_populate_record(null::public.${t}, $1) x`, [JSON.stringify(r)]);
    loaded++;
  }
}
await db.pg.exec('set session_replication_role = origin');
const count = async (t) => +(await db.query(`select count(*)::int n from public.${t}`))[0].n;
console.log(`copy of the live data loaded: ${loaded} rows from ${path.basename(file)} (made ${backup.at})`);
const before = { profiles: await count('profiles'), logins: await count('logins'), items: await count('items'), payouts: await count('payouts'), draws: await count('lottery_draws'),
  settings: (await db.query('select payout_mode from public.lottery_settings'))[0]?.payout_mode, feedback: await count('tester_feedback') };
assert.ok(before.payouts > 0 && before.draws > 0, 'the copy really has test payouts and lottery draws to clear');

// SEASONS (supabase/033, after this backup was made): plant what a devnet tester could have, a $5 pass bought with test
// SANTA, a granted costume piece and look, opened doors, so the switch-over is proven to clear them (2026-10-03)
const tester = (await db.query('select id from public.profiles limit 1'))[0]?.id;
assert.ok(tester, 'the backup has a profile to plant season rows on');
await db.query(`insert into public.season_passes (profile_id, season, signature, usd, paid_raw) values ($1, 'halloween', $2, 5, 1000) on conflict do nothing`, [tester, 'TestPass'.padEnd(88, '9')]);
await db.query(`insert into public.season_progress (profile_id, season, day, door) values ($1, 'halloween', '2026-10-01', true), ($1, 'halloween', '2026-10-02', true), ($1, 'halloween', '2026-10-03', true) on conflict do nothing`, [tester]);
await db.query(`insert into public.season_grants (profile_id, season, door, track, xp) values ($1, 'halloween', 1, 'free', 1), ($1, 'halloween', 7, 'streak', 1) on conflict do nothing`, [tester]); // (the backup's item list predates the Halloween items: level-step rewards)
await db.query(`insert into public.season_days (season, day, tasks) values ('halloween', '2026-10-03', '[]') on conflict do nothing`);

// the switch-over itself, exactly the file that runs live
const script = readFileSync(new URL('../../supabase/ops/mainnet_reset.sql', import.meta.url), 'utf8');
await db.pg.exec(script);
for (const t of ['season_passes', 'season_grants', 'season_progress', 'season_days'])
  assert.equal((await db.query(`select count(*)::int n from public.${t}`))[0].n, 0, `${t}: test season records cleared (a test pass would keep granting on mainnet)`);
await db.query(`select public.season_grant($1, 'halloween')`, [tester]);
assert.equal((await db.query('select count(*)::int n from public.inventory where profile_id = $1', [tester]))[0].n, 0, 'nothing is re-granted after the switch-over (no pass, no doors)');

// nothing left to PAY, by the real code (each would call the chain stand-in if it found anything)
const paid = []; const chain = { async sign(w) { paid.push(w); return { signature: 'x'.repeat(88), tx: 't', blockhash: 'b' }; }, async send() {}, async status() { return 'landed'; } };
assert.deepEqual(await runPayouts({ db, chain }), { sent: 0, pending: 0, resigned: 0, failed: 0 }, 'the payout worker finds nothing to send');
for (const table of ['lottery_payouts', 'reward_sweeps']) assert.equal((await runPayouts({ db, chain, table })).sent, 0, `nothing to send from ${table}`);
assert.equal(paid.length, 0, 'the chain was never asked to pay');
const lottery = createLottery({ db, chain: { latestBlock: async () => ({ blockhash: 'B'.repeat(43), slot: 1 }) }, livePrice: async () => ({ usd: 0.0003 }), liveFee: async () => ({ bps: 300, max: 1e15 }),
  wallet: 'LOTTERYwa11et', now: () => Date.parse('2027-01-01T00:00:00Z') }); // far in the future: every draw would be due
const drawn = await (lottery.runDraws ? lottery.runDraws() : lottery.draws().then(() => []));
assert.equal(await count('lottery_payouts'), 0, `the lottery runner finds no test tickets to pay (drew ${JSON.stringify(drawn)})`);
assert.deepEqual((await queueRewardClaims({ db, pools: { spin: 'A', slots: 'B', lottery: 'C' }, balances: async () => [], isSanta: () => true })), [], 'no reward claim waiting');
for (const p of await db.query('select game, santa_raw, treasury_net_raw, rules from public.pools')) { assert.equal(+p.santa_raw, 0, `${p.game} book is 0`); assert.equal(+p.treasury_net_raw, 0, `${p.game} treasury share is 0`); assert.deepEqual(p.rules, {}, `${p.game} has no rule overrides (jackpot % etc.)`); }

// kept
assert.equal(await count('profiles'), before.profiles, 'every account kept'); assert.equal(await count('logins'), before.logins, 'every login kept');
assert.equal(await count('items'), before.items, 'the item catalogue kept');
assert.equal((await db.query('select payout_mode from public.lottery_settings'))[0]?.payout_mode, before.settings, 'the lottery payout mode kept');
assert.equal(await count('tester_feedback'), before.feedback, 'tester feedback kept');
// a second run (e.g. retried at GO) is harmless
await db.pg.exec(script);
assert.equal(await count('profiles'), before.profiles);
console.log(`OK: mainnet switch-over rehearsed on the live data (${loaded} rows): ${before.payouts} test payouts and ${before.draws} lottery draws cleared, nothing for the worker, lottery or sweeper to pay, pool books 0, ${before.profiles} accounts / ${before.items} items / settings kept; safe to run twice`);
