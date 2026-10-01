// Special snowballs in the match referee (mockups/sim.js): the Ice Ball (catalog.js rules.stun 1.5) knocks a player down
// 50% longer than a normal snowball (0.9 s → 1.35 s); the rule rides on the ball through a host handover. (sim.js also caps a rule at 3×; not tested here.)
import assert from 'node:assert/strict';
import { createSim, K } from '../mockups/sim.js';
import { ballRules, BY_ID } from '../mockups/catalog.js';

// Player a throws one snowball at player b, standing still 4 m away. Returns how long b is knocked down.
function stunFromOneThrow(snowItem, { handover = false } = {}) {
  const make = () => createSim(Math.random, { rulesOf: (e) => (e.peer === 'a' ? ballRules({ snow: snowItem }) : {}) });
  let sim = make(); sim.syncRoster(['a', 'b']); sim.startMatch('ffa');
  for (let i = 0; i < 400 && sim.S.phase !== 'play'; i++) sim.step(1 / 30);
  const quiet = () => sim.S.ents.forEach((e) => { if (e.bot) { e.cool = 99; e.ammo = 0; } }); // bots don't throw in this test
  const A = () => sim.S.ents.find((e) => e.peer === 'a'), B = () => sim.S.ents.find((e) => e.peer === 'b');
  quiet(); Object.assign(A(), { x: 0, z: 0, vx: 0, vz: 0, stun: 0, cool: 0, ammo: 6 }); Object.assign(B(), { x: 4, z: 0, vx: 0, vz: 0, stun: 0 });
  sim.setReport('a', { q: 1, t: 0, ep: A().ep, x: 0, z: 0 }); sim.setReport('a', { q: 2, t: 1, ep: A().ep, x: 0, z: 0, ax: 4, az: 0 });
  assert.equal(sim.S.balls.length, 1, 'one snowball thrown');
  if (handover) { const snap = JSON.parse(JSON.stringify(sim.snapshot())); sim = make(); assert.ok(sim.load(snap)); quiet(); } // a new host takes over mid-flight
  for (let i = 0; i < 60; i++) { Object.assign(B(), { x: 4, z: 0 }); sim.step(1 / 60); if (B().stun > 0) return B().stun + 1 / 60; }
  return 0;
}
const near = (a, b) => Math.abs(a - b) < 0.04;
const normal = stunFromOneThrow('snow_white'), ice = stunFromOneThrow('snow_iceball'), iceHandover = stunFromOneThrow('snow_iceball', { handover: true });
assert.ok(near(normal, K.STUN), `a normal snowball stuns ${K.STUN} s (got ${normal.toFixed(2)})`);
assert.ok(near(ice, K.STUN * 1.5), `the Ice Ball stuns 50% longer, ${K.STUN * 1.5} s (got ${ice.toFixed(2)})`);
assert.ok(near(iceHandover, K.STUN * 1.5), `still 50% longer after a host handover mid-flight (got ${iceHandover.toFixed(2)})`);
assert.deepEqual(BY_ID.get('snow_iceball').rules, { stun: 1.5 });
for (const color of ['snow_ice', 'snow_gold', 'snow_ember']) assert.deepEqual(ballRules({ snow: color }), {}, `${color} is colour only`);
console.log(`OK: snowball rules: normal ${normal.toFixed(2)} s, Ice Ball ${ice.toFixed(2)} s (+50%), same after a host handover; colour snowballs unchanged`);
