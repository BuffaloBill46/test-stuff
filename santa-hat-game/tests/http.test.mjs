// The server's web door: sign-in required, only our website, each action routed, plain errors (no internals leaked).
import assert from 'node:assert/strict';
import { makeHandler } from '../server/http.js';

const calls = [];
const server = new Proxy({}, { get: (_, action) => async (...a) => { calls.push([action, ...a]); if (a[1] === 'boom') throw new Error('db password=secret'); return action === 'quote' && a[2] > 10 ? { error: 'buy 1 to 10' } : { ok: action }; } });
const h = makeHandler({ server, profileFor: async (t) => (t === 'good' ? 'profile-1' : null), limiter: null }); // the speed limit is checked below
const req = (body, { token = 'good', origin = 'https://buffalobill46.github.io', method = 'POST' } = {}) =>
  h(new Request('https://x.supabase.co/functions/v1/games', { method, headers: { origin, ...(token ? { authorization: 'Bearer ' + token } : {}), 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined }));
const json = async (r) => ({ status: r.status, body: await r.json(), allow: r.headers.get('access-control-allow-origin') });

let r = await h(new Request('https://x/f', { method: 'OPTIONS', headers: { origin: 'https://buffalobill46.github.io' } }));
assert.equal(r.status, 204); assert.equal(r.headers.get('access-control-allow-origin'), 'https://buffalobill46.github.io');
assert.equal((await json(await req({ action: 'settle', ticket: '7', seed: 'ab12cd34' }, { token: '' }))).status, 401, 'not signed in');
assert.equal((await json(await req({ action: 'settle', ticket: '7', seed: 'ab12cd34' }, { token: 'forged' }))).status, 401, 'a bad token');
assert.equal((await json(await req({ action: 'settle', ticket: '7', seed: 'ab12cd34' }, { origin: 'https://evil.example' }))).status, 403, 'another website');
assert.equal((await json(await req({ action: 'nope' }))).status, 400);
assert.equal((await json(await req({ action: 'credits' }))).status, 400, 'no credits any more (runs: Cody)');
assert.equal((await json(await req({ action: 'open', kind: 'big' }))).status, 400, 'no separate open: the run\'s plays come with the payment');
for (const [body, action] of [[{ action: 'quote', kind: 'spin', n: 5, bet: 0.1 }, 'quote'], [{ action: 'buy', quote: 'q', signature: 's' }, 'buy'], [{ action: 'settle', ticket: '7', seed: 'ab12cd34' }, 'settle']]) {
  const out = await json(await req(body)); assert.equal(out.status, 200); assert.deepEqual(out.body, { ok: action });
  assert.equal(calls.at(-1)[0], action); assert.equal(calls.at(-1)[1], 'profile-1', 'always the signed-in player, never one named in the request');
}
assert.equal((await json(await req({ action: 'quote', kind: 'big', n: 11 }))).status, 400, 'game refusals come back as 400');
const boom = await json(await req({ action: 'quote', kind: 'boom', n: 1 }));
assert.equal(boom.status, 500); assert.ok(!JSON.stringify(boom.body).includes('secret'), 'server internals never reach the player');
// Admin: its own door (no player sign-in; the wallet signature is the proof, checked in server/admin.js).
const h2 = makeHandler({ server, profileFor: async () => null, limiter: null, admin: { run: async (b) => (b.message === 'ok' ? { ok: true } : { error: 'not an admin message' }) } });
const adm = (body) => h2(new Request('https://x/f', { method: 'POST', headers: { origin: 'https://buffalobill46.github.io', 'x-santa-admin': '1' }, body: JSON.stringify(body) }));
assert.equal((await adm({ message: 'ok' })).status, 200); assert.equal((await adm({ message: 'x' })).status, 400);
assert.equal((await h2(new Request('https://x/f', { method: 'POST', headers: { origin: 'https://evil.example', 'x-santa-admin': '1' }, body: '{}' }))).status, 403, 'other websites refused for admin too');
console.log('OK: web door: sign-in required, other websites refused, 5 actions routed to the signed-in player, errors plain');

// ---- The speed limit (server/ratelimit.js), on the in-memory store with a pretend clock ----
import { makeLimiter, memoryStore, RATE_RULES } from '../server/ratelimit.js';
assert.throws(() => makeHandler({ server, profileFor: async () => null }), /limiter/, 'no limiter by accident: refuses to start');
let clock = Date.UTC(2026, 9, 1, 12, 0, 0); // on a window boundary
const logged = [];
const limited = (store = memoryStore()) => makeHandler({ server, profileFor: async (t) => (t.startsWith('good') ? 'profile-' + t : null), limiter: makeLimiter({ store, now: () => clock, log: (m) => logged.push(m) }) });
const from = (hh, body, { addr = '1.2.3.4', token = 'good' } = {}) => hh(new Request('https://x/f', { method: 'POST',
  headers: { origin: 'https://buffalobill46.github.io', 'x-forwarded-for': addr + ', 10.0.0.1', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }));
const settle = { action: 'settle', ticket: '7', seed: 'ab12cd34' };
assert.deepEqual(RATE_RULES, { windowSeconds: 10, perConnection: 60, perPlayer: 40 });

// An honest run of 10 (quote, buy, 10 settles, the winners list) inside 3 seconds: never slowed.
let lim = limited();
for (const [i, b] of [{ action: 'quote', kind: 'big', n: 10, bet: 1 }, { action: 'buy', quote: 'q', signature: 's' }, ...Array(10).fill(settle), { action: 'winners' }].entries()) {
  clock += 250; assert.equal((await from(lim, b)).status, 200, `honest run request ${i + 1}`);
}
// One player: 40 signed-in requests in a window pass, the 41st is told to slow down, with when to try again.
clock = Date.UTC(2026, 9, 1, 12, 1, 0); lim = limited(); calls.length = 0;
for (let i = 0; i < 40; i++) assert.equal((await from(lim, settle)).status, 200);
clock += 3000;
let r429 = await from(lim, settle);
assert.equal(r429.status, 429); assert.equal(r429.headers.get('retry-after'), '7'); assert.equal(r429.headers.get('access-control-allow-origin'), 'https://buffalobill46.github.io');
const why = await r429.json(); assert.equal(why.slowDown, true); assert.equal(why.retryAfter, 7); assert.match(why.error, /slow down.*7 seconds/);
assert.equal(calls.length, 40, 'a slowed request never reaches the game server');
assert.equal((await from(lim, settle, { token: 'good2' })).status, 200, 'another player on the same connection is not slowed by this player');
clock += 7000; assert.equal((await from(lim, settle)).status, 200, 'no ban: the next window starts fresh');
// One connection: 60 requests a window (here the public winners list, no sign-in), then slowed; another address is fine.
clock = Date.UTC(2026, 9, 1, 12, 2, 0); lim = limited(); calls.length = 0;
for (let i = 0; i < 60; i++) assert.equal((await from(lim, { action: 'winners' }, { addr: '5.6.7.8', token: '' })).status, 200);
assert.equal((await from(lim, { action: 'winners' }, { addr: '5.6.7.8', token: '' })).status, 429, 'public answers are limited per connection too');
assert.equal((await from(lim, { action: 'pools' }, { addr: '5.6.7.8', token: '' })).status, 429);
assert.equal((await from(lim, settle, { addr: '5.6.7.8' })).status, 429, 'and signed-in requests from that connection');
assert.equal(calls.length, 60, 'slowed before any database work');
assert.equal((await from(lim, { action: 'winners' }, { addr: '9.9.9.9', token: '' })).status, 200, 'other connections unaffected');
// Many accounts from one computer: the connection limit catches them even though each player is under their own.
clock = Date.UTC(2026, 9, 1, 12, 3, 0); lim = limited(); let codes = [];
for (let i = 0; i < 70; i++) codes.push((await from(lim, settle, { addr: '7.7.7.7', token: 'good' + (i % 7) })).status);
assert.equal(codes.filter((c) => c === 200).length, 60); assert.equal(codes.filter((c) => c === 429).length, 10);
// If counting itself breaks, players are let through (a counting fault never locks everyone out) and it's logged.
lim = limited({ hit: async () => { throw new Error('db down'); } }); logged.length = 0;
for (let i = 0; i < 100; i++) assert.equal((await from(lim, settle)).status, 200);
assert.ok(logged.length >= 100 && logged.every((m) => /counting failed/.test(m)), 'every uncounted request is logged');
console.log('OK: speed limit: an honest run never slowed; 40 a player / 60 a connection per 10 s, then "slow down" (no ban); checked before any database work; fails open, logged');

