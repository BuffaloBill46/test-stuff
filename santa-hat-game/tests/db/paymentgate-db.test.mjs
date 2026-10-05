// FAST ARCADE PAYMENTS, the money side (Cody 2026-10-05; server/paymentgate.js + server/payouts.js 'wait'): a run starts on a
// CONFIRMED payment, so its winnings must wait for FINALIZED. Real payout loop on real SQL (PGlite) with a stand-in Solana:
// confirmed → the winning stays queued (nothing signed, no attempt used) while another run's finalized winning goes out in the same
// pass; finalized → paid exactly once; a failed payment, or one still not final after 10 minutes → HELD for Cody, never paid.
// Then LIVE (read-only, on this PC): one of Cody's real Arcade payments reads as finalized. Run: node tests/db/paymentgate-db.test.mjs
import assert from 'node:assert/strict';
import { makeDb } from './setup.mjs';
import { runPayouts } from '../../server/payouts.js';
import { makePaymentGate, FINAL_WAIT_MS } from '../../server/paymentgate.js';

const db = await makeDb(['001_profiles.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql']);
const W = 'GaTEwa11et'.padEnd(44, '1').replace(/[0OIl]/g, '9'), me = await db.player(W);
const runWithPayout = async (sig) => {
  const q = (await db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'drop', 1, 0.1, 0.1, 1, 0.0003) returning id`, [me]))[0].id;
  await db.query(`insert into public.payments (signature, quote_id, profile_id, kind, n, paid_raw, burned_raw, arrived_raw) values ($1, $2, $3, 'drop', 1, 1, 0, 1)`, [sig, q, me]);
  const run = (await db.query(`insert into public.runs (profile_id, signature, kind, n, bet) values ($1, $2, 'drop', 1, 0.1) returning id`, [me, sig]))[0].id;
  return (await db.query(`insert into public.payouts (run_id, to_wallet, amount_usd, amount_raw, price_usd) values ($1, $2, 1, 1000, 0.0003) returning id`, [run, W]))[0].id;
};
const SLOW = 'PayConfirmedOnly', FAST = 'PayAlreadyFinal', BAD = 'PayFailedOnChain', STUCK = 'PayNeverFinal';
const status = { [SLOW]: { confirmationStatus: 'confirmed', err: null }, [FAST]: { confirmationStatus: 'finalized', err: null }, [BAD]: { confirmationStatus: 'confirmed', err: { InstructionError: [0, 'x'] } }, [STUCK]: null };
const ids = { slow: await runWithPayout(SLOW), fast: await runWithPayout(FAST), bad: await runWithPayout(BAD), stuck: await runWithPayout(STUCK) };
let t = Date.now(), n = 0; const signed = [];
const base = { sign: async (p) => { signed.push(p.id); return { signature: 'sig-' + p.id + '-' + ++n, tx: 'tx', blockhash: 'bh' }; }, send: async () => {}, status: async () => 'landed' };
const chain = makePaymentGate({ db, statuses: async (sig) => status[sig] ?? null, now: () => t }).gate(base);
const row = async (id) => (await db.query('select status, attempts from public.payouts where id = $1', [id]))[0];

let rep = await runPayouts({ db, chain });
assert.deepEqual(await row(ids.slow), { status: 'queued', attempts: 0 }, 'payment only confirmed: the winning WAITS (nothing signed, no try used)');
assert.equal((await row(ids.fast)).status, 'sent', "another run's finalized payment pays in the same pass (not stuck behind it)");
assert.equal((await row(ids.bad)).status, 'held', 'a payment that FAILED on the network: held for Cody, never paid');
assert.equal((await row(ids.stuck)).status, 'queued', 'a payment Solana does not know yet: waits');
assert.ok(!signed.includes(ids.slow) && !signed.includes(ids.bad) && !signed.includes(ids.stuck), 'nothing was signed for them');
status[SLOW] = { confirmationStatus: 'finalized', err: null };
rep = await runPayouts({ db, chain });
assert.equal((await row(ids.slow)).status, 'sent', 'once finalized: paid');
assert.equal(signed.filter((x) => x === ids.slow).length, 1, 'exactly once');
t += FINAL_WAIT_MS + 1; // the stuck one never shows up
await db.query(`update public.payouts set created_at = now() - interval '11 minutes' where id = $1`, [ids.stuck]);
rep = await runPayouts({ db, chain });
assert.equal((await row(ids.stuck)).status, 'held', 'still not final after 10 minutes: held for Cody');

if (!process.env.CI && process.env.OFFLINE !== '1') {
  // one of Cody's real Arcade payments (2026-10-05, Big Hat $5): Solana says finalized, so its winnings were (and would be) paid
  const sig = '5QaWZ9hnPN6KzgKpgmvws7jWznUEiGppjTmEcDoHPhVV9pJ9gnfUxDkPyfoJH8ti3JBkgtSGWjSrCo3gtmFMYM9C';
  const live = makePaymentGate({ db: { query: async () => [{ signature: sig }] }, statuses: async (s) => (await (await fetch('https://api.mainnet-beta.solana.com', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignatureStatuses', params: [[s], { searchTransactionHistory: true }] }) })).json()).result.value[0] });
  assert.equal(await live.check({ run_id: 1, created_at: new Date() }), 'ok', "LIVE: Cody's real Big Hat payment reads as finalized");
}
console.log('OK: fast Arcade payments: winnings wait for a FINALIZED payment (others pay meanwhile), then pay once; failed or never-final payments are held, never paid' + (process.env.CI || process.env.OFFLINE === '1' ? '' : '; a real payment checked live'));
