// SEASONS on real Postgres (PGlite), every live file 001–031 in order, then the Pumpkin King items (as 032 makes them) and 033.
// Proves: the database's season plan is exactly seasons.js's; progress comes only from matches the match server ran (the real
// server/levels.js finishByReferee, never a page's report); a door opens only when all 3 of the day's tasks are met; every reward
// is granted exactly once (free looks, level steps, streak bonus, gold costume pieces); the $5 pass grants pieces for doors
// already opened (backdated); nobody but the servers can write any of it.
// Run: node seasons-db.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDb } from './setup.mjs';
import { createLevels } from '../../server/levels.js';
import { SEASONS, seasonAt, dayKey, tasksFor, freeReward, goldReward, seasonDays, PASS_PRICE } from '../../mockups/seasons.js';

const FILES = ['001_profiles.sql', '002_items_seed.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql', '006_ranked_tickets.sql', '007_rate_limits.sql',
  '008_hats_backpacks.sql', '009_lock_my_plays.sql', '010_levels.sql', '011_lottery.sql', '012_special_snowballs.sql', '013_match_stats.sql', '014_run_sizes.sql',
  '015_special_gear.sql', '016_shop.sql', '017_referee_role.sql', '018_ranked_results.sql', '019_ranked_board.sql', '020_worker_role.sql', '021_alerts.sql',
  '022_ticket_cap.sql', '023_item_prices.sql', '024_reward_claims.sql', '025_stocking.sql', '026_shared_pool.sql', '027_tester_feedback.sql', '028_look_rewards.sql',
  '029_costumes.sql', '030_daily_reset.sql']; // then 032 (the Pumpkin King) and 033 below
const db = await makeDb(FILES);
await db.pg.exec(readFileSync(new URL('../../supabase/032_halloween_costume.sql', import.meta.url), 'utf8')); // the Pumpkin King pieces
const sql033 = readFileSync(new URL('../../supabase/033_seasons.sql', import.meta.url), 'utf8');
await db.pg.exec(sql033);
await db.pg.exec(sql033); // safe to apply twice
// the Thanksgiving items (035: the free looks and the Gobbler), so every season item in catalog.js is in the database
await db.pg.exec(readFileSync(new URL('../../supabase/035_thanksgiving.sql', import.meta.url), 'utf8'));
// the Christmas items (037: the free looks and the Gingerbread), the same way
await db.pg.exec(readFileSync(new URL('../../supabase/037_christmas.sql', import.meta.url), 'utf8'));
// Thanksgiving's door rewards (036), twice: safe to run twice
for (let k = 0; k < 2; k++) await db.pg.exec(readFileSync(new URL('../../supabase/036_thanksgiving_rewards.sql', import.meta.url), 'utf8'));

const S = seasonAt(); assert.ok(S && S.id === 'halloween', 'the test runs during Halloween (Oct 1–31 2026): ' + S?.id);
const DAY = dayKey(), DAYS = seasonDays(S);

// 1. the database plan is seasons.js's plan
for (const s of SEASONS) {
  const r = (await db.query('select extract(epoch from starts) * 1000 as a, extract(epoch from ends) * 1000 as b, pass_usd from public.seasons where id = $1', [s.id]))[0];
  assert.deepEqual([+r.a, +r.b, +r.pass_usd], [s.start, s.end, PASS_PRICE], `${s.id}: same dates and pass price as seasons.js`);
}
// every season with rewards in seasons.js (Halloween: 033, Thanksgiving: 036): each door, both tracks, exactly as seasons.js says
const plan = await db.query(`select door, track, item_id, xp from public.season_rewards where season = 'halloween' order by door, track`);
for (const SS of SEASONS.filter((x) => x.gold.length || Object.keys(x.free).length)) {
  const pl = await db.query('select door, track, item_id, xp from public.season_rewards where season = $1 order by door, track', [SS.id]), N = seasonDays(SS).length;
  assert.equal(pl.filter((p) => p.track === 'free').length, N, `${SS.id}: one free reward per door (${N} doors)`);
  for (let d = 1; d <= N; d++) {
    const f = pl.find((p) => p.door === d && p.track === 'free'), g = pl.find((p) => p.door === d && p.track === 'gold');
    assert.deepEqual(f && (f.item_id ? { kind: 'item', item: f.item_id } : { kind: 'xp', n: f.xp }), freeReward(SS, d), `${SS.id} door ${d} free reward matches seasons.js`);
    assert.deepEqual(g ? { kind: 'item', item: g.item_id } : null, goldReward(SS, d), `${SS.id} door ${d} gold reward matches seasons.js`);
  }
}
{ const { ITEMS } = await import('../../mockups/catalog.js');
  for (const it of ITEMS.filter((i) => i.season)) {
    const r = (await db.query('select slot, name, unlock_level, price_usd, season from public.items where id = $1', [it.id]))[0];
    assert.deepEqual(r && [r.slot, r.name, r.unlock_level, r.price_usd, r.season], [it.slot, it.name, null, null, it.season], `catalog season item ${it.id} is in the database as a season reward`);
  }
  for (const r of plan.filter((p) => p.item_id)) assert.ok(ITEMS.some((i) => i.id === r.item_id && i.season === 'halloween'), `reward ${r.item_id} is a Halloween item in catalog.js`); }
assert.equal((await db.query(`select public.season_day(now())::text as d`))[0].d, DAY, 'the database and the page name the game day the same (9 PM Indiana)');

// players
let wn = 0; const W = () => ('SNwa11et' + 'ABCDEFGHJK'[wn++]).padEnd(44, '1');
const mk = async (name) => { const id = (await db.query('insert into auth.users default values returning id'))[0].id;
  await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, $2, $3, '{}')`, [id, W(), name]); return id; };
const ava = await mk('Ava'), ben = await mk('Ben'), cid = await mk('Cid');
const levels = createLevels({ db });
const tasks = tasksFor(DAY);
const need = Object.fromEntries(tasks.map((t) => [t.stat, t.need]));
let mid = 0; const match = (places, stats) => ({ id: 'season-test-match-' + (++mid), auto: true, places, stats });
const prog = async (p) => (await db.query(`select stats, door from public.season_progress where profile_id = $1 and season = 'halloween' and day = $2::date`, [p, DAY]))[0];
const inv = async (p) => (await db.query('select item_id from public.inventory where profile_id = $1 order by item_id', [p])).map((r) => r.item_id);
const grants = async (p) => (await db.query(`select door, track, item_id, xp from public.season_grants where profile_id = $1 and season = 'halloween' order by door, track`, [p]));

// 2. a PAGE's report of a finish never moves season progress; the match server's does
const half = Object.fromEntries(Object.entries(need).filter(([k]) => k !== 'games' && k !== 'top3').map(([k, n]) => [k, Math.ceil(n / 2)]));
await levels.finish(ava, match([ava, ben], [half, half]));
assert.equal(await prog(ava), undefined, 'a page-reported finish: no season progress');
await levels.finishByReferee(match([ava, ben, null], [half, half, null]));
const p1 = await prog(ava);
assert.ok(p1 && p1.stats.games === 1 && !p1.door, `after one server match: counted, door still shut ${JSON.stringify(p1)}`);
assert.equal((await db.query(`select count(*)::int n from public.season_days where season = 'halloween' and day = $1::date`, [DAY]))[0].n, 1, "the day's tasks are stored once");

// 3. finishing every task opens the door and grants door 1 (free: one level step) exactly once
const full = Object.fromEntries(Object.entries(need).filter(([k]) => k !== 'games' && k !== 'top3').map(([k, n]) => [k, n]));
const lvl0 = (await db.query('select level, xp from public.profiles where id = $1', [ava]))[0];
await levels.finishByReferee(match([ava, ben], [full, {}]));
await levels.finishByReferee(match([ava, ben], [full, {}])); // another match after the door: nothing granted twice
const p2 = await prog(ava);
assert.ok(p2.door, `all tasks met → the door is open ${JSON.stringify(p2.stats)} need ${JSON.stringify(need)}`);
const g1 = await grants(ava);
assert.deepEqual(g1.map((g) => [g.door, g.track]), [[1, 'free']], 'door 1, free track, granted once');
const lvl1 = (await db.query('select level, xp from public.profiles where id = $1', [ava]))[0];
assert.ok(lvl1.level * 100 + lvl1.xp > lvl0.level * 100 + lvl0.xp, `door 1 gave a step of level progress (${JSON.stringify(lvl0)} → ${JSON.stringify(lvl1)})`);
assert.ok(!(await prog(ben))?.door, 'Ben (did nothing) has no door');

// counts are capped and unknown counts ignored; bad task lists refused
await assert.rejects(() => db.query(`select public.season_record($1, 'halloween', $2::date, '[]', '{}')`, [cid, DAY]), /bad tasks/);
await assert.rejects(() => db.query(`select public.season_record($1, 'halloween', '2026-10-01', $2, '{}')`, [cid, JSON.stringify(tasks)]), /not today/, "only today's game day");
await db.query(`select public.season_record($1, 'halloween', $2::date, $3, '{"hits": 99999, "money": 5}')`, [cid, DAY, JSON.stringify(tasks)]);
const pc = await prog(cid);
assert.ok((pc.stats.hits || 0) <= 500 && !('money' in pc.stats), `counts capped at 500 per match, unknown keys ignored ${JSON.stringify(pc.stats)}`);

// 4. earlier doors (as if opened on earlier days) + the PASS: free looks, gold pieces every 3 doors, the streak bonus, once each
const past = DAYS.slice(0, DAYS.indexOf(DAY)).slice(-8); // up to 8 days before today, in a row
for (const d of past) await db.query(`insert into public.season_progress (profile_id, season, day, door) values ($1, 'halloween', $2::date, true) on conflict (profile_id, season, day) do update set door = true`, [ava, d]);
const doors = past.length + 1;
await db.query(`select public.season_grant($1, 'halloween')`, [ava]);
const freeOnly = await grants(ava);
assert.ok(freeOnly.every((g) => g.track !== 'gold') && freeOnly.filter((g) => g.track === 'free').length === doors, `without the pass: ${doors} free doors, no gold`);
if (doors >= 2) assert.ok((await inv(ava)).includes('snow_candycorn'), 'door 2 gave the Candy Corn snowballs');
if (doors >= 7) assert.ok(freeOnly.some((g) => g.track === 'streak' && g.door === 7), '7 days in a row: the streak bonus');
// the pass, bought through the shop's own path (shop_buy → shop_grant kind 'pass'): backdated pieces for doors already opened
const q = (await db.query(`insert into public.shop_quotes (profile_id, kind, usd, santa_raw, price_usd, season) values ($1, 'pass', 5, 1000, 0.0003, 'halloween') returning id`, [ava]))[0].id;
const bought = (await db.query(`select public.shop_buy($1, $2, 1000, 'SNwa11etA') as r`, [q, 'PassSig'.padEnd(88, '5')]))[0].r;
assert.equal(bought.pass, 'halloween', 'the pass is granted by the shop path: ' + JSON.stringify(bought));
const gold = (await grants(ava)).filter((g) => g.track === 'gold');
assert.deepEqual(gold.map((g) => g.item_id), S.gold.slice(0, Math.floor(doors / 3)), `backdated: ${Math.floor(doors / 3)} piece(s) for ${doors} doors, in order`);
for (const g of gold) assert.ok((await inv(ava)).includes(g.item_id), `${g.item_id} is in the inventory`);
await db.query(`select public.season_grant($1, 'halloween')`, [ava]); await db.query(`select public.season_grant($1, 'halloween')`, [ava]);
assert.equal((await grants(ava)).length, freeOnly.length + gold.length, 'granting again gives nothing twice');
const q2 = (await db.query(`insert into public.shop_quotes (profile_id, kind, usd, santa_raw, price_usd, season) values ($1, 'pass', 5, 1000, 0.0003, 'halloween') returning id`, [ava]))[0].id;
const again = (await db.query(`select public.shop_buy($1, $2, 1000, 'SNwa11etA') as r`, [q2, 'PassSigTwo'.padEnd(88, '5')]))[0].r;
assert.ok(again.refunded, 'a second pass for the same season can never be granted: the payment is owed back in full');

// 4b. a FULL season, not just today's few days: 20 doors in a row (rows written directly; season_grant only counts open doors).
// Every free look, every level step, both streak bonuses (7, 14), and with the pass the whole Pumpkin King outfit, once each.
const iso = (t) => new Date(t).toISOString().slice(0, 10), dayMs = 86_400_000, today = Date.parse(DAY + 'T12:00:00Z');
const dee = await mk('Dee'), eli = await mk('Eli');
for (let i = 0; i < 20; i++) await db.query(`insert into public.season_progress (profile_id, season, day, door) values ($1, 'halloween', $2::date, true)`, [dee, iso(today - (19 - i) * dayMs)]);
await db.query(`insert into public.season_passes (profile_id, season, signature, usd, paid_raw) values ($1, 'halloween', $2, 5, 1000)`, [dee, 'DeePass'.padEnd(88, '7')]);
await db.query(`select public.season_grant($1, 'halloween')`, [dee]); await db.query(`select public.season_grant($1, 'halloween')`, [dee]);
const gd = await grants(dee), invD = await inv(dee);
assert.equal(gd.filter((g) => g.track === 'free').length, 20, '20 doors → 20 free rewards');
for (const it of Object.values(S.free)) assert.ok(invD.includes(it), `free look ${it} owned`);
assert.deepEqual(gd.filter((g) => g.track === 'gold').map((g) => g.item_id), S.gold, 'the pass: the whole Pumpkin King outfit, in order, one piece every 3 doors');
for (const it of S.gold) assert.ok(invD.includes(it), `${it} owned`);
assert.deepEqual(gd.filter((g) => g.track === 'streak').map((g) => g.door), [7, 14], '20 days in a row: streak bonuses at 7 and 14, once each');
const xpSteps = (await db.query(`select count(*)::int n from public.level_finishes where profile_id = $1 and match_id like 'season:%'`, [dee]))[0].n;
assert.equal(xpSteps, 20 - Object.keys(S.free).length + 2, 'one level step per non-look door + one per streak bonus, recorded once each');
// a gap breaks the streak: 6 days, a missed day, 6 days → no bonus
for (const back of [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12]) await db.query(`insert into public.season_progress (profile_id, season, day, door) values ($1, 'halloween', $2::date, true)`, [eli, iso(today - back * dayMs)]);
await db.query(`select public.season_grant($1, 'halloween')`, [eli]);
assert.equal((await grants(eli)).filter((g) => g.track === 'streak').length, 0, 'a missed day resets the streak (6 + 6 days: no bonus)');

// 5. nobody but the servers writes any of it
await db.query('set role authenticated'); await db.query(`select set_config('test.uid', $1, false)`, [ben]);
for (const [what, q3] of [['progress', `insert into public.season_progress (profile_id, season, day, door) values ('${ben}', 'halloween', '${DAY}', true)`],
  ['a pass', `insert into public.season_passes (profile_id, season) values ('${ben}', 'halloween')`],
  ['a grant', `insert into public.season_grants (profile_id, season, door, track, item_id) values ('${ben}', 'halloween', 3, 'gold', 'face_pumpkinking')`],
  ['season_record', `select public.season_record('${ben}', 'halloween', '${DAY}', '${JSON.stringify(tasks)}', '{"hits": 50}')`],
  ['season_grant', `select public.season_grant('${ben}', 'halloween')`]])
  await assert.rejects(() => db.query(q3), /permission denied|row-level security/, `a signed-in player can't write ${what}`);
assert.equal((await db.query(`select count(*)::int n from public.season_progress where profile_id = $1`, [ava])).length, 1);
assert.equal((await db.query(`select count(*)::int n from public.season_grants where profile_id = $1`, [ava]))[0].n, 0, 'and can only read their own grants');
await db.query('reset role');
await db.query('set role santa_referee');
await db.query(`select public.season_record($1, 'halloween', $2::date, $3, '{"hits": 1}')`, [ben, DAY, JSON.stringify(tasks)]);
await assert.rejects(() => db.query(`select public.season_grant($1, 'halloween')`, [ben]), /permission denied/, 'the match server can record progress, never grant directly');
await db.query('reset role');
console.log(`OK: seasons on real Postgres (001–031 + 033 + Thanksgiving 035/036 + Christmas items 037): the plan equals seasons.js (dates, price, every door's rewards); progress only from the match server's own matches; a door opens when all 3 tasks are met; today: ${doors} doors and ${gold.length} gold piece(s) backdated by the pass; a full 20-door season: every free look, the whole Pumpkin King outfit, streak bonuses at 7 and 14 (a missed day resets it), each granted once; a second pass is owed back; players and the match server can't write or grant anything themselves`);
