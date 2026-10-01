// SPECIAL SNOWBALLS (Cody, 2026-10-01, his handwritten page; DESIGN_NOTES → "Levels, special snowballs and special gear").
// Kept forever once owned. A throw uses `cost` snowballs from the counter ('all' = the whole counter, and it must be FULL).
// Players fill their slots (SB1–SB3, how many by level: levels.js) on the Avatar screen; the buttons sit under the counter.
// The match referee (sim.js) applies the effects; the page (online.js) draws them. One table, so nothing can drift.
export const SPECIALS = {
  ice: { name: 'Ice Ball', cost: 2, stunSec: 2, look: 'icy ball', note: '2-second stun' },
  split: { name: 'Split Ball', cost: 3, splitAfter: 1, pieces: 3, fanDeg: 18, look: '3-colour ball', note: 'Splits into 3 after 1 second, fanning out' },
  giant: { name: 'Giant Ball', cost: 3, size: 3, look: 'your snowball colour, 3× the size', note: '3× the size of a normal ball' },
  fire: { name: 'Fire Ball', cost: 2, speed: 2, look: 'fire tail', note: '2× speed' },
  sky: { name: 'Sky Ball', cost: 5, waves: 2, perWave: 5, radius: 2.2, firstAt: 1.0, gap: 0.6, look: 'goes up, rains down', note: 'Rains down on a small area where you aim, in 2 waves' },
  rain: { name: 'Snowball Rain', cost: 'all', minLevel: 5, seconds: 3, every: 0.08, look: 'the whole ring', note: 'The whole ring rains snowballs for 3 seconds (needs a full counter; level 5+)' },
};
export const SPECIAL_KINDS = Object.keys(SPECIALS);
export const DROP_HIT_RADIUS = 0.9; // a falling snowball (Sky Ball, Snowball Rain) hits anyone this close to where it lands

// Can this player throw this special now? (Level 5 for Rain; enough snowballs; Rain needs a full counter.) → '' or why not.
export function cantThrow(kind, { ammo, max, level }) {
  const S = SPECIALS[kind]; if (!S) return 'unknown snowball';
  if (S.minLevel && (level || 1) < S.minLevel) return `needs level ${S.minLevel}`;
  if (S.cost === 'all') return ammo >= max && ammo > 0 ? '' : 'needs a full counter';
  return ammo >= S.cost ? '' : `needs ${S.cost} snowballs`;
}
export const costOf = (kind, max) => (SPECIALS[kind]?.cost === 'all' ? max : SPECIALS[kind]?.cost || 1);
