// HOUSE BOTS IN REAL MATCHES (Cody 2026-10-05: "use these bots for real player games too"; server/referee.js assignBots), with fake
// connections and a fake clock: every bot in a room plays as a house bot account (a different one each; one not in another room
// first), every screen is told who (peers.hb: name, look, level), the match's places and stats carry their accounts to the levels
// code, and in RANKED they win/lose points while still putting in a bot's 5. No house bots known: the old bots, as before.
// Run: node tests/referee-housebots.test.mjs
import assert from 'node:assert/strict';
import { createReferee } from '../server/referee.js';
import { PHASES } from '../mockups/sim.js';

const HB = Array.from({ length: 6 }, (_, i) => ({ id: `00000000-0000-4000-8000-00000000000${i}`, name: ['frostbyte', 'Kaylee_x', 'mikey2012', 'ghostpepper', 'TannerB', 'Icicle'][i], avatar: { hat: 'hat_red' }, level: 1 + i }));
let t = 1_000_000;
const finishes = [];
const ref = createReferee({ now: () => t, houseBots: async () => HB, finish: async (m) => { finishes.push(m); return { counted: [] }; } });
const settle = () => new Promise((r) => setTimeout(r, 5));
const conn = () => { const c = { got: [], send: (s) => c.got.push(JSON.parse(s)), close() {} }; c.h = ref.connect(c); c.say = (m) => c.h.message(JSON.stringify(m)); c.last = (k) => [...c.got].reverse().find((m) => m.t === k); return c; };
const run = (secs, dt = 1 / 30) => { for (let i = 0; i < secs / dt; i++) { t += dt * 1000; ref.tick(dt); } };

ref.tick(1 / 30); await settle(); // the house bot list is read
const a = conn(); a.say({ t: 'join', code: 'pf1', me: { id: 'alice01', n: 'Alice', j: 0, a: {}, l: 1, pid: '11111111-1111-4111-8111-111111111111' } });
run(1);
let hb = a.last('peers').hb, bots = a.last('snap').d.E.filter((r) => r[2] === 1);
assert.ok(bots.length >= 2, 'the room has bots');
assert.equal(hb.length, bots.length, 'every bot is told to the screen as a house bot: ' + JSON.stringify(hb.map((x) => x[1])));
assert.ok(hb.every(([id, n, av, l]) => bots.some((r) => r[0] === id) && HB.some((b) => b.name === n && b.level === l) && av?.hat === 'hat_red'), 'with its name, look and level');
assert.equal(new Set(hb.map((x) => x[1])).size, hb.length, 'a different house bot for each bot');
// a second room prefers house bots not already playing in the first
const b = conn(); b.say({ t: 'join', code: 'pf2', me: { id: 'bobby02', n: 'Bob', j: 0, a: {}, l: 1 } }); run(1);
const inA = new Set(hb.map((x) => x[1])), inB = b.last('peers').hb.map((x) => x[1]);
assert.ok(inB.every((n) => !inA.has(n)), `room 2 gets house bots not in room 1 while there are free ones (${[...inA]} | ${inB})`);
// the match ends: places and stats carry the house bots' accounts
run(16 + 10 + 70 + 15);
const fin = finishes.find((m) => m.places.includes('11111111-1111-4111-8111-111111111111'));
assert.ok(fin, 'the match was reported');
const houseIds = fin.places.filter((p) => HB.some((b) => b.id === p));
assert.equal(houseIds.length, bots.length, 'every house bot is in the places, by its account (so its level and games count)');
assert.ok(fin.places.every((p, i) => !HB.some((b) => b.id === p) || fin.stats[i]), 'with its throws and hits');
// no house bots known: the old way (no names sent, nothing recorded for bots)
const plain = createReferee({ now: () => t }), pc = { got: [], send: (s) => pc.got.push(JSON.parse(s)), close() {} }; plain.connect(pc).message(JSON.stringify({ t: 'join', code: 'pf3', me: { id: 'carol03', n: 'C', j: 0, a: {}, l: 1 } }));
for (let i = 0; i < 30; i++) { t += 33; plain.tick(1 / 30); }
assert.deepEqual(pc.got.filter((m) => m.t === 'peers').at(-1).hb, [], 'no house bots: none named, as before');
console.log(`OK: house bots in real matches: every bot plays as a different house bot (name, look, level on every screen), free ones first across rooms, their places and stats recorded to their accounts (${PHASES.length} phases ran)`);
