// Hats and Backpacks in the database (supabase/008_hats_backpacks.sql) with the real 001–004 SQL and the item seed:
// a saved avatar can wear a hat and a backpack it has unlocked; locked or wrong-slot items are refused; a page that doesn't
// send the new slots yet (the live one until republished) still saves, with "none"; the Ice Ball unlocks by level.
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
assert.deepEqual(await save({ ...base, hat: 'hat_earmuffs', pack: 'pack_satchel' }), { ...base, hat: 'hat_earmuffs', pack: 'pack_satchel' }, 'level 2 items at level 2');
assert.match((await save({ ...base, hat: 'hat_antlers' })).refused, /isn't unlocked for hat/, 'level 4 antlers refused at level 2');
assert.match((await save({ ...base, pack: 'pack_gift' })).refused, /isn't unlocked for pack/, 'a Store backpack needs buying first');
assert.match((await save({ ...base, hat: 'pack_sack' })).refused, /isn't unlocked for hat/, 'a backpack can\'t be worn as a hat');
assert.match((await save({ ...base, snow: 'snow_iceball' })).refused, /isn't unlocked for snow/, 'Ice Ball is level 4');
await db.query(`insert into public.inventory (profile_id, item_id) values ($1, 'pack_gift')`, [uid]);
await db.query('update public.profiles set level = 4 where id = $1', [uid]);
assert.deepEqual(await save({ ...base, hat: 'hat_antlers', pack: 'pack_gift', snow: 'snow_iceball' }), { ...base, hat: 'hat_antlers', pack: 'pack_gift', snow: 'snow_iceball' }, 'bought + levelled up');
console.log('OK: hats and backpacks in the database: unlocked ones save, locked or wrong-slot refused, old pages still save, Ice Ball by level');
