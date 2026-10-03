// The referee server's own database login (supabase/017_referee_role.sql) on real Postgres (PGlite), every live file 001–017
// in order: as santa_referee it can find a sign-in's profile (saved level + look) and record an Auto match through the real
// levels code (server/levels.js finishByReferee), and it is refused everything else: logins, wallets, money tables, writing
// profiles, the shop. Run: node referee-role-db.test.mjs
import assert from 'node:assert/strict';
import { makeDb } from './setup.mjs';
import { createLevels } from '../../server/levels.js';

const ALL = ['001_profiles.sql', '002_items_seed.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql', '006_ranked_tickets.sql', '007_rate_limits.sql',
  '008_hats_backpacks.sql', '009_lock_my_plays.sql', '010_levels.sql', '011_lottery.sql', '012_special_snowballs.sql', '013_match_stats.sql', '014_run_sizes.sql',
  '015_special_gear.sql', '016_shop.sql', '017_referee_role.sql', '030_daily_reset.sql'];
const db = await makeDb(ALL);
let wn = 0; const W = () => ('RFwa11et' + 'ABCDEFGH'[wn++]).padEnd(44, '1');
const mk = async (name, level, avatar) => { const id = (await db.query('insert into auth.users default values returning id'))[0].id;
  await db.query('insert into public.profiles (id, wallet, name, avatar, level) values ($1, $2, $3, $4, $5)', [id, W(), name, JSON.stringify(avatar), level]);
  await db.query(`insert into public.logins (user_id, profile_id, kind) values ($1, $1, 'wallet')`, [id]); return id; };
const ann = await mk('Ann', 6, { shirt: 'shirt_red', sb1: 'sb_ice', g1: 'gear_pumpkin' }), ben = await mk('Ben', 1, {});

await db.query('set role santa_referee');
const who = (await db.query('select * from public.referee_profile($1)', [ann]))[0];
assert.deepEqual([who.id, who.level, who.avatar.sb1, who.name], [ann, 6, 'sb_ice', 'Ann'], 'a sign-in → its profile, saved level and look');
const r = await createLevels({ db }).finishByReferee({ id: 'server-match-0001', auto: true, places: [ben, null, ann, null] });
assert.deepEqual(r.counted.map((c) => c.place), [1, 3], 'it records an Auto match (Ben 1st, Ann 3rd) through the real levels code');
// refused: everything else
const no = async (q, p, why) => { await assert.rejects(() => db.query(q, p), /permission denied/, why); };
await no('select * from public.logins', [], 'no reading logins');
await no('select wallet from public.profiles', [], 'no reading wallets');
await no(`update public.profiles set level = 10 where id = $1`, [ben], 'no writing profiles');
await no('select * from public.payouts', [], 'no payouts');
await no('select * from public.item_purchases', [], 'no shop purchases');
await no(`select public.buy_level($1, 'x', 1, 2)`, [ben], 'no buying levels');
await no(`select public.save_profile('x', '{}')`, [], 'no saving looks');
await db.query('reset role');
assert.equal((await db.query('select level, xp from public.profiles where id = $1', [ben]))[0].xp, 1, 'the finish really landed');
// nobody else can use the referee's lookup
for (const role of ['anon', 'authenticated']) { await db.query('set role ' + role); await no('select * from public.referee_profile($1)', [ann], role + ' cannot look up sign-ins'); await db.query('reset role'); }
console.log("OK: referee login (017): looks up a sign-in's saved profile and records Auto match finishes; refused logins, wallets, profile writes, payouts, the shop, levels and looks; nobody else can use its lookup");
