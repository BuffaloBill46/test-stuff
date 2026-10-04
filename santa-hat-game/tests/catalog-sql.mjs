// Prints the SQL that syncs the database `items` table with mockups/catalog.js, after checking the catalog.
import { ITEMS, SLOTS, DEFAULT_AVATAR, COSTUMES, COSTUME_SLOTS, SEASONS } from '../mockups/catalog.js';
import { GEAR, GEAR_KINDS, RETIRED } from '../mockups/gear.js';
import { forSale } from '../mockups/shoprules.js';
const ITEM_SLOTS = [...SLOTS, 'sball', 'gear']; // look slots + special snowballs (slots SB1–SB3) + special gear (G1–G2)

const fail = (m) => { console.error('CATALOG ERROR:', m); process.exit(1); };
const ids = new Set();
for (const it of ITEMS) {
  if (ids.has(it.id)) fail('duplicate id ' + it.id); ids.add(it.id);
  if (!ITEM_SLOTS.includes(it.slot)) fail('bad slot ' + it.id);
  // season-pass items (catalog.js `season`) have NEITHER: given by the pass, never earned by level or sold
  if (it.season ? it.level != null || it.price != null : (it.level == null) === (it.price == null)) fail(it.id + (it.season ? ' is a season item: no level and no price' : ' must have exactly one of level or price'));
  if (it.season && !SEASONS[it.season]) fail(it.id + ' is in an unknown season ' + it.season);
  if (!/^[a-z0-9_]{3,40}$/.test(it.id)) fail('bad id ' + it.id);
}
// every hat and backpack names the shape the character draws (a scripted edit once stripped the backpacks' `pack` shapes)
for (const it of ITEMS) if ((it.slot === 'hat' || it.slot === 'pack') && !it[it.slot]) fail(it.id + ' has no ' + it.slot + ' shape');
// special gear: every gear item does a gear.js kind, and every kind can be had (one item each)
for (const it of ITEMS) if (it.slot === 'gear' && it.id !== 'gear_none' && !GEAR[it.gear]) fail('gear item ' + it.id + ' has no gear.js kind');
// every gear kind has exactly one item, except retired ones (gear.js RETIRED): the Heated Coat (removed 2026-10-02) has none, the
// Pumpkin Costume (retired 2026-10-03) keeps its item because players own it; a retired gear's item is never for sale
for (const k of GEAR_KINDS) { const its = ITEMS.filter((i) => i.gear === k);
  if (RETIRED.has(k) ? its.length > 1 || its.some(forSale) : its.length !== 1) fail('gear ' + k + (RETIRED.has(k) ? ' is retired: at most its one old item, and never for sale' : ' needs exactly one item')); }
if (!RETIRED.has('pumpkin') || forSale(ITEMS.find((i) => i.id === 'gear_pumpkin'))) fail('the Pumpkin Costume gear is retired and not for sale');
if (ITEMS.some((i) => i.season && forSale(i))) fail('a season-pass item is never for sale');
for (const s of SLOTS) if (!ITEMS.some((i) => i.slot === s && i.level === 1)) fail('slot ' + s + ' has no level-1 item');
// costumes (Cody 2026-10-02): each has exactly one piece in every costume slot (shirt, pants, face, hat, pack, snow), all
// unlocked at the costume's level and FREE (no price); no piece belongs to a set that doesn't exist; skin is never a costume piece
for (const it of ITEMS) if (it.set && !COSTUMES[it.set]) fail(it.id + ' is in an unknown costume ' + it.set);
for (const [set, c] of Object.entries(COSTUMES)) {
  const pieces = ITEMS.filter((i) => i.set === set);
  if (pieces.map((i) => i.slot).sort().join() !== [...COSTUME_SLOTS].sort().join()) fail(`costume ${set}: needs exactly one piece per slot ${COSTUME_SLOTS.join(', ')} (has ${pieces.map((i) => i.slot).join(', ')})`);
  // a level costume: every piece at its level, free; a season costume (the Halloween pass's Pumpkin King): every piece in that
  // season, no level, no price
  for (const i of pieces) if (c.season ? i.season !== c.season || i.level != null || i.price != null : i.level !== c.level || i.price != null || i.season)
    fail(`${i.id}: a ${c.name} piece ${c.season ? `is a ${c.season} season piece (no level, no price)` : `unlocks at level ${c.level} and is free`}`);
}
for (const id of ['face_pumpkinking', 'hat_pumpkinking', 'shirt_pumpkinking', 'pants_pumpkinking', 'pack_pumpkinking', 'snow_pumpkinking'])
  if (ITEMS.find((i) => i.id === id)?.set !== 'pumpkinking') fail(`${id}: the season pass grants the Pumpkin King by these ids`);
// the Thanksgiving pass's Gobbler (supabase/035), by the same kind of fixed ids, and the season's five free looks
for (const id of ['face_gobbler', 'hat_gobbler', 'shirt_gobbler', 'pants_gobbler', 'pack_gobbler', 'snow_gobbler'])
  if (ITEMS.find((i) => i.id === id)?.set !== 'gobbler') fail(`${id}: the Thanksgiving pass grants the Gobbler by these ids`);
for (const id of ['snow_cranberry', 'shirt_pumpkinpie', 'pants_harvestgold', 'snow_mapleleaf', 'shirt_cornhusk'])
  { const it = ITEMS.find((i) => i.id === id); if (it?.season !== 'thanksgiving' || it.set) fail(`${id}: a free Thanksgiving look`); }
if (ITEMS.some((i) => i.set && i.slot === 'skin')) fail('skin tones are never costume pieces');
// bots stay plain: no bot ever wears a costume piece (refcore.js botAvatar), checked over 5,000 bot ids
{ const { botAvatar } = await import('../mockups/refcore.js'), BY = new Map(ITEMS.map((i) => [i.id, i]));
  for (let id = 0; id < 5000; id++) for (const v of Object.values(botAvatar(id))) if (BY.get(v)?.set || BY.get(v)?.season) fail(`bot ${id} wears costume or season piece ${v}`); }
for (const [s, id] of Object.entries(DEFAULT_AVATAR)) { const it = ITEMS.find((i) => i.id === id), want = /^sb[1-3]$/.test(s) ? 'sball' : /^g[12]$/.test(s) ? 'gear' : s; if (!it || it.slot !== want || it.level !== 1) fail('default ' + id + ' must be a level-1 ' + want); }

const q = (v) => (v == null ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
// (the season column: 032_halloween_costume.sql)
const rows = ITEMS.map((i) => `(${q(i.id)}, ${q(i.slot)}, ${q(i.name)}, ${q(i.level ?? null)}, ${q(i.price ?? null)}, ${q(i.season ?? null)})`).join(',\n  ');
console.log(`insert into public.items (id, slot, name, unlock_level, price_usd, season) values
  ${rows}
on conflict (id) do update set slot = excluded.slot, name = excluded.name, unlock_level = excluded.unlock_level, price_usd = excluded.price_usd, season = excluded.season;
delete from public.items where id not in (${ITEMS.map((i) => q(i.id)).join(', ')});`);
