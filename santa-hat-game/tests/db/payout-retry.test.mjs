// PAYOUTS NEVER GIVE UP (Cody 2026-10-05: "make sure payouts never pause. That is a big no no"; server/payouts.js). A winning
// whose send keeps failing (the pool wallet short of SANTA or SOL, or Solana in trouble) used to be marked 'failed' after 5 tries
// and never sent. Now: past 5 tries it's never 'failed', it's retried once every 2 minutes (not every few seconds), it pays the
// moment the trouble ends, EXACTLY ONCE, and the alert says it's still being retried. Real worker loop, real SQL (PGlite).
// Run: node tests/db/payout-retry.test.mjs
import assert from 'node:assert/strict';
import { makeDb } from './setup.mjs';
import { runPayouts, MAX_ATTEMPTS, RETRY_EVERY_MS } from '../../server/payouts.js';

const db = await makeDb(['001_profiles.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql']);
const W = 'ReTRYwa11et'.padEnd(44, '1').replace(/[0OIl]/g, '9'), me = await db.player(W);
const q = (await db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'drop', 1, 0.1, 0.1, 1, 0.0003) returning id`, [me]))[0].id;
await db.query(`insert into public.payments (signature, quote_id, profile_id, kind, n, paid_raw, burned_raw, arrived_raw) values ('R1', $1, $2, 'drop', 1, 1, 0, 1)`, [q, me]);
const run = (await db.query(`insert into public.runs (profile_id, signature, kind, n, bet) values ($1, 'R1', 'drop', 1, 0.1) returning id`, [me]))[0].id;
const [{ id }] = await db.query(`insert into public.payouts (run_id, to_wallet, amount_usd, amount_raw, price_usd) values ($1, $2, 2.5, 8000, 0.0003) returning id`, [run, W]);

// a stand-in Solana: while `broken`, every transaction fails on the chain (as with an empty pool); `landed` counts real payments
let broken = true, n = 0, t = Date.parse('2026-10-05T12:00:00Z');
const landed = new Set(), signed = [];
const chain = {
  sign: async (p) => { const s = { signature: `sig-${p.id}-${++n}`, tx: `tx${n}`, blockhash: `bh${n}` }; signed.push(s.signature); return s; },
  send: async () => {},
  status: async (sig) => { if (broken) return 'failed'; landed.add(sig); return 'landed'; },
};
const row = async () => (await db.query('select status, attempts from public.payouts where id = $1', [id]))[0];
const tick = (ms = 5000) => { t += ms; return runPayouts({ db, chain, now: () => t, tries: tries }); };
const tries = new Map();

for (let i = 0; i < MAX_ATTEMPTS + 3; i++) await tick();
let r = await row();
assert.notEqual(r.status, 'failed', 'after 5 failed tries it is NOT given up ' + JSON.stringify(r));
assert.equal(r.status, 'sending');
assert.equal(r.attempts, MAX_ATTEMPTS + 1, 'past 5 tries, a few seconds apart, it is not hammered (one retry, then it waits)');
const alert = await db.query(`select id from public.payouts where status = 'sending' and attempts >= 5`);
assert.equal(alert.length, 1, "the alert's query finds it (\"still being retried\")");
for (let k = 0; k < 3; k++) { await tick(RETRY_EVERY_MS + 1); }
assert.equal((await row()).attempts, MAX_ATTEMPTS + 4, 'then once every 2 minutes, for as long as it takes');

broken = false; // the pool is topped up / Solana is back
await tick(RETRY_EVERY_MS + 1);
r = await row();
assert.equal(r.status, 'sent', 'it pays the moment the trouble ends');
assert.equal(landed.size, 1, 'EXACTLY ONCE: one transaction landed');
for (let k = 0; k < 5; k++) await tick(RETRY_EVERY_MS + 1);
assert.equal(landed.size, 1, 'and never again'); assert.equal((await row()).status, 'sent');
console.log(`OK: payouts never give up: past ${MAX_ATTEMPTS} failed tries they're retried every ${RETRY_EVERY_MS / 60000} minutes (never 'failed'), pay the moment the trouble ends, exactly once (${signed.length} tries, 1 landed)`);
