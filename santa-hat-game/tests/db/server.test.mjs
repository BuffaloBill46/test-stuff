// The game server's steps (server/games.js) end to end on real Postgres (PGlite) with the real 001–005 SQL:
// quote → pay (a finalized-transaction stand-in) → buy → open → settle, cheating attempts, and plays settling at the same time.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createGameServer } from '../../server/games.js';
import { check } from '../../mockups/house.js';
import { newSeed } from '../../mockups/fair.js';
import { splitPayment, MINT } from '../../mockups/market.js';

const pg = new PGlite();
await pg.exec(`
  create role anon; create role authenticated; create role service_role; create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb,
    created_at timestamptz default now(), updated_at timestamptz default now(), last_sign_in_at timestamptz);
  create table auth.identities (id uuid primary key default gen_random_uuid(), provider_id text, user_id uuid references auth.users, identity_data jsonb,
    provider text, last_sign_in_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
for (const f of ['001_profiles.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql']) await pg.exec(readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8'));
const db = { query: async (q, p) => (await pg.query(q, p)).rows, tx: (fn) => pg.transaction((t) => fn({ query: async (q, p) => (await t.query(q, p)).rows })) };
const one = async (q, p) => (await db.query(q, p))[0];

const PLAYER = 'PLAYERwa11et111111111111111111111111111111', OTHER = 'THEMwa11et11111111111111111111111111111111';
const POOLS = { spin: 'SPINpoo1wa11et11111111111111111111111111111', slots: 'SLOTSpoo1wa11et1111111111111111111111111111' };
const FEE = { bps: 300, max: 1e15 }, PRICE = 0.0008508;
const mk = async (wallet) => { const id = (await one('insert into auth.users default values returning id')).id; await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, $2, 'P', '{}')`, [id, wallet]); return id; };
const me = await mk(PLAYER), them = await mk(OTHER);
await db.query(`insert into public.pools (game, pool, rules) values ('spin', 50, '{}'), ('slots', 500, '{}')`);

// Finalized transactions the stand-in chain returns (shaped like Solana's getTransaction jsonParsed).
const txs = new Map();
function pay(sig, { from = PLAYER, to, total, at = Date.now() }) {
  const s = splitPayment(total, 1000, FEE), b = (i, o, a) => ({ accountIndex: i, mint: MINT, owner: o, uiTokenAmount: { amount: String(a), decimals: 6 } });
  txs.set(sig, { blockTime: Math.floor(at / 1000), meta: { err: null, innerInstructions: [], preTokenBalances: [b(1, from, 1e13), b(2, to, 1e12)], postTokenBalances: [b(1, from, 1e13 - total), b(2, to, 1e12 + s.arrives)] },
    transaction: { message: { accountKeys: [{ pubkey: from, signer: true }], instructions: [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { mint: MINT, authority: from, tokenAmount: { amount: String(s.burn) } } } }] } } });
}
const server = createGameServer({ db, chain: { getTransaction: async (s) => txs.get(s) ?? null }, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, poolWallets: POOLS });
const credits = async (p, k) => +((await one('select left_n from public.credits where profile_id = $1 and kind = $2', [p, k]))?.left_n ?? 0);
const pool = async (g) => +(await one('select pool from public.pools where game = $1', [g])).pool;

// Buy 10 $1 spins.
let q = await server.quote(me, 'spin100', 10);
assert.equal(q.usd, 10); assert.equal(q.santaRaw, Math.round(10 / PRICE * 1e6));
pay('sigA', { to: POOLS.spin, total: q.santaRaw });
let b = await server.buy(me, q.id, 'sigA');
assert.deepEqual(b, { ok: true, kind: 'spin100', left: 10 });
assert.ok(Math.abs(await pool('spin') - (50 + 10 * 0.87591)) < 0.001, 'the entries reached the Spin pool at purchase');

// Cheats and mistakes: nothing is added.
const q2 = await server.quote(me, 'spin100', 5);
const replay = await server.quote(me, 'spin100', 10); // same amount, so only the one-use rule can stop it
assert.equal((await server.buy(me, replay.id, 'sigA')).error, 'payment already used');
assert.match((await server.buy(me, q2.id, 'sigA')).error, /quote was/, 'a payment for a different amount is refused too');
pay('sigWrongPool', { to: POOLS.slots, total: q2.santaRaw }); assert.match((await server.buy(me, q2.id, 'sigWrongPool')).error, /pool received/);
pay('sigTheirs', { from: OTHER, to: POOLS.spin, total: q2.santaRaw }); assert.match((await server.buy(me, q2.id, 'sigTheirs')).error, /not signed/);
pay('sigLate', { to: POOLS.spin, total: q2.santaRaw, at: Date.now() + 5 * 60_000 }); assert.match((await server.buy(me, q2.id, 'sigLate')).error, /quote window/);
assert.equal((await server.buy(them, q2.id, 'sigA')).error, 'unknown quote', 'someone else can\'t use my quote');
assert.equal(await credits(me, 'spin100'), 10);

// Play all 10, checking every result, and that the pool moves only by what's paid out (+ skim / top-off).
let expectPool = await pool('spin');
for (let i = 0; i < 10; i++) {
  const o = await server.open(me, 'spin100'); assert.ok(o.ticket, JSON.stringify(o));
  assert.equal((await one('select secret is not null as locked, state from public.plays where id = $1', [o.ticket])).state, 'open');
  const s = await server.settle(me, o.ticket, newSeed(16));
  assert.ok(s.r, JSON.stringify(s));
  assert.equal(s.proof.commit, o.commit, 'the revealed play matches the fingerprint shown at open');
  const c = await check(s.proof); assert.ok(c.matches); assert.equal(c.outcome.slice, s.r.slice, 'anyone can re-check the result');
  expectPool += -s.r.pay - (s.r.skim || 0) + (s.r.topOff || 0);
  assert.ok(Math.abs(await pool('spin') - expectPool) < 1e-4);
  assert.equal((await server.settle(me, o.ticket, newSeed(16))).error, 'no open play with that ticket', 'settles once');
}
assert.deepEqual(await server.open(me, 'spin100'), { noCredit: true });

// Slots: 10 pulls opened and settled at the same time; every pool change must be counted.
// NOTE: PGlite runs transactions one at a time, so this can't catch a missing pool lock (checked: removing "for update" still
// passes here). The lock must be proven on a real multi-connection Postgres before launch (TODO → Before anything paid goes live).
q = await server.quote(me, 'big', 10); pay('sigB', { to: POOLS.slots, total: q.santaRaw }); assert.ok((await server.buy(me, q.id, 'sigB')).ok);
const startSlots = await pool('slots');
const opened = await Promise.all(Array.from({ length: 10 }, () => server.open(me, 'big')));
assert.equal(opened.filter((o) => o.ticket).length, 10);
const settled = await Promise.all(opened.map((o) => server.settle(me, o.ticket, newSeed(16))));
const moved = settled.reduce((a, s) => a - s.r.pay - (s.r.skim || 0) + (s.r.topOff || 0), 0);
assert.ok(Math.abs(await pool('slots') - (startSlots + moved)) < 1e-4, 'simultaneous settles: every pool change counted');
assert.equal(await credits(me, 'big'), 0);

// Someone else can't settle my play; a paused pool refuses and keeps the credit.
q = await server.quote(me, 'spin10', 2); pay('sigC', { to: POOLS.spin, total: q.santaRaw }); await server.buy(me, q.id, 'sigC');
const o = await server.open(me, 'spin10');
assert.equal((await server.settle(them, o.ticket, newSeed(16))).error, 'no open play with that ticket');
await server.settle(me, o.ticket, newSeed(16));
await db.query(`update public.pools set rules = '{"paused": true}' where game = 'spin'`);
assert.deepEqual(await server.open(me, 'spin10'), { refused: true, stopped: true }); assert.equal(await credits(me, 'spin10'), 1);
const books = await db.query('select * from public.credits where bought <> used + left_n'); assert.equal(books.length, 0);
console.log(`OK: quote → pay → buy → open → settle on real Postgres; 5 bad payments refused; 20 plays re-checked; 10 settles at once all counted (pool lock itself: to prove on real Postgres); paused pool keeps the credit`);
