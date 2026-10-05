// TOURNAMENTS (Cody 2026-10-05; server/tourney.js + server/referee.js; DESIGN_NOTES "TOURNAMENTS"), on the real match server
// code with fake players and a fake clock: only the admin wallet makes / starts / calls off; the code (or, in the countdown,
// the announcement) enters; leave before the start = not in; a 60 s countdown; too few = called off; games of 4-6 with the top
// 2 real players through, the final's top 8 placed; a no-show and a leaver are out; bots never go through; 90 s matches; only
// the bracket's players may sit in a game (others watch; no Start button); the pot (5 a body in round 1) is split 30/20/14/...
// and recorded once per player; levels counted like Auto match; the tournament saved at the end.
// Run: node tests/tourney.test.mjs
import assert from 'node:assert/strict';
import { createReferee } from '../server/referee.js';
import { planRound, advancers, potShares, roundsFor, cleanRules, FINAL_SHARE, MAX_ENTRANTS } from '../server/tourney.js';

// ---- the pure rules
const ids = (n) => Array.from({ length: n }, (_, i) => 'p' + i);
for (const n of [2, 5, 8]) assert.deepEqual([planRound(ids(n)).final, planRound(ids(n)).groups.length], [true, 1], `${n} players: straight to the final`);
for (const n of [9, 13, 22, 37, 64]) { const p = planRound(ids(n)); assert.ok(!p.final && p.groups.every((g) => g.length >= 4 && g.length <= 6) && p.groups.flat().length === n, `${n} players: games of 4-6 (${p.groups.map((g) => g.length)})`); }
assert.deepEqual([roundsFor(2), roundsFor(8), roundsFor(9), roundsFor(64)], [1, 1, 2, 3], 'rounds: ≤8 one final; 9 → 2; 64 → 3');
assert.deepEqual(advancers([{ id: null, present: true }, { id: 'a', present: false }, { id: 'b', present: true }, { id: null, present: true }, { id: 'c', present: true }, { id: 'd', present: true }]), ['b', 'c'], 'top 2 REAL players who were still there: bots and a leaver skipped');
const sh = potShares(100, ids(8).map((p) => ({ account: p })));
assert.deepEqual(Object.values(sh), FINAL_SHARE, 'a pot of 100 over 8 places: 30/20/14/11/9/7/5/4');
const sh4 = potShares(41, [{ account: 'a' }, { account: null }, { account: 'c' }, { account: 'd' }]);
assert.ok(sh4.a > sh4.c && sh4.c > sh4.d && !('null' in sh4) && sh4.a + sh4.c + sh4.d <= 41, 'fewer places: re-weighted; a place with no account earns nothing ' + JSON.stringify(sh4));
assert.equal(Object.values(potShares(41, ids(4).map((p) => ({ account: p })))).reduce((a, b) => a + b, 0), 41, 'the whole pot is paid out');
assert.deepEqual(cleanRules({ mode: 'team', style: 'normal' }), { mode: 'ffa', style: 'normal' }, 'team play paused: FFA');

// ---- the match server, fake clock and lines
let t = 1_000_000;
const results = [], finishes = [], saved = [];
const identify = async (token) => (token.startsWith('tok-') ? { pid: token.slice(4).padEnd(36, '0').slice(0, 36), n: token.slice(4, 18), l: 1, a: {}, rp: 0, admin: token === 'tok-admin' } : null);
const ref = createReferee({ now: () => t, identify, rand: (() => { let s = 9; return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31); })(),
  finish: async (m) => { finishes.push(m); return { counted: [] }; }, ranked: { hold: async () => 'free', start: async () => 1, release: async () => 1, result: async (mid, pid, ch) => { results.push([mid, pid, ch]); return ch; }, cleanup: async () => 0 },
  tourneyDone: async (r) => { saved.push(r); }, log: { log() {}, error: (...a) => console.error(...a) } });
const settle = () => new Promise((r) => setTimeout(r, 2));
const line = (token) => { const c = { got: [], send: (s) => c.got.push(JSON.parse(s)), close() {} }; c.h = ref.connect(c); c.say = (m) => c.h.message(JSON.stringify(m)); c.tour = () => [...c.got].reverse().find((m) => m.t === 'tour'); c.terr = () => [...c.got].reverse().find((m) => m.t === 'terr')?.why; c.say({ t: 'board' }); if (token) c.say({ t: 'tsub', token }); return c; };
const pidOf = (name) => name.padEnd(36, '0').slice(0, 36);
// the clock runs in steps of 1/10 s; every simulated second the real event loop gets a turn (a join's sign-in check is async)
const run = async (secs, each = () => {}) => { const dt = 1 / 10; for (let i = 0; i < secs / dt; i++) { t += dt * 1000; ref.tick(dt); each(); if (i % 10 === 9) await settle(); } };

const admin = line('tok-admin'), stranger = line('tok-stranger'), guest = line(null); await settle();
stranger.say({ t: 'tcreate', rules: {} });
assert.match(stranger.terr(), /Only the admin wallet/, 'a player who is not the admin cannot make one');
admin.say({ t: 'tcreate', rules: { mode: 'ffa', style: 'gear' } });
const code = admin.tour().you.code, tid = admin.tour().d.id;
assert.ok(/^[A-Z2-9]{5}$/.test(code) && admin.tour().d.state === 'open', 'the admin gets a 5-character code: ' + code);
assert.equal(stranger.tour().you.code, undefined, 'nobody else is shown the code');
admin.say({ t: 'tcreate', rules: {} }); assert.match(admin.terr(), /already on/, 'one at a time');
guest.say({ t: 'tjoin', code }); assert.match(guest.terr(), /Sign in/, 'entering needs a sign-in');
stranger.say({ t: 'tjoin', code: 'ZZZZZ' }); assert.match(stranger.terr(), /doesn't match/, 'a wrong code is refused');
stranger.say({ t: 'tjoin', id: tid }); assert.match(stranger.terr(), /doesn't match/, 'before Start, only the code enters');
stranger.say({ t: 'tjoin', code: code.toLowerCase() }); assert.equal(stranger.tour().you.entered, true, 'the code enters (any case)');
assert.deepEqual(admin.tour().d.names, ['stranger'], 'everyone sees who is in');
stranger.say({ t: 'tleave' }); assert.equal(stranger.tour().you.entered, false, 'leave before the start: not entered');
assert.equal(admin.tour().d.n, 0);
stranger.say({ t: 'tstart' }); assert.match(stranger.terr(), /Only the admin/, 'only the admin starts it');

// called off when too few: 1 player at the end of the countdown
stranger.say({ t: 'tjoin', code }); admin.say({ t: 'tstart' });
assert.equal(guest.tour().d.state, 'countdown', 'Start: the countdown, sent to every page (a guest too)');
assert.ok(guest.tour().d.startsIn <= 60 && guest.tour().d.startsIn >= 59, '60 s');
await run(61);
assert.equal(admin.tour().d.state, 'off', 'one player: called off');
assert.match(admin.tour().d.why, /needs 2/);
assert.equal(saved.length, 1, 'the called-off tournament is saved too');

// ---- a real one: 11 players, one no-show, one leaves mid-game
admin.say({ t: 'tcreate', rules: { style: 'gear' } }); const code2 = admin.tour().you.code; admin.say({ t: 'tstart' });
const names = ['alice', 'bob', 'cara', 'dan', 'eve', 'finn', 'gus', 'hana', 'ivan', 'jo', 'kim'];
const P = Object.fromEntries(names.map((n) => [n, { line: line('tok-' + n), room: null }])); await settle();
for (const n of names.slice(0, 10)) P[n].line.say({ t: 'tjoin', code: code2 });
P.kim.line.say({ t: 'tjoin', id: admin.tour().d.id }); // tapped the announcement in the countdown
assert.equal(admin.tour().d.n, 11, '11 entered (one by tapping the announcement)');
const noShow = 'jo', leaver = 'dan';
// each player's page: told its game (you.next), it joins that room; back to the bracket when the room closes
const drive = () => { for (const n of names) { const p = P[n], y = p.line.tour()?.you;
  if (p.room && p.room.got.some((m) => m.t === 'closed')) p.room = null;
  if (!p.room && y?.next && n !== noShow) { const c = { got: [], send: (s) => c.got.push(JSON.parse(s)), close() {} }; c.h = ref.connect(c); c.h.message(JSON.stringify({ t: 'join', code: y.next, token: 'tok-' + n, me: { id: 'id' + n, n } })); p.room = c; } } };
await run(60, drive); await settle(); await run(1, drive); await settle();
const s1 = admin.tour().d; assert.equal(s1.state, 'running'); assert.equal(s1.rounds.length, 1);
assert.deepEqual(s1.rounds[0].games.map((g) => g.players.length).sort(), [5, 6], 'round 1: 11 players in games of 5 and 6');
// a stranger can't take a seat in a tournament game, can watch; the Start button does nothing there
const g0 = s1.rounds[0].games[0].code, nosy = { got: [], send: (s) => nosy.got.push(JSON.parse(s)), close() {} }; nosy.h = ref.connect(nosy);
nosy.h.message(JSON.stringify({ t: 'join', code: g0, token: 'tok-nosy', me: { id: 'idnosy', n: 'nosy' } })); await settle();
assert.match(nosy.got.find((m) => m.t === 'err')?.why || '', /for its players/, 'not in the bracket: no seat');
const watch = { got: [], send: (s) => watch.got.push(JSON.parse(s)), close() {} }; watch.h = ref.connect(watch);
watch.h.message(JSON.stringify({ t: 'join', code: g0, me: { id: 'idwatch', n: 'w', w: true } })); await settle();
assert.ok(watch.got.some((m) => m.t === 'peers'), 'anyone may watch');
await run(25, drive); await settle();
const r0 = ref.rooms.get(g0); assert.ok(r0 && r0.sim.S.phase !== 'lobby', 'the games start (all there, or at the deadline)');
// the leaver: leaves the tournament during their game
P[leaver].line.say({ t: 'tleave' }); P[leaver].room?.h.gone(); P[leaver].room = null;
let playTime = 0; await run(30, () => { drive(); for (const g of admin.tour().d.rounds[0].games) { const r = ref.rooms.get(g.code); if (r?.sim.S.phase === 'play') playTime = Math.max(playTime, r.sim.S.time); } });
assert.ok(playTime > 85 && playTime <= 90, `matches are 90 s (${playTime.toFixed(1)})`);
await run(120, drive); await settle();
const after1 = admin.tour().d;
assert.ok(after1.rounds[0].games.every((g) => g.finish), 'round 1 over');
const thru = after1.rounds[0].games.flatMap((g) => g.players.filter((x) => x.st === 'thru').map((x) => x.n));
assert.equal(thru.length, 4, 'top 2 real players of each game go through: ' + thru);
assert.ok(!thru.includes(noShow) && !thru.includes(leaver), 'the no-show and the leaver are out');
assert.equal(P[noShow].line.tour().you.out, true, 'the no-show is told they are out');
assert.ok(after1.nextIn > 0 || after1.rounds.length === 2, 'a break before the next round');
await run(25, drive); await settle(); await run(170, drive); await settle();
const fin = admin.tour().d;
assert.equal(fin.state, 'done', 'the final was played: ' + fin.state + ' ' + fin.why);
assert.equal(fin.rounds.length, 2); assert.equal(fin.rounds[1].final, true, 'round 2 is the final (4 left)');
assert.ok(fin.standings.length >= 4 && fin.standings.length <= 8, 'the final placed everyone in it (players and bots)');
const finalReal = fin.rounds[1].games[0].players.map((x) => x.n).sort();
assert.deepEqual(finalReal, [...thru].sort(), 'only who went through played the final (bots filled the seats)');
// the pot: 5 per body in round 1, split over the final, recorded once per player as 'tour-<id>'
const bodies1 = fin.pot / 5; assert.ok(Number.isInteger(bodies1) && bodies1 >= 11, `pot ${fin.pot} = 5 × ${bodies1} bodies in round 1`);
const mine = results.filter((r) => r[0] === 'tour-' + fin.id);
assert.ok(mine.length >= 4 && mine.every((r) => r[2] > 0), 'points recorded to the final\'s accounts: ' + JSON.stringify(mine.map((r) => r[2])));
assert.ok(mine.reduce((a, r) => a + r[2], 0) <= fin.pot, 'never more than the pot');
const paid = fin.standings.filter((x) => x.points > 0); // (a plain test bot has no account: its share is paid to nobody)
assert.ok(paid.length >= 4 && paid.every((x, i) => i === 0 || x.points <= paid[i - 1].points), 'a better place gets a bigger share: ' + JSON.stringify(fin.standings.map((x) => [x.place, x.points])));
const winner = names.find((n) => P[n].line.tour().you.place?.place === 1);
if (winner) assert.ok(P[winner].line.tour().you.place.points > 0, 'the winner is told their place and points');
assert.ok(finishes.some((f) => f.auto && f.places.some(Boolean)), 'levels counted like an Auto match');
assert.equal(saved.at(-1).id, fin.id); assert.ok(saved.at(-1).standings.length >= 4 && saved.at(-1).entrants === 11, 'the standings are saved');
assert.ok(![...ref.rooms.values()].some((r) => r.tour), 'every tournament room is closed');
// after 10 minutes the results go
await run(601); assert.equal(admin.tour().d, null, 'the finished tournament is cleared after 10 minutes');
console.log(`OK: tournaments: admin-only, code / announcement entry, leave, 60 s countdown, called off when too few; 11 players → games of 5+6 → top 2 real through (no-show + leaver out) → final; 90 s matches; seats only for the bracket; pot ${fin.pot} split and recorded; levels counted; saved; cleared`);
