// Special gear (Cody, 2026-10-01, his handwritten page; mockups/gear.js), as rules and on the real match referee. Every effect is
// an assertion, then stacking, the Present Box's level rules over many seeds, and everything through a host handover.
// Run: node tests/gear.test.mjs
import assert from 'node:assert/strict';
import { createSim, K } from '../mockups/sim.js';
import { GEAR, GEAR_KINDS, effectsOf, heldWith, resolvePresent, gearIn, gearAllowed, gearMask, gearOfMask, statOf, NO_STACK_NOTE } from '../mockups/gear.js';
import { cleanAvatar, ITEMS, GEAR_SLOTS } from '../mockups/catalog.js';
import { levelInfo } from '../mockups/levels.js';

// a seeded rand (the first value is dropped: for small seeds it is always near 0, which would pick the same gear every time)
const seeded = (s) => { const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; r(); return r; };

// ---------- 1. The table, as rules
const fx = (...k) => effectsOf(k);
for (const k of ['pumpkin', 'kevlar', 'heated']) assert.equal(fx(k).extraHits, 1, `${k}: +1 hit`);
assert.equal(fx('santa').extraHits, 2, 'Santa Costume: +2 hits');
assert.equal(fx('bag').heldMult, 1.5, 'Santa Bag: +50% held'); assert.equal(fx('backpack').heldMult, 1.25, 'Backpack: +25% held');
assert.equal(fx('satchel').refillMult, 1.25, 'Elf Satchel: 25% faster'); assert.equal(fx('shoes').speedMult, 1.25, 'Elf Shoes: +25% speed');
assert.deepEqual([fx('elfhat').size, fx('elfhat').hitMult], [0.5, 2], 'Elf Hat: half size, 2× effect');
assert.deepEqual(fx(), { extraHits: 0, heldMult: 1, refillMult: 1, speedMult: 1, size: 1, hitMult: 1 }, 'no gear: nothing changes');
// NO STACKING (Cody, 2026-10-01: "Can't stack same stat"): a second gear of a stat already counted adds nothing; different stats combine
assert.equal(fx('bag', 'backpack').heldMult, 1.5, 'Santa Bag + Backpack: only the Santa Bag counts'); assert.equal(fx('pumpkin', 'santa').extraHits, 1, 'Pumpkin + Santa: only the Pumpkin counts');
{ const f = fx('bag', 'shoes'); assert.ok(f.heldMult === 1.5 && f.speedMult === 1.25, 'different stats combine: +50% held and +25% speed'); }
for (const [a, b, same] of [['bag', 'backpack', true], ['pumpkin', 'kevlar', true], ['heated', 'santa', true], ['bag', 'shoes', false], ['elfhat', 'pumpkin', false], ['satchel', 'shoes', false]])
  assert.equal(statOf(a) === statOf(b), same, `${a} + ${b} ${same ? 'share' : "don't share"} a stat`);
assert.ok(GEAR_KINDS.every((k) => k === 'present' ? statOf(k) === null : !!statOf(k)), 'every gear has one stat; Present Box takes its pick\'s');
assert.ok(/same stat/.test(NO_STACK_NOTE), 'the note the Special Gear tab shows');
assert.equal(fx('bag', 'bag').heldMult, 1.5, 'the same gear twice counts once');
// round UP (Cody), with no float noise on whole numbers
assert.deepEqual([heldWith(5, fx('bag')), heldWith(5, fx('backpack')), heldWith(8, fx('backpack')), heldWith(4, fx('bag', 'backpack')), heldWith(12, fx('bag', 'backpack')), heldWith(7, fx())], [8, 7, 10, 6, 18, 7]);
// level rules: Santa Costume from level 3
assert.equal(gearAllowed('santa', 2), false); assert.equal(gearAllowed('santa', 3), true); assert.equal(gearAllowed('nope', 10), false);
// the snapshot code goes both ways, and the order is fixed (a reorder would swap players' gear mid-match)
for (const k of GEAR_KINDS) if (k !== 'present') assert.deepEqual(gearOfMask(gearMask([k])), [k]);
assert.deepEqual(GEAR_KINDS, ['pumpkin', 'kevlar', 'heated', 'santa', 'present', 'bag', 'satchel', 'shoes', 'elfhat', 'backpack'], 'GEAR_KINDS order never changes');
assert.ok(GEAR_KINDS.every((k) => GEAR[k]) && Object.keys(GEAR).length === GEAR_KINDS.length);

// ---------- 2. Slots: cleanAvatar and gearIn
const item = (kind) => ITEMS.find((i) => i.gear === kind).id;
assert.deepEqual(GEAR_SLOTS, ['g1', 'g2']);
{ const c = cleanAvatar({ g1: item('bag'), g2: item('bag') }); assert.deepEqual([c.g1, c.g2], [item('bag'), 'gear_none'], 'the same gear can\'t fill two slots'); }
{ const c = cleanAvatar({ g1: 'shirt_red', g2: 'gear_nope' }); assert.deepEqual([c.g1, c.g2], ['gear_none', 'gear_none'], 'unknown or wrong slot → empty'); }
{ const c = cleanAvatar({}); assert.deepEqual([c.g1, c.g2], ['gear_none', 'gear_none'], 'missing → empty'); }
{ const c = cleanAvatar({ g1: 'gear_none', g2: 'gear_none', sb1: 'sb_none' }); assert.deepEqual([c.g1, c.g2], ['gear_none', 'gear_none'], 'empty slots can repeat'); }
const two = { g1: item('kevlar'), g2: item('shoes') };
assert.deepEqual(gearIn(two, 7), ['kevlar'], 'levels 1–7: one gear slot'); assert.deepEqual(gearIn(two, 8), ['kevlar', 'shoes'], 'level 8: two');
assert.deepEqual(gearIn({ g1: item('pumpkin'), g2: item('shoes') }, 8), ['shoes'], 'the retired Pumpkin Costume (2026-10-03) is never worn, even if still in a slot');
assert.deepEqual(gearIn({ g1: item('santa') }, 2), [], 'Santa Costume below level 3: not worn'); assert.deepEqual(gearIn({ g1: item('santa') }, 3), ['santa']);
assert.deepEqual(gearIn({ g1: item('present') }, 1), ['present'], 'Present Box is resolved by the referee, not here');
assert.deepEqual(gearIn({ g1: item('bag'), g2: item('backpack') }, 8), ['bag'], 'no stacking: a second gear of the same stat is left out');
assert.deepEqual(gearIn({ g1: item('bag'), g2: item('shoes') }, 8), ['bag', 'shoes'], 'different stats: both');

// ---------- 3. Present Box: one random OTHER gear the level allows, never itself, never Santa below 3, never a doubled gear
{ const seen = { 1: new Set(), 3: new Set(), 8: new Set() };
  for (let s = 1; s <= 3000; s++) for (const lv of [1, 3, 8]) {
    const other = lv === 8 ? ['bag'] : [], got = resolvePresent(['present', ...other], lv, seeded(s));
    assert.equal(got.length, 1 + other.length, 'exactly one gear in its place'); const pick = got.find((k) => !other.includes(k));
    assert.ok(pick && pick !== 'present', 'never a Present Box'); assert.ok(!other.length || statOf(pick) !== statOf(other[0]), `no stacking: never ${pick} next to ${other[0]}`); assert.ok(gearAllowed(pick, lv), `level ${lv} allows ${pick}`);
    assert.ok(!other.includes(pick), 'never the gear in the other slot'); seen[lv].add(pick);
    assert.deepEqual(resolvePresent(['present', ...other], lv, seeded(s)), got, 'same seed, same gear');
  }
  assert.ok(!seen[1].has('santa'), 'never Santa Costume below level 3'); assert.equal(seen[1].size, 6, 'level 1: all 6 others come up');
  assert.ok(!Object.values(seen).some((s) => s.has('heated') || s.has('pumpkin')), 'never the retired Heated Coat (Cody 2026-10-02) or Pumpkin Costume (2026-10-03)');
  assert.ok(seen[3].has('santa') && seen[3].size === 7, 'level 3+: Santa Costume can come up (7: all but the retired Heated Coat and Pumpkin Costume)'); assert.ok(!seen[8].has('bag'), 'level 8 with a Santa Bag: never a 2nd bag'); }

// ---------- 4. On the referee
// Players a, b, c (bots parked far away); `gear` and `lv` say what each wears and their level.
function match({ gear = {}, lv = {}, seed = 7 } = {}) {
  const rand = seeded(seed), lev = (e) => lv[e.peer] || 1;
  const sim = createSim(rand, { startOf: (e) => levelInfo(lev(e)).start, levelOf: lev, gearOf: (e) => gear[e.peer] || [] });
  sim.syncRoster(['a', 'b', 'c', 'd', 'e', 'f']); sim.startMatch('ffa');
  for (const e of sim.S.ents) if (e.bot) { e.x = 50; e.z = 50; }
  const P = (p) => sim.S.ents.find((e) => e.peer === p);
  const put = (p, x, z) => { const e = P(p); e.x = x; e.z = z; e.vx = e.vz = 0; e.stun = 0; e.cool = 0; e.immune = 0; };
  let q = 0; const thr = (p, x, z, sp = '') => { const e = P(p); sim.setReport(p, { q: ++q + (p.charCodeAt(0) * 1e6), ep: e.ep, x: e.x, z: e.z, vx: 0, vz: 0, f: 0, t: (e.lastTh ?? 0) + 1, ax: x, az: z, sp }); };
  for (const p of ['a', 'b', 'c']) sim.setReport(p, { q: p.charCodeAt(0) * 1e6, ep: P(p).ep, x: P(p).x, z: P(p).z, t: 0 });
  const run = (s) => { for (let t = 0; t < s; t += 0.05) { sim.step(0.05); for (const e of sim.S.ents) if (e.bot) { e.x = 50; e.z = 50; } } };
  // a throws a plain snowball straight at b, 5 away (both off the pedestal, so nobody grabs the hat); returns b's stun afterwards
  const shoot = () => { m0.put('a', 5, 0); m0.put('b', 5, 5); m0.thr('a', 5, 5); m0.run(0.6); return m0.P('b').stun; };
  const m0 = { sim, P, put, thr, run }; return { ...m0, shoot };
}

// Extra hits: Pumpkin Costume takes 2 snowballs to knock down; scoring is the same on every hit; all come back after each stun.
{ const m = match({ gear: { b: ['kevlar'] } }); const b = m.P('b'), a = m.P('a'); b.score = 10;
  assert.equal(b.xh, 1, 'starts with 1 extra hit');
  assert.equal(m.shoot(), 0, '1st hit: not knocked down'); assert.equal(b.xh, 0, 'the extra hit is gone');
  assert.deepEqual([a.score, b.score], [5, 9], 'still +5 for the thrower and −1 for b');
  assert.ok(m.shoot() > 0, '2nd hit: knocked down'); assert.ok(b.stun <= K.STUN, 'a normal 0.9 s stun'); assert.deepEqual([a.score, b.score], [10, 8]);
  m.run(1); assert.equal(b.stun <= 0 && b.xh, 1, 'after the stun the extra hit is back');
  assert.equal(m.shoot(), 0, 'and absorbs the next hit again (all game)'); }
{ const m = match({ gear: { b: ['santa'] }, lv: { b: 3 } }); assert.equal(m.P('b').xh, 2);
  assert.equal(m.shoot(), 0); assert.equal(m.shoot(), 0); assert.ok(m.shoot() > 0, 'Santa Costume: the 3rd hit knocks down'); }
{ const m = match({ gear: { b: ['santa'] }, lv: { b: 2 } }); assert.ok(m.shoot() > 0, 'Santa Costume at level 2: not worn, the 1st hit knocks down'); }
{ const m = match({ gear: { b: ['kevlar'] } }); m.sim.S.hat.st = 'head'; m.sim.S.hat.holder = m.P('b').id;
  m.shoot(); assert.equal(m.sim.S.hat.holder, m.P('b').id, 'a hit that only takes an extra hit leaves the hat on');
  m.shoot(); assert.notEqual(m.sim.S.hat.holder, m.P('b').id, 'the knock-down knocks it off'); }
{ const m = match({ gear: { b: ['kevlar'] } }); m.shoot(); assert.equal(m.P('b').xh, 0); m.sim.S.time = 0.01;
  if (K.ROUNDS > 1) { m.run(K.BREAK_TIME + 0.2); assert.equal(m.sim.S.round, 2); assert.equal(m.P('b').xh, 1, 'a new round starts with every extra hit'); }
  else { m.run(0.2); assert.equal(m.sim.S.phase, 'end', 'one round (Cody 2026-10-03): the match ends when the round does'); } }

// Elf Hat: stun twice as long (normal and Ice Ball), half size; a hit still takes just ONE extra hit (Cody, 2026-10-01).
{ const m = match({ gear: { b: ['elfhat'] } }); const s = m.shoot(); assert.ok(s > K.STUN && s <= 2 * K.STUN, `Elf Hat: ${s.toFixed(2)} s of ${2 * K.STUN}`); }
{ const rand = seeded(1);
  const sim = createSim(rand, { gearOf: (e) => (e.peer === 'b' ? ['elfhat'] : []), specialsOf: (e) => (e.peer === 'a' ? ['ice'] : []), startOf: () => 12 });
  sim.syncRoster(['a', 'b', 'c', 'd']); sim.startMatch('ffa'); const A = sim.S.ents.find((e) => e.peer === 'a'), B = sim.S.ents.find((e) => e.peer === 'b');
  for (const e of sim.S.ents) { e.x = 50; e.z = 50; e.immune = 0; } Object.assign(A, { x: 0, z: 0, cool: 0 }); Object.assign(B, { x: 0, z: 5, vx: 0, vz: 0 });
  sim.setReport('a', { q: 1, ep: A.ep, x: 0, z: 0, t: 0 }); sim.setReport('a', { q: 2, ep: A.ep, x: 0, z: 0, t: 1, ax: 0, az: 5, sp: 'ice' });
  for (let t = 0; t < 0.6; t += 0.05) sim.step(0.05); assert.ok(B.stun > 3.4 && B.stun <= 4, `Ice Ball on an Elf Hat: ${B.stun.toFixed(2)} s of 4`); }
{ const m = match({ gear: { b: ['elfhat', 'santa'] }, lv: { b: 8 } });
  assert.equal(m.shoot(), 0, 'Elf Hat + Santa: the 1st hit takes one extra hit'); assert.equal(m.P('b').xh, 1); assert.equal(m.shoot(), 0, 'the 2nd takes the other');
  const s = m.shoot(); assert.ok(s > K.STUN && s <= 2 * K.STUN, 'the 3rd knocks down, for twice as long'); }
{ const m = match({ gear: { b: ['elfhat', 'kevlar'] }, lv: { b: 8 } }); assert.equal(m.shoot(), 0, 'Elf Hat + Kevlar Vest: the 1st hit only takes the extra hit (Cody: still 2 hits)'); assert.ok(m.shoot() > 0, 'the 2nd knocks down'); }
for (const [gear, want] of [[[], true], [['elfhat'], false]]) { // a snowball passing 0.45 to the side: hits a full-size player, misses a half-size one
  const m = match({ gear: { b: gear } }); m.put('a', 0, 0); m.put('b', 0.45, 6); m.thr('a', 0, 6); m.run(0.6);
  assert.equal(m.P('b').stun > 0, want, `${gear.length ? 'Elf Hat' : 'no gear'}: 0.45 off the line ${want ? 'hits' : 'misses'}`); }
for (const d of [3, 6, 10]) { const m = match({ gear: { b: ['elfhat'] } }); m.put('a', 0, 0); m.put('b', 0, d); m.thr('a', 0, d); m.run(1); assert.ok(m.P('b').stun > 0, `an aimed throw from ${d} still hits a half-size player`); }

// Snowballs held: the level's count × (1 + bonus), rounded up; refills to that; bots stay at 4.
{ const m = match({ gear: { b: ['bag'], c: ['bag', 'backpack'] }, lv: { c: 8 } });
  assert.deepEqual([m.P('a').max, m.P('b').max, m.P('c').max], [5, 8, 15], 'level 1: 5; + Santa Bag: 8; level 8 + Bag + Backpack: 15 (no stacking: only the Bag, 10 × 1.5)');
  assert.deepEqual(m.P('c').gear, ['bag'], 'the referee leaves the second same-stat gear off');
  assert.equal(m.P('b').ammo, 8, 'starts full');
  m.put('b', 0, 0); m.P('b').ammo = 5; m.run(10); assert.equal(m.P('b').ammo, 8, 'refills up to the bigger count'); }
// Snowball Rain needs a FULL counter, and a Santa Bag makes the counter bigger (so it uses all of the bigger counter).
{ const rand = seeded(2); const sim = createSim(rand, { startOf: () => 8, levelOf: () => 5, specialsOf: (e) => (e.peer === 'a' ? ['rain'] : []), gearOf: (e) => (e.peer === 'a' ? ['bag'] : []) });
  sim.syncRoster(['a', 'b', 'c', 'd']); sim.startMatch('ffa'); const A = sim.S.ents.find((e) => e.peer === 'a'); A.cool = 0;
  assert.equal(A.max, 12); sim.setReport('a', { q: 1, ep: A.ep, x: A.x, z: A.z, t: 0 }); sim.setReport('a', { q: 2, ep: A.ep, x: A.x, z: A.z, t: 1, ax: 0, az: 0, sp: 'rain' });
  assert.equal(A.ammo, 0, 'Rain with a Santa Bag uses the whole (12) counter'); }

// Elf Satchel: snowballs come back 25% faster (one every 2.2 s → every 1.76 s, away from the piles).
for (const [gear, want] of [[[], 2.2], [['satchel'], 2.2 / 1.25]]) {
  const m = match({ gear: { b: gear } }); m.put('b', 0, 0); const b = m.P('b'); b.ammo = 0; b.regen = 0; let t = 0;
  while (b.ammo === 0 && t < 5) { m.sim.step(0.01); t += 0.01; m.put('b', 0, 0); }
  assert.ok(Math.abs(t - want) < 0.03, `${gear[0] || 'no gear'}: a snowball back after ${t.toFixed(2)} s (want ${want.toFixed(2)})`);
}
// Elf Shoes: the referee lets the player run 25% faster; without them the same report is slowed to the normal top speed.
for (const [gear, top] of [[[], K.HUMAN_SPEED * 1.05], [['shoes'], K.HUMAN_SPEED * 1.25 * 1.05]]) {
  const m = match({ gear: { b: gear } }); const b = m.P('b'); m.put('b', 0, 5); const v = K.HUMAN_SPEED * 1.25;
  m.sim.setReport('b', { q: 5e9, ep: b.ep, x: 0, z: 5, vx: v, vz: 0, t: b.lastTh });
  assert.ok(Math.abs(b.vx - Math.min(v, top)) < 1e-9, `${gear[0] || 'no gear'}: speed ${b.vx.toFixed(2)}`);
}

// Present Box on the referee: resolved once at match start with the referee's rand: same seed, same gear; never itself;
// level rules; and a new match rolls again.
{ const picks = new Set();
  for (let s = 1; s <= 300; s++) { const a = match({ gear: { b: ['present'] }, seed: s }), b = match({ gear: { b: ['present'] }, seed: s });
    const g = a.P('b').gear; assert.equal(g.length, 1); assert.notEqual(g[0], 'present'); assert.notEqual(g[0], 'santa', 'level 1: never Santa');
    assert.deepEqual(b.P('b').gear, g, 'same seed, same gear'); picks.add(g[0]); }
  assert.equal(picks.size, 6, 'every gear level 1 allows comes up'); assert.ok(!picks.has('heated') && !picks.has('pumpkin'), 'never the retired Heated Coat or Pumpkin Costume'); }
{ const m = match({ gear: { b: ['present'] } }); const first = m.P('b').gear[0]; let changed = false;
  for (let i = 0; i < 20 && !changed; i++) { m.sim.startMatch('ffa'); changed = m.P('b').gear[0] !== first; } assert.ok(changed, 'each match rolls again'); }
{ const sim = createSim(seeded(3), { levelOf: () => 10, gearOf: () => ['santa', 'bag'] }); sim.syncRoster(['a']); sim.startMatch('ffa'); const bots = sim.S.ents.filter((e) => e.bot);
  assert.ok(bots.length >= 3 && bots.every((e) => e.gear.length === 0 && e.max === 4 && e.xh === 0), 'bots never get gear (even if asked), and keep 4 snowballs'); }

// ---------- 5. Host handover: the new host keeps the old host's gear (even a Present Box's pick, never re-rolled), extra hits
// left, the bigger counter, and the snapshot round-trips exactly. The heir's own gearOf says something else on purpose.
{ const m = match({ gear: { b: ['kevlar', 'bag'], c: ['present'] }, lv: { b: 8 }, seed: 11 });
  m.shoot(); assert.equal(m.P('b').xh, 0); m.P('b').ammo = 13;
  const snap = JSON.parse(JSON.stringify(m.sim.snapshot()));
  const heir = createSim(seeded(99), { startOf: (e) => levelInfo(e.peer === 'b' ? 8 : 1).start, levelOf: (e) => (e.peer === 'b' ? 8 : 1), gearOf: () => ['shoes'] });
  assert.ok(heir.load(snap));
  const B = heir.S.ents.find((e) => e.peer === 'b'), C = heir.S.ents.find((e) => e.peer === 'c');
  assert.deepEqual(B.gear, ['kevlar', 'bag']); assert.equal(B.xh, 0, 'the used extra hit stays used'); assert.equal(B.max, 15, 'level 8 + Santa Bag: 15 kept');
  assert.equal(B.ammo, 13, 'ammo above the level\'s 10 is kept (the past load() bug class)'); assert.deepEqual(C.gear, m.P('c').gear, 'the Present Box\'s pick, not a re-roll');
  assert.equal(JSON.stringify({ ...heir.snapshot(), s: 0, c: 0 }), JSON.stringify({ ...snap, s: 0, c: 0 }), 'snapshot → load → snapshot is identical');
  // and the effects work on the new host: b's next hit knocks down, then the extra hit comes back
  for (const e of heir.S.ents) { e.x = 50; e.z = 50; e.immune = 0; } const A = heir.S.ents.find((e) => e.peer === 'a'); Object.assign(A, { x: 0, z: 0, cool: 0, stun: 0 }); Object.assign(B, { x: 0, z: 5, stun: 0 });
  heir.setReport('a', { q: 9e9, ep: A.ep, x: 0, z: 0, t: 0 }); heir.setReport('a', { q: 9e9 + 1, ep: A.ep, x: 0, z: 0, t: 1, ax: 0, az: 5 }); for (let t = 0; t < 0.6; t += 0.05) heir.step(0.05);
  assert.ok(B.stun > 0, 'knocked down on the new host'); assert.equal(B.xh, 1, 'extra hit back');
  // size: only gear wearers carry 2 more numbers
  const rows = snap.E; assert.ok(rows.filter((r) => r.length > 15).length === 2 && rows.every((r) => r.length === 15 || r.length === 17));
}
console.log('OK: special gear: +1/+2 hits (2 or 3 snowballs to knock down, +5/−1 on every hit, hat stays until knocked down, all back after each stun and each round), Elf Hat (2× stun, a hit still takes just 1, half size but aimed throws hit), Santa Bag/Backpack (round up, refill to it, Rain uses it all), Elf Satchel 25% faster, Elf Shoes 25% faster, Santa Costume level 3+, no stacking (two gear of the same stat: only the first counts; different stats combine), Present Box never itself/Santa below 3/a doubled gear, same seed same pick, bots none, all through a host handover (exact round trip)');
