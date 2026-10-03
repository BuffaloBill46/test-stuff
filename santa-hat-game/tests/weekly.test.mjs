// WEEKLY MODES (Cody, 2026-10-03; mockups/weekly.js rules, sim.js plays them). The real simulation, each rule as an exact
// number: Hot Hat (hat seconds score double, a snowball melts every 2 s worn, never below 0), King of the Gazebo (5 a second
// for the ONE player in the ring, nobody when shared), Blizzard (refill twice as fast); a plain room unchanged; the mode rides
// in snapshots (a new host keeps it); the rotation (one mode a game week, only built modes). Run: node weekly.test.mjs
import assert from 'node:assert/strict';
import { createSim, PTS } from '../mockups/sim.js';
import { VARIANTS, ROTATION, weeklyAt } from '../mockups/weekly.js';
import { weekStart } from '../mockups/gameclock.js';

let seed = 42; const rand = () => ((seed = Math.imul(seed, 1103515245) + 12345 >>> 0) / 4294967296);
const DT = 1 / 30;
// a match with 2 players (no bots), everyone placed by hand
function match(variant) {
  const sim = createSim(rand, { variant }); sim.syncRoster(['aaaaaaaaaaaa1', 'bbbbbbbbbbbb2']);
  sim.startMatch('ffa'); // (starting fills the room with bots)
  sim.S.ents.filter((e) => e.bot).forEach((e) => sim.S.ents.splice(sim.S.ents.indexOf(e), 1)); // then just the two players
  return sim;
}
const run = (sim, secs, each = () => {}) => { for (let i = 0; i < Math.round(secs / DT); i++) { each(); sim.step(DT); } };
const park = (e, x, z) => { e.x = x; e.z = z; e.vx = e.vz = 0; e.since = 9; };

// --- Hot Hat
{ const sim = match('hothat'), [a, b] = sim.S.ents;
  park(b, 9, 9); park(a, 9, -9); a.ammo = 5; a.max = 5;
  Object.assign(sim.S.hat, { st: 'head', holder: a.id, acc: 0, melt: 0 });
  run(sim, 4.05, () => { park(a, 9, -9); park(b, 9, 9); a.regen = 0; });
  assert.equal(a.score, 4 * PTS.hatSec * VARIANTS.hothat.hatMult, `Hot Hat: 4 s worn = ${4 * PTS.hatSec * 2} points (double)`);
  assert.equal(a.ammo, 5 - 2, 'Hot Hat: 2 snowballs melted in 4 s');
  a.ammo = 0; run(sim, 2.5, () => { park(a, 9, -9); a.regen = 0; });
  assert.equal(a.ammo, 0, 'never below 0'); }
// --- plain room: unchanged
{ const sim = match(null), [a, b] = sim.S.ents; park(b, 9, 9); a.ammo = 5; a.max = 5;
  Object.assign(sim.S.hat, { st: 'head', holder: a.id, acc: 0 });
  run(sim, 4.05, () => { park(a, 9, -9); park(b, 9, 9); a.regen = 0; });
  assert.equal(a.score, 4 * PTS.hatSec, 'a plain room: 10 a second'); assert.equal(a.ammo, 5, 'and nothing melts'); }
// --- King of the Gazebo
{ const sim = match('gazebo'), [a, b] = sim.S.ents, Z = VARIANTS.gazebo;
  Object.assign(sim.S.hat, { st: 'head', holder: b.id }); // keep the hat away from the gazebo
  run(sim, 3.05, () => { park(a, 2.2, 0); park(b, 10, 0); });
  const aBefore = a.score;
  assert.equal(aBefore, 3 * Z.zonePts, `alone in the ring: ${Z.zonePts} a second`);
  const bBefore = b.score;
  run(sim, 3.05, () => { park(a, 2.2, 0); park(b, -2.4, 0.5); });
  assert.equal(a.score, aBefore, 'shared ring: nobody scores from it');
  assert.equal(b.score - bBefore, 3 * PTS.hatSec, 'b still scores the hat, nothing from the ring');
  run(sim, 2.05, () => { park(a, 5, 0); park(b, 10, 0); });
  assert.equal(a.score, aBefore, 'outside the ring (5 from the middle): nothing'); }
// --- Blizzard
{ const plain = match(null), bliz = match('blizzard');
  for (const sim of [plain, bliz]) { const a = sim.S.ents[0]; a.ammo = 0; a.max = 20; a.regen = 0; }
  // 7.5 s, away from a refill boundary (each refill restarts its timer, so counts move in whole steps of 1/30 s)
  run(plain, 7.5, () => park(plain.S.ents[0], 0, -11)); run(bliz, 7.5, () => park(bliz.S.ents[0], 0, -11));
  assert.equal(bliz.S.ents[0].ammo, 2 * plain.S.ents[0].ammo, `Blizzard refills twice as fast (${bliz.S.ents[0].ammo} vs ${plain.S.ents[0].ammo})`); }
// --- the mode rides in snapshots: a page taking over as host keeps it
{ const sim = match('gazebo'), snap = sim.snapshot(); const s2 = createSim(rand); assert.ok(s2.load(snap));
  assert.equal(s2.S.variant, 'gazebo', 'a new host keeps the weekly mode'); assert.equal(match(null).snapshot().vr, 0, 'plain: vr 0'); }
// --- the rotation
{ const weeks = Array.from({ length: 6 }, (_, i) => weeklyAt(Date.UTC(2026, 9, 7) + i * 7 * 86400e3));
  assert.deepEqual(weeks, [0, 1, 2, 3, 4, 5].map((i) => ROTATION[(i + 1) % ROTATION.length]), `one mode a week, in order: ${weeks.join(', ')}`);
  assert.ok(!ROTATION.includes('hathunt'), 'Hat Hunt stays out of the rotation until it is built');
  const ws = weekStart(Date.UTC(2026, 9, 7)); assert.equal(weeklyAt(ws), weeklyAt(ws + 6.9 * 86400e3), 'the same mode all week');
  assert.notEqual(weeklyAt(ws - 1000), weeklyAt(ws), 'and it changes at the week\'s start (Sunday 9 PM Indiana)'); }
console.log('OK: weekly modes: Hot Hat (double hat points, a snowball melts every 2 s, never below 0), King of the Gazebo (5 a second alone in the ring, nobody when shared), Blizzard (2× refill), plain unchanged, kept through a host handover, one mode a game week (built modes only)');
