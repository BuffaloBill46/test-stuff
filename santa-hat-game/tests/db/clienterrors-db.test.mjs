// ERRORS PLAYERS HIT (Cody, 2026-10-04 to-do #3; supabase/048, server/clienterrors.js) on a real database through the real front
// door (server/http.js) and admin actions: a page's error is kept; the same error from many players is ONE row with a count (the
// build's ?v= and line numbers in the message don't split it); only a NEW kind goes to Telegram, and a fixed one coming back says
// so; one connection can't flood it (20 an hour) and Telegram hears at most 5 an hour; the admin screen lists and marks fixed
// (admin wallet only); the website can't read the table; a bad report never gets an error back. Run: node tests/db/clienterrors-db.test.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { makeDb } from './setup.mjs';
import { createClientErrors, PER_ADDRESS_HOUR, TELEGRAM_PER_HOUR } from '../../server/clienterrors.js';
import { makeHandler } from '../../server/http.js';
import { createAdmin, adminMessage, b58encode } from '../../server/admin.js';

const FILES = readdirSync(new URL('../../supabase/', import.meta.url)).filter((f) => /^0\d\d_.*\.sql$/.test(f) && f !== '031_games_role.sql').sort();
const db = await makeDb(FILES);
for (let i = 0; i < 2; i++) await db.pg.exec(readFileSync(new URL('../../supabase/048_client_errors.sql', import.meta.url), 'utf8')); // safe twice
const sent = [], telegram = { send: async (t) => { sent.push(t); } };
let clock = Date.now(); const ce = createClientErrors({ db, telegram, now: () => clock });
const handle = makeHandler({ server: {}, clientErrors: ce, limiter: null, profileFor: async () => null });
let ip = '203.0.113.1';
const post = async (body) => { const r = await handle(new Request('http://localhost/api', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ action: 'client-error', ...body }) }));
  return { status: r.status, ...(await r.json()) }; };
const rows = async () => db.query('select * from public.client_errors order by first_seen');

// 1. one error, reported by many players: one row, a count; Telegram hears it once
const err = { message: "Cannot read properties of undefined (reading 'kind')", source: '/online.js?v=ab12cd:412:33', stack: 'TypeError: …\n at online.js:412:33', page: 'play', build: 'ab12cd', ua: 'Chrome on Android' };
assert.ok((await post(err)).ok);
assert.ok(/NEW page error players hit/.test(sent[0]) && /reading 'kind'/.test(sent[0]) && /On: play/.test(sent[0]), 'a new kind of error goes to Telegram: ' + sent[0]);
for (let i = 0; i < 4; i++) { ip = '198.51.100.' + i; await post({ ...err, source: '/online.js?v=ff99ee:412:33', build: 'ff99ee' }); } // other players, a later build
let r = await rows();
assert.ok(r.length === 1 && r[0].count === 5 && r[0].build === 'ff99ee' && sent.length === 1, `the same error from 5 players: one row, count ${r[0].count}, Telegram once (${sent.length})`);
// 2. a different error is a new row (and a new Telegram)
await post({ message: 'santaPay is not a function', source: '/shopui.js:47:12', page: 'store' });
r = await rows(); assert.ok(r.length === 2 && sent.length === 2, 'a different error: its own row and its own message');
// 3. no flood: one connection at most 20 an hour (quietly dropped beyond); Telegram at most 5 an hour
ip = '192.0.2.50';
for (let i = 0; i < PER_ADDRESS_HOUR + 5; i++) await post({ message: 'spam error number ' + i * 7919, source: '/x.js:' + i + ':1' });
r = await rows();
assert.ok(r.length <= 2 + PER_ADDRESS_HOUR, `one connection's reports are capped at ${PER_ADDRESS_HOUR} an hour (${r.length - 2} kept)`);
assert.equal(sent.length, TELEGRAM_PER_HOUR, `Telegram hears at most ${TELEGRAM_PER_HOUR} new kinds an hour`);
// 4. nothing to report, odd input: never an error back to the page
assert.equal((await post({})).status, 200); assert.equal((await post({ message: 'x'.repeat(5000), stack: 'y'.repeat(9000) })).status, 200);
assert.ok((await rows()).every((x) => x.message.length <= 300 && (x.stack || '').length <= 1200), 'long fields are cut, never refused');
// 5. the admin screen: only an admin wallet; list (open first), mark fixed; it reopens (and Telegram says so) if it comes back
const key = async () => { const k = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']); return { k, address: b58encode(new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey))) }; };
const cody = await key(), stranger = await key(), nonce = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
const signed = async (w, fields) => { const message = adminMessage({ at: new Date().toISOString(), nonce: nonce(), ...fields });
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', w.k.privateKey, new TextEncoder().encode(message)));
  return { wallet: w.address, message, signature: [...sig].map((b) => b.toString(16).padStart(2, '0')).join('') }; };
const admin = createAdmin({ db, adminWallets: [cody.address], clientErrors: ce });
assert.match((await admin.run(await signed(stranger, { action: 'errors-list', game: 'errors' }))).error, /not an admin wallet/, "a stranger can't read them");
const l = await admin.run(await signed(cody, { action: 'errors-list', game: 'errors' }));
const kindErr = l.errors.find((x) => /reading 'kind'/.test(x.message));
assert.ok(l.ok && kindErr.count === 5 && kindErr.page === 'play' && kindErr.status === 'open', 'Cody sees it: how many times, where, open');
assert.ok((await admin.run(await signed(cody, { action: 'errors-fixed', game: 'errors', settings: { id: kindErr.id } }))).ok, 'Cody marks it fixed');
clock += 2 * 3600e3; const before = sent.length; ip = '203.0.113.99';
await post(err);
r = (await rows()).find((x) => x.fingerprint === kindErr.id);
assert.ok(r.status === 'open' && r.count === 6 && sent.length === before + 1 && /FIXED one came back/.test(sent[sent.length - 1]), 'it came back: reopened, and Telegram says the fixed one came back');
// 6. the website can't read or write the table
for (const role of ['anon', 'authenticated']) {
  await db.pg.exec(`set role ${role}`);
  await assert.rejects(db.pg.query('select * from public.client_errors'), /permission denied/, `${role} can't read them`);
  await db.pg.exec('reset role');
}
console.log('OK: errors players hit: kept and grouped (one row, a count, across builds), Telegram only for new kinds (and comebacks), floods capped, admin lists and marks fixed, the website locked out');
