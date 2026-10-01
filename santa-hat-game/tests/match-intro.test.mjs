// The match load screen and countdown (Cody, 2026-10-01): introMatch → 'intro' for INTRO_TIME (5 s) → 'count' for COUNT_TIME
// (5 s) → round 1. In both, the referee refuses every move and throw, bots stand still, the hat stays on its stand, no points;
// the phase and its timer travel in the snapshot (a referee handover mid-countdown carries on from the same second).
// Run: node match-intro.test.mjs
import { createSim, K, PHASES } from '../mockups/sim.js';
let seed = 7; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const fail = (m, x) => { console.error('FAIL:', m, x ? JSON.stringify(x).slice(0, 300) : ''); process.exit(1); };
if (K.INTRO_TIME !== 5 || K.COUNT_TIME !== 5) fail('load screen and countdown are 5 s each', K);
if (PHASES.slice(0, 4).join() !== 'lobby,play,break,end') fail('older phase numbers changed', PHASES);

const sim = createSim(rand); sim.syncRoster(['a', 'b']);
for (let i = 0; i < 60; i++) sim.step(1 / 30); // warm-up
sim.introMatch('ffa'); const S = sim.S;
if (S.phase !== 'intro' || S.time !== 5 || !S.mid || S.round !== 1) fail('introMatch starts the load screen', { ph: S.phase, t: S.time, mid: S.mid });
if (!S.ev.some((e) => e[1] === 'intro')) fail('an intro event');
const spots = S.ents.map((e) => [e.x, e.z, e.ammo]), a = S.ents.find((e) => e.peer === 'a');
let q = 1, t = 0, sawCount = false, hand = null;
while (S.phase === 'intro' || S.phase === 'count') {
  // player a tries to run and to throw every frame
  sim.setReport('a', { q: q++, ep: a.ep, x: a.x + 0.3, z: a.z, vx: 6, vz: 0, t: ++t, ax: 0, az: 0 });
  sim.step(1 / 30);
  if (S.phase === 'count') { sawCount = true; if (!hand && S.time < 2.5) hand = sim.snapshot(); }
  if (S.balls.length || S.drops.length) fail('a snowball was thrown during the ' + S.phase);
  if (S.hat.st !== 'ped') fail('the hat left its stand during the ' + S.phase);
  if (S.ents.some((e, i) => e.x !== spots[i][0] || e.z !== spots[i][1])) fail('someone moved during the ' + S.phase);
  if (S.ents.some((e) => e.score)) fail('points during the ' + S.phase);
}
if (!sawCount) fail('no countdown');
if (S.phase !== 'play' || S.time !== K.ROUND_TIME || !S.ev.some((e) => e[1] === 'round' && e[2] === 1)) fail('round 1 starts after the countdown', { ph: S.phase, t: S.time });
// a handover mid-countdown: the new referee carries on from the same second and the same match
const sim2 = createSim(rand); sim2.load(hand);
if (sim2.S.phase !== 'count' || Math.abs(sim2.S.time - hand.tm) > 1e-9 || sim2.S.mid !== hand.mid) fail('handover keeps the countdown', { ph: sim2.S.phase, t: sim2.S.time });
let n = 0; while (sim2.S.phase === 'count' && n++ < 200) sim2.step(1 / 30);
if (sim2.S.phase !== 'play' || n > Math.ceil(hand.tm * 30) + 2) fail('after a handover the countdown still ends on time', { n });
// startMatch (the rules tests' shortcut) still goes straight to round 1
const sim3 = createSim(rand); sim3.syncRoster(['c']); sim3.startMatch('team'); if (sim3.S.phase !== 'play') fail('startMatch goes straight to play');
console.log('OK: 5 s load screen, 5 s countdown, nobody moves/throws/scores/grabs the hat in either, handover keeps the timer');
