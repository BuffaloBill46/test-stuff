// LEVELS (Cody, 2026-10-01; DESIGN_NOTES → "Levels, special snowballs and special gear"). Pure rules, no graphics, no network:
// the page, the match referee and the server all read these. Max level 10 for now.
//   Earned: 10 ticks per level (a tick: a top-3 finish or a season "+1 level tick"; 5 until 2026-10-04), in Auto match games only (ranked or unranked; not practice or private rooms).
//   Except level 9 → 10: 10 FIRST-place wins (Cody, 2026-10-01); 2nd and 3rd don't count there.
//   Bought: up to level 5 only. Levels 2–4 cost $1.00 each; level 5 costs $5.00. Paid in SANTA, 50% burned / 50% treasury.
// A player's progress is { level, xp }: xp = finishes counted toward the NEXT level (0 to need-1). Buying a level keeps it.
export const MAX_LEVEL = 10, WINS_PER_LEVEL = 10, MAX_BOUGHT_LEVEL = 5; // 10 ticks a level (Cody, 2026-10-04; was 5: the season gives level ticks too)

// What each level gives (Cody's table). start = snowballs held at the start (and the most you can hold);
// sb = special snowball slots (SB1–SB3); gear = special gear slots.
export const LEVELS = {
  1: { start: 5, sb: 1, gear: 1 },
  2: { start: 6, sb: 1, gear: 1 },
  3: { start: 7, sb: 1, gear: 1 },
  4: { start: 7, sb: 2, gear: 1 },
  5: { start: 8, sb: 2, gear: 1 },
  6: { start: 9, sb: 2, gear: 1 },
  7: { start: 10, sb: 2, gear: 1 },
  8: { start: 10, sb: 3, gear: 2 },
  9: { start: 11, sb: 3, gear: 2 },
  10: { start: 12, sb: 3, gear: 2 },
};

// What the next level takes: how many finishes, and which places count.
export const needFor = (level) => (level === 9 ? 10 : WINS_PER_LEVEL);
export const placeCounts = (level, place) => (level === 9 ? place === 1 : place >= 1 && place <= 3);

export const clampLevel = (n) => Math.min(MAX_LEVEL, Math.max(1, Math.floor(Number(n)) || 1));
export const levelInfo = (n) => LEVELS[clampLevel(n)];

// Price in dollars to buy the NEXT level from `level`, or null when it can't be bought (already level 5 or higher).
export function buyPrice(level) {
  const next = clampLevel(level) + 1;
  if (next > MAX_BOUGHT_LEVEL) return null;
  return next === MAX_BOUGHT_LEVEL ? 5 : 1;
}

// Only these games count toward levels (Cody: "a automatch ranked or unranked game placing top 3").
export const countsForLevels = (game) => !!game && game.auto === true && !game.practice;

// A finished Auto match: place = 1-based finishing place. Returns the new progress and whether a level was gained.
export function afterMatch(progress, place, game) {
  const p = { level: clampLevel(progress?.level), xp: Math.max(0, Math.floor(Number(progress?.xp) || 0)) };
  if (!countsForLevels(game) || !placeCounts(p.level, place) || p.level >= MAX_LEVEL) return { ...p, up: false };
  p.xp += 1;
  if (p.xp >= needFor(p.level)) { p.level += 1; p.xp = 0; return { ...p, up: true }; }
  return { ...p, up: false };
}

// Buying one level (after the payment is confirmed). Refused above level 4 (level 5 is the most that can be bought).
export function afterBuy(progress) {
  const p = { level: clampLevel(progress?.level), xp: Math.max(0, Math.floor(Number(progress?.xp) || 0)) };
  const price = buyPrice(p.level);
  if (price === null) return { ...p, error: 'levels above 5 are earned in Auto match games, not bought' };
  return { level: p.level + 1, xp: p.xp, paid: price };
}

// What the Progress box shows: "3 of 10 top-3 finishes to level 4".
export function progressLine(progress) {
  const level = clampLevel(progress?.level), xp = Math.max(0, Math.floor(Number(progress?.xp) || 0));
  if (level >= MAX_LEVEL) return { level, max: true, text: `Level ${MAX_LEVEL}: the top, for now` };
  const need = needFor(level), what = level === 9 ? 'first-place wins' : 'top-3 finishes';
  return { level, xp, need, text: `${xp} of ${need} ${what} to level ${level + 1}` };
}
