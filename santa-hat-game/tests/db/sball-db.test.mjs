// Special snowball slots in the database (supabase/012_special_snowballs.sql) on the live files in order, with Supabase's grants:
// a loadout saves (never silently dropped), only owned specials go in, the same special can't fill two slots, an old page still
// saves (empty slots), and the colour-slot Ice Ball prototype's owner becomes an Ice Ball special owner. Run: node sball-db.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDb } from './setup.mjs';

const db = await makeDb(['001_profiles.sql', '002_items_seed.sql', '003_email_profiles.sql', '004_linked_logins.sql', '008_hats_backpacks.sql', '010_levels.sql']);
const uid = (await db.query('insert into auth.users default values returning id'))[0].id;
await db.query(`insert into public.profiles (id, wallet, name, avatar, level) values ($1, $2, 'Jo', $3, 4)`, [uid, 'JQwa11etA'.padEnd(44, '1'), JSON.stringify({ snow: 'snow_iceball' })]);
await db.query(`insert into public.logins (user_id, profile_id, kind) values ($1, $1, 'wallet')`, [uid]);
await db.query(`insert into public.inventory (profile_id, item_id) values ($1, 'snow_iceball')`, [uid]); // owned the prototype before 012
await db.pg.exec(readFileSync(new URL('../../supabase/012_special_snowballs.sql', import.meta.url), 'utf8'));
const owned = (await db.query('select item_id from public.inventory where profile_id = $1 order by item_id', [uid])).map((r) => r.item_id);
assert.deepEqual(owned, ['sb_ice'], 'the prototype\'s owner now owns the Ice Ball special');
assert.equal((await db.query(`select avatar->>'snow' s from public.profiles where id = $1`, [uid]))[0].s, 'snow_white', 'wearer moved to white');
assert.equal((await db.query(`select count(*)::int n from public.items where id = 'snow_iceball'`))[0].n, 0, 'the prototype item is gone');

await db.query(`select set_config('test.uid', $1, false)`, [uid]);
const base = { shirt: 'shirt_red', pants: 'pants_navy', face: 'face_dots', skin: 'skin_2', snow: 'snow_white' };
const save = (a) => db.query('select avatar from public.save_profile($1, $2)', ['Jo', JSON.stringify(a)]).then((r) => r[0].avatar, (e) => ({ refused: e.message }));
assert.deepEqual(await save(base), { ...base, hat: 'hat_none', pack: 'pack_none', sb1: 'sb_none', sb2: 'sb_none', sb3: 'sb_none' }, 'an old page (no slots sent): empty slots, not refused');
assert.equal((await save({ ...base, sb1: 'sb_ice' })).sb1, 'sb_ice', 'an owned special saves (not dropped)');
assert.match((await save({ ...base, sb1: 'sb_fire' })).refused, /isn't unlocked/, 'a special not owned is refused');
assert.match((await save({ ...base, sb1: 'shirt_red' })).refused, /isn't unlocked/, 'a shirt can\'t go in a snowball slot');
await db.query(`insert into public.inventory (profile_id, item_id) values ($1, 'sb_sky')`, [uid]);
assert.deepEqual(await save({ ...base, sb1: 'sb_ice', sb2: 'sb_sky', sb3: 'sb_none' }).then((a) => [a.sb1, a.sb2, a.sb3]), ['sb_ice', 'sb_sky', 'sb_none'], 'two specials in two slots');
assert.match((await save({ ...base, sb1: 'sb_ice', sb2: 'sb_ice' })).refused, /two slots/, 'the same special can\'t fill two slots');
assert.equal((await save({ ...base, sb1: 'sb_none', sb2: 'sb_none' })).sb2, 'sb_none', 'empty slots can repeat');
await db.query('set role anon');
await assert.rejects(() => db.query('select public.save_profile($1, $2)', ['x', '{}']), undefined, 'a signed-out visitor can\'t save anything');
await db.query('reset role');
console.log('OK: special snowball slots in the database: loadouts save (never dropped), only owned specials, no duplicates, old pages still save, the prototype Ice Ball owner became an Ice Ball special owner');
process.exit(0);
