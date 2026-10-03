// Prints the SQL that syncs the database `items` table with mockups/catalog.js, after checking the catalog.
import { ITEMS, SLOTS, DEFAULT_AVATAR, COSTUMES, COSTUME_SLOTS } from '../mockups/catalog.js';
import { GEAR, GEAR_KINDS, RETIRED } from '../mockups/gear.js';
const ITEM_SLOTS = [...SLOTS, 'sball', 'gear']; // look slots + special snowballs (slots SB1–SB3) + special gear (G1–G2)

const fail = (m) => { console.error('CATALOG ERROR:', m); process.exit(1); };
const ids = new Set();
for (const it of ITEMS) {
  if (ids.has(it.id)) fail('duplicate id ' + it.id); ids.add(it.id);
  if (!ITEM_SLOTS.includes(it.slot)) fail('bad slot ' + it.id);
  if ((it.level == null) === (it.price == null)) fail(it.id + ' must have exactly one of level or price');
  if (!/^[a-z0-9_]{3,40}$/.test(it.id)) fail('bad id ' + it.id);
}
// every hat and backpack names the shape the character draws (a scripted edit once stripped the backpacks' `pack` shapes)
for (const it of ITEMS) if ((it.slot === 'hat' || it.slot === 'pack') && !it[it.slot]) fail(it.id + ' has no ' + it.slot + ' shape');
// special gear: every gear item does a gear.js kind, and every kind can be had (one item each)
for (const it of ITEMS) if (it.slot === 'gear' && it.id !== 'gear_none' && !GEAR[it.gear]) fail('gear item ' + it.id + ' has no gear.js kind');
// every gear kind has exactly one item, except retired ones (gear.js RETIRED: the Heated Coat, removed 2026-10-02), which have none
for (const k of GEAR_KINDS) if (ITEMS.filter((i) => i.gear === k).length !== (RETIRED.has(k) ? 0 : 1)) fail('gear ' + k + (RETIRED.has(k) ? ' is retired: no item may sell it' : ' needs exactly one item'));
for (const s of SLOTS) if (!ITEMS.some((i) => i.slot === s && i.level === 1)) fail('slot ' + s + ' has no level-1 item');
// costumes (Cody 2026-10-02): each has exactly one piece in every costume slot (shirt, pants, face, hat, pack, snow), all
// unlocked at the costume's level and FREE (no price); no piece belongs to a set that doesn't exist; skin is never a costume piece
for (const it of ITEMS) if (it.set && !COSTUMES[it.set]) fail(it.id + ' is in an unknown costume ' + it.set);
for (const [set, c] of Object.entries(COSTUMES)) {
  const pieces = ITEMS.filter((i) => i.set === set);
  if (pieces.map((i) => i.slot).sort().join() !== [...COSTUME_SLOTS].sort().join()) fail(`costume ${set}: needs exactly one piece per slot ${COSTUME_SLOTS.join(', ')} (has ${pieces.map((i) => i.slot).join(', ')})`);
  for (const i of pieces) if (i.level !== c.level || i.price != null) fail(`${i.id}: a ${c.name} piece unlocks at level ${c.level} and is free`);
}
if (ITEMS.some((i) => i.set && i.slot === 'skin')) fail('skin tones are never costume pieces');
// bots stay plain: no bot ever wears a costume piece (refcore.js botAvatar), checked over 5,000 bot ids
{ const { botAvatar } = await import('../mockups/refcore.js'), BY = new Map(ITEMS.map((i) => [i.id, i]));
  for (let id = 0; id < 5000; id++) for (const v of Object.values(botAvatar(id))) if (BY.get(v)?.set) fail(`bot ${id} wears costume piece ${v}`); }
for (const [s, id] of Object.entries(DEFAULT_AVATAR)) { const it = ITEMS.find((i) => i.id === id), want = /^sb[1-3]$/.test(s) ? 'sball' : /^g[12]$/.test(s) ? 'gear' : s; if (!it || it.slot !== want || it.level !== 1) fail('default ' + id + ' must be a level-1 ' + want); }

const q = (v) => (v == null ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const rows = ITEMS.map((i) => `(${q(i.id)}, ${q(i.slot)}, ${q(i.name)}, ${q(i.level ?? null)}, ${q(i.price ?? null)})`).join(',\n  ');
console.log(`insert into public.items (id, slot, name, unlock_level, price_usd) values
  ${rows}
on conflict (id) do update set slot = excluded.slot, name = excluded.name, unlock_level = excluded.unlock_level, price_usd = excluded.price_usd;
delete from public.items where id not in (${ITEMS.map((i) => q(i.id)).join(', ')});`);
