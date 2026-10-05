// RANKED on the referee server (server/referee.js): sign-in required, the server picks the room and holds a ticket, a match
// starts only with 2+ real players, tickets are spent at the start and given back when leaving before it, points come from
// mockups/ranked.js once per match (leaving mid-match = not placing), the room closes after the match, ranked rooms can't be
// entered by code (watching is fine), and a restart gives back held tickets. The ticket store here follows the rules of
// supabase/006 + 018, which tests/db/ranked-db.test.mjs checks on real Postgres. Run: node referee-ranked.test.mjs
import assert from 'node:assert/strict';
import { createReferee, NO_TICKETS, RANKED_PAUSED } from '../server/referee.js';
import { PHASES, K } from '../mockups/sim.js';
import { settleRanked } from '../mockups/ranked.js';

const P = (n) => `${n}0000000-2222-4333-8444-555555555555`;
const people = { ann: { pid: P(1), l: 3, n: 'Ann', a: { sb1: 'sb_ice' }, rp: 0 }, ben: { pid: P(2), l: 4, n: 'Ben', a: {}, rp: 500 },
  cat: { pid: P(3), l: 2, n: 'Cat', a: {}, rp: 20 }, dan: { pid: P(4), l: 1, n: 'Dan', a: {}, rp: 0 } };
// the ticket store (006/018 rules): 10 free; hold once per room; spend at start; release only while held
const tickets = new Map(Object.values(people).map((p) => [p.pid, 10])); tickets.set(P(4), 0);
const holds = new Map(), results = [], calls = [];
const ranked = {
  async hold(pid, rid) { const k = pid + rid; if (holds.has(k) && holds.get(k) !== 'released') return 'already'; if (!tickets.get(pid)) return 'none'; tickets.set(pid, tickets.get(pid) - 1); holds.set(k, 'held'); return 'free'; },
  async start(rid) { calls.push('start ' + rid); for (const [k, v] of holds) if (k.endsWith(rid) && v === 'held') holds.set(k, 'spent'); },
  async release(pid, rid) { const k = pid + rid; if (holds.get(k) !== 'held') return false; holds.set(k, 'released'); tickets.set(pid, tickets.get(pid) + 1); return true; },
  async result(mid, pid, change) { results.push({ mid, pid, change }); return 100 + change; },
  async cleanup(prefix) { calls.push('cleanup ' + prefix); return 0; },
};
let t = 1e7;
const finishes = [];
const ref = createReferee({ now: () => t, identify: async (tok) => people[tok] || null, finish: async (m) => { finishes.push(m); return { counted: [] }; }, ranked });
const settle = () => new Promise((r) => setTimeout(r, 0));
const conn = () => { const c = { got: [], send: (s) => c.got.push(JSON.parse(s)) }; c.h = ref.connect(c); c.say = (m) => c.h.message(JSON.stringify(m)); c.last = (k) => [...c.got].reverse().find((m) => m.t === k); return c; };
const me = (id) => ({ id, n: 'claimed', a: {}, l: 10 });
const tick = (secs) => { for (let i = 0; i < secs * 30; i++) { t += 1000 / 30; ref.tick(1 / 30); } };
const until = (c, ph) => { for (let i = 0; i < 600 * 30 && PHASES[c.last('snap')?.d.ph] !== ph; i++) { t += 1000 / 30; ref.tick(1 / 30); } };
await settle();
assert.deepEqual(calls, ['cleanup ref-'], 'on start, tickets held by an earlier run come back');

// --- who may play ranked
const closed = createReferee({ identify: async () => people.ann }); const cc = { got: [], send: (s) => cc.got.push(JSON.parse(s)) }; closed.connect(cc).message(JSON.stringify({ t: 'ranked', token: 'ann', me: me('anon0001') })); await settle();
assert.match(cc.got[0].why, /opens soon/, 'no ticket store: ranked stays closed');
const g = conn(); g.say({ t: 'ranked', me: me('gues0001') }); await settle(); assert.match(g.last('err').why, /signed in/, 'guests: sign in first');
const f = conn(); f.say({ t: 'ranked', token: 'forged', me: me('forg0001') }); await settle(); assert.match(f.last('err').why, /signed in/, 'a forged sign-in: refused');
const d = conn(); d.say({ t: 'ranked', token: 'dan', me: me('dann0001') }); await settle(); assert.equal(d.last('err').why, NO_TICKETS, 'no tickets left: told why');
assert.equal(ref.rooms.size, 0, 'refused searches leave no empty rooms behind');

// --- Ann searches: a new ranked room, waiting for a 2nd real player (no countdown)
const a = conn(); a.say({ t: 'ranked', token: 'ann', me: me('anne0001') }); await settle();
const code = [...ref.rooms.keys()][0];
assert.match(code, /^PRG\d+$/, 'no style sent (an older page): a special-gear room'); assert.equal(tickets.get(P(1)), 9, 'one ticket held');
assert.deepEqual([a.last('peers').ps[0].n, a.last('peers').ps[0].l], ['Ann', 3], 'her saved name and level, not what the page claimed');
tick(30); let s = a.last('snap').d;
assert.deepEqual([PHASES[s.ph], s.rk, s.wait, s.cd], ['lobby', 1, 1, 0], 'alone: waiting, no countdown, even after 30 s');
// joining by its code: refused for players, fine for watchers
const sneak = conn(); sneak.say({ t: 'join', code, token: 'cat', me: me('snea0001') }); await settle(); assert.match(sneak.last('err').why, /Auto match/);
const watch = conn(); watch.say({ t: 'join', code, me: { ...me('watc0001'), w: true } }); await settle(); assert.ok(watch.last('peers'), 'watching a ranked game is fine');
// one seat per account: the same player in a 2nd tab
const twin = conn(); twin.say({ t: 'ranked', token: 'ann', me: me('twin0001') }); await settle(); assert.match(twin.last('err').why, /another tab/);
// Ben and Cat search: the open room (closest by rank points among open rooms); 15 s after the 2nd player it starts
const b = conn(); b.say({ t: 'ranked', token: 'ben', me: me('benn0001') }); await settle();
const c = conn(); c.say({ t: 'ranked', token: 'cat', me: me('catt0001') }); await settle();
assert.equal(ref.rooms.size, 1, 'both seated in the open ranked room');
tick(1); s = a.last('snap').d; assert.ok(!s.wait && s.cd > 13 && s.cd <= 15, '3 real players: 15 s countdown: ' + s.cd);
// Cat leaves before the start: her ticket comes back
c.h.gone(); await settle(); assert.equal(tickets.get(P(3)), 10, 'left before the start: ticket back');
// a fourth (Cat again, new tab) rejoins, then the match starts: tickets spent
const c2 = conn(); c2.say({ t: 'ranked', token: 'cat', me: me('catt0002') }); await settle();
until(a, 'intro');
const rid = calls.find((x) => x.startsWith('start '))?.slice(6);
assert.ok(rid?.startsWith('ref-'), 'tickets spent at the start');
assert.deepEqual([...holds].filter(([k, v]) => k.endsWith(rid) && v === 'spent').length, 3, 'all three held tickets spent');
// a search now doesn't join the started game: a new room
const e = conn(); e.say({ t: 'ranked', token: 'ben', me: me('benn0002') }); await settle(); assert.match(e.last('err')?.why || '', /another tab/, 'Ben is already in a ranked game');
until(a, 'play');
// Cat quits mid-match: no ticket back, and she still gets "not placing"
c2.h.gone(); await settle(); assert.equal(tickets.get(P(3)), 9, 'quitting after the start: the ticket stays spent');
until(a, 'end'); await settle();
const end = a.last('snap').d, mid = end.mid;
// the pot uses each player's SAVED level (Ann 3, Ben 4: 2 points a level, to-do #14), not the level 10 their pages claimed
const order = end.E.map((r) => ({ id: r[2] ? 'x' + r[0] : { anne0001: P(1), benn0001: P(2) }[r[1]], bot: !!r[2], score: r[11], level: { anne0001: 3, benn0001: 4 }[r[1]] }));
const want = settleRanked(order).points; want[P(3)] = -5;
assert.deepEqual(Object.fromEntries(results.filter((r) => r.mid === mid).map((r) => [r.pid, r.change])), want, 'points = ranked.js on the final scores and saved levels; the quitter −5');
assert.notDeepEqual(want, (() => { const w = settleRanked(order.map((o) => ({ ...o, level: 10 }))).points; w[P(3)] = -5; return w; })(), "(and that's a different answer from the claimed level 10s)");
assert.equal(results.length, 3, 'once per player per match');
assert.deepEqual(a.last('rank').d, { change: want[P(1)], points: 100 + want[P(1)] }, 'each player is told their change');
assert.equal(finishes.length, 1, 'the finish also counts toward levels'); assert.equal(finishes[0].id, mid);
// after the end screen the room closes; the lines stay open for the next search
until(a, 'lobby'); await settle();
assert.match(a.last('closed')?.why || '', /Match over/); assert.equal(ref.rooms.has(code), false, 'the room is gone');
a.say({ t: 'ranked', token: 'ann', me: me('anne0001') }); await settle();
assert.ok([...ref.rooms.values()].some((r) => r.ranked && r.conns.has('anne0001')), 'Ann can search again on the same line');
assert.equal(tickets.get(P(1)), 8, 'with a fresh ticket');
// board: ranked rooms listed as ranked
const l = conn(); l.say({ t: 'board' }); assert.ok(l.last('board').games.some((x) => x.ranked === 1 && /^PR/.test(x.code)));
// --- play styles (Cody 2026-10-02): ranked has the same Normal / Special gear ticks; the server only pairs matching rooms
const ref2 = createReferee({ now: () => t, identify: async (tok) => people[tok] || null, ranked });
const conn2 = () => { const c = { got: [], send: (x) => c.got.push(JSON.parse(x)) }; c.h = ref2.connect(c); c.say = (m) => c.h.message(JSON.stringify(m)); return c; };
const roomOf = (id) => [...ref2.rooms.values()].find((r) => r.conns.has(id));
conn2().say({ t: 'ranked', token: 'ann', styles: ['normal'], me: me('anne0009') }); await settle();
conn2().say({ t: 'ranked', token: 'ben', styles: ['gear'], me: me('benn0009') }); await settle();
assert.match(roomOf('anne0009').code, /^PRN\d+$/, 'normal only: a normal ranked room');
assert.match(roomOf('benn0009').code, /^PRG\d+$/, 'special gear only: a gear ranked room, not hers');
assert.equal(roomOf('anne0009').conns.get('anne0009').me.a.sb1, 'sb_none', 'normal ranked: her special snowball does not count');
conn2().say({ t: 'ranked', token: 'cat', styles: ['normal', 'gear'], me: me('catt0009') }); await settle();
assert.equal(roomOf('catt0009'), roomOf('anne0009'), 'both ticked: either style, closest rank points first (Ann 0 vs Ben 500; Cat 20)');
const l2 = conn2(); l2.say({ t: 'board' }); assert.deepEqual(l2.got.at(-1).games.map((x) => x.style).sort(), ['gear', 'normal'], "the games list shows each ranked room's style");
// --- Cody's pause (2026-10-02): while paused, searches are refused and no ticket is held; unpaused, ranked works again
let paused = true;
const ref3 = createReferee({ now: () => t, identify: async (tok) => people[tok] || null, ranked, rankedPaused: () => paused });
const c3 = { got: [], send: (x) => c3.got.push(JSON.parse(x)) }, h3 = ref3.connect(c3), before = tickets.get(P(3));
h3.message(JSON.stringify({ t: 'ranked', token: 'cat', me: me('catt0010') })); await settle();
assert.equal(c3.got.at(-1).why, RANKED_PAUSED, 'paused: told so'); assert.equal(ref3.rooms.size, 0, 'paused: no room made'); assert.equal(tickets.get(P(3)), before, 'paused: no ticket held');
paused = false; h3.message(JSON.stringify({ t: 'ranked', token: 'cat', me: me('catt0010') })); await settle();
assert.equal(ref3.rooms.size, 1, 'unpaused: ranked works again, no restart');
console.log('OK: ranked on the referee: pause switch, Normal / Special gear choice (paired by style, normal strips specials), sign-in + tickets, the server picks the room, 2 real players to start, tickets spent at the start and back if you leave before, ranked.js points once (quitters −5), levels too, room closes after, code-join refused, watching ok, restart cleanup');
