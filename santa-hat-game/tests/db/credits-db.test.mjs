// Runs the real database files (001–005) on real Postgres (PGlite) with small stand-ins for Supabase's auth, then tries to
// break the run and play rules (runs of 1 to 100 plays, Cody 2026-10-01). 005 is NOT applied to the live project; this is how it gets checked before it is.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { SUPABASE_GRANTS } from './setup.mjs';

const db = new PGlite();
const SQL = (f) => readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8');
// Stand-ins for what Supabase provides: roles, auth.users/identities, auth.uid() (read from a setting in tests).
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb,
    created_at timestamptz default now(), updated_at timestamptz default now(), last_sign_in_at timestamptz);
  create table auth.identities (id uuid primary key default gen_random_uuid(), provider_id text, user_id uuid references auth.users, identity_data jsonb,
    provider text, last_sign_in_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  ${SUPABASE_GRANTS}
`);
for (const f of ['001_profiles.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql', '009_lock_my_plays.sql', '014_run_sizes.sql']) {
  try { await db.exec(SQL(f)); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}
const one = async (q, p) => (await db.query(q, p)).rows[0];
const fails = async (q, p, why) => { await assert.rejects(() => db.query(q, p), undefined, why); };

// A player with a profile and a wallet login.
const uid = (await one(`insert into auth.users default values returning id`)).id;
await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, 'PLAYERwa11et111111111111111111111111111111', 'Cody', '{}')`, [uid]);
await db.query(`insert into public.logins (user_id, profile_id, kind) values ($1, $1, 'wallet') on conflict do nothing`, [uid]);
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', 58767000000, '{}'), ('slots', 587670000000, '{}')`); // SANTA, 6 decimals

// Buying: a quote, then a payment → a run of n plays made at once ('spent': no secret yet). Nothing can buy twice.
const Q = async (kind, n, bet, raw = 5876820000) => (await one(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, $2, $3, $4, $5, $6, 0.0008508) returning id`, [uid, kind, n, bet, n * bet, raw])).id;
const q = await Q('spin', 5, 1); // five $1 spins
const run = +(await one(`select public.buy_run($1, 'sig1', 5876820000, 570050000, 5147000000) as id`, [q])).id;
const plays = (await db.query(`select id, state, bet, secret from public.plays where run_id = $1 order by play_no`, [run])).rows;
assert.equal(plays.length, 5, 'the run\'s 5 plays exist right after the payment');
assert.ok(plays.every((p) => p.state === 'spent' && p.secret === null && +p.bet === 1), 'no secret yet: secrets come only after the payment');
await fails(`select public.buy_run($1, 'sig1', 1, 1, 1)`, [q], 'a used quote can\'t buy again');
await fails(`select public.buy_run($1, 'sig1', 1, 1, 1)`, [await Q('big', 1, 1)], 'a used signature can\'t buy again');
assert.equal(+(await one(`select santa_raw from public.pools where game = 'spin'`)).santa_raw, 58767000000 + 5147000000, 'the SANTA that arrived reaches the Spin pool');
assert.equal(+(await one(`select santa_raw from public.pools where game = 'slots'`)).santa_raw, 587670000000, 'and not the Slots pool');
for (const n of [0, 101]) await fails(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'big', $2, 1, $2, 1, 1)`, [uid, n], `a run of ${n} is refused (1 to 100 only, 014)`);
for (const t of ['quotes', 'payments', 'runs']) assert.match((await one(`select pg_get_constraintdef(oid) as d from pg_constraint where conname = $1`, [t + '_n_check'])).d, /n >= 1\) AND \(n <= 100\)/, `${t}: 1 to 100`);
await fails(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'big', 5, 1, 4, 1, 1)`, [uid], 'the price must be n × the size');

// The order: lock → settle, per play. No skipping steps, no settling twice; settling sends nothing on its own.
const [p1, p2, p3, p4, p5] = plays.map((p) => p.id);
await fails(`select public.settle_play($1, 'seed', '{}', 0, 0, 0.00085, 0, 0, 'w', 0)`, [p1], 'can\'t settle before the secret is locked');
await fails(`update public.plays set state = 'open' where id = $1`, [p1], 'open without a locked secret is refused');
await db.query(`select public.lock_play($1, $2, 'secret')`, [p1, 'a'.repeat(64)]);
await fails(`select public.lock_play($1, $2, 'other')`, [p1, 'b'.repeat(64)], 'the secret can\'t be swapped once locked');
await db.query(`select public.settle_play($1, 'seed', '{"mult":5}', 5, 5876820000, 0.00085, -5876820000, 0, 'w', 0)`, [p1]);
assert.equal(+(await one(`select santa_raw from public.pools where game = 'spin'`)).santa_raw, 58767000000 + 5147000000 - 5876820000, 'the prize leaves the pool\'s books exactly');
assert.equal(+(await one(`select count(*) as n from public.payouts`)).n, 0, 'nothing is sent before the run is done');
await fails(`select public.settle_play($1, 'seed', '{}', 0, 0, 1, 0, 0, 'w', 0)`, [p1], 'a play settles once');
{ // a play can never take the pool below zero: the database refuses
  await db.query(`select public.lock_play($1, $2, 's')`, [p2, 'd'.repeat(64)]);
  await fails(`select public.settle_play($1, 'x', '{}', 1, 1, 1, -999999999999999, 0, 'w', 0)`, [p2], 'pool below zero is refused');
}
assert.equal((await one(`select public.finish_run($1, 'W', 1000) as id`, [run])).id, null, 'unfinished plays: no payout yet');
// p2 refused (the pool was stopped): its $1 comes back with the run, paid by the pool
const spin0 = +(await one(`select santa_raw from public.pools where game = 'spin'`)).santa_raw;
await db.query(`select public.refund_play($1, 1175000000, 0.00085)`, [p2]);
assert.equal(+(await one(`select santa_raw from public.pools where game = 'spin'`)).santa_raw, spin0 - 1175000000, 'the refund leaves the pool');
await fails(`select public.refund_play($1, 1, 1)`, [p2], 'refunded once');
const finish = async (id) => { await db.query(`select public.lock_play($1, $2, 's')`, [id, 'e'.repeat(64)]); await db.query(`select public.settle_play($1, 'x', '{}', 0, 0, 1, 0, 0, 'w', 0)`, [id]); };
await finish(p3); await finish(p4); await finish(p5);
const payout = +(await one(`select public.finish_run($1, 'PLAYERwa11et111111111111111111111111111111', 1000) as id`, [run])).id;
const po = await one(`select * from public.payouts where id = $1`, [payout]);
assert.deepEqual([+po.amount_raw, +po.amount_usd, po.status, po.to_wallet], [5876820000 + 1175000000, 6, 'queued', 'PLAYERwa11et111111111111111111111111111111'], 'ONE payout: the 5× prize + the refunded $1');
assert.equal(+(await one(`select public.finish_run($1, 'W', 1000) as id`, [run])).id, 0, 'a run is paid once');
await fails(`insert into public.payouts (run_id, to_wallet, amount_usd, amount_raw, price_usd) values ($1, 'W', 1, 1, 1)`, [run], 'the database itself refuses a second payout for a run');

// A run that wins nothing sends nothing; a run's payout above the cap is held for Cody.
const r2 = +(await one(`select public.buy_run($1, 'sig2', 1, 1, 1) as id`, [await Q('big', 1, 1)])).id;
const x2 = (await one(`select id from public.plays where run_id = $1`, [r2])).id; await finish(x2);
assert.equal(+(await one(`select public.finish_run($1, 'W', 205) as id`, [r2])).id, 0); assert.equal(+(await one(`select count(*) as n from public.payouts where run_id = $1`, [r2])).n, 0);
const r3 = +(await one(`select public.buy_run($1, 'sig3', 1, 1, 1) as id`, [await Q('big', 1, 1)])).id;
const x3 = (await one(`select id from public.plays where run_id = $1`, [r3])).id;
await db.query(`select public.lock_play($1, $2, 's')`, [x3, 'c'.repeat(64)]);
await db.query(`select public.settle_play($1, 'x', '{"stops":[1,2,3,4,5]}', 430, 505880000000, 0.00085, -505880000000, 0, 'w', 0)`, [x3]);
await db.query(`select public.finish_run($1, 'W', 205)`, [r3]);
assert.equal((await one(`select status from public.payouts where run_id = $1`, [r3])).status, 'held', 'a $430 run (no jackpot) is held for Cody');

// What the website can do: read its own runs and settled secrets only; change nothing; call no server function.
await db.exec(`grant usage on schema public to authenticated; grant select on all tables in schema public to authenticated;`);
await db.query(`set role authenticated`); await db.query(`select set_config('test.uid', $1, false)`, [uid]);
assert.equal((await db.query(`select * from public.runs`)).rows.length, 3, 'sees own runs');
const mine = (await db.query(`select id, state, secret from public.my_plays order by id`)).rows;
assert.ok(mine.every((r) => (r.state === 'settled') === (r.secret !== null)), 'secrets show only for settled plays');
await fails(`update public.runs set n = 10`, [], 'the website can\'t change runs');
// my_plays reads plays with the owner's rights (to hide unsettled secrets), so writing THROUGH it would skip row security.
await fails(`update public.my_plays set pay = 999`, [], 'the website can\'t change its plays through my_plays');
await fails(`delete from public.my_plays`, [], 'the website can\'t delete its plays through my_plays');
await fails(`insert into public.price_samples (usd) values (1)`, [], 'the website can\'t plant a SANTA price sample');
await fails(`select public.finish_run($1, 'W', 1)`, [r2], 'the website can\'t call server functions');
assert.equal((await db.query(`select secret from public.plays`)).rows.length, 0, 'the website sees no rows of the plays table (secrets only via my_plays, once settled)');
assert.equal((await db.query(`select * from public.payments`)).rows.length, 0, 'nor payments');
await db.query(`reset role`);
assert.ok(+(await one(`select count(*) as n from public.plays`)).n >= 7, 'the plays really exist (the empty result above is row security, not an empty table)');
console.log('OK: 001–005 apply on real Postgres; runs of 1 to 100 only (014), bought once; the play order is enforced by the database; a run pays ONE payout, once, only when done; refunds come back with it; the website can only read');
