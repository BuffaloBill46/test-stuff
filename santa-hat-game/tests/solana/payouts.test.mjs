// The payout worker on the REAL Token-2022 program (LiteSVM) with the REAL 005 SQL (PGlite): winners are paid exactly once,
// even when the worker crashes at the worst moments. Run: cd tests/solana && npm install && node payouts.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LiteSVM, FailedTransactionMetadata } from 'litesvm';
import { PGlite } from '@electric-sql/pglite';
import { generateKeyPairSigner, createTransactionMessage, setTransactionMessageFeePayerSigner, appendTransactionMessageInstructions, signTransactionMessageWithSigners,
  setTransactionMessageLifetimeUsingBlockhash, getSignatureFromTransaction, pipe, lamports } from '@solana/kit';
import { getCreateAccountInstruction } from '@solana-program/system';
import { TOKEN_2022_PROGRAM_ADDRESS, getMintSize, getInitializeTransferFeeConfigInstruction, getInitializeMint2Instruction, findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction, getMintToInstruction, getTransferCheckedWithFeeInstruction, decodeToken } from '@solana-program/token-2022';
import { runPayouts, MAX_ATTEMPTS } from '../../server/payouts.js';

// --- chain: a 3%-fee test token, a pool wallet holding 10,000 SANTA, winners
const svm = new LiteSVM(), DEC = 6, BPS = 300;
const signer = async () => { const s = await generateKeyPairSigner(); svm.airdrop(s.address, lamports(10_000_000_000n)); return s; };
const run = async (payer, ixs) => { const m = pipe(createTransactionMessage({ version: 0 }), (x) => setTransactionMessageFeePayerSigner(payer, x), (x) => svm.setTransactionMessageLifetimeUsingLatestBlockhash(x), (x) => appendTransactionMessageInstructions(ixs, x));
  const r = svm.sendTransaction(await signTransactionMessageWithSigners(m)); assert.ok(!(r instanceof FailedTransactionMetadata), String(r.err?.())); };
const admin = await signer(), mint = await generateKeyPairSigner(), pool = await signer();
const ext = [{ __kind: 'TransferFeeConfig', transferFeeConfigAuthority: admin.address, withdrawWithheldAuthority: admin.address, withheldAmount: 0n,
  olderTransferFee: { epoch: 0n, maximumFee: 10n ** 15n, transferFeeBasisPoints: BPS }, newerTransferFee: { epoch: 0n, maximumFee: 10n ** 15n, transferFeeBasisPoints: BPS } }];
await run(admin, [getCreateAccountInstruction({ payer: admin, newAccount: mint, lamports: svm.minimumBalanceForRentExemption(BigInt(getMintSize(ext))), space: getMintSize(ext), programAddress: TOKEN_2022_PROGRAM_ADDRESS }),
  getInitializeTransferFeeConfigInstruction({ mint: mint.address, transferFeeConfigAuthority: admin.address, withdrawWithheldAuthority: admin.address, transferFeeBasisPoints: BPS, maximumFee: 10n ** 15n }),
  getInitializeMint2Instruction({ mint: mint.address, decimals: DEC, mintAuthority: admin.address, freezeAuthority: null })]);
const ata = async (owner) => (await findAssociatedTokenPda({ owner, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS, mint: mint.address }))[0];
const winners = await Promise.all([1, 2, 3, 4, 5, 6].map(() => signer()));
const poolAta = await ata(pool.address);
for (const w of [pool, ...winners]) await run(admin, [getCreateAssociatedTokenIdempotentInstruction({ payer: admin, ata: await ata(w.address), owner: w.address, mint: mint.address, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS })]);
await run(admin, [getMintToInstruction({ mint: mint.address, token: poolAta, mintAuthority: admin, amount: 10_000n * 10n ** 6n })]);
const bal = async (owner) => Number(decodeToken(svm.getAccount(await ata(owner))).data.amount);

// The chain adapter the worker uses (the live one does the same with a Solana RPC: getLatestBlockhash, sendTransaction,
// getSignatureStatuses + isBlockhashValid). `crash` makes the next step fail like a dying server.
const crash = { beforeSend: false, afterSend: false, dying: false };
const chain = {
  async sign(p) {
    const amount = BigInt(p.amount_raw), fee = (amount * BigInt(BPS) + 9999n) / 10000n, blockhash = svm.latestBlockhash(), destination = await ata(p.to_wallet);
    const m = pipe(createTransactionMessage({ version: 0 }), (x) => setTransactionMessageFeePayerSigner(pool, x),
      (x) => setTransactionMessageLifetimeUsingBlockhash({ blockhash, lastValidBlockHeight: 1_000_000n }, x),
      (x) => appendTransactionMessageInstructions([getTransferCheckedWithFeeInstruction({ source: poolAta, mint: mint.address, destination, authority: pool, amount, decimals: DEC, fee }),
        { programAddress: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', accounts: [], data: new TextEncoder().encode(`Santa Hat payout #${p.id}`) }], x)); // unique per payout
    const tx = await signTransactionMessageWithSigners(m);
    return { signature: getSignatureFromTransaction(tx), tx, blockhash };
  },
  async send(tx) {
    if (crash.beforeSend) { crash.beforeSend = false; throw new Error('server died before sending'); }
    const r = svm.sendTransaction(tx);
    if (crash.afterSend) { crash.afterSend = false; crash.dying = true; } // sent for real; the server dies at its next step
    if (r instanceof FailedTransactionMetadata) throw new Error('rejected');
  },
  async status(sig, blockhash) {
    if (crash.dying) { crash.dying = false; throw new Error('server died after sending'); }
    const t = svm.getTransaction(sig);
    if (t && !(t instanceof FailedTransactionMetadata)) return 'landed';
    if (t) return 'failed';
    return blockhash === svm.latestBlockhash() ? 'pending' : 'expired';
  },
};

// --- database: the real 001–005 SQL
const pg = new PGlite();
await pg.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), last_sign_in_at timestamptz);
  create table auth.identities (id uuid primary key default gen_random_uuid(), provider_id text, user_id uuid references auth.users, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
for (const f of ['001_profiles.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql']) await pg.exec(readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8'));
const db = { query: async (q, p) => (await pg.query(q, p)).rows };
const uid = (await db.query('insert into auth.users default values returning id'))[0].id;
await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, $2, 'W', '{}')`, [uid, winners[0].address]);
let playNo = 0;
async function payout(winner, santa, status = 'queued') {
  const id = (await db.query(`insert into public.plays (profile_id, kind, play_no, state, commit, secret, player_seed, result) values ($1, 'big', $2, 'settled', $3, 's', 'p', '{}') returning id`, [uid, ++playNo, 'a'.repeat(64)]))[0].id;
  return (await db.query(`insert into public.payouts (play_id, to_wallet, amount_usd, amount_raw, price_usd, status) values ($1, $2, 1, $3, 0.00085, $4) returning id`, [id, winner.address, santa * 1e6, status]))[0].id;
}
const row = async (id) => (await db.query('select * from public.payouts where id = $1', [id]))[0];
const got = (santa) => Math.floor(santa * 1e6) - Math.ceil(santa * 1e6 * BPS / 10000); // what arrives after the 3% tax

// 1) Normal: two winners paid, each arriving 3% lighter.
const [a, b] = [await payout(winners[0], 100), await payout(winners[1], 5)];
let rep = await runPayouts({ db, chain });
assert.equal(rep.sent, 2); assert.equal((await row(a)).status, 'sent'); assert.equal(await bal(winners[0].address), got(100)); assert.equal(await bal(winners[1].address), got(5));

// 2) Crash after the signature is saved but BEFORE sending: stays 'sending'; not resent while it could still land;
//    re-signed only after its blockhash expires; paid exactly once.
crash.beforeSend = true; const c = await payout(winners[2], 20);
await runPayouts({ db, chain });
assert.equal((await row(c)).status, 'sending'); assert.equal(await bal(winners[2].address), 0);
await runPayouts({ db, chain }); assert.equal(await bal(winners[2].address), 0, 'blockhash still valid: wait, never a second transaction');
svm.expireBlockhash();
rep = await runPayouts({ db, chain });
assert.equal(rep.resigned, 1); assert.equal((await row(c)).status, 'sent'); assert.equal(await bal(winners[2].address), got(20), 'paid once');

// 3) Crash AFTER sending, before it's marked sent: the next run finds it landed and does NOT send again.
crash.afterSend = true; const d = await payout(winners[3], 50);
let died = false; await runPayouts({ db, chain }).catch(() => { died = true; });
assert.ok(died && (await row(d)).status === 'sending' && (await row(d)).tx, 'the worker really died mid-payout, after sending');
svm.expireBlockhash(); // even with the blockhash gone, the saved signature shows it landed
rep = await runPayouts({ db, chain });
assert.equal((await row(d)).status, 'sent'); assert.equal(await bal(winners[3].address), got(50), 'landed once; the recovery never resent it');

// 4) Held payouts (above the sanity cap) are never touched by the worker.
const e = await payout(winners[4], 430, 'held');
await runPayouts({ db, chain }); assert.equal((await row(e)).status, 'held'); assert.equal(await bal(winners[4].address), 0);

// 5) The pool can't cover it: rejected each time, re-signed only after expiry, gives up after MAX_ATTEMPTS as 'failed'.
const f = await payout(winners[5], 1_000_000);
for (let i = 0; i < MAX_ATTEMPTS + 2; i++) { await runPayouts({ db, chain }); svm.expireBlockhash(); }
assert.equal((await row(f)).status, 'failed'); assert.equal(await bal(winners[5].address), 0);

// The books: the pool paid out exactly the sent payouts, nothing more.
const sent = await db.query(`select amount_raw from public.payouts where status = 'sent'`);
const paidOut = sent.reduce((s, r) => s + Number(r.amount_raw), 0);
assert.equal(10_000e6 - await bal(pool.address), paidOut, 'the pool lost exactly what was paid out');
console.log(`OK: payout worker on the real token program: ${sent.length} winners paid exactly once (including crash before send and crash after send), held payouts untouched, an unpayable one failed safely`);
