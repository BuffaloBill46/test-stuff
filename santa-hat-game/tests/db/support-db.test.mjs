// SUPPORT (Cody, 2026-10-04: "a support button ... admin wallet tracks or telegram bot messages me"; supabase/046, server/support.js)
// on a real database with every migration, through the real server front door (server/http.js) and the real admin actions:
// a guest and a signed-in player send messages; each is kept and sent to Cody's Telegram bot at once (who, how to reach them,
// where, what); empty / too long refused; at most 5 an hour per connection or per player; the admin screen (admin-wallet-signed)
// lists them open first and marks one handled with a note; a stranger's wallet can't; the website can't read the table.
// Run: node tests/db/support-db.test.mjs
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { makeDb } from './setup.mjs';
import { createSupport, PER_HOUR } from '../../server/support.js';
import { makeHandler } from '../../server/http.js';
import { createAdmin, adminMessage, b58encode } from '../../server/admin.js';

const FILES = readdirSync(new URL('../../supabase/', import.meta.url)).filter((f) => /^0\d\d_.*\.sql$/.test(f) && f !== '031_games_role.sql').sort();
const db = await makeDb(FILES);
for (const m of ['046_support.sql', '047_support_tickets.sql']) for (let i = 0; i < 2; i++) await db.pg.exec((await import('node:fs')).readFileSync(new URL('../../supabase/' + m, import.meta.url), 'utf8')); // safe twice
const sent = [], telegram = { send: async (t) => { sent.push(t); } };
const support = createSupport({ db, telegram });
const WALLET = 'SuPPoRTwa11et'.padEnd(44, '1').replace(/[0OIl]/g, '9');
const ann = await db.player(WALLET, 'Ann');
const handle = makeHandler({ server: {}, support, limiter: null, profileFor: async (t) => (t === 'ann-token' ? ann : null) });
let ip = '203.0.113.7';
const post = async (body, token) => { const r = await handle(new Request('http://localhost/api', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }));
  return { status: r.status, ...(await r.json()) }; };

// 1. a guest (not signed in: can't sign in is the commonest problem) and a signed-in player
const g = await post({ action: 'support', message: "I can't sign in with my email, the code never comes", contact: 'guest@example.com', page: 'home' });
assert.ok(g.status === 200 && g.ok && g.id > 0, 'a guest can send a message: ' + JSON.stringify(g));
assert.ok(/SUPPORT ticket #\d+ from a guest \(not signed in\)/.test(sent[0]) && /Reach them: guest@example\.com/.test(sent[0]) && /On: home/.test(sent[0]) && /code never comes/.test(sent[0]), 'Telegram got it at once: ' + sent[0]);
ip = '203.0.113.8';
const a = await post({ action: 'support', message: 'My Big Hat win never arrived', page: 'games' }, 'ann-token');
assert.ok(a.ok, 'a signed-in player can send one');
assert.ok(/from Ann \(Supp…1111\)|from Ann \(\w{4}…\w{4}\)/.test(sent[1]) && /No contact given/.test(sent[1]), 'Telegram says who (name, short wallet), and that no contact was given: ' + sent[1]);
const [row] = await db.query('select profile_id, contact, page, status, address_hash from public.support_messages where id = $1', [a.id]);
assert.ok(row.profile_id === ann && row.contact === null && row.page === 'games' && row.status === 'open' && /^[0-9a-f]{32}$/.test(row.address_hash) && !row.address_hash.includes('203'), 'kept: who, where, open; the connection only as a one-way fingerprint');

// 2. refused: nothing written, too long, too many an hour (per connection, and per player across connections)
assert.match((await post({ action: 'support', message: '   ' })).error, /write a message/);
assert.match((await post({ action: 'support', message: 'x'.repeat(1001) })).error, /under 1000/);
assert.match((await post({ action: 'support', message: 'hi', contact: 'c'.repeat(121) })).error, /contact is too long/);
ip = '198.51.100.1'; for (let i = 0; i < PER_HOUR; i++) assert.ok((await post({ action: 'support', message: 'spam ' + i })).ok);
assert.match((await post({ action: 'support', message: 'one more' })).error, /several messages this hour/, `the ${PER_HOUR + 1}th from one connection in an hour: refused`);
for (let i = 1; i < PER_HOUR; i++) { ip = '192.0.2.' + i; assert.ok((await post({ action: 'support', message: 'Ann again ' + i }, 'ann-token')).ok); }
ip = '192.0.2.99'; assert.match((await post({ action: 'support', message: 'Ann from a new connection' }, 'ann-token')).error, /several messages/, 'and from one PLAYER, whatever connection');
const before = sent.length; await db.query(`update public.support_messages set created_at = now() - interval '2 hours'`);
assert.ok((await post({ action: 'support', message: 'an hour later' }, 'ann-token')).ok && sent.length === before + 1, 'an hour later: fine again');

// 3. the admin screen: only an admin wallet; open first; mark handled with a note
const key = async () => { const k = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']); return { k, address: b58encode(new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey))) }; };
const cody = await key(), stranger = await key(), nonce = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
const signed = async (w, fields) => { const message = adminMessage({ at: new Date().toISOString(), nonce: nonce(), ...fields });
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', w.k.privateKey, new TextEncoder().encode(message)));
  return { wallet: w.address, message, signature: [...sig].map((b) => b.toString(16).padStart(2, '0')).join('') }; };
const admin = createAdmin({ db, adminWallets: [cody.address], support });
assert.match((await admin.run(await signed(stranger, { action: 'support-list', game: 'support' }))).error, /not an admin wallet/, 'a stranger can\'t read them');
let l = await admin.run(await signed(cody, { action: 'support-list', game: 'support' }));
assert.ok(l.ok && l.messages.length >= 3 && l.messages[0].status === 'open', 'Cody reads them, open first');
const annMsg = l.messages.find((m) => m.id === a.id);
assert.ok(annMsg.name === 'Ann' && annMsg.wallet === WALLET && /never arrived/.test(annMsg.message), 'with who wrote and what');
const h = await admin.run(await signed(cody, { action: 'support-handled', game: 'support', settings: { id: a.id, note: 'resent the payout' } }));
assert.ok(h.ok && h.id === a.id, 'Cody marks it handled: ' + JSON.stringify(h));
assert.match((await admin.run(await signed(cody, { action: 'support-handled', game: 'support', settings: { id: a.id } }))).error, /no open support message/, 'not twice');
const [hr] = await db.query('select status, handled_by, note from public.support_messages where id = $1', [a.id]);
assert.ok(hr.status === 'handled' && hr.handled_by === cody.address && hr.note === 'resent the payout', 'kept: handled, by which admin wallet, the note');
l = await admin.run(await signed(cody, { action: 'support-list', game: 'support' }));
assert.equal(l.messages.find((m) => m.id === a.id).status, 'handled', 'the list shows it handled, after the open ones');

// 3b. TICKETS the player follows (Cody 2026-10-04; 047): a guest with the code their browser kept sees Pending, then Resolved with
//     Cody's note; a wrong code, or someone else's ticket, shows nothing; signed in, Ann sees all of hers with no codes at all.
//     A RESOLVED ticket can be cleared from the player's list (its ×); a pending one can't, nor anyone else's.
{ const st = async (body, token) => (await post({ action: 'support-status', ...body }, token));
  assert.ok(/^[A-Za-z0-9_-]{24}$/.test(g.key || ''), 'the sender gets a secret ticket code: ' + g.key);
  let r = await st({ tickets: [{ id: g.id, key: g.key }] });
  assert.ok(r.ok && r.tickets.length === 1 && r.tickets[0].id === g.id && r.tickets[0].status === 'pending' && r.tickets[0].note === null && /sign in/.test(r.tickets[0].about), 'a guest follows their ticket: pending ' + JSON.stringify(r));
  assert.equal((await st({ tickets: [{ id: g.id, key: 'x'.repeat(24) }] })).tickets.length, 0, 'a wrong code: nothing');
  assert.equal((await st({ tickets: [{ id: a.id, key: g.key }] })).tickets.length, 0, "someone else's ticket with my code: nothing");
  assert.equal((await st({ tickets: [{ id: g.id, key: g.key }] }, 'ann-token')).tickets.filter((t) => t.id === g.id).length, 1, "signed in, my browser's guest ticket still shows");
  const annT = (await st({}, 'ann-token')).tickets;
  assert.ok(annT.length >= 5 && annT.every((t) => t.id !== g.id) && annT.some((t) => t.id === a.id && t.status === 'resolved' && t.note === 'resent the payout'), "signed in, Ann sees all of hers (no codes), the handled one Resolved with Cody's note");
  const clear = (body, token) => post({ action: 'support-clear', ...body }, token);
  assert.match((await clear({ id: g.id, tickets: [{ id: g.id, key: g.key }] })).error, /only your own resolved/, 'a PENDING ticket has no × and cannot be cleared');
  await admin.run(await signed(cody, { action: 'support-handled', game: 'support', settings: { id: g.id, note: 'Email codes fixed, try again' } }));
  r = await st({ tickets: [{ id: g.id, key: g.key }] });
  assert.ok(r.tickets[0].status === 'resolved' && r.tickets[0].note === 'Email codes fixed, try again' && r.tickets[0].resolvedAt > 0, 'once Cody resolves it, the guest sees Resolved and his note');
  assert.match((await clear({ id: g.id, tickets: [{ id: g.id, key: 'y'.repeat(24) }] })).error, /only your own/, "someone else can't clear it");
  assert.match((await clear({ id: g.id }, 'ann-token')).error, /only your own/, "nor another signed-in player");
  assert.ok((await clear({ id: g.id, tickets: [{ id: g.id, key: g.key }] })).ok, 'the guest clears their resolved ticket (×)');
  assert.equal((await st({ tickets: [{ id: g.id, key: g.key }] })).tickets.length, 0, 'gone from their list');
  assert.ok((await clear({ id: a.id }, 'ann-token')).ok && (await st({}, 'ann-token')).tickets.every((t) => t.id !== a.id), 'signed in: cleared on every device (kept on the server)');
  assert.ok((await admin.run(await signed(cody, { action: 'support-list', game: 'support' }))).messages.some((m) => m.id === g.id), 'Cody still has the cleared ones');
  assert.ok((await st({ tickets: 'nonsense' })).ok && (await st({ tickets: Array(50).fill({ id: 1, key: 'k' }) })).ok, 'odd input is just ignored'); }

// 4. the website (signed in or not) can't read or write the messages
for (const role of ['anon', 'authenticated']) {
  await db.pg.exec(`set role ${role}`);
  await assert.rejects(db.pg.query('select * from public.support_messages'), /permission denied/, `${role} can't read them`);
  await assert.rejects(db.pg.query(`insert into public.support_messages (message) values ('x')`), /permission denied/, `${role} can't write them`);
  await db.pg.exec('reset role');
}
// 5. no Telegram set up: still kept (and on the admin screen)
const quiet = createSupport({ db, telegram: null });
assert.ok((await quiet.submit({ address: '10.0.0.1', message: 'no bot yet' })).ok, 'without Telegram the message is still kept');
console.log('OK: support: guests and players send messages, kept and sent to Cody\'s Telegram at once (who, contact, where); empty/too long/too many refused; admin wallet lists and marks handled (strangers can\'t); the website can\'t read them');
