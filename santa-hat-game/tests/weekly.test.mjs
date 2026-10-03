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
// --- HAT HUNT: three hats; every hat on a head scores; one hat per head; a hit knocks off the RIGHT hat; kept through a handover;
// a full 8-player match keeps it all true every frame and its snapshots stay under the 4 KiB cap
{ const sim = match('hathunt'), [a, b] = sim.S.ents, H = sim.S.hats;
  assert.equal(H.length, 3, 'three hats'); assert.equal(H[0], sim.S.hat, 'the first is the gazebo hat');
  assert.deepEqual(H.map((h) => h.st), ['ped', 'ground', 'ground'], 'one on the gazebo, two on the ground');
  // a walks onto the first extra hat, b onto the second: both wear one and both score
  run(sim, 0.2, () => { park(a, H[1].x, H[1].z); park(b, H[2].x, H[2].z); });
  assert.deepEqual([H[1].holder, H[2].holder], [a.id, b.id], 'each picks up the hat they walk onto');
  const s0 = [a.score, b.score];
  run(sim, 3.05, () => { park(a, -9, -6); park(b, 9, -6); });
  assert.deepEqual([a.score - s0[0], b.score - s0[1]], [3 * PTS.hatSec, 3 * PTS.hatSec], 'every hat on a head scores 10 a second');
  // a walks to the gazebo wearing a hat: can't take a second one
  run(sim, 0.3, () => { park(a, 1.6, 0); park(b, 9, -6); });
  assert.equal(H[0].st, 'ped', 'one hat per head: the gazebo hat stays put');
  assert.equal(H.filter((h) => h.holder === a.id).length, 1, 'a still wears exactly one');
  // a hit knocks off a's hat, and only a's
  const mine = H.find((h) => h.holder === a.id); a.immune = 0; a.xh = 0;
  sim.S.balls.push({ id: 999, owner: b.id, sm: 1, kind: '', r: 1, stunSec: 0, g: 0, age: 0, x: a.x - 0.5, y: 1.2, z: a.z, vx: 18, vy: 0, vz: 0, life: 2 });
  run(sim, 0.1, () => park(b, 9, -6));
  assert.ok(mine.st === 'air' && H.find((h) => h.holder === b.id), 'the hit knocks the hat off a into the air; b keeps theirs');
  // a page taking over as host keeps all three hats where they are
  const snap = sim.snapshot(), s2 = createSim(rand); s2.load(snap);
  assert.deepEqual(s2.S.hats.map((h) => [h.st, h.holder]), H.map((h) => [h.st, h.holder]), 'a new host keeps every hat');
  assert.equal(match(null).snapshot().X, undefined, 'a plain match sends no extra hats'); }
{ const sim = createSim(rand, { variant: 'hathunt' }); sim.syncRoster(Array.from({ length: 8 }, (_, i) => 'pppppppppppp' + i)); sim.startMatch('ffa');
  let big = 0;
  for (let f = 0; f < 60 * 30; f++) {
    for (const e of sim.S.ents) if (!e.bot && f % 20 === 0) { e.x += (rand() - 0.5) * 3; e.z += (rand() - 0.5) * 3; }
    sim.step(1 / 30);
    const worn = sim.S.hats.filter((h) => h.st === 'head').map((h) => h.holder);
    if (new Set(worn).size !== worn.length) throw new Error('a player wears two hats at frame ' + f);
    if (sim.S.hats.length !== 3) throw new Error('hats lost');
    if (sim.S.ents.some((e) => e.score < 0)) throw new Error('negative score');
    big = Math.max(big, JSON.stringify(sim.snapshot()).length);
  }
  assert.ok(big < 4096, `snapshots under 4 KiB with three hats (${big} bytes)`); }
// --- the rotation
{ const weeks = Array.from({ length: 6 }, (_, i) => weeklyAt(Date.UTC(2026, 9, 7) + i * 7 * 86400e3, ROTATION));
  assert.deepEqual(weeks, [0, 1, 2, 3, 4, 5].map((i) => ROTATION[(i + 1) % ROTATION.length]), `one mode a week, in order: ${weeks.join(', ')}`);
  assert.ok(!ROTATION.includes('hathunt'), 'Hat Hunt stays out of the rotation until it is built');
  const ws = weekStart(Date.UTC(2026, 9, 7)); assert.equal(weeklyAt(ws, ROTATION), weeklyAt(ws + 6.9 * 86400e3, ROTATION), 'the same mode all week');
  assert.notEqual(weeklyAt(ws - 1000, ROTATION), weeklyAt(ws, ROTATION), 'and it changes at the week\'s start (Sunday 9 PM Indiana)'); }
// --- switched off (supabase/034, the admin screen): none on → no weekly mode; one on → that one every week
{ const t0 = Date.UTC(2026, 9, 7); assert.equal(weeklyAt(t0, []), null, 'all switched off: no weekly mode');
  for (let i = 0; i < 4; i++) assert.equal(weeklyAt(t0 + i * 7 * 86400e3, ['gazebo']), 'gazebo', 'only the Gazebo on: the Gazebo every week');
  assert.equal(weeklyAt(t0, ['hathunt']), null, 'Hat Hunt switched on but not built: still no weekly mode'); }
console.log('OK: Hat Hunt: three hats, each on a head scores, one hat per head, a hit knocks off the right hat, kept through a handover, an 8-player match stays true every frame under 4 KiB');
console.log('OK: weekly modes: Hot Hat (double hat points, a snowball melts every 2 s, never below 0), King of the Gazebo (5 a second alone in the ring, nobody when shared), Blizzard (2× refill), plain unchanged, kept through a host handover, one mode a game week (built modes only)');
