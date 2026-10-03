// The level 5 and level 10 COSTUMES in the database (supabase/029_costumes.sql) on top of every file that seeds or changes items
// (002, 008, 010, 012, 015, 023, 028): every items row equals mockups/catalog.js (the costume rows AND the rest); each costume has
// one free piece per look slot at its level; save_profile refuses every Nutcracker piece below level 5 and saves the whole
// costume at level 5 (the Frost King stays locked until 10); the file is safe to run twice; the shop never sells a piece.
// Run: node costumes-db.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDb } from './setup.mjs';
import { ITEMS, COSTUMES, COSTUME_SLOTS, costumeItems } from '../../mockups/catalog.js';
import { forSale } from '../../mockups/shoprules.js';

const db = await makeDb(['001_profiles.sql', '002_items_seed.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql', '006_ranked_tickets.sql', '008_hats_backpacks.sql', '009_lock_my_plays.sql', '010_levels.sql', '011_lottery.sql', '012_special_snowballs.sql']);
const run = (f) => db.pg.exec(readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8'));
for (const f of ['015_special_gear.sql', '016_shop.sql', '022_ticket_cap.sql', '023_item_prices.sql', '028_look_rewards.sql', '029_costumes.sql']) await run(f);
await run('029_costumes.sql'); // twice: safe to re-run

// 1. The database's items = catalog.js, every row (id, slot, name, unlock level, price)
const rows = await db.query('select id, slot, name, unlock_level, price_usd::float8 as price from public.items order by id');
const want = ITEMS.filter((i) => !i.season).map((i) => ({ id: i.id, slot: i.slot, name: i.name, unlock_level: i.level ?? null, price: i.price ?? null })).sort((a, b) => (a.id < b.id ? -1 : 1));
assert.deepEqual(rows, want, 'every items row equals catalog.js after 029 (season rewards come with 033: seasons-db.test checks those)');

// 2. Each costume: one piece per look slot, all at the costume's level, none priced, none for sale
for (const [set, c] of Object.entries(COSTUMES)) {
  const r = await db.query('select slot, unlock_level, price_usd from public.items where id = any($1) order by slot', [costumeItems(set).map((i) => i.id)]);
  assert.deepEqual(r.map((x) => x.slot), [...COSTUME_SLOTS].sort(), `${set}: one piece per slot`);
  assert.ok(r.every((x) => x.unlock_level === c.level && x.price_usd === null), `${set}: every piece unlocks at level ${c.level}, free`);
  assert.ok(costumeItems(set).every((i) => !forSale(i)), `${set}: no piece is for sale`);
}

// 3. Saving: a player at level 4, then 5, then 10
const uid = (await db.query('insert into auth.users default values returning id'))[0].id;
await db.query(`insert into public.profiles (id, wallet, name, avatar, level) values ($1, $2, 'Nutty', '{}', 4)`, [uid, 'NUTwa11et'.padEnd(44, '1')]);
await db.query(`insert into public.logins (user_id, profile_id, kind) values ($1, $1, 'wallet')`, [uid]);
await db.query(`select set_config('test.uid', $1, false)`, [uid]);
const base = { shirt: 'shirt_red', pants: 'pants_navy', face: 'face_dots', skin: 'skin_2', hat: 'hat_none', pack: 'pack_none', snow: 'snow_white' };
const outfit = (set) => Object.fromEntries(costumeItems(set).map((i) => [i.slot, i.id]));
const save = (a) => db.query('select avatar from public.save_profile($1, $2)', ['Nutty', JSON.stringify(a)]).then((r) => r[0].avatar, (e) => ({ refused: e.message }));
const level = (n) => db.query('update public.profiles set level = $2 where id = $1', [uid, n]);
const wears = (got, a) => Object.entries(a).every(([s, id]) => got?.[s] === id);

for (const it of costumeItems('nutcracker')) assert.match((await save({ ...base, [it.slot]: it.id })).refused || '', /isn't unlocked/, `level 4: ${it.id} refused`);
assert.match((await save({ ...base, ...outfit('nutcracker') })).refused || '', /isn't unlocked/, 'level 4: the whole Nutcracker refused');
await level(5);
assert.ok(wears(await save({ ...base, ...outfit('nutcracker') }), outfit('nutcracker')), 'level 5: the whole Nutcracker saves');
for (const it of costumeItems('frostking')) assert.match((await save({ ...base, [it.slot]: it.id })).refused || '', /isn't unlocked/, `level 5: ${it.id} (Frost King) still refused`);
await level(9);
assert.match((await save({ ...base, ...outfit('frostking') })).refused || '', /isn't unlocked/, 'level 9: the Frost King refused');
await level(10);
assert.ok(wears(await save({ ...base, ...outfit('frostking') }), outfit('frostking')), 'level 10: the whole Frost King saves');
// mix and match at 10: the Nutcracker's coat with the Frost King's crown and the drum
const mix = { ...base, shirt: 'shirt_nutcracker', hat: 'hat_icecrown', pack: 'pack_drum', snow: 'snow_crystal' };
assert.ok(wears(await save(mix), mix), 'level 10: pieces mix and match');
// the old gold snowball stays gone (010): the Nutcracker's gold is a different item
assert.match((await save({ ...base, snow: 'snow_gold' })).refused || '', /isn't unlocked/, 'Gilded (snow_gold) is still not an item');

console.log(`OK: costumes in the database: items = catalog.js (${rows.length} rows, 029 run twice); Nutcracker (5) and Frost King (10) each one free piece per slot (${COSTUME_SLOTS.join(', ')}), none for sale; every Nutcracker piece refused at level 4, whole costume saves at 5; Frost King refused at 5 and 9, saves at 10; pieces mix`);
