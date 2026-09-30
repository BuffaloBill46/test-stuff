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
const FEE = { bps: 300, max: 1e15 }; let PRICE = 0.0008508; // changes mid-test: the pools float with it
const mk = async (wallet) => { const id = (await one('insert into auth.users default values returning id')).id; await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, $2, 'P', '{}')`, [id, wallet]); return id; };
const me = await mk(PLAYER), them = await mk(OTHER);
const START = { spin: Math.round(50 / PRICE * 1e6), slots: Math.round(500 / PRICE * 1e6) }; // $50 / $500 of SANTA at today's price
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', $1, '{}'), ('slots', $2, '{}')`, [START.spin, START.slots]);

// Finalized transactions the stand-in chain returns (shaped like Solana's getTransaction jsonParsed).
const txs = new Map();
function pay(sig, { from = PLAYER, to, total, at = Date.now() }) {
  const s = splitPayment(total, 1000, FEE), b = (i, o, a) => ({ accountIndex: i, mint: MINT, owner: o, uiTokenAmount: { amount: String(a), decimals: 6 } });
  txs.set(sig, { blockTime: Math.floor(at / 1000), meta: { err: null, innerInstructions: [], preTokenBalances: [b(1, from, 1e13), b(2, to, 1e12)], postTokenBalances: [b(1, from, 1e13 - total), b(2, to, 1e12 + s.arrives)] },
    transaction: { message: { accountKeys: [{ pubkey: from, signer: true }], instructions: [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { mint: MINT, authority: from, tokenAmount: { amount: String(s.burn) } } } }] } } });
}
const server = createGameServer({ db, chain: { getTransaction: async (s) => txs.get(s) ?? null }, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, poolWallets: POOLS });
const credits = async (p, k) => +((await one('select left_n from public.credits where profile_id = $1 and kind = $2', [p, k]))?.left_n ?? 0);
const pool = async (g) => +(await one('select santa_raw from public.pools where game = $1', [g])).santa_raw; // SANTA, smallest unit

// Buy 10 $1 spins.
let q = await server.quote(me, 'spin100', 10);
assert.equal(q.usd, 10); assert.equal(q.santaRaw, Math.round(10 / PRICE * 1e6));
pay('sigA', { to: POOLS.spin, total: q.santaRaw });
let b = await server.buy(me, q.id, 'sigA');
assert.deepEqual(b, { ok: true, kind: 'spin100', left: 10 });
assert.equal(await pool('spin'), START.spin + splitPayment(q.santaRaw, 1000, FEE).arrives, 'exactly the SANTA that arrived reached the Spin pool at purchase');

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
  expectPool += s.poolDelta;
  assert.equal(await pool('spin'), expectPool, 'the pool\'s SANTA changes by exactly the play\'s movements');
  assert.ok(Math.abs(s.payRaw - Math.round(s.r.pay / PRICE * 1e6)) <= 1, 'the payout is the dollar prize in SANTA at the live price');
  assert.equal((await server.settle(me, o.ticket, newSeed(16))).error, 'no open play with that ticket', 'settles once');
}
assert.deepEqual(await server.open(me, 'spin100'), { noCredit: true });

// Slots: 10 pulls opened and settled at the same time; every pool change must be counted.
// NOTE: PGlite runs transactions one at a time, so this can't catch a missing pool lock (checked: removing "for update" still
// passes here). The lock must be proven on a real multi-connection Postgres before launch (TODO → Before anything paid goes live).
q = await server.quote(me, 'big', 10); pay('sigB', { to: POOLS.slots, total: q.santaRaw }); assert.ok((await server.buy(me, q.id, 'sigB')).ok);
const startSlots = await pool('slots');
// One play at a time per player: 10 taps at once → exactly 1 play, 9 told to wait, only 1 credit spent.
const burst = await Promise.all(Array.from({ length: 10 }, () => server.open(me, 'big')));
assert.equal(burst.filter((o) => o.ticket).length, 1); assert.equal(burst.filter((o) => o.busy).length, 9);
assert.equal(await credits(me, 'big'), 9, 'the 9 refused taps spent nothing');
let moved = (await server.settle(me, burst.find((o) => o.ticket).ticket, newSeed(16))).poolDelta;
for (let i = 0; i < 9; i++) { const o = await server.open(me, 'big'); moved += (await server.settle(me, o.ticket, newSeed(16))).poolDelta; }
// 10 different players settling at the same time: every SANTA movement counted.
const others = [];
// fake wallet addresses must be valid base58: no 0, O, I or l
for (let i = 0; i < 10; i++) { const w = 'PLAYR' + 'abcdefghjk'[i].repeat(3) + 'wa11et'.padEnd(34, '1'); const id = await mk(w);
  await db.query(`insert into public.credits (profile_id, kind, left_n, bought) values ($1, 'big', 1, 1)`, [id]); others.push(id); }
const opened = await Promise.all(others.map((id) => server.open(id, 'big')));
assert.equal(opened.filter((o) => o.ticket).length, 10);
const settled = await Promise.all(opened.map((o, i) => server.settle(others[i], o.ticket, newSeed(16))));
moved += settled.reduce((a, x) => a + x.poolDelta, 0);
assert.equal(await pool('slots'), startSlots + moved, 'settles at the same time: every SANTA movement counted');

// SANTA's price halves (Cody: pools float with the token). The pool's SANTA doesn't change; its dollar value halves,
// so the pool jackpot's dollar size halves too; a fixed $5 prize now costs twice the SANTA.
{
  const rawBefore = await pool('spin'), usdBefore = rawBefore / 1e6 * PRICE;
  PRICE /= 2;
  assert.equal(await pool('spin'), rawBefore, 'a price move changes no balance');
  assert.ok(Math.abs(rawBefore / 1e6 * PRICE - usdBefore / 2) < 1e-9, 'the pool\'s dollar value halves');
  const { jackpotAmount } = await import('../../mockups/slots.js');
  const slotsUsd = (await pool('slots')) / 1e6 * PRICE;
  console.log(`price halved: Spin pool now worth $${(rawBefore / 1e6 * PRICE).toFixed(2)} (was $${usdBefore.toFixed(2)}); Slots pool jackpot now about $${jackpotAmount('big', slotsUsd).toFixed(2)}`);
  q = await server.quote(me, 'spin100', 1); pay('sigHalf', { to: POOLS.spin, total: q.santaRaw }); assert.ok((await server.buy(me, q.id, 'sigHalf')).ok);
  assert.equal(q.santaRaw, Math.round(1 / PRICE * 1e6), 'a $1 spin now costs twice the SANTA');
  const o = await server.open(me, 'spin100'); const ss = await server.settle(me, o.ticket, newSeed(16));
  assert.ok(Math.abs(ss.payRaw - Math.round(ss.r.pay / PRICE * 1e6)) <= 1, 'prizes paid at the new price');
}
assert.equal(await credits(me, 'big'), 0);

// Someone else can't settle my play; a paused pool refuses and keeps the credit.
q = await server.quote(me, 'spin10', 2); pay('sigC', { to: POOLS.spin, total: q.santaRaw }); await server.buy(me, q.id, 'sigC');
const o = await server.open(me, 'spin10');
assert.equal((await server.settle(them, o.ticket, newSeed(16))).error, 'no open play with that ticket');
await server.settle(me, o.ticket, newSeed(16));
await db.query(`update public.pools set rules = '{"paused": true}' where game = 'spin'`);
assert.deepEqual(await server.open(me, 'spin10'), { refused: true, stopped: true }); assert.equal(await credits(me, 'spin10'), 1);
// Stuck plays: one spent with no secret, one opened but never settled (page closed). A minute later the next play tidies both.
await db.query(`update public.pools set rules = '{}' where game = 'spin'`);
q = await server.quote(me, 'spin100', 3); pay('sigD', { to: POOLS.spin, total: q.santaRaw }); await server.buy(me, q.id, 'sigD');
const back = (id) => db.query(`update public.plays set spent_at = now() - interval '2 minutes', opened_at = case when opened_at is null then null else now() - interval '2 minutes' end where id = $1`, [id]);
const stateOf = async (id) => (await one('select state from public.plays where id = $1', [id])).state;
// (a) the server died before making the secret: refunded by the next play
const stuckSpent = (await one(`select public.spend_credit($1, 'spin100') as id`, [me])).id;
assert.deepEqual(await server.open(me, 'spin100'), { busy: true }, 'a fresh unfinished play blocks a second one');
await back(stuckSpent);
let creditsBefore = await credits(me, 'spin100');
let next = await server.open(me, 'spin100'); assert.ok(next.ticket);
assert.equal(await stateOf(stuckSpent), 'refunded', 'a play stuck before its secret is refunded');
assert.equal(await credits(me, 'spin100'), creditsBefore + 1 - 1, 'refund +1, the new play -1');
// (b) the page closed after the secret was locked: finished and paid by the next play
const stuckOpen = next;
await back(stuckOpen.ticket);
next = await server.open(me, 'spin100'); assert.ok(next.ticket);
assert.equal(await stateOf(stuckOpen.ticket), 'settled', 'a play stuck after its secret is finished and paid');
await server.settle(me, next.ticket, newSeed(16));
const books = await db.query('select * from public.credits where bought <> used + left_n'); assert.equal(books.length, 0);
console.log(`OK: quote → pay → buy → open → settle on real Postgres; 5 bad payments refused; 20 plays re-checked; 10 settles at once all counted (balances add/subtract, so none can be lost); price halving checked; paused pool keeps the credit`);
