// Ranked matchmaking: every match follows the rules, nobody is matched twice, and nobody waits forever.
import assert from 'node:assert/strict';
import { formMatches, widthAfter, botsFor, RULES } from '../mockups/matchmaker.js';

assert.deepEqual([widthAfter(0), widthAfter(9.9), widthAfter(10), widthAfter(19), widthAfter(20)], [50, 50, 150, 150, Infinity]);
assert.deepEqual([2, 3, 4, 5, 6, 7].map((r) => botsFor(r)), [3, 3, 2, 1, 1, 1]);

// Worked cases.
let r = formMatches([{ id: 'a', points: 100, since: 0 }, { id: 'b', points: 130, since: 1 }], 5);
assert.equal(r.matches.length, 0, 'two players at 5 s: keep looking for more');
r = formMatches([{ id: 'a', points: 100, since: 0 }, { id: 'b', points: 130, since: 1 }], 30);
assert.deepEqual(r.matches, [{ players: ['a', 'b'], bots: 3 }], 'at 30 s: start with bots');
r = formMatches([{ id: 'a', points: 100, since: 0 }, { id: 'b', points: 400, since: 0 }], 15);
assert.equal(r.matches.length, 0, '300 points apart at 15 s: not yet');
r = formMatches([{ id: 'a', points: 100, since: 0 }, { id: 'b', points: 400, since: 0 }], 30);
assert.equal(r.matches.length, 1, 'at 30 s: any real player');
r = formMatches([{ id: 'solo', points: 0, since: 0 }], 300);
assert.equal(r.matches.length, 0, 'one real player alone never starts a ranked match (needs 2)');
const seven = Array.from({ length: 9 }, (_, i) => ({ id: 'p' + i, points: 1000 + i * 3, since: 0 }));
r = formMatches(seven, 1);
assert.equal(r.matches[0].players.length, 7, 'seven close players start right away (full room with 1 bot)');
assert.equal(r.matches[0].bots, 1); assert.equal(r.queue.length, 2);

// Random traffic for 2 simulated hours: check every match, and how long people wait.
let queue = [], seq = 0, waits = [], checked = 0, strandedWithCompany = 0;
for (let t = 0; t < 7200; t++) {
  const arrivals = Math.random() < 0.15 ? 1 + Math.floor(Math.random() * 3) : 0;
  for (let k = 0; k < arrivals; k++) queue.push({ id: 'u' + seq++, points: Math.round(Math.max(0, 500 + (Math.random() - 0.5) * 1200)), since: t });
  const out = formMatches(queue, t);
  const seen = new Set();
  for (const m of out.matches) {
    const real = m.players.length, total = real + m.bots;
    assert.ok(real >= RULES.minReal && real <= RULES.maxReal, `real players ${real}`);
    assert.ok(m.bots >= RULES.minBots && m.bots <= RULES.maxBots, `bots ${m.bots}`);
    assert.ok(total >= 3 && total <= 8, `total ${total}`);
    const ps = m.players.map((id) => queue.find((p) => p.id === id));
    const oldest = Math.min(...ps.map((p) => p.since)), width = widthAfter(t - oldest);
    const spread = Math.max(...ps.map((p) => p.points)) - Math.min(...ps.map((p) => p.points));
    assert.ok(spread <= 2 * width, `points spread ${spread} within the search width ${width}`);
    for (const id of m.players) { assert.ok(!seen.has(id), 'matched twice'); seen.add(id); }
    ps.forEach((p) => waits.push(t - p.since)); checked++;
  }
  queue = out.queue;
  if (queue.length >= 2 && queue.some((p) => t - p.since > RULES.botsAt)) strandedWithCompany++;
}
waits.sort((a, b) => a - b);
assert.equal(strandedWithCompany, 0, 'nobody waits past 30 s while another real player is searching');
console.log(`OK: ${checked} matches checked; wait median ${waits[waits.length >> 1]} s, longest ${waits.at(-1)} s; nobody left waiting past 30 s with company`);
