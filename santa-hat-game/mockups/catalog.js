// Avatar item catalog. The database's `items` table is seeded from this file (see tests/catalog-sql.mjs),
// so the game, the store and the server always agree on what exists and how it unlocks.
// Each item unlocks at a level OR is sold in the store (price in USD, paid in SANTA) — never both.
export const SLOTS = ['shirt', 'pants', 'face', 'skin', 'snow'];
export const SLOT_NAMES = { shirt: 'Shirts', pants: 'Pants', face: 'Faces', skin: 'Skin', snow: 'Snowballs' };

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
  { id: 'snow_gold', slot: 'snow', name: 'Gilded', color: 0xffd060, level: 5 },
  { id: 'snow_ember', slot: 'snow', name: 'Ember', color: 0xff7a3a, price: 0.25 },
];

export const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const DEFAULT_AVATAR = { shirt: 'shirt_red', pants: 'pants_navy', face: 'face_dots', skin: 'skin_2', snow: 'snow_white' };

// Anything unknown or in the wrong slot falls back to the default, so a bad value can never break rendering.
export function cleanAvatar(a) {
  const out = {};
  for (const s of SLOTS) { const it = BY_ID.get(a && a[s]); out[s] = it && it.slot === s ? it.id : DEFAULT_AVATAR[s]; }
  return out;
}

export function usable(item, level, owned) { return (item.level != null && item.level <= level) || (owned && owned.has(item.id)); }
