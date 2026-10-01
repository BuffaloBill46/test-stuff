// Bot signals through the admin door on real Postgres (PGlite) with the real SQL: Cody's signed request lists the scripted
// player (and not the person), anyone else is refused, and the check is read-only (nothing logged, nothing changed).
import assert from 'node:assert/strict';
import { makeDb, directRun } from './setup.mjs';
import { createAdmin, adminMessage, b58encode } from '../../server/admin.js';

const db = await makeDb();
const wallet = async () => { const k = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  return { k, address: b58encode(new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey))) }; };
const cody = await wallet(), stranger = await wallet();
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
async function signed(w, fields) {
  const message = adminMessage({ at: new Date().toISOString(), nonce: hex(crypto.getRandomValues(new Uint8Array(16))), settings: {}, ...fields });
  return { wallet: w.address, message, signature: hex(new Uint8Array(await crypto.subtle.sign('Ed25519', w.k.privateKey, new TextEncoder().encode(message)))) };
}
const admin = createAdmin({ db, adminWallets: [cody.address] });

// Two players, 40 runs each over the last ~2 hours: a script reacting 2.0 s (±0.05) after each run ends; a person 1–40 s.
const bot = await db.player('BoTwa11et'.padEnd(44, '1'), 'Speedy'), person = await db.player('PersQnwa11et'.padEnd(44, '1'), 'Jo');
let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
for (const [who, react] of [[bot, () => 2 + (rnd() - 0.5) * 0.1], [person, () => 1 + rnd() * rnd() * 39]]) {
  let t = Date.now() - 2 * 3600e3;
  for (let i = 0; i < 40; i++) {
    const { run } = await directRun(db, who, 'spin', 1, 1);
    const paid = t + (15 + rnd() * 6) * 1000; // payment confirmed + the play
    await db.query(`update public.quotes set created_at = $2 where id = (select pa.quote_id from public.runs r join public.payments pa on pa.signature = r.signature where r.id = $1)`, [run, new Date(t)]);
    await db.query('update public.runs set paid_at = $2 where id = $1', [run, new Date(paid)]);
    t = paid + react() * 1000;
  }
}
const logBefore = (await db.query('select count(*)::int as n from public.pool_log'))[0].n;
const r = await admin.run(await signed(cody, { action: 'bot-signals', game: 'all' }));
assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.checkedRuns, 80);
assert.deepEqual(r.flagged.map((f) => f.name), ['Speedy'], 'the script is listed, the person is not');
assert.ok(r.flagged[0].reasons.some((x) => x.signal === 'clockwork' && x.strong));
assert.equal(r.flagged[0].wallet, 'BoTwa11et'.padEnd(44, '1'), 'full wallet: only Cody sees this list');
assert.match((await admin.run(await signed(stranger, { action: 'bot-signals', game: 'all' }))).error, /not an admin wallet/);
assert.match((await admin.run(await signed(cody, { action: 'bot-signals', game: 'spin' }))).error, /unknown action or game/);
const stale = await signed(cody, { action: 'bot-signals', game: 'all', at: new Date(Date.now() - 10 * 60e3).toISOString() });
assert.match((await admin.run(stale)).error, /too old/);
assert.equal((await db.query('select count(*)::int as n from public.pool_log'))[0].n, logBefore, 'read only: nothing logged');
console.log('OK: bot signals via the admin door: Cody\'s signed check lists the 2-second script (clockwork), not the person; others refused; read only');
