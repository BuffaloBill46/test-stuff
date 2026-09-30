// The server's web door: sign-in required, only our website, each action routed, plain errors (no internals leaked).
import assert from 'node:assert/strict';
import { makeHandler } from '../server/http.js';

const calls = [];
const server = new Proxy({}, { get: (_, action) => async (...a) => { calls.push([action, ...a]); if (a[1] === 'boom') throw new Error('db password=secret'); return action === 'quote' && a[2] > 10 ? { error: 'buy 1 to 10' } : { ok: action }; } });
const h = makeHandler({ server, profileFor: async (t) => (t === 'good' ? 'profile-1' : null), credits: async () => [{ kind: 'big', left_n: 3 }] });
const req = (body, { token = 'good', origin = 'https://buffalobill46.github.io', method = 'POST' } = {}) =>
  h(new Request('https://x.supabase.co/functions/v1/games', { method, headers: { origin, ...(token ? { authorization: 'Bearer ' + token } : {}), 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined }));
const json = async (r) => ({ status: r.status, body: await r.json(), allow: r.headers.get('access-control-allow-origin') });

let r = await h(new Request('https://x/f', { method: 'OPTIONS', headers: { origin: 'https://buffalobill46.github.io' } }));
assert.equal(r.status, 204); assert.equal(r.headers.get('access-control-allow-origin'), 'https://buffalobill46.github.io');
assert.equal((await json(await req({ action: 'open', kind: 'big' }, { token: '' }))).status, 401, 'not signed in');
assert.equal((await json(await req({ action: 'open', kind: 'big' }, { token: 'forged' }))).status, 401, 'a bad token');
assert.equal((await json(await req({ action: 'open', kind: 'big' }, { origin: 'https://evil.example' }))).status, 403, 'another website');
assert.equal((await json(await req({ action: 'nope' }))).status, 400);
assert.deepEqual((await json(await req({ action: 'credits' }))).body, { credits: [{ kind: 'big', left_n: 3 }] });
for (const [body, action] of [[{ action: 'quote', kind: 'big', n: 3 }, 'quote'], [{ action: 'buy', quote: 'q', signature: 's' }, 'buy'], [{ action: 'open', kind: 'spin10' }, 'open'], [{ action: 'settle', ticket: '7', seed: 'ab12cd34' }, 'settle']]) {
  const out = await json(await req(body)); assert.equal(out.status, 200); assert.deepEqual(out.body, { ok: action });
  assert.equal(calls.at(-1)[0], action); assert.equal(calls.at(-1)[1], 'profile-1', 'always the signed-in player, never one named in the request');
}
assert.equal((await json(await req({ action: 'quote', kind: 'big', n: 11 }))).status, 400, 'game refusals come back as 400');
const boom = await json(await req({ action: 'open', kind: 'boom' }));
assert.equal(boom.status, 500); assert.ok(!JSON.stringify(boom.body).includes('secret'), 'server internals never reach the player');
console.log('OK: web door: sign-in required, other websites refused, 5 actions routed to the signed-in player, errors plain');
