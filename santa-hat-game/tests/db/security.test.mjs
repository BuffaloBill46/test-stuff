// Security audit (2026-09-30): every attack gets a clean refusal, never a crash (a crash = a 500 and a stuck request).
import assert from 'node:assert/strict';
import { makeDb } from './setup.mjs';
import { createGameServer, QUOTES_PER_HOUR } from '../../server/games.js';
import { makeHandler } from '../../server/http.js';

const db = await makeDb();
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', 58823529411, '{}'), ('slots', 588235294117, '{}')`);
const me = await db.player('PLAYERwa11et111111111111111111111111111111');
const server = createGameServer({ db, chain: { getTransaction: async () => null }, livePrice: async () => ({ usd: 0.00085 }), liveFee: async () => ({ bps: 300, max: 1e15 }), poolWallets: { spin: 'SPINpoo1wa11et11111111111111111111111111111', slots: 'SLOTSpoo1wa11et1111111111111111111111111111' } });
const noThrow = async (label, fn) => { try { const r = await fn(); assert.ok(r && (r.error || r.refused || r.noCredit || r.failed), `${label}: expected a refusal, got ${JSON.stringify(r)}`); return r; } catch (e) { assert.fail(`${label} crashed: ${e.message}`); } };

// 1. Names every JavaScript object carries are not games.
for (const k of ['toString', 'constructor', '__proto__', 'hasOwnProperty', '', 'BIG', null, 7]) {
  await noThrow(`quote ${k}`, () => server.quote(me, k, 1));
  await noThrow(`open ${k}`, () => server.open(me, k));
}
// 2. Junk ids and signatures are refused politely.
for (const t of ['abc', '1; drop table plays', '-1', '1e9', '99999999999999999999999', '']) await noThrow(`settle ${t}`, () => server.settle(me, t, 'ab12cd34'));
for (const s of ['', 'x', 'sig', '0'.repeat(88), 'O'.repeat(88), '<script>']) await noThrow(`buy ${s}`, () => server.buy(me, '00000000-0000-0000-0000-000000000000', s));
await noThrow('buy junk quote', () => server.buy(me, "' or 1=1 --", '5'.repeat(88)));
// 3. An account with no wallet can't start a play (its winnings would have nowhere to go).
const emailOnly = (await db.query('insert into auth.users default values returning id'))[0].id; // 003 lets email-only profiles have no wallet
await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, null, 'Emma', '{}')`, [emailOnly]);
await db.query(`insert into public.credits (profile_id, kind, left_n, bought) values ($1, 'big', 1, 1)`, [emailOnly]);
assert.match((await server.open(emailOnly, 'big')).error, /needs a linked wallet/);
assert.equal((await db.query(`select left_n from public.credits where profile_id = $1`, [emailOnly]))[0].left_n, 1, 'credit untouched');
// 4. Quote spam stops at the hourly limit.
let last; for (let i = 0; i < QUOTES_PER_HOUR + 3; i++) last = await server.quote(me, 'spin10', 1);
assert.match(last.error, /too many price quotes/);
assert.equal((await db.query('select count(*)::int as n from public.quotes where profile_id = $1', [me]))[0].n, QUOTES_PER_HOUR);
// 5. The public winners list is cached (10 s), so hammering it doesn't hammer the database.
let calls = 0; const counting = { ...db, query: (q, p) => { if (/from public.plays pl join/.test(q)) calls++; return db.query(q, p); } };
const s2 = createGameServer({ db: counting, chain: {}, livePrice: async () => ({ usd: 1 }), liveFee: async () => ({ bps: 300, max: 1e15 }), poolWallets: {} });
for (let i = 0; i < 50; i++) await s2.winners();
assert.equal(calls, 1, '50 requests, 1 database query');
// 6. Through the web door: crafted bodies get 4xx answers, never 500.
const h = makeHandler({ server, profileFor: async () => me, credits: async () => [] });
for (const body of [{ action: 'open', kind: '__proto__' }, { action: 'settle', ticket: 'x', seed: 'zz' }, { action: 'quote', kind: 'big', n: '1e3' }, { action: 'buy', quote: {}, signature: [] }, { action: 'constructor' }, 'null', '[]']) {
  const r = await h(new Request('https://x/f', { method: 'POST', headers: { origin: 'https://buffalobill46.github.io', authorization: 'Bearer t' }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
  assert.ok(r.status >= 400 && r.status < 500, `${JSON.stringify(body)} → ${r.status}`);
}
console.log('OK: security: crafted game names, junk ids/signatures, email-only accounts, quote spam, winners hammering and crafted requests all refused cleanly (no crashes)');
