// Special gear in the database (supabase/015_special_gear.sql) on the live files in order, with Supabase's grants: the items
// match catalog.js; backpack owners also get the gear (nothing taken away, nobody moved); gear saves (never silently dropped),
// only owned gear, no gear in two slots, the 2nd slot from level 8, Santa Costume from level 3; the 7-day wear clock starts
// once and only the server writes it; worn-out gear comes off on save and from every saved avatar; players can't touch any of
// it. Run: node gear-db.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDb } from './setup.mjs';
import { ITEMS } from '../../mockups/catalog.js';

const db = await makeDb(['001_profiles.sql', '002_items_seed.sql', '003_email_profiles.sql', '004_linked_logins.sql', '008_hats_backpacks.sql', '010_levels.sql', '012_special_snowballs.sql']);
const mk = async (name, wallet) => { const id = (await db.query('insert into auth.users default values returning id'))[0].id;
  await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, $2, $3, $4)`, [id, wallet.padEnd(44, '1'), name, JSON.stringify({ pack: 'pack_sack' })]);
  await db.query(`insert into public.logins (user_id, profile_id, kind) values ($1, $1, 'wallet')`, [id]); return id; };
const uid = await mk('Jo', 'JQwa11etA'), other = await mk('Al', 'AQwa11etB');
for (const it of ['pack_sack', 'pack_gift']) await db.query('insert into public.inventory (profile_id, item_id) values ($1, $2)', [uid, it]); // bought before 015
await db.pg.exec(readFileSync(new URL('../../supabase/015_special_gear.sql', import.meta.url), 'utf8'));

// 1. The item rows are catalog.js's, exactly.
const rows = await db.query(`select id, name, unlock_level, price_usd::float8 as price from public.items where slot = 'gear' order by id`);
assert.deepEqual(rows, ITEMS.filter((i) => i.slot === 'gear').map((i) => ({ id: i.id, name: i.name, unlock_level: i.level ?? null, price: i.price ?? null })).sort((a, b) => (a.id < b.id ? -1 : 1)), 'gear items match catalog.js');
// 2. The migration: backpack owners also own the gear; the backpacks stay owned and worn; nobody is put in a gear slot.
const owned = async (p) => (await db.query('select item_id from public.inventory where profile_id = $1 order by item_id', [p])).map((r) => r.item_id);
assert.deepEqual(await owned(uid), ['gear_gift', 'gear_sack', 'pack_gift', 'pack_sack'], 'Toy Sack → +Toy Sack gear, Gift Box → +Gift Box gear, backpacks kept');
assert.deepEqual(await owned(other), [], 'someone who owned none gets none');
const av = async (p = uid) => (await db.query('select avatar from public.profiles where id = $1', [p]))[0].avatar;
assert.deepEqual(await av(), { pack: 'pack_sack' }, 'the worn backpack is untouched; no gear put on (its clock would start)');
assert.equal((await db.query(`select count(*)::int n from public.items where id like 'pack_%'`))[0].n, 4, 'no backpack item deleted');

// 3. Saving.
await db.query(`select set_config('test.uid', $1, false)`, [uid]);
const base = { shirt: 'shirt_red', pants: 'pants_navy', face: 'face_dots', skin: 'skin_2', snow: 'snow_white' };
const save = (a, name = 'Jo') => db.query('select name, avatar from public.save_profile($1, $2)', [name, JSON.stringify(a)]).then((r) => ({ ...r[0].avatar, _name: r[0].name }), (e) => ({ refused: e.message }));
const g = (a) => [a.g1, a.g2];
assert.deepEqual(g(await save(base)), ['gear_none', 'gear_none'], 'an old page (no gear sent): empty slots, not refused');
assert.equal((await save({ ...base, g1: 'gear_sack' })).g1, 'gear_sack', 'owned gear saves (not dropped)');
assert.match((await save({ ...base, g1: 'gear_pumpkin' })).refused, /isn't unlocked/, 'gear not owned is refused');
assert.match((await save({ ...base, g1: 'pack_sack' })).refused, /isn't unlocked/, 'a backpack isn\'t gear');
assert.match((await save({ ...base, g1: 'sb_ice' })).refused, /isn't unlocked/, 'a special snowball isn\'t gear');
assert.match((await save({ ...base, g1: 'gear_nope' })).refused, /isn't unlocked/, 'unknown gear is refused');
assert.match((await save({ ...base, g1: 'gear_sack', g2: 'gear_gift' })).refused, /level 8/, 'the 2nd slot is closed below level 8');
assert.deepEqual(g(await save({ ...base, g1: 'gear_none', g2: 'gear_none' })), ['gear_none', 'gear_none'], 'empty slots can repeat');
await db.query('update public.profiles set level = 8 where id = $1', [uid]);
assert.deepEqual(g(await save({ ...base, g1: 'gear_sack', g2: 'gear_gift' })), ['gear_sack', 'gear_gift'], 'level 8: two gear');
assert.match((await save({ ...base, g1: 'gear_sack', g2: 'gear_sack' })).refused, /two slots/, 'the same gear can\'t fill two slots');
// NO STACKING (Cody, 2026-10-01: "Can't stack same stat"): two gear with the same stat are refused; different stats save
await db.query(`insert into public.inventory (profile_id, item_id) values ($1, 'gear_backpack'), ($1, 'gear_shoes') on conflict do nothing`, [uid]);
assert.match((await save({ ...base, g1: 'gear_sack', g2: 'gear_backpack' })).refused, /same stat/, 'Toy Sack (Santa Bag) + Backpack: both "held", refused');
assert.deepEqual(g(await save({ ...base, g1: 'gear_sack', g2: 'gear_shoes' })), ['gear_sack', 'gear_shoes'], 'Toy Sack + Elf Shoes (held + speed) save');
{ const { GEAR } = await import('../../mockups/gear.js');
  for (const it of ITEMS.filter((i) => i.slot === 'gear')) {
    const sql = (await db.query('select public.gear_stat($1) as s', [it.id]))[0].s;
    assert.equal(sql, it.gear ? GEAR[it.gear].stat ?? null : null, `${it.id}: the database's stat matches gear.js`); } }
await db.query(`insert into public.inventory (profile_id, item_id) values ($1, 'gear_santa')`, [uid]);
await db.query('update public.profiles set level = 2 where id = $1', [uid]);
assert.match((await save({ ...base, g1: 'gear_santa' })).refused, /level 3/, 'Santa Costume below level 3 is refused');
await db.query('update public.profiles set level = 3 where id = $1', [uid]);
assert.equal((await save({ ...base, g1: 'gear_santa' })).g1, 'gear_santa', 'level 3: Santa Costume saves');
await db.query('update public.profiles set level = 8 where id = $1', [uid]);

// 4. The wear clock: starts once, only for owned gear items, never moves.
const rec = (items, p = uid) => db.query('select public.record_gear_worn($1, $2) n', [p, items]).then((r) => r[0].n);
assert.equal(await rec(['gear_sack', 'gear_pumpkin', 'gear_none', 'shirt_red']), 1, 'only the owned gear item starts a clock');
const clock = async (it) => (await db.query('select first_worn_at t from public.gear_wear where profile_id = $1 and item_id = $2', [uid, it]))[0]?.t;
const t0 = await clock('gear_sack'); assert.ok(t0);
assert.equal(await rec(['gear_sack']), 0, 'worn again: nothing new'); assert.equal(+(await clock('gear_sack')), +t0, 'the clock never restarts');
const worn = (it) => db.query('select public.gear_worn_out($1, $2) w', [uid, it]).then((r) => r[0].w);
const age = (it, iv) => db.query(`update public.gear_wear set first_worn_at = now() - $3::interval where profile_id = $1 and item_id = $2`, [uid, it, iv]);
assert.equal(await worn('gear_sack'), false, 'just started: fine'); assert.equal(await worn('gear_gift'), false, 'never worn: fine');
await age('gear_sack', '6 days 23 hours'); assert.equal(await worn('gear_sack'), false, '6 days 23 hours: still fine');
await age('gear_sack', '7 days 1 minute'); assert.equal(await worn('gear_sack'), true, 'past 7 days: worn out');

// 5. Worn-out gear: comes off on save (the rest of the save still goes through) and from every saved avatar.
const s = await save({ ...base, shirt: 'shirt_blue', g1: 'gear_sack', g2: 'gear_gift' }, 'Joanna');
assert.deepEqual([s.g1, s.g2, s.shirt, s._name], ['gear_none', 'gear_gift', 'shirt_blue', 'Joanna'], 'worn-out gear saves as empty; everything else saves');
await db.query(`update public.profiles set avatar = avatar || '{"g1": "gear_sack"}' where id = $1`, [uid]); // saved before it wore out
assert.equal((await db.query('select public.take_off_worn_gear() n'))[0].n, 1, 'one avatar changed');
assert.deepEqual(g(await av()), ['gear_none', 'gear_gift'], 'the worn-out gear came off, the other stayed');
assert.equal((await db.query('select public.take_off_worn_gear() n'))[0].n, 0, 'run again: nothing');

// 6. Grants: players read only their own clock and write nothing; nobody but the server runs the clock functions.
await db.query(`insert into public.inventory (profile_id, item_id) values ($1, 'gear_shoes')`, [other]); await rec(['gear_shoes'], other);
await db.query('set role authenticated');
assert.deepEqual((await db.query('select item_id from public.gear_wear order by item_id')).map((r) => r.item_id), ['gear_sack'], 'a player sees only their own clock');
for (const q of [`insert into public.gear_wear (profile_id, item_id) values ('${uid}', 'gear_gift')`, `update public.gear_wear set first_worn_at = now()`, `delete from public.gear_wear`,
  `select public.record_gear_worn('${uid}', array['gear_gift'])`, `select public.gear_worn_out('${uid}', 'gear_sack')`, `select public.take_off_worn_gear()`])
  await assert.rejects(() => db.query(q), /permission denied/, 'a signed-in player can\'t: ' + q);
await db.query('reset role'); await db.query('set role anon');
for (const q of ['select * from public.gear_wear', `select public.record_gear_worn('${uid}', array['gear_gift'])`, `select public.save_profile('x', '{}')`])
  await assert.rejects(() => db.query(q), /permission denied/, 'a signed-out visitor can\'t: ' + q);
await db.query('reset role');
assert.equal(+(await clock('gear_sack')) < Date.now() - 7 * 864e5, true, 'and the clock wasn\'t reset by any of that');
console.log('OK: special gear in the database: items match catalog.js; backpack owners also got the gear (nothing deleted, nobody moved); gear saves (never dropped), only owned, no duplicates, 2nd slot from level 8, Santa Costume from level 3; the 7-day clock starts once, owned gear only; worn out after 7 days comes off on save and from saved avatars; players read only their own clock and can\'t write it or run its functions; visitors get nothing');
process.exit(0);
