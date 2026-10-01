// Levels (Cody, 2026-10-01): the table from his notes exactly; 5 top-3 Auto match finishes per level (9 → 10: 10 FIRST-place wins); buy up to level 5
// ($1 each for 2–4, $5 for 5); max 10. Run: node tests/levels.test.mjs
import assert from 'node:assert/strict';
import { LEVELS, MAX_LEVEL, levelInfo, buyPrice, afterMatch, afterBuy, countsForLevels, progressLine } from '../mockups/levels.js';

// 1. Cody's handwritten table, row for row (level: starting snowballs, special ball slots, special gear slots)
const CODY = [[1, 5, 1, 1], [2, 6, 1, 1], [3, 7, 1, 1], [4, 7, 2, 1], [5, 8, 2, 1], [6, 9, 2, 1], [7, 10, 2, 1], [8, 10, 3, 2], [9, 11, 3, 2], [10, 12, 3, 2]];
for (const [lv, start, sb, gear] of CODY) assert.deepEqual(LEVELS[lv], { start, sb, gear }, `level ${lv} matches Cody's table`);
assert.equal(Object.keys(LEVELS).length, MAX_LEVEL);
// Nothing ever goes down as you level up.
for (let lv = 2; lv <= MAX_LEVEL; lv++) for (const k of ['start', 'sb', 'gear']) assert.ok(LEVELS[lv][k] >= LEVELS[lv - 1][k], `${k} never drops (level ${lv})`);
assert.deepEqual(levelInfo(0), LEVELS[1]); assert.deepEqual(levelInfo(99), LEVELS[10]); assert.deepEqual(levelInfo('x'), LEVELS[1]);

// 2. Earning: only top 3 in an Auto match counts; exactly 5 per level; 45 from level 1 to 10; then it stops.
const AUTO = { auto: true }, PRIVATE = { auto: false }, PRACTICE = { auto: true, practice: true };
assert.ok(countsForLevels(AUTO) && !countsForLevels(PRIVATE) && !countsForLevels(PRACTICE) && !countsForLevels(null));
let p = { level: 1, xp: 0 };
for (const [place, game] of [[1, PRIVATE], [2, PRACTICE], [4, AUTO], [8, AUTO], [0, AUTO]]) assert.deepEqual(afterMatch(p, place, game), { level: 1, xp: 0, up: false }, `place ${place} ${JSON.stringify(game)} doesn't count`);
let wins = 0, ups = 0;
while (p.level < 9) { const r = afterMatch(p, 1 + (wins % 3), AUTO); wins++; if (r.up) ups++; p = r; assert.ok(wins < 1000); }
assert.equal(wins, 40, '5 top-3 finishes for each of levels 2–9');
// Level 9 → 10 (Cody): 10 FIRST-place wins; 2nd and 3rd don't count there.
assert.deepEqual(afterMatch(p, 2, AUTO), { level: 9, xp: 0, up: false }, 'at level 9, 2nd place does not count');
assert.deepEqual(afterMatch(p, 3, AUTO), { level: 9, xp: 0, up: false }, 'nor 3rd');
assert.equal(progressLine(p).text, '0 of 10 first-place wins to level 10');
let firsts = 0; while (p.level < MAX_LEVEL) { const r = afterMatch(p, 1, AUTO); firsts++; if (r.up) ups++; p = r; assert.ok(firsts < 100); }
assert.equal(firsts, 10, '10 first-place wins from 9 to 10'); assert.equal(ups, 9);
assert.deepEqual(afterMatch(p, 1, AUTO), { level: 10, xp: 0, up: false }, 'level 10 is the top for now');
assert.equal(progressLine(p).max, true);
assert.equal(progressLine({ level: 3, xp: 2 }).text, '2 of 5 top-3 finishes to level 4');

// 3. Buying: $1, $1, $1 for levels 2–4, $5 for level 5 ($8 in all); never above 5; buying keeps progress toward the next level.
assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(buyPrice), [1, 1, 1, 5, null, null, null]);
let b = { level: 1, xp: 3 }, spent = 0;
while (true) { const r = afterBuy(b); if (r.error) break; spent += r.paid; assert.equal(r.xp, 3, 'progress kept'); b = r; }
assert.equal(b.level, 5); assert.equal(spent, 8, 'level 1 → 5 costs $8 in all');
assert.match(afterBuy({ level: 7, xp: 0 }).error, /earned/);
// Bought to 5, then earned: 5 more top-3 finishes (minus the 3 already counted) reach 6.
let e = b; for (let i = 0; i < 2; i++) e = afterMatch(e, 1, AUTO); assert.equal(e.level, 6, 'progress carried through buying');

console.log('OK: levels: Cody\'s table exactly, never drops; 5 top-3 Auto match finishes per level to 9, then 10 FIRST-place wins to 10 (2nd/3rd don\'t count there), then stops; buy to 5 for $8 ($1, $1, $1, $5), progress kept');
