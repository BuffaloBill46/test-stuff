// RENT-DRAIN GUARD (security review 2026-10-03; server/solanachain.js + server/payouts.js): the pool opens a winner's SANTA account
// at most once a day per wallet. Real adapter (real @solana/kit + token-2022 instruction builders, real signing) with a stand-in
// network that says the winner's account is missing; the real worker loop on real Postgres (PGlite, live SQL files).
// Run: node rent-guard.test.mjs
import assert from 'node:assert/strict';
import { makeDb } from './setup.mjs';
import { runPayouts } from '../../server/payouts.js';
import { makeSolanaChain } from '../../server/solanachain.js';
const kit = await import('../solana/node_modules/@solana/kit/dist/index.node.mjs');
const T22 = await import('../solana/node_modules/@solana-program/token-2022/dist/src/index.mjs');

const pool = await kit.generateKeyPairSigner(), winner = (await kit.generateKeyPairSigner()).address, other = (await kit.generateKeyPairSigner()).address;
let t = Date.parse('2026-10-04T00:00:00Z'), exists = new Set(); // which token accounts the "network" has
const call = (value) => ({ send: async () => value });
const rpc = {
  getAccountInfo: (a) => call({ value: exists.has(String(a)) ? { data: ['', 'base64'] } : null }),
  getLatestBlockhash: () => call({ value: { blockhash: '4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZAMdL4VZHirAn', lastValidBlockHeight: 10n } }),
  isBlockhashValid: () => call({ value: true }), getSignatureStatuses: () => call({ value: [null] }), sendTransaction: () => call('sig'),
};
const MINT = 'Jx95so9XYhtSJJoqup7Xb3T9Ptr9ZuUTXSgPcu6uttg';
const chain = makeSolanaChain({ kit, T22, rpcUrl: 'x', mint: MINT, rpc, now: () => t, keyFor: async () => pool, to: async (r) => r.to_wallet,
  feeOf: async () => ({ bps: 300, max: 1e15 }), label: (r) => `Santa Hat payouts #${r.id}` });
const opens = (s) => s.tx.messageBytes && kit.getCompiledTransactionMessageDecoder().decode(s.tx.messageBytes).instructions.length;

// the adapter alone
const a = await chain.sign({ id: 1, amount_raw: 1000, to_wallet: winner });
assert.ok(a.signature && !a.hold, 'first payout to a wallet with no account: signed (the pool opens it once)');
assert.equal(opens(a), 3, 'open + transfer + memo');
const b = await chain.sign({ id: 2, amount_raw: 1000, to_wallet: winner });
assert.ok(b.hold && !b.signature, 'another payout, same wallet, its account missing AGAIN within a day: held, not signed');
assert.ok((await chain.sign({ id: 1, amount_raw: 1000, to_wallet: winner })).signature, 're-signing the SAME payout (an expired try) is never held');
assert.ok((await chain.sign({ id: 3, amount_raw: 1000, to_wallet: other })).signature, 'other wallets are not affected');
exists.add(String((await T22.findAssociatedTokenPda({ owner: winner, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS, mint: MINT }))[0]));
assert.ok((await chain.sign({ id: 4, amount_raw: 1000, to_wallet: winner })).signature, 'an account that exists: always signed');
exists = new Set(); t += 86_400_001;
assert.ok((await chain.sign({ id: 5, amount_raw: 1000, to_wallet: winner })).signature, 'a day later it may be opened again');

// the worker: a held payout is parked for Cody and the queue keeps moving
const db = await makeDb(['001_profiles.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql']);
const me = await db.player(winner);
for (const [i, w] of [winner, winner, other].entries()) { // one payout per run (005): three runs
  const q = (await db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'drop', 1, 0.1, 0.1, 1, 0.0003) returning id`, [me]))[0].id;
  await db.query(`insert into public.payments (signature, quote_id, profile_id, kind, n, paid_raw, burned_raw, arrived_raw) values ($1, $2, $3, 'drop', 1, 1, 0, 1)`, ['S' + i, q, me]);
  const run = (await db.query(`insert into public.runs (profile_id, signature, kind, n, bet) values ($1, $2, 'drop', 1, 0.1) returning id`, [me, 'S' + i]))[0].id;
  await db.query(`insert into public.payouts (run_id, to_wallet, amount_usd, amount_raw, price_usd) values ($1, $2, 0.3, 1000, 0.0003)`, [run, w]); }
const fresh = makeSolanaChain({ kit, T22, rpcUrl: 'x', mint: MINT, rpc, now: () => t, keyFor: async () => pool, to: async (r) => r.to_wallet, feeOf: async () => ({ bps: 300, max: 1e15 }), label: (r) => `Santa Hat payouts #${r.id}` });
const rep = await runPayouts({ db, chain: fresh });
const st = (await db.query('select to_wallet, status from public.payouts order by id')).map((r) => r.status);
assert.deepEqual(st, ['sending', 'held', 'sending'], 'the 2nd opening for the same wallet is HELD for Cody; the others go out (pending on the stand-in network)');
assert.equal(rep.held, 1);
console.log('OK: rent-drain guard: a winner\'s token account is opened by the pool at most once a day per wallet; a 2nd within a day is held for Cody (not signed), the rest of the queue keeps moving; re-signing the same payout, existing accounts and other wallets are never held');
