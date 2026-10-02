// Avatar item catalog. The database's `items` table is seeded from this file (see tests/catalog-sql.mjs),
// so the game, the store and the server always agree on what exists and how it unlocks.
// Each item unlocks at a level OR is sold in the store (price in USD, paid in SANTA) — never both.
export const SLOTS = ['shirt', 'pants', 'face', 'skin', 'hat', 'pack', 'snow'];
export const SLOT_NAMES = { shirt: 'Shirts', pants: 'Pants', face: 'Faces', skin: 'Skin', hat: 'Hats', pack: 'Backpacks', snow: 'Snowballs', sball: 'Special Snowballs', gear: 'Special Gear' };
// SPECIAL SNOWBALLS (Cody, 2026-10-01): items of slot 'sball' (specials.js says what each does), kept forever once owned, put in the
// player's slots SB1–SB3 (avatar keys sb1, sb2, sb3; how many open by level: levels.js). 'sb_none' = an empty slot.
// Prices are placeholders (Cody: "set a base price, we will change later"). Snowball Rain also needs level 5 to use (specials.js).
export const SB_SLOTS = ['sb1', 'sb2', 'sb3'];
// SPECIAL GEAR (Cody, 2026-10-01): items of slot 'gear' (gear.js says what each does), put in the player's gear slots G1–G2
// (avatar keys g1, g2; how many open by level: levels.js `gear`). 'gear_none' = an empty slot. Gear WEARS OUT 7 days after the
// first match wearing it (the database keeps that clock: 015_special_gear.sql). Prices are Claude's placeholders (Cody: "set a
// base price, we will change later"). SLOT_NAMES has no 'gear' entry yet on purpose: the Avatar page's Special Gear tab
// isn't built, and the page lists slots from it.
export const GEAR_SLOTS = ['g1', 'g2'];
// Snowball RULES (Cody, 2026-10-01: special snowball types are coming: faster, bigger, longer stun, splits). An item's
// `rules` change how its snowballs play; the match referee reads them (sim.js). Today: stun (× the normal 0.9 s knock-down).

export const ITEMS = [
  { id: 'shirt_red', slot: 'shirt', name: 'Hat Red', color: 0xcf3128, level: 1 },
  { id: 'shirt_blue', slot: 'shirt', name: 'Frost Blue', color: 0x3d6fb8, level: 1 },
  { id: 'shirt_green', slot: 'shirt', name: 'Pine', color: 0x3f9a66, level: 1 },
  { id: 'shirt_gold', slot: 'shirt', name: 'Lantern Gold', color: 0xe0a030, level: 2 },
  { id: 'shirt_violet', slot: 'shirt', name: 'Aurora Violet', color: 0x7a4fa3, level: 3 },
  { id: 'shirt_teal', slot: 'shirt', name: 'Ice Teal', color: 0x2f8f8a, level: 4 },
  { id: 'shirt_pink', slot: 'shirt', name: 'Candy Pink', color: 0xd76aa0, level: 5 },
  { id: 'shirt_snow', slot: 'shirt', name: 'Snowdrift', color: 0xf0ede4, level: 6 },
  { id: 'shirt_coal', slot: 'shirt', name: 'Coal', color: 0x2a2a35, price: 0.25 },
  { id: 'shirt_ember', slot: 'shirt', name: 'Ember', color: 0xe8612c, price: 0.25 },

  { id: 'pants_navy', slot: 'pants', name: 'Night Navy', color: 0x2d3a63, level: 1 },
  { id: 'pants_brown', slot: 'pants', name: 'Bark', color: 0x5a3b24, level: 1 },
  { id: 'pants_grey', slot: 'pants', name: 'Stone', color: 0x6f6a73, level: 2 },
  { id: 'pants_green', slot: 'pants', name: 'Fir', color: 0x2a5a3f, level: 3 },
  { id: 'pants_red', slot: 'pants', name: 'Berry', color: 0x8f1712, level: 5 },
  { id: 'pants_snow', slot: 'pants', name: 'Frost', color: 0xe6ecf5, price: 0.15 },

  { id: 'face_dots', slot: 'face', name: 'Classic', face: 'dots', level: 1 },
  { id: 'face_smile', slot: 'face', name: 'Grin', face: 'smile', level: 1 },
  { id: 'face_wow', slot: 'face', name: 'Surprised', face: 'wow', level: 3 },
  { id: 'face_wink', slot: 'face', name: 'Wink', face: 'wink', level: 2 },
  { id: 'face_shades', slot: 'face', name: 'Shades', face: 'shades', level: 4 },
  { id: 'face_beard', slot: 'face', name: 'Big Beard', face: 'beard', level: 6 },
  { id: 'face_mask', slot: 'face', name: 'Scarf Mask', face: 'mask', price: 0.30 },
  { id: 'face_gorilla', slot: 'face', name: 'Gorilla', face: 'gorilla', price: 0.50 },
  { id: 'face_snowman', slot: 'face', name: 'Snowman', face: 'snowman', price: 0.50 },
  { id: 'face_panda', slot: 'face', name: 'Panda', face: 'panda', price: 0.50 },

  { id: 'skin_1', slot: 'skin', name: 'Tone 1', color: 0xf0c7a0, level: 1 },
  { id: 'skin_2', slot: 'skin', name: 'Tone 2', color: 0xe8b894, level: 1 },
  { id: 'skin_3', slot: 'skin', name: 'Tone 3', color: 0xc58c63, level: 1 },
  { id: 'skin_4', slot: 'skin', name: 'Tone 4', color: 0x8d5a3b, level: 1 },
  { id: 'skin_5', slot: 'skin', name: 'Tone 5', color: 0x5e3a26, level: 1 },

  { id: 'snow_white', slot: 'snow', name: 'Fresh Powder', color: 0xf5f1e8, level: 1 },
  { id: 'snow_ice', slot: 'snow', name: 'Glacier', color: 0x9fd8ff, level: 2 },
  { id: 'snow_pink', slot: 'snow', name: 'Sugarplum', color: 0xff9ccf, level: 3 },
  { id: 'snow_green', slot: 'snow', name: 'Mint', color: 0x9dffb0, level: 4 },
  { id: 'snow_ember', slot: 'snow', name: 'Ember', color: 0xff7a3a, price: 0.25 },
  // The first special snowball (Cody's example): stuns 50% longer than normal. Bought in the Store for now (Cody); levels later.
  // (The colour-slot Ice Ball prototype became the Ice Ball special below, 2026-10-01. A colour can still carry `rules`.)

  // Hats and backpacks are bought in the Store for now (Cody, 2026-10-01; he'll set levels later); prices are Claude's placeholders.
  // Hats (2026-10-01): worn on the head, hidden while that player wears the Santa hat (the prize must always be seen).
  { id: 'hat_none', slot: 'hat', name: 'No hat', hat: 'none', level: 1 },
  { id: 'hat_beanie', slot: 'hat', name: 'Knit Beanie', hat: 'beanie', color: 0x3d6fb8, price: 0.25 },
  { id: 'hat_earmuffs', slot: 'hat', name: 'Earmuffs', hat: 'earmuffs', color: 0xd76aa0, price: 0.25 },
  { id: 'hat_antlers', slot: 'hat', name: 'Reindeer Antlers', hat: 'antlers', color: 0x8a5a33, price: 0.50 },
  { id: 'hat_tophat', slot: 'hat', name: 'Snowman Top Hat', hat: 'tophat', color: 0x2a2a35, price: 0.25 },
  // Special snowballs (2026-10-01).
  { id: 'sb_none', slot: 'sball', name: 'Empty slot', level: 1 },
  { id: 'sb_ice', slot: 'sball', name: 'Ice Ball', special: 'ice', color: 0xbfeaff, price: 0.50 },
  { id: 'sb_split', slot: 'sball', name: 'Split Ball', special: 'split', color: 0xcf3128, price: 0.75 },
  { id: 'sb_giant', slot: 'sball', name: 'Giant Ball', special: 'giant', color: 0xf5f1e8, price: 0.75 },
  { id: 'sb_fire', slot: 'sball', name: 'Fire Ball', special: 'fire', color: 0xff7a3a, price: 0.50 },
  { id: 'sb_sky', slot: 'sball', name: 'Sky Ball', special: 'sky', color: 0x9fd8ff, price: 1.00 },
  { id: 'sb_rain', slot: 'sball', name: 'Snowball Rain', special: 'rain', color: 0xdbe8ff, price: 2.00 },

  // Backpacks (2026-10-01).
  { id: 'pack_none', slot: 'pack', name: 'No backpack', pack: 'none', level: 1 },
  { id: 'pack_satchel', slot: 'pack', name: 'Elf Satchel', pack: 'satchel', color: 0x3f9a66, price: 0.25 },
  { id: 'pack_sack', slot: 'pack', name: 'Toy Sack', pack: 'sack', color: 0xcf3128, price: 0.50 },
  { id: 'pack_gift', slot: 'pack', name: 'Gift Box', pack: 'gift', color: 0x7a4fa3, price: 0.25 },

  // Special gear (2026-10-01). Cody: existing items become gear and keep their names: Toy Sack = Santa Bag, Gift Box =
  // Present Box, Elf Satchel keeps its name. They are NEW items (gear_sack, gear_gift, gear_satchel) next to the backpacks
  // above, which stay: they were bought as forever looks and the character still draws them (pack slot). 015 gives every
  // backpack owner the matching gear too. Gear is drawn on the character (kit.js GEAR_LOOKS; matches draw the referee's e.gear).
  // Santa Costume's level 3 is a WEAR rule (gear.js minLevel), not an unlock level, so it still has a price.
  { id: 'gear_none', slot: 'gear', name: 'Empty slot', level: 1 },
  { id: 'gear_pumpkin', slot: 'gear', name: 'Pumpkin Costume', gear: 'pumpkin', color: 0xe8812c, price: 0.50 },
  { id: 'gear_kevlar', slot: 'gear', name: 'I.C.E. Kevlar Vest', gear: 'kevlar', color: 0x9fd8ff, price: 0.50 },
  { id: 'gear_heated', slot: 'gear', name: 'Heated Coat', gear: 'heated', color: 0xcf3128, price: 0.50 },
  { id: 'gear_santa', slot: 'gear', name: 'Santa Costume', gear: 'santa', color: 0xcf3128, price: 1.00 },
  { id: 'gear_gift', slot: 'gear', name: 'Gift Box', gear: 'present', color: 0x7a4fa3, price: 0.50 },
  { id: 'gear_sack', slot: 'gear', name: 'Toy Sack', gear: 'bag', color: 0xcf3128, price: 0.75 },
  { id: 'gear_satchel', slot: 'gear', name: 'Elf Satchel', gear: 'satchel', color: 0x3f9a66, price: 0.50 },
  { id: 'gear_shoes', slot: 'gear', name: 'Elf Shoes', gear: 'shoes', color: 0x3f9a66, price: 0.75 },
  { id: 'gear_elfhat', slot: 'gear', name: 'Elf Hat', gear: 'elfhat', color: 0x3f9a66, price: 0.50 },
  { id: 'gear_backpack', slot: 'gear', name: 'Backpack', gear: 'backpack', color: 0x5a3b24, price: 0.50 },
];

export const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const DEFAULT_AVATAR = { shirt: 'shirt_red', pants: 'pants_navy', face: 'face_dots', skin: 'skin_2', hat: 'hat_none', pack: 'pack_none', snow: 'snow_white', sb1: 'sb_none', sb2: 'sb_none', sb3: 'sb_none', g1: 'gear_none', g2: 'gear_none' };

// Anything unknown or in the wrong slot falls back to the default, so a bad value can never break rendering.
export function cleanAvatar(a) {
  const out = {};
  for (const s of SLOTS) { const it = BY_ID.get(a && a[s]); out[s] = it && it.slot === s ? it.id : DEFAULT_AVATAR[s]; }
  // special snowball slots: a special item, each special at most once (a repeat empties the later slot)
  const seen = new Set();
  for (const s of SB_SLOTS) { const it = BY_ID.get(a && a[s]); const ok = it && it.slot === 'sball' && (it.id === 'sb_none' || !seen.has(it.id)); out[s] = ok ? it.id : 'sb_none'; seen.add(out[s]); }
  // gear slots, the same way: a gear item, each gear at most once (two slots hold two DIFFERENT gear), anything else → empty
  for (const s of GEAR_SLOTS) { const it = BY_ID.get(a && a[s]); const ok = it && it.slot === 'gear' && (it.id === 'gear_none' || !seen.has(it.id)); out[s] = ok ? it.id : 'gear_none'; seen.add(out[s]); }
  return out;
}

// The snowball rules a saved avatar plays with ({} = a normal snowball).
export const ballRules = (a) => BY_ID.get(cleanAvatar(a).snow)?.rules || {};

// The special snowballs a player brings into a match: what's in their slots, only the slots their level opens, and only
// the ones their level allows (Snowball Rain: level 5). → specials.js kinds, e.g. ['ice', 'sky'].
export function specialsIn(a, level, slotsOpen) {
  const c = cleanAvatar(a), out = [];
  for (const s of SB_SLOTS.slice(0, slotsOpen)) { const it = BY_ID.get(c[s]); if (it?.special && !(it.special === 'rain' && level < 5)) out.push(it.special); }
  return out;
}
export function usable(item, level, owned) { return (item.level != null && item.level <= level) || (owned && owned.has(item.id)); }
