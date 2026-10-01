// Hats and Backpacks in the database (supabase/008_hats_backpacks.sql) with the real 001–004 SQL and the item seed:
// a saved avatar can wear a hat and a backpack it has unlocked; locked or wrong-slot items are refused; a page that doesn't
// send the new slots yet (the live one until republished) still saves, with "none"; bought items save (they're Store items for now, Cody).
import assert from 'node:assert/strict';
import { makeDb } from './setup.mjs';

const db = await makeDb(['001_profiles.sql', '002_items_seed.sql', '003_email_profiles.sql', '004_linked_logins.sql', '008_hats_backpacks.sql']);
const uid = (await db.query('insert into auth.users default values returning id'))[0].id;
await db.query(`insert into public.profiles (id, wallet, name, avatar, level) values ($1, $2, 'Jo', '{}', 2)`, [uid, 'JQwa11et'.padEnd(44, '1')]);
await db.query(`insert into public.logins (user_id, profile_id, kind) values ($1, $1, 'wallet')`, [uid]);
await db.query(`select set_config('test.uid', $1, false)`, [uid]);
const base = { shirt: 'shirt_red', pants: 'pants_navy', face: 'face_dots', skin: 'skin_2', snow: 'snow_white' };
const save = (a) => db.query('select avatar from public.save_profile($1, $2)', ['Jo', JSON.stringify(a)]).then((r) => r[0].avatar, (e) => ({ refused: e.message }));

assert.deepEqual(await save(base), { ...base, hat: 'hat_none', pack: 'pack_none' }, 'old page (no hat/backpack sent): saved with "none"');
assert.match((await save({ ...base, hat: 'hat_earmuffs' })).refused, /isn't unlocked for hat/, 'a Store hat needs buying first');
assert.match((await save({ ...base, pack: 'pack_gift' })).refused, /isn't unlocked for pack/, 'a Store backpack needs buying first');
assert.match((await save({ ...base, hat: 'pack_sack' })).refused, /isn't unlocked for hat/, 'a backpack can\'t be worn as a hat');
assert.match((await save({ ...base, snow: 'snow_iceball' })).refused, /isn't unlocked for snow/, 'the Ice Ball needs buying first');
for (const it of ['hat_antlers', 'pack_gift', 'snow_iceball']) await db.query('insert into public.inventory (profile_id, item_id) values ($1, $2)', [uid, it]);
assert.deepEqual(await save({ ...base, hat: 'hat_antlers', pack: 'pack_gift', snow: 'snow_iceball' }), { ...base, hat: 'hat_antlers', pack: 'pack_gift', snow: 'snow_iceball' }, 'bought ones save');
console.log('OK: hats and backpacks in the database: unlocked ones save, locked or wrong-slot refused, old pages still save, bought items save');
