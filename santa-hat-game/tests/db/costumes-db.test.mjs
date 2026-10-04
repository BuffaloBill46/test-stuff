// The level 5 and level 10 COSTUMES in the database (supabase/029_costumes.sql) on top of every file that seeds or changes items
// (002, 008, 010, 012, 015, 023, 028): every items row equals mockups/catalog.js (the costume rows AND the rest); each costume has
// one free piece per look slot at its level; save_profile refuses every Nutcracker piece below level 5 and saves the whole
// costume at level 5 (the Frost King stays locked until 10); the file is safe to run twice; the shop never sells a piece.
// And 032 (the Halloween pass's Pumpkin King): season items with no level or price, wearable only once owned, safe twice.
// And 035 (Thanksgiving: the free looks and the pass's Gobbler): the same rules, safe twice. And 037 (Christmas: the free
// looks and the pass's Gingerbread), the same.
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
// 032: the Halloween pass's Pumpkin King (season items: no level, no price), twice: safe to re-run
await run('032_halloween_costume.sql'); await run('032_halloween_costume.sql');
// 035: the Thanksgiving items (five free looks and the pass's Gobbler), twice: safe to re-run
await run('035_thanksgiving.sql'); await run('035_thanksgiving.sql');
// 037: the Christmas items (five free looks and the pass's Gingerbread), twice: safe to re-run
await run('037_christmas.sql'); await run('037_christmas.sql');

// 1. The database's items = catalog.js, every row (id, slot, name, unlock level, price, season)
const rows = await db.query('select id, slot, name, unlock_level, price_usd::float8 as price, season from public.items order by id');
// (the free HALLOWEEN looks, a season without a costume set, come with 033: seasons-db.test checks those; the Thanksgiving
// ones come with 035, run above)
const want = ITEMS.filter((i) => !(i.season === 'halloween' && !i.set)).map((i) => ({ id: i.id, slot: i.slot, name: i.name, unlock_level: i.level ?? null, price: i.price ?? null, season: i.season ?? null })).sort((a, b) => (a.id < b.id ? -1 : 1));
assert.deepEqual(rows, want, 'every items row equals catalog.js after 029 and 032');
// the retired Pumpkin Costume gear keeps its row and price (players own it; the code retires it: gear.js RETIRED, forSale)
assert.deepEqual(rows.find((r) => r.id === 'gear_pumpkin'), { id: 'gear_pumpkin', slot: 'gear', name: 'Pumpkin Costume', unlock_level: null, price: 1, season: null }, 'gear_pumpkin row kept');
assert.ok(!forSale(ITEMS.find((i) => i.id === 'gear_pumpkin')), 'the retired Pumpkin Costume is not for sale');

// 2. Each costume: one piece per look slot, all at the costume's level (a season costume: in its season, no level), none
// priced, none for sale
for (const [set, c] of Object.entries(COSTUMES)) {
  const r = await db.query('select slot, unlock_level, price_usd, season from public.items where id = any($1) order by slot', [costumeItems(set).map((i) => i.id)]);
  assert.deepEqual(r.map((x) => x.slot), [...COSTUME_SLOTS].sort(), `${set}: one piece per slot`);
  if (c.season) assert.ok(r.every((x) => x.unlock_level === null && x.price_usd === null && x.season === c.season), `${set}: every piece is a ${c.season} season piece, no level, no price`);
  else assert.ok(r.every((x) => x.unlock_level === c.level && x.price_usd === null && x.season === null), `${set}: every piece unlocks at level ${c.level}, free`);
  assert.ok(costumeItems(set).every((i) => !forSale(i)), `${set}: no piece is for sale`);
}
// the rebuilt items_check: a season item has neither a level nor a price; any other item still has exactly one
const bad = (sql) => db.query(sql).then(() => 'accepted', (e) => e.message);
assert.match(await bad(`insert into public.items (id, slot, name, unlock_level, price_usd, season) values ('shirt_t1', 'shirt', 'T', 3, null, 'halloween')`), /items_check/, 'a season item with a level is refused');
assert.match(await bad(`insert into public.items (id, slot, name, unlock_level, price_usd, season) values ('shirt_t2', 'shirt', 'T', null, 1, 'halloween')`), /items_check/, 'a season item with a price is refused');
assert.match(await bad(`insert into public.items (id, slot, name, unlock_level, price_usd) values ('shirt_t3', 'shirt', 'T', null, null)`), /items_check/, 'a plain item with neither is still refused');
assert.match(await bad(`insert into public.items (id, slot, name, unlock_level, price_usd) values ('shirt_t4', 'shirt', 'T', 2, 1)`), /items_check/, 'a plain item with both is still refused');

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
// the Pumpkin King (Halloween pass): no level opens it, even 10; once owned (the pass grants the six by id) it saves at any level
for (const it of costumeItems('pumpkinking')) assert.match((await save({ ...base, [it.slot]: it.id })).refused || '', /isn't unlocked/, `level 10, not owned: ${it.id} refused`);
await level(1);
for (const it of costumeItems('pumpkinking')) await db.query('insert into public.inventory (profile_id, item_id) values ($1, $2)', [uid, it.id]);
assert.ok(wears(await save({ ...base, ...outfit('pumpkinking') }), outfit('pumpkinking')), 'level 1, owned: the whole Pumpkin King saves');
// the Gobbler (Thanksgiving pass, 035) the same way, and the free Thanksgiving looks: no level opens any of them, owning does
const TG = ITEMS.filter((i) => i.season === 'thanksgiving');
assert.equal(TG.length, 11, 'Thanksgiving: five free looks and the six Gobbler pieces');
await level(10);
for (const it of TG) assert.match((await save({ ...base, [it.slot]: it.id })).refused || '', /isn't unlocked/, `level 10, not owned: ${it.id} refused`);
await level(1);
for (const it of TG) await db.query('insert into public.inventory (profile_id, item_id) values ($1, $2)', [uid, it.id]);
assert.ok(wears(await save({ ...base, ...outfit('gobbler') }), outfit('gobbler')), 'level 1, owned: the whole Gobbler saves');
for (const it of TG.filter((i) => !i.set)) assert.ok(wears(await save({ ...base, [it.slot]: it.id }), { [it.slot]: it.id }), `level 1, owned: ${it.id} saves`);
// the Gingerbread (Christmas pass, 037) and the free Christmas looks, the same way
const XM = ITEMS.filter((i) => i.season === 'christmas');
assert.equal(XM.length, 11, 'Christmas: five free looks and the six Gingerbread pieces');
await level(10);
for (const it of XM) assert.match((await save({ ...base, [it.slot]: it.id })).refused || '', /isn't unlocked/, `level 10, not owned: ${it.id} refused`);
await level(1);
for (const it of XM) await db.query('insert into public.inventory (profile_id, item_id) values ($1, $2)', [uid, it.id]);
assert.ok(wears(await save({ ...base, ...outfit('gingerbread') }), outfit('gingerbread')), 'level 1, owned: the whole Gingerbread saves');
for (const it of XM.filter((i) => !i.set)) assert.ok(wears(await save({ ...base, [it.slot]: it.id }), { [it.slot]: it.id }), `level 1, owned: ${it.id} saves`);

console.log(`OK: costumes in the database: items = catalog.js (${rows.length} rows, 029 and 032 run twice); Nutcracker (5) and Frost King (10) each one free piece per slot (${COSTUME_SLOTS.join(', ')}), none for sale; every Nutcracker piece refused at level 4, whole costume saves at 5; Frost King refused at 5 and 9, saves at 10; pieces mix; Pumpkin King (Halloween pass): season pieces with no level or price (items_check rebuilt, still strict for others), refused unowned even at 10, saves owned at 1; the Gobbler and the free Thanksgiving looks (035, run twice) the same; the Gingerbread and the free Christmas looks (037, run twice) the same; gear_pumpkin kept, not for sale`);
