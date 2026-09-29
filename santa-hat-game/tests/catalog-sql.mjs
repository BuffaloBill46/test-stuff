// Prints the SQL that syncs the database `items` table with mockups/catalog.js, after checking the catalog.
import { ITEMS, SLOTS, DEFAULT_AVATAR } from '../mockups/catalog.js';

const fail = (m) => { console.error('CATALOG ERROR:', m); process.exit(1); };
const ids = new Set();
for (const it of ITEMS) {
  if (ids.has(it.id)) fail('duplicate id ' + it.id); ids.add(it.id);
  if (!SLOTS.includes(it.slot)) fail('bad slot ' + it.id);
  if ((it.level == null) === (it.price == null)) fail(it.id + ' must have exactly one of level or price');
  if (!/^[a-z0-9_]{3,40}$/.test(it.id)) fail('bad id ' + it.id);
}
for (const s of SLOTS) if (!ITEMS.some((i) => i.slot === s && i.level === 1)) fail('slot ' + s + ' has no level-1 item');
for (const [s, id] of Object.entries(DEFAULT_AVATAR)) { const it = ITEMS.find((i) => i.id === id); if (!it || it.slot !== s || it.level !== 1) fail('default ' + id + ' must be a level-1 ' + s); }

const q = (v) => (v == null ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const rows = ITEMS.map((i) => `(${q(i.id)}, ${q(i.slot)}, ${q(i.name)}, ${q(i.level ?? null)}, ${q(i.price ?? null)})`).join(',\n  ');
console.log(`insert into public.items (id, slot, name, unlock_level, price_usd) values
  ${rows}
on conflict (id) do update set slot = excluded.slot, name = excluded.name, unlock_level = excluded.unlock_level, price_usd = excluded.price_usd;
delete from public.items where id not in (${ITEMS.map((i) => q(i.id)).join(', ')});`);
