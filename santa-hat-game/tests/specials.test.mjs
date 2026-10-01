// Special snowballs, hat immunity and −1 per hit (Cody, 2026-10-01, his handwritten pages), on the real match referee.
// Each rule from the page is checked directly, then everything survives a host handover. Run: node tests/specials.test.mjs
import assert from 'node:assert/strict';
import { createSim, K, HAT_IMMUNE } from '../mockups/sim.js';
import { SPECIALS } from '../mockups/specials.js';

let seed = 3; const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
// A match with players a, b, c and no bots in the way (bots only fill empty spots); a holds every special, b none.
function match(opts = {}) {
  const lv = { a: 10, b: 1, c: 1, ...(opts.levels || {}) };
  const sim = createSim(rand, { startOf: () => 12, specialsOf: (e) => (e.peer === 'a' ? Object.keys(SPECIALS) : []), levelOf: (e) => lv[e.peer] || 1 });
  sim.syncRoster(['a', 'b', 'c', 'd', 'e', 'f']); sim.startMatch('ffa');
  for (const e of sim.S.ents) if (e.bot) { e.x = 50; e.z = 50; } // bots parked out of the way (outside every snowball's reach)
  const P = (p) => sim.S.ents.find((e) => e.peer === p);
  const put = (p, x, z) => { const e = P(p); e.x = x; e.z = z; e.vx = e.vz = 0; e.stun = 0; e.cool = 0; e.immune = 0; };
  let q = 0; const thr = (p, x, z, sp = '') => { const e = P(p); sim.setReport(p, { q: ++q + (p.charCodeAt(0) * 1e6), ep: e.ep, x: e.x, z: e.z, vx: 0, vz: 0, f: 0, t: (e.lastTh ?? 0) + 1, ax: x, az: z, sp }); };
  for (const p of ['a', 'b', 'c']) sim.setReport(p, { q: p.charCodeAt(0) * 1e6, ep: P(p).ep, x: P(p).x, z: P(p).z, t: 0 }); // each player's throw counter starts
  const run = (s) => { for (let t = 0; t < s; t += 0.05) { sim.step(0.05); for (const e of sim.S.ents) if (e.bot) { e.x = 50; e.z = 50; } } };
  return { sim, P, put, thr, run };
}

// 1. Costs come off the counter; only what's in a player's slots can be thrown; bots and empty slots throw nothing special.
for (const kind of ['ice', 'split', 'giant', 'fire', 'sky']) {
  const m = match(); m.put('a', 0, 0); const before = m.P('a').ammo; m.thr('a', 0, 6, kind); m.sim.step(0.01);
  assert.equal(before - m.P('a').ammo, SPECIALS[kind].cost, `${kind} uses ${SPECIALS[kind].cost}`);
}
{ const m = match(); m.put('b', 0, 0); const before = m.P('b').ammo; m.thr('b', 0, 6, 'ice'); m.sim.step(0.01);
  assert.equal(m.P('b').ammo, before, 'not in your slots: refused, nothing used'); assert.equal(m.sim.S.balls.length, 0); }

// 2. Ice Ball: a 2-second stun (a normal hit stays 0.9 s).
{ const m = match(); m.put('a', 0, 0); m.put('b', 0, 5); m.thr('a', 0, 5, 'ice'); m.run(0.6);
  assert.ok(m.P('b').stun > 1.4 && m.P('b').stun <= 2, `Ice Ball stun ${m.P('b').stun.toFixed(2)} s left of 2`); }
{ const m = match(); m.put('a', 0, 0); m.put('b', 0, 5); m.thr('a', 0, 5); m.run(0.6); assert.ok(m.P('b').stun > 0 && m.P('b').stun <= K.STUN, 'normal hit: 0.9 s'); }
// 3. Fire Ball: 2× speed.
{ const m = match(); m.put('a', 0, 0); m.thr('a', 0, 10, 'fire'); m.sim.step(0.01); const b = m.sim.S.balls[0];
  assert.ok(Math.abs(Math.hypot(b.vx, b.vz) - 2 * K.BALL_SPEED) < 1e-6, 'Fire Ball flies at 2× speed'); }
// 4. Giant Ball: 3× the size, so it hits someone a normal ball would miss.
for (const [kind, want] of [['', false], ['giant', true]]) {
  const m = match(); m.put('a', 0, 0); m.put('b', 1.2, 6); m.thr('a', 0, 6, kind); m.run(0.6);
  assert.equal(m.P('b').stun > 0, want, `${kind || 'normal'} ball 1.2 off the line: ${want ? 'hits' : 'misses'}`);
}
// 5. Split Ball: 3 pieces after 1 second, fanning out; one player is hit by one piece at most.
{ const m = match(); m.put('a', 0, 0); m.thr('a', 0, 12, 'split'); m.run(1.02);
  const pieces = m.sim.S.balls.filter((b) => b.kind === 'piece'); assert.equal(pieces.length, 3, 'three pieces after 1 s');
  const dirs = pieces.map((b) => Math.atan2(b.vx, b.vz)).sort(); assert.ok(dirs[2] - dirs[0] > 0.5, 'fanned out');
  m.put('b', pieces[1].x, pieces[1].z + 0.3); const g = pieces[0].g; for (const p of pieces) { p.x = m.P('b').x; p.z = m.P('b').z; p.y = 1.2; } // all three on b at once
  const sBefore = m.P('a').score; m.sim.step(0.01);
  assert.equal(m.sim.S.gh[g].filter((id) => id === m.P('b').id).length, 1, 'b hit by one piece only'); assert.equal(m.P('a').score - sBefore, 5, 'scored once'); }
// 6. Sky Ball: 2 waves landing around where it was aimed; someone standing there is hit; the thrower is safe.
{ const m = match(); m.put('a', -8, 0); m.put('b', 6, 0); m.put('c', 6.5, 0.5); m.thr('a', 6, 0, 'sky'); m.sim.step(0.01);
  assert.equal(m.sim.S.drops.length, SPECIALS.sky.waves * SPECIALS.sky.perWave, '2 waves of snowballs');
  assert.ok(m.sim.S.drops.every((p) => Math.hypot(p.x - 6, p.z) <= SPECIALS.sky.radius + 1e-9), 'all around where it was aimed');
  m.run(0.9); assert.equal(m.P('b').stun, 0, 'nothing lands before the first wave');
  let hits = 0; for (let t = 0; t < 1.2 && !hits; t += 0.05) { for (const p of ['b', 'c']) { const e = m.P(p); e.x = p === 'b' ? 6 : 6.5; e.z = p === 'b' ? 0 : 0.5; } m.run(0.05); hits = ['b', 'c'].filter((p) => m.P(p).stun > 0).length; }
  assert.ok(hits >= 1, 'someone standing where it was aimed is hit'); assert.equal(m.P('a').stun, 0, 'the thrower is never hit'); }
// 7. Snowball Rain: level 5+, a FULL counter, uses it all, rains on the whole ring for 3 s.
{ const m = match({ levels: { a: 4 } }); m.put('a', 0, 0); m.thr('a', 0, 0, 'rain'); m.sim.step(0.01); assert.equal(m.P('a').ammo, 12, 'level 4: refused, nothing used'); }
{ const m = match(); m.put('a', 0, 0); m.P('a').ammo = 11; m.thr('a', 0, 0, 'rain'); m.sim.step(0.01); assert.equal(m.P('a').ammo, 11, 'not full: refused'); }
{ const m = match(); m.put('a', 0, 0); m.thr('a', 0, 0, 'rain'); m.sim.step(0.01);
  assert.equal(m.P('a').ammo, 0, 'uses the whole counter'); const n = m.sim.S.drops.length; assert.ok(n >= 30 && n <= 60, `${n} snowballs over 3 s`);
  assert.ok(m.sim.S.drops.every((p) => Math.hypot(p.x, p.z) <= K.ARENA + 1e-9), 'all inside the ring');
  const t = m.sim.S.drops.map((p) => p.t); assert.ok(Math.max(...t) - Math.min(...t) > 2.5, 'spread over 3 seconds'); }

// 8. Hat immunity: after getting the hat, 2 s fully untouchable (even standing in a crowd), then hittable again.
{ const m = match(); m.put('b', 0, 1); m.put('a', 0, -4);
  m.sim.S.hat.st = 'ped'; m.P('b').x = 0; m.P('b').z = 0.5; m.run(0.1); assert.equal(m.sim.S.hat.holder, m.P('b').id, 'b took the hat');
  assert.ok(m.P('b').immune > HAT_IMMUNE - 0.2, 'immune');
  m.thr('a', 0, 0.5); m.run(0.5); assert.equal(m.P('b').stun, 0, 'a snowball passes through while immune'); assert.equal(m.sim.S.hat.holder, m.P('b').id, 'and the hat stays');
  m.run(1.6); m.P('a').cool = 0; m.thr('a', m.P('b').x, m.P('b').z); m.run(0.5); assert.ok(m.P('b').stun > 0, 'after 2 s a snowball hits again'); }

// 9. Getting hit costs 1 point; never below 0; the thrower still gets +5.
{ const m = match(); m.put('a', 0, 0); m.put('b', 0, 5); m.P('b').score = 1; m.thr('a', 0, 5); m.run(0.6);
  assert.equal(m.P('b').score, 0, '1 → 0'); assert.equal(m.P('a').score, 5, 'thrower +5');
  m.run(1.2); m.P('a').cool = 0; m.put('b', 0, 5); m.thr('a', 0, 5); m.run(0.6); assert.equal(m.P('b').score, 0, 'stops at 0'); }

// 10. Throwing restarts the refill timer (no snowball handed straight back after a throw from a full counter).
{ const m = match(); m.put('a', 0, 0); m.run(3); assert.equal(m.P('a').ammo, 12); m.thr('a', 0, 6); m.sim.step(0.01); assert.equal(m.P('a').ammo, 11, 'a full counter does not refill the moment you throw'); }

// 11. A host handover keeps specials in flight, falling snowballs and immunity.
{ const m = match(); m.put('a', 0, 0); m.thr('a', 0, 12, 'giant'); m.thr('a', 3, 3, 'sky'); m.sim.S.ents.find((e) => e.peer === 'b').immune = 1.5; m.sim.step(0.01);
  const heir = createSim(rand, { startOf: () => 12 }); heir.load(m.sim.snapshot());
  assert.equal(heir.S.balls[0].kind, 'giant'); assert.equal(heir.S.balls[0].r, 3); assert.equal(heir.S.drops.length, m.sim.S.drops.length);
  assert.ok(heir.S.ents.find((e) => e.peer === 'b').immune > 0, 'immunity survives'); }
console.log('OK: special snowballs (costs, slots only, Ice 2 s, Fire 2×, Giant 3×, Split 3 pieces one hit each, Sky 2 waves, Rain level 5 + full counter), hat immunity 2 s, −1 per hit (floor 0), refill restarts on a throw, all through a host handover');
