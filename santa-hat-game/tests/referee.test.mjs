// The SERVER REFEREE's rooms (server/referee.js), with fake connections and a fake clock: joining, the 15-second auto start,
// a whole match to the end, the owner-only controls of private rooms, the room caps, and cheats that must get nowhere.
// Run: node referee.test.mjs
import assert from 'node:assert/strict';
import { createReferee, MAX_WATCHERS } from '../server/referee.js';
import { K, PHASES } from '../mockups/sim.js';
import { TEAM_PAUSED } from '../mockups/refcore.js';

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
run(K.ROUNDS * K.ROUND_TIME + (K.ROUNDS - 1) * K.BREAK_TIME + 5); // every round (1 since 2026-10-03), into the end screen
s = a.last('snap').d; assert.equal(PHASES[s.ph], 'end', 'the match ran to the end on the server'); assert.ok(Array.isArray(s.R), 'with a result');
assert.ok(s.E.some((r) => r[11] > 0), 'someone scored');

// --- the live games list: honest (the server makes it), the page's fields
const l = conn('lobby'); l.say({ t: 'board' });
const g = l.last('board').games.find((x) => x.code === 'PF1');
assert.deepEqual(Object.keys(g).sort(), ['code', 'free', 'humans', 'leader', 'lscore', 'mode', 'phase', 'ranked', 'round', 'starts', 'style', 'time', 'variant', 'watchers'].sort());
assert.equal(g.humans, 2); assert.equal(g.phase, 'end'); assert.ok(g.leader, 'names the leader');

// --- private room: only the owner may pick the mode and start; emotes are rate-limited
const o = conn('o'), p = conn('p');
o.say({ t: 'join', code: 'ab12', me: me('owner01') }); t += 10; p.say({ t: 'join', code: 'AB12', me: me('other02') });
run(1);
p.say({ t: 'start' }); run(0.5); assert.equal(PHASES[o.last('snap').d.ph], 'lobby', 'a non-owner cannot start');
p.say({ t: 'mode', mode: 'team' }); run(0.5); assert.equal(o.last('snap').d.md, 0, 'a non-owner cannot change the mode');
o.say({ t: 'mode', mode: 'team' }); run(0.5); assert.equal(o.last('snap').d.md, TEAM_PAUSED ? 0 : 1, TEAM_PAUSED ? 'team play is paused: even the owner gets FFA (Cody 2026-10-03)' : 'the owner can');
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
// --- phase 2: who's who from the database; the server records Auto match finishes itself
{
  let tt = 5_000_000; const finishes = [], PID = '11111111-2222-4333-8444-555555555555', PID2 = '99999999-2222-4333-8444-555555555555';
  const saved = { good: { pid: PID, l: 7, n: 'RealName', a: { sb1: 'sb_ice', g1: 'gear_pumpkin' } }, good2: { pid: PID2, l: 2, n: 'Second', a: {} } };
  const r2 = createReferee({ now: () => tt, identify: async (tok) => saved[tok] || null, finish: async (m) => { finishes.push(m); return { counted: [{ place: m.places.indexOf(PID) + 1, level: 7, xp: 3, up: false }] }; } });
  const c2 = (n) => { const c = { got: [], send: (x) => c.got.push(JSON.parse(x)) }; c.h = r2.connect(c); c.say = (m) => c.h.message(JSON.stringify(m)); c.last = (k) => [...c.got].reverse().find((m) => m.t === k); return c; };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  // run the clock until c's latest snapshot shows the phase (at most 10 minutes of match time)
  const until = (c, ph) => { for (let i = 0; i < 600 * 30 && PHASES[c.last('snap')?.d.ph] !== ph; i++) { tt += 1000 / 30; r2.tick(1 / 30); } };
  const real = c2(), cheat = c2(), twin = c2(), other = c2();
  real.say({ t: 'join', code: 'PF4', token: 'good', me: me('real0001', { n: 'Fake', l: 1 }) }); await settle();
  cheat.say({ t: 'join', code: 'PF4', token: 'forged', me: me('cheat001', { l: 10, pid: PID, a: { sb1: 'sb_ice', sb2: 'sb_sky', g1: 'gear_pumpkin' } }) }); await settle();
  const ps = Object.fromEntries(real.last('peers').ps.map((p) => [p.id, p]));
  assert.deepEqual([ps.real0001.l, ps.real0001.n, ps.real0001.pid, ps.real0001.a.sb1], [7, 'RealName', PID, 'sb_ice'], 'signed in: the SAVED level, name and look');
  assert.deepEqual([ps.cheat001.l, ps.cheat001.pid, ps.cheat001.a.sb1, ps.cheat001.a.sb2, ps.cheat001.a.g1], [1, null, 'sb_none', 'sb_none', 'gear_none'], 'a forged sign-in plays as a plain guest (no claimed level, account, specials or gear)');
  twin.say({ t: 'join', code: 'PF4', token: 'good', me: me('twin0001') }); await settle();
  assert.match(twin.last('err').why, /another tab/, 'one seat per account');
  other.say({ t: 'join', code: 'PF4', token: 'good2', me: me('othr0001') }); await settle();
  until(real, 'play'); until(real, 'end');
  await settle();
  assert.equal(PHASES[real.last('snap').d.ph], 'end');
  assert.equal(finishes.length, 1, 'recorded once per match');
  assert.deepEqual([finishes[0].auto, finishes[0].places.length >= 4, finishes[0].places.filter(Boolean).sort()], [true, true, [PID, PID2].sort()], 'every place, accounts by id (bots and guests as empty places)');
  assert.equal(finishes[0].id, real.last('snap').d.mid);
  // the season's daily tasks (levels.js seasonProgress): each signed-in place carries that player's match counts, bots none
  const f0 = finishes[0];
  assert.equal(f0.stats?.length, f0.places.length, 'one stats entry per place');
  f0.places.forEach((p, i) => assert.ok(p ? ['hits', 'hatSec', 'steals', 'catches', 'specials'].every((k) => Number.isFinite(f0.stats[i][k])) : true, `place ${i + 1}: counts sent (${JSON.stringify(f0.stats[i])})`));
  assert.deepEqual(real.last('counted')?.d, { place: finishes[0].places.indexOf(PID) + 1, level: 7, xp: 3, up: false }, 'the counted player is told');
  assert.equal(cheat.last('counted'), undefined, 'nobody else is');
  // a private room counts nothing
  const pr = c2(); pr.say({ t: 'join', code: 'PRIV9', token: 'good', me: me('priv0001') }); await settle(); pr.say({ t: 'start' });
  until(pr, 'play'); until(pr, 'end');
  await settle(); assert.equal(PHASES[pr.last('snap').d.ph], 'end'); assert.equal(finishes.length, 1, 'private rooms record nothing');
}
console.log('OK: phase 2: saved level/look for signed-in players, forged sign-ins play as guests, one seat per account, Auto match finishes recorded once by the server and told to the player');
// --- Auto match (Cody, 2026-10-02): tick FFA/TEAM and normal/special gear, the server pairs you with the best waiting game
{
  let at = 9_000_000; const r3 = createReferee({ now: () => at, modeAllowed: () => true }); // the team-room logic, as it works when team play is on
  const c3 = () => { const c = { got: [], send: (x) => c.got.push(JSON.parse(x)) }; c.h = r3.connect(c); c.say = (m) => c.h.message(JSON.stringify(m)); c.last = (k) => [...c.got].reverse().find((m) => m.t === k); return c; };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const auto = async (id, modes, styles, extra = {}) => { const c = c3(); c.say({ t: 'auto', modes, styles, me: me(id, extra) }); await settle(); return c; };
  const codeOf = (c) => c.last('peers')?.code;
  // nobody waiting: a new room of a ticked type and style
  const a1 = await auto('auto0001', ['team'], ['normal']); assert.equal(codeOf(a1), 'PTN1', 'new TEAM normal room');
  const a2 = await auto('auto0002', ['ffa'], ['gear']); assert.equal(codeOf(a2), 'PFG1', 'new FFA gear room');
  const a3 = await auto('auto0003', ['ffa'], ['gear']); assert.equal(codeOf(a3), 'PFG1', 'joins the waiting FFA gear room');
  // ticking both types and both styles: the waiting room with the MOST players (PFG1 has 2, PTN1 has 1)
  const a4 = await auto('auto0004', ['ffa', 'team'], ['normal', 'gear']); assert.equal(codeOf(a4), 'PFG1', 'both ticked: the fullest waiting room');
  // styles never mix: a normal-only player isn't put in the gear room, though it's fuller
  const a5 = await auto('auto0005', ['ffa', 'team'], ['normal']); assert.equal(codeOf(a5), 'PTN1', 'normal play only: the normal room');
  // in a normal-play room the server strips special snowballs and gear (the look stays)
  const n1 = a5.last('peers').ps.find((p) => p.id === 'auto0005');
  const fancy = await auto('auto0006', ['team'], ['normal'], { a: { shirt: 'shirt_red', sb1: 'sb_ice', g1: 'gear_pumpkin' }, l: 9 });
  const f1 = fancy.last('peers').ps.find((p) => p.id === 'auto0006');
  assert.deepEqual([f1.a.shirt, f1.a.sb1, f1.a.g1], ['shirt_red', 'sb_none', 'gear_none'], 'normal play: look kept, specials and gear stripped by the server');
  const g6 = await auto('auto0007', ['ffa'], ['gear'], { a: { sb1: 'sb_ice' }, l: 9 });
  assert.equal(g6.last('peers').ps.find((p) => p.id === 'auto0007').a.sb1, 'sb_ice', 'special gear rooms keep them');
  // a match being played is never picked: PFG1 starts; the next FFA gear player gets a new room
  for (let i = 0; i < 20 * 30; i++) { at += 1000 / 30; r3.tick(1 / 30); }
  assert.notEqual(PHASES[a2.last('snap').d.ph], 'lobby', 'PFG1 started');
  const late = await auto('auto0008', ['ffa'], ['gear']); assert.equal(codeOf(late), 'PFG2', 'not dropped into a running match');
  // the games list says each room's style
  const lst = c3(); lst.say({ t: 'board' }); const byCode = Object.fromEntries(lst.last('board').games.map((x) => [x.code, x.style]));
  assert.deepEqual([byCode.PTN1, byCode.PFG2], ['normal', 'gear']);
}
// TEAM PLAY PAUSED (Cody 2026-10-03), as the live server runs: ticking only TEAM gets an FFA room, and a TEAM room code plays FFA
if (TEAM_PAUSED) {
  let t4 = 9_500_000; const r4 = createReferee({ now: () => t4 });
  const c4 = () => { const c = { got: [], send: (x) => c.got.push(JSON.parse(x)) }; c.h = r4.connect(c); c.say = (m) => c.h.message(JSON.stringify(m)); c.last = (k) => [...c.got].reverse().find((m) => m.t === k); return c; };
  const t1 = c4(); t1.say({ t: 'auto', modes: ['team'], styles: ['gear'], me: me('paus0001') }); await new Promise((r) => setTimeout(r, 0));
  assert.equal(t1.last('peers')?.code, 'PFG1', 'team play paused: TEAM-only tick gets an FFA room');
  const t2 = c4(); t2.say({ t: 'join', code: 'ptg1', me: me('paus0002') }); await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 30; i++) { t4 += 33; r4.tick(1 / 30); } // the server's clock runs: snapshots go out
  const snap2 = t2.last('snap')?.d;
  assert.ok(snap2 && snap2.md === 0, `a TEAM room code plays FFA while paused (snapshot mode ${snap2?.md})`);
  console.log('OK: team play paused: TEAM ticks and TEAM room codes play FFA');
}
console.log('OK: Auto match: ticked types and styles, fullest waiting room first, styles never mix, normal play strips specials and gear on the server, running matches never picked');
console.log('OK: server referee: rooms by the server clock, auto start, a full match to the end, moves checked, fakes ignored, honest games list, owner-only controls, caps');

// --- AUTO MATCH TOGETHER (Cody 2026-10-03): a friends' room's host takes the group into a public Auto match. The server
// picks a public room with seats for ALL of them, holds those seats 20 s, and tells everyone where to go; a stranger can't
// take a held seat; holds run out; only the host, before a match, can do it.
{ let tt = 9_000_000; const r5 = createReferee({ now: () => tt });
  const c5 = (id) => { const c = { got: [], send: (x) => c.got.push(JSON.parse(x)) }; c.h = r5.connect(c); c.say = (m) => c.h.message(JSON.stringify(m)); c.last = (k) => [...c.got].reverse().find((m) => m.t === k); c.id = id; return c; };
  // a public room with 5 strangers already waiting (3 seats left)
  const strangers = Array.from({ length: 5 }, (_, i) => c5('strngr' + i));
  strangers.forEach((c, i) => { tt += 10; c.say({ t: 'join', code: 'PFG1', me: me(c.id) }); });
  // a friends' room of 3
  const host = c5('host001'), f1 = c5('frnd001'), f2 = c5('frnd002');
  for (const c of [host, f1, f2]) { tt += 10; c.say({ t: 'join', code: 'FRND42', me: me(c.id) }); }
  f1.say({ t: 'together', modes: ['ffa'], styles: ['gear'] });
  assert.ok(/host/.test(f1.last('err')?.why || ''), 'only the host can take the group');
  host.say({ t: 'together', modes: ['ffa'], styles: ['gear'] });
  const go = host.last('goto');
  assert.ok(go && go.code === 'PFG1' && f1.last('goto')?.code === 'PFG1' && f2.last('goto')?.code === 'PFG1', `everyone is sent to the waiting public room with exactly 3 seats left (${JSON.stringify(go)})`);
  const board5 = () => r5.board().find((g) => g.code === 'PFG1');
  assert.equal(board5().free, 0, 'the games list shows it full: 5 waiting + 3 held');
  // a stranger tries to take a held seat; Auto match doesn't offer the room either
  const s6 = c5('strngr6'); s6.say({ t: 'join', code: 'PFG1', me: me('strngr6') });
  assert.ok(/full/.test(s6.last('err')?.why || ''), 'a stranger can\'t take a held seat');
  const s7 = c5('strngr7'); s7.say({ t: 'auto', modes: ['ffa'], styles: ['gear'], me: me('strngr7') });
  assert.notEqual(s7.last('peers')?.code, 'PFG1', 'Auto match sends a stranger elsewhere');
  // the group arrives (each leaves the friends' room and joins with the normal join)
  for (const c of [host, f1, f2]) { c.h.gone(); const n = c5(c.id); tt += 10; n.say({ t: 'join', code: 'PFG1', me: me(c.id) }); assert.equal(n.last('peers')?.code, 'PFG1', `${c.id} takes its held seat`); }
  assert.equal(board5().humans, 8, 'all 8 seated');
  // a group bigger than any waiting room's free seats gets a fresh room; holds run out after 20 s
  const big = Array.from({ length: 4 }, (_, i) => c5('big00' + i));
  big.forEach((c) => { tt += 10; c.say({ t: 'join', code: 'BIG777', me: me(c.id) }); });
  big[0].say({ t: 'together', modes: ['ffa'], styles: ['gear'] });
  const bigTo = big[0].last('goto')?.code;
  assert.ok(bigTo && bigTo !== 'PFG1', `a group of 4 goes to a room with 4 free seats (${bigTo})`);
  { const g = r5.board().find((x) => x.code === bigTo); assert.equal(g ? g.free : 4, 8 - (g ? g.humans : 0) - 4, `its 4 seats held (${g ? g.humans : 0} already there)`); }
  tt += 21_000; const late = c5('strngr9'); late.say({ t: 'join', code: bigTo, me: me('strngr9') });
  assert.equal(late.last('peers')?.code, bigTo, 'after 20 s the holds are gone: the seats are free again'); }
console.log('OK: Auto match together: the host only; a public room with seats for the whole group; seats held 20 s (no stranger takes them, Auto match skips the room, the games list shows them taken); the group takes them; bigger groups get a fresh room');

// --- WEEKLY MODE ROOMS (weekly.js): a player who ticks this week's mode gets a PW room playing it; plain FFA never lands there
{ const { weeklyAt } = await import('../mockups/weekly.js');
  let tt = 12_000_000_000; const r6 = createReferee({ now: () => tt });
  const c6 = (id) => { const c = { got: [], send: (x) => c.got.push(JSON.parse(x)) }; c.h = r6.connect(c); c.say = (m) => c.h.message(JSON.stringify(m)); c.last = (k) => [...c.got].reverse().find((m) => m.t === k); return c; };
  const w1 = c6(); w1.say({ t: 'auto', modes: ['weekly'], styles: ['gear'], me: me('weekly01') });
  const code = w1.last('peers')?.code;
  assert.equal(code, 'PWG1', `this week's mode: a weekly room (${code})`);
  const g = r6.board().find((x) => x.code === code);
  assert.equal(g.variant, weeklyAt(tt), `the games list says which mode (${g.variant})`);
  assert.equal(r6.rooms.get(code).sim.S.variant, weeklyAt(tt), 'its match plays that mode');
  const f1 = c6(); f1.say({ t: 'auto', modes: ['ffa'], styles: ['gear'], me: me('plainff1') });
  assert.equal(f1.last('peers')?.code, 'PFG1', 'a plain Free-for-all player goes to a plain room');
  const w2 = c6(); w2.say({ t: 'auto', modes: ['weekly'], styles: ['gear'], me: me('weekly02') });
  assert.equal(w2.last('peers')?.code, 'PWG1', 'the next weekly player joins the waiting weekly room');
  const both = c6(); both.say({ t: 'auto', modes: ['ffa', 'weekly'], styles: ['gear'], me: me('either01') });
  assert.ok(['PWG1', 'PFG1'].includes(both.last('peers')?.code), 'ticking both: the fullest waiting room of either kind'); }
console.log('OK: weekly mode rooms: PW rooms play this week\'s mode, listed with it; only players who ticked it go there');
