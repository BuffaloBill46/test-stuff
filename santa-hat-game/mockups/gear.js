// SPECIAL GEAR (Cody, 2026-10-01, his handwritten page; DESIGN_NOTES → "Levels, special snowballs and special gear").
// Pure rules, no graphics, no network: the page, the match referee (sim.js) and the server all read this one table.
// Gear WEARS OUT: a 7-day clock starts at the first match wearing it and never stops (the database keeps the clock:
// supabase/015_special_gear.sql). Players put gear in their gear slots G1–G2 (avatar keys g1, g2; how many open by level:
// levels.js `gear`, 1 for levels 1–7, 2 for 8–10). Two slots hold two DIFFERENT gear (catalog.js cleanAvatar).
//   hits: extra hits before a hit knocks you down (Cody: "+1 hit (2 balls to stun)"); they come back after each stun, all game.
//   held: + share of snowballs held (the starting count and the most you can hold), rounded up.
//   refill: snowballs come back this much faster.  speed: + share of move speed.
//   size: the player's size (Elf Hat: half), and hitMult: how many times stronger a snowball is on them (Elf Hat: 2×,
//   so a stun lasts twice as long and a hit takes 2 extra hits instead of 1).
//   present: at match start it becomes one random OTHER gear the player's level allows (resolvePresent).
//   minLevel: worn only from that level (Santa Costume: level 3+, like Snowball Rain's level 5 in specials.js).
import { BY_ID, GEAR_SLOTS, cleanAvatar } from './catalog.js';
import { levelInfo } from './levels.js';
export const GEAR = {
  pumpkin: { name: 'Pumpkin Costume', hits: 1, note: '+1 hit (2 snowballs to knock you down)' },
  kevlar: { name: 'I.C.E. Kevlar Vest', hits: 1, note: '+1 hit' },
  heated: { name: 'Heated Coat', hits: 1, note: '+1 hit' },
  santa: { name: 'Santa Costume', hits: 2, minLevel: 3, note: '+2 hits (level 3+)' },
  present: { name: 'Present Box', present: true, note: 'Becomes one random gear at the start of each match' },
  bag: { name: 'Santa Bag', held: 0.5, note: '+50% snowballs held' },
  satchel: { name: 'Elf Satchel', refill: 0.25, note: 'Snowballs come back 25% faster' },
  shoes: { name: 'Elf Shoes', speed: 0.25, note: '+25% move speed' },
  elfhat: { name: 'Elf Hat', size: 0.5, hitMult: 2, note: 'Half size, but snowballs do 2× on you (stun twice as long; a hit takes 2 extra hits)' },
  backpack: { name: 'Backpack', held: 0.25, note: '+25% snowballs held' },
};
// Fixed order: a player's gear travels in match snapshots as a bitmask of these (gearMask), so NEVER reorder; add at the end.
export const GEAR_KINDS = ['pumpkin', 'kevlar', 'heated', 'santa', 'present', 'bag', 'satchel', 'shoes', 'elfhat', 'backpack'];
export const WEAR_DAYS = 7; // the clock starts at the first match wearing it (015_special_gear.sql keeps it)

// Can a player of this level wear this gear? (Santa Costume: level 3+.)
export const gearAllowed = (kind, level) => !!GEAR[kind] && (level || 1) >= (GEAR[kind].minLevel || 1);

// Present Box: each one in the list becomes one random gear the level allows, never a Present Box itself and never one already
// worn (two slots hold two DIFFERENT gear, so a Present Box can't double a gear up either). `rand` is the referee's, so a
// seeded match picks the same gear every time. Resolved ONCE at match start; the result travels in snapshots (gearMask).
export function resolvePresent(kinds, level, rand = Math.random) {
  const out = (kinds || []).filter((k) => k !== 'present' && gearAllowed(k, level));
  for (const k of kinds || []) if (k === 'present') {
    const pick = GEAR_KINDS.filter((g) => g !== 'present' && gearAllowed(g, level) && !out.includes(g));
    if (pick.length) out.push(pick[Math.min(pick.length - 1, Math.floor(rand() * pick.length))]);
  }
  return out;
}

// What a list of (resolved) gear does, combined. Two DIFFERENT gear stack by ADDING: Santa Bag + Backpack = +75% held,
// Pumpkin + Santa Costume = +3 hits, Elf Shoes alone +25%. OPEN QUESTION for Cody: should two gear stack at all, and by
// adding? (Claude's pick for now; only levels 8–10 have 2 slots.) Elf Hat's size and 2× don't come from anything else.
export function effectsOf(kinds) {
  const fx = { extraHits: 0, heldMult: 1, refillMult: 1, speedMult: 1, size: 1, hitMult: 1 };
  for (const k of new Set(kinds || [])) { const G = GEAR[k]; if (!G) continue;
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
  for (const s of GEAR_SLOTS.slice(0, levelInfo(level).gear)) { const k = BY_ID.get(c[s])?.gear; if (k && gearAllowed(k, level) && !out.includes(k)) out.push(k); }
  return out;
}

// A player's resolved gear as one small number for the snapshot (bit i = GEAR_KINDS[i]), and back.
export const gearMask = (kinds) => (kinds || []).reduce((m, k) => (GEAR_KINDS.includes(k) ? m | (1 << GEAR_KINDS.indexOf(k)) : m), 0);
export const gearOfMask = (m) => GEAR_KINDS.filter((k, i) => k !== 'present' && (Math.floor(Number(m) || 0) >> i) & 1);
