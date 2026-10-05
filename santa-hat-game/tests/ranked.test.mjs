// Ranked points: the Play page's rules, checked on worked cases and 20,000 random matches.
import assert from 'node:assert/strict';
import { settleRanked, applyPoints } from '../mockups/ranked.js';

const P = (id, score, bot = false, level = 5) => ({ id, score, bot, level });
// the pot (Cody 2026-10-04, to-do #14): 2 points per level of each player (level 1 = 2 … level 10 = 20), 5 per bot
let r = settleRanked([P('a', 90, false, 1), P('b', 40, false, 1), P('c', 10, true)]);
assert.deepEqual([r.pot, r.prizes, r.points], [9, [9], { a: 9, b: -5 }], '3 players (two level 1s + a bot): pot 2+2+5, 1st takes it all');
r = settleRanked([P('a', 90), P('b', 80), P('c', 70), P('d', 60), P('e', 50, true), P('f', 5), P('g', 1, true), P('h', 0)]);
assert.deepEqual([r.pot, r.prizes], [70, [42, 14, 14]], '8 players (six level 5s, two bots): pot 6×10 + 2×5 = 70, 60/20/20');
assert.deepEqual(r.points, { a: 42, b: 14, c: 14, d: -5, f: -5, h: -5 });
// Cody: "if a low level is playing higher levels they get rewarded better and vice versa"
assert.equal(settleRanked([P('low', 90, false, 1), P('hi1', 50, false, 10), P('hi2', 40, false, 10)]).points.low, 42, 'a level 1 beating two level 10s wins 2+20+20 = 42');
assert.equal(settleRanked([P('hi', 90, false, 10), P('lo1', 50, false, 1), P('lo2', 40, false, 1)]).points.hi, 24, 'a level 10 beating two level 1s wins 20+2+2 = 24');
r = settleRanked([P('bot1', 99, true), P('a', 50, false, 3), P('b', 40, false, 3), P('c', 30, false, 3)]);
assert.deepEqual([r.pot, r.prizes, r.points], [23, [15, 4, 4], { a: 4, b: 4, c: -5 }], "a bot can take 1st; its 15 just isn't paid out (leftover point to 1st)");
r = settleRanked([P('a', 50), P('b', 50), P('c', 10), P('d', 5)]);
assert.deepEqual(r.points, { a: 16, b: 16, c: 8, d: -5 }, 'a tie for 1st shares 1st + 2nd (24 + 8 = 32 → 16 each)');
r = settleRanked([P('a', 50), P('b', 20), P('c', 20), P('d', 20), P('e', 1)]);
assert.deepEqual(r.points, { a: 30, b: 7, c: 7, d: 6, e: -5 }, 'three tied for 2nd share 2nd + 3rd (10 + 10 = 20 → 7, 7, 6)');
assert.equal(settleRanked([{ id: 'x', score: 1 }, { id: 'y', score: 0 }]).pot, 4, 'no level known = level 1 (2 points)');
assert.equal(settleRanked([P('a', 1, false, 99), P('b', 0, false, -3)]).pot, 22, 'levels are clamped to 1..10');
const max = settleRanked(Array.from({ length: 8 }, (_, i) => P('m' + i, 8 - i, false, 10)));
assert.deepEqual([max.pot, max.points.m0], [160, 96], 'the most a match can give: 8 level 10s, pot 160, 1st 96 (the database allows 100)');
assert.equal(applyPoints(3, -5), 0, 'never below 0'); assert.equal(applyPoints(10, 48), 58);

// Random matches: the paid places add up to the pot exactly; only real players get changes; non-placers lose exactly 5.
for (let k = 0; k < 20000; k++) {
  const n = 3 + Math.floor(Math.random() * 6), players = Array.from({ length: n }, (_, i) => P('p' + i, Math.floor(Math.random() * 6) * 10, Math.random() < 0.35, 1 + Math.floor(Math.random() * 10)));
  const s = settleRanked(players);
  assert.equal(s.pot, players.reduce((t, p) => t + (p.bot ? 5 : 2 * p.level), 0));
  assert.ok(Object.values(s.points).every((c) => Math.abs(c) <= 100), 'every change fits the database (±100)');
  const paidOut = players.filter((p) => !p.bot && s.placed.includes(p.id)).reduce((a, p) => a + s.points[p.id], 0);
  assert.ok(Object.keys(s.points).every((id) => !players.find((p) => p.id === id).bot), 'bots get no points');
  for (const p of players) if (!p.bot && !s.placed.includes(p.id)) assert.equal(s.points[p.id], -5);
  assert.ok(paidOut <= s.pot && s.prizes.reduce((a, b) => a + b, 0) === s.pot, 'the places add up to the pot exactly; real players never get more');
}
console.log('OK: ranked points: pot = 2 per level + 5 per bot, 1st-takes-all at 3 or fewer, 60/20/20 at 4+, bots place but aren\'t paid, ties split, −5, floor at 0');
