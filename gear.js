// SPECIAL GEAR (Cody, 2026-10-01, his handwritten page; DESIGN_NOTES → "Levels, special snowballs and special gear").
// Pure rules, no graphics, no network: the page, the match referee (sim.js) and the server all read this one table.
// Gear WEARS OUT: a 7-day clock starts at the first match wearing it and never stops (the database keeps the clock:
// supabase/015_special_gear.sql). Players put gear in their gear slots G1–G2 (avatar keys g1, g2; how many open by level:
// levels.js `gear`, 1 for levels 1–7, 2 for 8–10). Two slots hold two DIFFERENT gear (catalog.js cleanAvatar).
//   hits: extra hits before a hit knocks you down (Cody: "+1 hit (2 balls to stun)"); they come back after each stun, all game.
//   held: + share of snowballs held (the starting count and the most you can hold), rounded up.
//   refill: snowballs come back this much faster.  speed: + share of move speed.
//   size: the player's size (Elf Hat: half), and hitMult: how much longer a knock-down lasts on them (Elf Hat: 2×). A hit still
//   takes just ONE extra hit with an Elf Hat (Cody, 2026-10-01: "it still takes 2 hits if they have gear on").
//   present: at match start it becomes one random OTHER gear the player's level allows (resolvePresent).
//   minLevel: worn only from that level (Santa Costume: level 3+, like Snowball Rain's level 5 in specials.js).
import { BY_ID, GEAR_SLOTS, cleanAvatar } from './catalog.js?v=2d3bd4b23e';
import { levelInfo } from './levels.js?v=2d3bd4b23e';
export const GEAR = {
  pumpkin: { name: 'Pumpkin Costume', stat: 'hits', hits: 1, note: '+1 hit (2 snowballs to knock you down)' },
  kevlar: { name: 'I.C.E. Kevlar Vest', stat: 'hits', hits: 1, note: '+1 hit' },
  heated: { name: 'Heated Coat', stat: 'hits', hits: 1, note: '+1 hit' },
  santa: { name: 'Santa Costume', stat: 'hits', hits: 2, minLevel: 3, note: '+2 hits (level 3+)' },
  present: { name: 'Present Box', present: true, note: 'Becomes one random gear at the start of each match' },
  bag: { name: 'Santa Bag', stat: 'held', held: 0.5, note: '+50% snowballs held' },
  satchel: { name: 'Elf Satchel', stat: 'refill', refill: 0.25, note: 'Snowballs come back 25% faster' },
  shoes: { name: 'Elf Shoes', stat: 'speed', speed: 0.25, note: '+25% move speed' },
  elfhat: { name: 'Elf Hat', stat: 'size', size: 0.5, hitMult: 2, note: 'Half size, but when you\'re knocked down you stay down twice as long' },
  backpack: { name: 'Backpack', stat: 'held', held: 0.25, note: '+25% snowballs held' },
};
// Fixed order: a player's gear travels in match snapshots as a bitmask of these (gearMask), so NEVER reorder; add at the end.
export const GEAR_KINDS = ['pumpkin', 'kevlar', 'heated', 'santa', 'present', 'bag', 'satchel', 'shoes', 'elfhat', 'backpack'];
// NO STACKING (Cody, 2026-10-01: "Can't stack same stat"): two gear can't boost the same stat. Each gear has one stat (above);
// Present Box has none until it turns into a gear, then it has that gear's. Enforced in gearIn (the match), resolvePresent (its
// pick), effectsOf (defensive) and the database save (015 save_profile); the Special Gear tab shows NO_STACK_NOTE.
export const NO_STACK_NOTE = "Two gear can't boost the same stat (like Toy Sack + Backpack, or two +1 hit gear).";
export const statOf = (kind) => GEAR[kind]?.stat || null;
const statTaken = (kinds, kind) => !!statOf(kind) && (kinds || []).some((k) => k !== kind && statOf(k) === statOf(kind));
export const WEAR_DAYS = 7; // the clock starts at the first match wearing it (015_special_gear.sql keeps it)

// Can a player of this level wear this gear? (Santa Costume: level 3+.)
// Retired gear (Cody 2026-10-02: Heated Coat removed from the game; 2026-10-03: the Pumpkin Costume retired, its jack-o'-lantern
// head lives on as the Pumpkin King costume's face, the Halloween pass reward): kept in GEAR/GEAR_KINDS so the gear code doesn't
// shift, but never worn, never sold (shoprules.js forSale), never listed (Store, Avatar, guide), and never what a Present Box
// becomes. The Pumpkin Costume's catalog item and database row stay (players own it; the row keeps its price) but do nothing.
export const RETIRED = new Set(['heated', 'pumpkin']);
export const gearAllowed = (kind, level) => !!GEAR[kind] && !RETIRED.has(kind) && (level || 1) >= (GEAR[kind].minLevel || 1);

// Present Box: each one in the list becomes one random gear the level allows, never a Present Box itself and never one already
// worn (two slots hold two DIFFERENT gear, so a Present Box can't double a gear up either). `rand` is the referee's, so a
// seeded match picks the same gear every time. Resolved ONCE at match start; the result travels in snapshots (gearMask).
export function resolvePresent(kinds, level, rand = Math.random) {
  const out = []; // what the player wears, minus anything their level doesn't allow and a second gear of a stat (no stacking)
  for (const k of kinds || []) if (k !== 'present' && gearAllowed(k, level) && !out.includes(k) && !statTaken(out, k)) out.push(k);
  for (const k of kinds || []) if (k === 'present') {
    const pick = GEAR_KINDS.filter((g) => g !== 'present' && gearAllowed(g, level) && !out.includes(g) && !statTaken(out, g)); // no stacking
    if (pick.length) out.push(pick[Math.min(pick.length - 1, Math.floor(rand() * pick.length))]);
  }
  return out;
}

// What a list of (resolved) gear does, combined. Cody: gear can't stack the same stat, so only gear with DIFFERENT stats combine
// (Santa Bag + Elf Shoes: +50% held and +25% speed); a second gear of a stat already counted adds nothing (it can't get here
// through gearIn or the save anyway).
export function effectsOf(kinds) {
  const fx = { extraHits: 0, heldMult: 1, refillMult: 1, speedMult: 1, size: 1, hitMult: 1 };
  const seen = new Set();
  for (const k of new Set(kinds || [])) { const G = GEAR[k]; if (!G || (G.stat && seen.has(G.stat))) continue; if (G.stat) seen.add(G.stat); // no stacking
    fx.extraHits += G.hits || 0; fx.heldMult += G.held || 0; fx.refillMult += G.refill || 0; fx.speedMult += G.speed || 0;
    if (G.size) fx.size *= G.size; if (G.hitMult) fx.hitMult *= G.hitMult; }
  return fx;
}
// Snowballs held with gear: the level's count × the held bonus, rounded UP (Cody: "round up"). 5 + 50% = 7.5 → 8.
// The tiny subtraction stops float noise (e.g. 4 × 1.75 = 7.000000001) from rounding a whole number up by one.
export const heldWith = (start, fx) => Math.ceil(start * (fx?.heldMult || 1) - 1e-9);

// The gear a player brings into a match: what's in their gear slots, only the slots their level opens (levels.js), and only
// the ones their level allows (Santa Costume: 3+) → GEAR kinds, e.g. ['present', 'shoes']. Like catalog.js specialsIn.
// Present Box is NOT resolved here (the referee does it once, at match start, with its rand). Worn-out gear (7 days) is the
// database's job: save_profile takes it off, so a saved avatar never holds it (015_special_gear.sql).
export function gearIn(avatar, level) {
  const c = cleanAvatar(avatar), out = [];
  for (const s of GEAR_SLOTS.slice(0, levelInfo(level).gear)) { const k = BY_ID.get(c[s])?.gear; if (k && gearAllowed(k, level) && !out.includes(k) && !statTaken(out, k)) out.push(k); } // no stacking
  return out;
}

// A player's resolved gear as one small number for the snapshot (bit i = GEAR_KINDS[i]), and back.
export const gearMask = (kinds) => (kinds || []).reduce((m, k) => (GEAR_KINDS.includes(k) ? m | (1 << GEAR_KINDS.indexOf(k)) : m), 0);
export const gearOfMask = (m) => GEAR_KINDS.filter((k, i) => k !== 'present' && (Math.floor(Number(m) || 0) >> i) & 1);
