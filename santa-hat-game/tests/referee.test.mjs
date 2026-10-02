// The SERVER REFEREE's rooms (server/referee.js), with fake connections and a fake clock: joining, the 15-second auto start,
// a whole match to the end, the owner-only controls of private rooms, the room caps, and cheats that must get nowhere.
// Run: node referee.test.mjs
import assert from 'node:assert/strict';
import { createReferee, MAX_WATCHERS } from '../server/referee.js';
import { K, PHASES } from '../mockups/sim.js';

let t = 1_000_000;
const ref = createReferee({ now: () => t });
const conn = (name) => { const c = { got: [], send: (s) => c.got.push(JSON.parse(s)), close() {} }; c.h = ref.connect(c); c.say = (m) => c.h.message(JSON.stringify(m)); c.last = (k) => [...c.got].reverse().find((m) => m.t === k); c.name = name; return c; };
const run = (secs, dt = 1 / 30) => { for (let i = 0; i < secs / dt; i++) { t += dt * 1000; ref.tick(dt); } };
const me = (id, extra = {}) => ({ id, n: id, j: 0, a: {}, l: 1, ...extra });

// --- an Auto match room: two players, the room starts itself 15 s later, plays three rounds and ends with scores
const a = conn('a'), b = conn('b');
a.say({ t: 'join', code: 'pf1', me: me('alice01') });
t += 50; b.say({ t: 'join', code: 'PF1', me: me('bobby02', { j: -999999 }) }); // claims it joined first: the server's clock decides
assert.deepEqual(a.last('peers').ps.map((p) => p.id), ['alice01', 'bobby02']);
assert.equal(b.last('peers').own, 'alice01', 'the earliest player by the SERVER clock owns the room, whatever a page claims');
run(1);
let s = a.last('snap').d;
assert.equal(s.hid, 'server'); assert.equal(PHASES[s.ph], 'lobby'); assert.ok(s.cd > 13 && s.cd <= 15, 'countdown from 15 s with 2 players: ' + s.cd);
assert.ok(s.E.length >= K.MIN_BODIES, 'bots fill the room');
run(15); assert.equal(PHASES[a.last('snap').d.ph], 'intro', 'started by itself after 15 s');
run(10); assert.equal(PHASES[a.last('snap').d.ph], 'play', 'load screen 5 s + countdown 5 s, then play');
// alice reports moving (a legal walk) → the referee moves her; a teleport report gets nowhere near its target
const alice = () => a.last('snap').d.E.find((r) => r[1] === 'alice01');
const ep = alice()[13], x0 = alice()[4], z0 = alice()[5];
let q = 0;
for (let i = 0; i < 10; i++) { a.say({ t: 'rep', d: { q: ++q, ep, x: x0 + 0.2 * (i + 1), z: z0, vx: 3, vz: 0, f: 0, t: 0, ax: 0, az: 0, sp: '' } }); run(0.1); }
assert.ok(Math.abs(alice()[4] - (x0 + 2)) < 0.6, `a legal walk is followed: ${alice()[4]} vs ${x0 + 2}`);
const before = alice()[4];
a.say({ t: 'rep', d: { q: ++q, ep, x: before - 15, z: z0, vx: 0, vz: 0, f: 0, t: 0, ax: 0, az: 0, sp: '' } }); run(0.1);
assert.ok(Math.abs(alice()[4] - before) < 3, 'a teleport is refused (the referee limits each step)');
// a page sending its own "snapshot" or a score: no such message for players; nothing changes
const scoreBefore = alice()[11];
a.say({ t: 'snap', d: { s: 1e9, E: [[0, 'alice01', 0, 0, 0, 0, 0, 0, 0, 0, 0, 99999]] } }); a.say({ t: 'score', n: 99999 });
run(0.2); assert.ok(alice()[11] < 99999 && alice()[11] >= scoreBefore, 'fake snapshots/scores from a page are ignored');
run(3 * K.ROUND_TIME + 2 * K.BREAK_TIME + 5);
s = a.last('snap').d; assert.equal(PHASES[s.ph], 'end', 'the match ran to the end on the server'); assert.ok(Array.isArray(s.R), 'with a result');
assert.ok(s.E.some((r) => r[11] > 0), 'someone scored');

// --- the live games list: honest (the server makes it), the page's fields
const l = conn('lobby'); l.say({ t: 'board' });
const g = l.last('board').games.find((x) => x.code === 'PF1');
assert.deepEqual(Object.keys(g).sort(), ['code', 'humans', 'leader', 'lscore', 'mode', 'phase', 'ranked', 'round', 'time', 'watchers'].sort());
assert.equal(g.humans, 2); assert.equal(g.phase, 'end'); assert.ok(g.leader, 'names the leader');

// --- private room: only the owner may pick the mode and start; emotes are rate-limited
const o = conn('o'), p = conn('p');
o.say({ t: 'join', code: 'ab12', me: me('owner01') }); t += 10; p.say({ t: 'join', code: 'AB12', me: me('other02') });
run(1);
p.say({ t: 'start' }); run(0.5); assert.equal(PHASES[o.last('snap').d.ph], 'lobby', 'a non-owner cannot start');
p.say({ t: 'mode', mode: 'team' }); run(0.5); assert.equal(o.last('snap').d.md, 0, 'a non-owner cannot change the mode');
o.say({ t: 'mode', mode: 'team' }); run(0.5); assert.equal(o.last('snap').d.md, 1, 'the owner can');
o.say({ t: 'start' }); run(0.5); assert.equal(PHASES[o.last('snap').d.ph], 'intro', 'the owner starts the match');
p.got.length = 0; o.say({ t: 'emote', d: { e: 1 } }); o.say({ t: 'emote', d: { e: 2 } });
assert.equal(p.got.filter((m) => m.t === 'emote').length, 1, 'one emote per 1.2 s');
// the owner leaves: the next player owns it; the last one leaves: the room is gone
o.h.gone(); assert.equal(p.last('peers').own, 'other02');
p.h.gone(); assert.equal(ref.rooms.has('AB12'), false, 'an empty room is removed');

// --- caps: same id twice, 8 players, 4 watchers
const d1 = conn('d1'), d2 = conn('d2');
d1.say({ t: 'join', code: 'CAP1', me: me('dupe0001') }); d2.say({ t: 'join', code: 'CAP1', me: me('dupe0001') });
assert.match(d2.last('err').why, /already in this room/);
for (let i = 2; i <= K.MAX_HUMANS; i++) conn('x').say({ t: 'join', code: 'CAP1', me: me('cap' + String(i).padStart(5, '0')) });
const late = conn('late'); late.say({ t: 'join', code: 'CAP1', me: me('late0001') }); assert.match(late.last('err').why, /full/);
for (let i = 0; i < MAX_WATCHERS; i++) conn('w').say({ t: 'join', code: 'CAP1', me: me('watch' + i + 'xx', { w: true }) });
const w5 = conn('w5'); w5.say({ t: 'join', code: 'CAP1', me: me('watch9xx', { w: true }) }); assert.match(w5.last('err').why, /watchers/);
const bad = conn('bad'); bad.say({ t: 'join', code: 'CAP2', me: me('<script>') }); assert.match(bad.last('err').why, /bad player id/);
bad.h.message('not json'); assert.match(bad.last('err').why, /JSON/);
console.log('OK: server referee: rooms by the server clock, auto start, a full match to the end, moves checked, fakes ignored, honest games list, owner-only controls, caps');
