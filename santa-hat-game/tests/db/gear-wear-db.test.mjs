// Special gear's 7-day wear clock, started by the server when an Auto match finishes (server/levels.js finish → 015's
// record_gear_worn and take_off_worn_gear), on PGlite with the live files in order and Supabase's grants. A finish starts each
// account's clock once (the gear items in the slots its level opens; a Gift Box runs its own clock); a second finish never
// restarts it; practice and private rooms start nothing; worn-out gear comes off saved avatars at the next finish; level counts
// are unchanged. Run: node gear-wear-db.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDb } from './setup.mjs';
import { createLevels } from '../../server/levels.js';

const db = await makeDb(['001_profiles.sql', '002_items_seed.sql', '003_email_profiles.sql', '004_linked_logins.sql', '008_hats_backpacks.sql', '010_levels.sql', '012_special_snowballs.sql', '013_match_stats.sql']);
await db.pg.exec(readFileSync(new URL('../../supabase/015_special_gear.sql', import.meta.url), 'utf8'));
// Valid base58 test wallets (no 0, O, I or l; LESSONS).
let wn = 0; const W = () => ('GWwa11et' + 'ABCDEFGH'[wn++]).padEnd(44, '1');
const base = { shirt: 'shirt_red', pants: 'pants_navy', face: 'face_dots', skin: 'skin_2', snow: 'snow_white' };
// A player with this level, these owned gear items and this SAVED avatar (written directly: what the page's save left there).
const mk = async (name, level, owns, gear) => { const id = (await db.query('insert into auth.users default values returning id'))[0].id;
  await db.query('insert into public.profiles (id, wallet, name, avatar, level) values ($1, $2, $3, $4, $5)', [id, W(), name, JSON.stringify({ ...base, ...gear }), level]);
  await db.query(`insert into public.logins (user_id, profile_id, kind) values ($1, $1, 'wallet')`, [id]);
  for (const it of owns) await db.query('insert into public.inventory (profile_id, item_id) values ($1, $2)', [id, it]); return id; };
// Hal (level 8): Toy Sack + Elf Shoes, both slots open. Fay (level 1): Pumpkin in G1 and Elf Shoes in G2, but G2 opens at level 8,
// so only the Pumpkin is worn (an avatar saved back when she was level 8, say). Gil: a Gift Box (its own clock, whatever it
// becomes). Pia: gear, but she only plays practice.
const hal = await mk('Hal', 8, ['gear_sack', 'gear_shoes'], { g1: 'gear_sack', g2: 'gear_shoes' });
const fay = await mk('Fay', 1, ['gear_pumpkin', 'gear_shoes'], { g1: 'gear_pumpkin', g2: 'gear_shoes' });
const gil = await mk('Gil', 3, ['gear_gift'], { g1: 'gear_gift' });
const pia = await mk('Pia', 3, ['gear_heated'], { g1: 'gear_heated' });
const lv = createLevels({ db });
const clocks = async () => Object.fromEntries((await db.query(`select p.name || ':' || w.item_id k, w.first_worn_at t from public.gear_wear w join public.profiles p on p.id = w.profile_id order by 1`)).map((r) => [r.k, +r.t]));
const avatar = async (id) => (await db.query('select avatar from public.profiles where id = $1', [id]))[0].avatar;

// 1. Practice and private rooms: nothing starts (only counted Auto matches, like the level counts).
assert.deepEqual((await lv.finish(pia, { id: 'practice-0001', auto: true, practice: true, places: [pia] })).counted, []);
assert.deepEqual((await lv.finish(pia, { id: 'private-00002', auto: false, places: [pia] })).counted, []);
assert.deepEqual(await clocks(), {}, 'practice / private: no clock started');

// 2. An Auto match: every account's worn gear starts its clock, once. Bots and guests (null) are skipped; levels still count.
const r1 = await lv.finish(hal, { id: 'auto-gear-0001', auto: true, places: [hal, null, fay, gil] });
assert.deepEqual(r1.counted.map((c) => c.place), [1, 3], 'level counts unchanged: 1st and 3rd with accounts');
const c1 = await clocks();
assert.deepEqual(Object.keys(c1), ['Fay:gear_pumpkin', 'Gil:gear_gift', 'Hal:gear_sack', 'Hal:gear_shoes'], 'each worn gear item, once (Fay\'s closed G2 not started; Gift Box runs its own clock)');

// 3. A second finish (a later match, and the same match reported again) never restarts a clock.
await new Promise((r) => setTimeout(r, 20));
await lv.finish(hal, { id: 'auto-gear-0002', auto: true, places: [fay, hal, gil] });
await lv.finish(hal, { id: 'auto-gear-0001', auto: true, places: [hal, null, fay, gil] });
assert.deepEqual(await clocks(), c1, 'same clocks, same start times');

// 4. Worn out (moved back 8 days): the next finish takes it off the saved avatar; the other gear stays; its clock isn't restarted.
await db.query(`update public.gear_wear set first_worn_at = now() - interval '8 days' where profile_id = $1 and item_id = 'gear_sack'`, [hal]);
const old = (await clocks())['Hal:gear_sack'];
await lv.finish(fay, { id: 'auto-gear-0003', auto: true, places: [fay, null] });
const a = await avatar(hal);
assert.deepEqual([a.g1, a.g2, a.shirt], ['gear_none', 'gear_shoes', 'shirt_red'], 'worn-out Toy Sack taken off Hal\'s saved avatar (Hal wasn\'t even in that match); Elf Shoes and the look stay');
assert.equal((await clocks())['Hal:gear_sack'], old, 'the worn-out clock stays where it was');
await lv.finish(hal, { id: 'auto-gear-0004', auto: true, places: [hal] });
assert.deepEqual([(await avatar(hal)).g1, (await clocks())['Hal:gear_sack']], ['gear_none', old], 'and the next match doesn\'t put it back or restart it');
console.log('OK: special gear wear clock from Auto match finishes: practice/private start nothing; each account\'s worn gear items start once (closed slots skipped, Gift Box its own clock); later finishes never restart a clock; worn-out gear (8 days) comes off saved avatars at the next finish, the rest stays; level counts unchanged');
process.exit(0);
