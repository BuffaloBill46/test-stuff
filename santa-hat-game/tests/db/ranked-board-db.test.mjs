// The Ranks page's Today / This week boards (supabase/019_ranked_board.sql) on real Postgres (PGlite), all live files in order:
// points GAINED in the window, most first; older results left out; never more than 8 days back; anyone may read it (guests
// too), and it shows names, wallets, level, points and match counts only. Run: node ranked-board-db.test.mjs
import assert from 'node:assert/strict';
import { makeDb } from './setup.mjs';
const ALL = ['001_profiles.sql', '002_items_seed.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql', '006_ranked_tickets.sql', '007_rate_limits.sql',
  '008_hats_backpacks.sql', '009_lock_my_plays.sql', '010_levels.sql', '011_lottery.sql', '012_special_snowballs.sql', '013_match_stats.sql', '014_run_sizes.sql',
  '015_special_gear.sql', '016_shop.sql', '017_referee_role.sql', '018_ranked_results.sql', '019_ranked_board.sql', '030_daily_reset.sql'];
const db = await makeDb(ALL);
let wn = 0; const W = () => ('BDwa11et' + 'ABCDEFGH'[wn++]).padEnd(44, '1');
const mk = async (name) => { const id = (await db.query('insert into auth.users default values returning id'))[0].id; await db.query('insert into public.profiles (id, wallet, name, avatar) values ($1, $2, $3, $4)', [id, W(), name, '{}']); return id; };
const ann = await mk('Ann'), ben = await mk('Ben'), cat = await mk('Cat');
const res = (m, pid, change, ago) => db.query(`insert into public.ranked_results (match_id, profile_id, change, at) values ($1, $2, $3, now() - $4::interval)`, [m, pid, change, ago]);
await res('m1', ann, 24, '1 hour'); await res('m1', ben, 8, '1 hour'); await res('m2', ann, -5, '2 hours'); await res('m2', ben, 30, '2 hours');
await res('m3', cat, 40, '3 days'); await res('m4', ann, 99, '20 days');
const board = async (sinceSql) => db.query(`select * from public.ranked_board(${sinceSql})`);
let today = await board(`now() - interval '1 day'`);
assert.deepEqual(today.map((r) => [r.name, r.points, r.matches]), [['Ben', 38, 2], ['Ann', 19, 2]], 'today: points gained, most first');
assert.deepEqual(Object.keys(today[0]).sort(), ['level', 'matches', 'name', 'points', 'wallet'], 'only public fields');
const week = await board(`now() - interval '7 days'`);
assert.deepEqual(week.map((r) => [r.name, r.points]), [['Cat', 40], ['Ben', 38], ['Ann', 19]], 'this week adds Cat (3 days ago)');
const far = await board(`now() - interval '60 days'`);
assert.ok(!far.some((r) => r.points === 118), 'never more than 8 days back (Ann\'s 20-day-old +99 left out)');
for (const role of ['anon', 'authenticated']) { await db.query('set role ' + role); assert.equal((await board(`now() - interval '1 day'`)).length, 2, role + ' can read it'); await db.query('reset role'); }
console.log('OK: ranked boards (019): today / this week by points gained, older results out, at most 8 days back, public, public fields only');
