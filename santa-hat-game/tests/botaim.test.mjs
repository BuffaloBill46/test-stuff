// HOUSE BOTS' AIM (Cody 2026-10-05: "bots hit % in game ... range from 10% - 48%"; mockups/sim.js aimOf, AIM_BASE): each house
// bot has its own accuracy, spread evenly from 10% to 48% over all of them, the same bot always the same; and in real simulated
// matches each bot's hit % lands on its own accuracy (a bot throwing wide lobs into open space, so a miss really misses).
// Run: node tests/botaim.test.mjs
import assert from 'node:assert/strict';
import { createSim, aimOf, AIM_MIN, AIM_MAX } from '../mockups/sim.js';

const ids = Array.from({ length: 18 }, (_, i) => `bot-${String(i).padStart(2, '0')}`);
const shots = ids.map((id) => aimOf(id, ids)).sort((a, b) => a - b);
assert.equal(shots[0], AIM_MIN); assert.equal(+shots.at(-1).toFixed(6), AIM_MAX);
assert.equal(AIM_MIN, 0.1); assert.equal(AIM_MAX, 0.48);
assert.equal(aimOf('bot-05', ids), aimOf('bot-05', [...ids].reverse()), 'the same bot gets the same aim whatever order the list comes in');
assert.equal(aimOf('someone-else', ids), 0, 'not a house bot: the standard bot aim');

let seed = 7; const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const TARGETS = [0.1, 0.29, 0.48], tot = new Map(TARGETS.map((t) => [t, { t: 0, h: 0 }]));
for (let g = 0; g < 150; g++) {
  const sim = createSim(rand); sim.syncRoster([]); sim.S.wantBots = 5; sim.startMatch('ffa');
  sim.S.ents.filter((e) => e.bot).forEach((e, i) => { e.hb = true; e.shot = TARGETS[(i + g) % TARGETS.length]; });
  for (let i = 0; i < 30 * 180 && sim.S.phase !== 'end'; i++) sim.step(1 / 30);
  for (const e of sim.S.ents.filter((x) => x.bot)) { const a = tot.get(e.shot); a.t += e.st.thrown; a.h += e.st.hits; }
}
for (const [t, a] of tot) {
  const pct = a.h / a.t;
  assert.ok(a.t > 1500 && Math.abs(pct - t) < 0.035, `a ${Math.round(t * 100)}% bot hit ${(pct * 100).toFixed(1)}% of ${a.t} throws`);
}
console.log('OK: house bots aim from 10% to 48% (fixed per bot); in matches each lands on its own: ' + [...tot].map(([t, a]) => `${Math.round(t * 100)}%→${((100 * a.h) / a.t).toFixed(1)}%`).join(', '));
