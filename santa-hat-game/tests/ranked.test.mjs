// Ranked points: the Play page's rules, checked on worked cases and 20,000 random matches.
import assert from 'node:assert/strict';
import { settleRanked, applyPoints } from '../mockups/ranked.js';

const P = (id, score, bot = false) => ({ id, score, bot });
let r = settleRanked([P('a', 90), P('b', 40), P('c', 10, true)]);
assert.deepEqual([r.pot, r.prizes, r.points], [30, [30], { a: 30, b: -5 }], '3 players: 1st takes the whole pot');
r = settleRanked([P('a', 90), P('b', 80), P('c', 70), P('d', 60), P('e', 50, true), P('f', 5), P('g', 1, true), P('h', 0)]);
assert.deepEqual([r.pot, r.prizes], [80, [48, 16, 16]], '8 players · pot 80, as the Play page shows');
assert.deepEqual(r.points, { a: 48, b: 16, c: 16, d: -5, f: -5, h: -5 });
r = settleRanked([P('bot1', 99, true), P('a', 50), P('b', 40), P('c', 30)]);
assert.deepEqual(r.points, { a: 8, b: 8, c: -5 }, 'a bot can take 1st; its 24 just isn\'t paid out');
r = settleRanked([P('a', 50), P('b', 50), P('c', 10), P('d', 5)]);
assert.deepEqual(r.points, { a: 16, b: 16, c: 8, d: -5 }, 'a tie for 1st shares 1st + 2nd (24 + 8 = 32 → 16 each)');
r = settleRanked([P('a', 50), P('b', 20), P('c', 20), P('d', 20), P('e', 1)]);
assert.deepEqual(r.points, { a: 30, b: 7, c: 7, d: 6, e: -5 }, 'three tied for 2nd share 2nd + 3rd (10 + 10 = 20 → 7, 7, 6)');
assert.equal(applyPoints(3, -5), 0, 'never below 0'); assert.equal(applyPoints(10, 48), 58);

// Random matches: the paid places add up to the pot exactly; only real players get changes; non-placers lose exactly 5.
for (let k = 0; k < 20000; k++) {
  const n = 3 + Math.floor(Math.random() * 6), players = Array.from({ length: n }, (_, i) => P('p' + i, Math.floor(Math.random() * 6) * 10, Math.random() < 0.35));
  const s = settleRanked(players);
  assert.equal(s.pot, 10 * n);
  const paidOut = players.filter((p) => !p.bot && s.placed.includes(p.id)).reduce((a, p) => a + s.points[p.id], 0);
  assert.ok(Object.keys(s.points).every((id) => !players.find((p) => p.id === id).bot), 'bots get no points');
  for (const p of players) if (!p.bot && !s.placed.includes(p.id)) assert.equal(s.points[p.id], -5);
  assert.ok(paidOut <= s.pot && s.prizes.reduce((a, b) => a + b, 0) === s.pot, 'the places add up to the pot exactly; real players never get more');
}
console.log('OK: ranked points: pots, 1st-takes-all at 3 or fewer, 60/20/20 at 4+, bots place but aren\'t paid, ties split, −5, floor at 0');
