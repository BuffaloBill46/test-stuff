// Runs the real database files (001–005) on real Postgres (PGlite) with small stand-ins for Supabase's auth, then tries to
// break the credit and play rules. 005 is NOT applied to the live project; this is how it gets checked before it is.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

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
`);
for (const f of ['001_profiles.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql']) {
  try { await db.exec(SQL(f)); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}
const one = async (q, p) => (await db.query(q, p)).rows[0];
const fails = async (q, p, why) => { await assert.rejects(() => db.query(q, p), undefined, why); };

// A player with a profile and a wallet login.
const uid = (await one(`insert into auth.users default values returning id`)).id;
await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, 'PLAYERwa11et111111111111111111111111111111', 'Cody', '{}')`, [uid]);
await db.query(`insert into public.logins (user_id, profile_id, kind) values ($1, $1, 'wallet') on conflict do nothing`, [uid]);
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', 58767000000, '{}'), ('slots', 587670000000, '{}')`); // SANTA, 6 decimals

// Buying: a quote, then a payment. The same signature or quote can't buy twice.
const q = (await one(`insert into public.quotes (profile_id, kind, n, usd, santa_raw, price_usd) values ($1, 'spin100', 5, 5, 5876820000, 0.0008508) returning id`, [uid])).id;
assert.equal((await one(`select public.buy_credits($1, 'sig1', 5876820000, 570050000, 5147000000) as n`, [q])).n, 5);
await fails(`select public.buy_credits($1, 'sig1', 1, 1, 1)`, [q], 'a used quote can\'t buy again');
const q2 = (await one(`insert into public.quotes (profile_id, kind, n, usd, santa_raw, price_usd) values ($1, 'big', 2, 2, 1, 1) returning id`, [uid])).id;
await fails(`select public.buy_credits($1, 'sig1', 1, 1, 1)`, [q2], 'a used signature can\'t buy again');
assert.equal(+(await one(`select santa_raw from public.pools where game = 'spin'`)).santa_raw, 58767000000 + 5147000000, 'the SANTA that arrived reaches the Spin pool');
assert.equal(+(await one(`select santa_raw from public.pools where game = 'slots'`)).santa_raw, 587670000000, 'and not the Slots pool');
await fails(`insert into public.quotes (profile_id, kind, n, usd, santa_raw, price_usd) values ($1, 'big', 11, 11, 1, 1)`, [uid], 'more than 10 at once is refused');

// The books can't be unbalanced, even by hand.
await fails(`update public.credits set left_n = left_n + 1 where profile_id = $1`, [uid], 'bought = used + left is enforced by the database');
await fails(`update public.credits set left_n = -1, used = used + 6 where profile_id = $1`, [uid], 'never below zero');

// The order: spend → lock → settle. No secret before the spend; no skipping steps; no settling twice.
const p1 = (await one(`select public.spend_credit($1, 'spin100') as id`, [uid])).id;
assert.ok(p1);
assert.equal((await one(`select state, secret from public.plays where id = $1`, [p1])).secret, null, 'spent: no secret exists yet');
await fails(`select public.settle_play($1, 'seed', '{}', 0, 0, 0.00085, 0, 0, 'w', 205)`, [p1], 'can\'t settle before the secret is locked');
await fails(`update public.plays set state = 'open' where id = $1`, [p1], 'open without a locked secret is refused');
await db.query(`select public.lock_play($1, $2, 'secret')`, [p1, 'a'.repeat(64)]);
await fails(`select public.lock_play($1, $2, 'other')`, [p1, 'b'.repeat(64)], 'the secret can\'t be swapped once locked');
await db.query(`select public.settle_play($1, 'seed', '{"mult":5}', 5, 5876820000, 0.00085, -5876820000, 0, 'PLAYERwa11et111111111111111111111111111111', 205)`, [p1]);
assert.equal(+(await one(`select santa_raw from public.pools where game = 'spin'`)).santa_raw, 58767000000 + 5147000000 - 5876820000, 'the payout leaves the pool exactly');
{ // a play can never take the pool below zero: the database refuses, and the credit is refunded
  const px = (await one(`select public.spend_credit($1, 'spin100') as id`, [uid])).id;
  await db.query(`select public.lock_play($1, $2, 's')`, [px, 'd'.repeat(64)]);
  await fails(`select public.settle_play($1, 'x', '{}', 1, 1, 1, -999999999999999, 0, 'w', 205)`, [px], 'pool below zero is refused');
  await db.query(`select public.refund_play($1)`, [px]);
}
await fails(`select public.settle_play($1, 'seed', '{}', 0, 0, 1, 0, 0, 'w', 205)`, [p1], 'a play settles once');
assert.equal((await one(`select status from public.payouts where play_id = $1`, [p1])).status, 'queued');

// Refund: the credit comes back and the books still balance. Credits run out cleanly.
const p2 = (await one(`select public.spend_credit($1, 'spin100') as id`, [uid])).id;
await db.query(`select public.refund_play($1)`, [p2]);
let c = await one(`select left_n, bought, used from public.credits where profile_id = $1 and kind = 'spin100'`, [uid]);
assert.deepEqual([c.left_n, c.bought, c.used], [4, 5, 1]);
const finish = async (id) => { await db.query(`select public.lock_play($1, $2, 's')`, [id, 'e'.repeat(64)]); await db.query(`select public.settle_play($1, 'x', '{}', 0, 0, 1, 0, 0, 'w', 205)`, [id]); };
const first = (await one(`select public.spend_credit($1, 'spin100') as id`, [uid])).id;
assert.equal(+(await one(`select public.spend_credit($1, 'big') as id`, [uid])).id, -1, 'one play at a time: refused while another is unfinished');
await finish(first);
for (let i = 0; i < 3; i++) { const id = (await one(`select public.spend_credit($1, 'spin100') as id`, [uid])).id; assert.ok(+id > 0); await finish(id); }
assert.equal((await one(`select public.spend_credit($1, 'spin100') as id`, [uid])).id, null, 'no credit, no play');
assert.equal((await one(`select public.spend_credit($1, 'big') as id`, [uid])).id, null, 'Spin credits can\'t be spent on Slots');

// A payout above the sanity cap is held for Cody.
const q3 = (await one(`insert into public.quotes (profile_id, kind, n, usd, santa_raw, price_usd) values ($1, 'big', 1, 1, 1, 1) returning id`, [uid])).id;
await db.query(`select public.buy_credits($1, 'sig3', 1, 1, 1)`, [q3]);
const p3 = (await one(`select public.spend_credit($1, 'big') as id`, [uid])).id;
await db.query(`select public.lock_play($1, $2, 's')`, [p3, 'c'.repeat(64)]);
await db.query(`select public.settle_play($1, 'x', '{"jackpot":true}', 430, 505880000000, 0.00085, -505880000000, 0, 'w', 205)`, [p3]);
assert.equal((await one(`select status from public.payouts where play_id = $1`, [p3])).status, 'held');

// What the website can do: read own credits and settled secrets only; change nothing; call no server function.
await db.exec(`grant usage on schema public to authenticated; grant select on all tables in schema public to authenticated;`);
await db.query(`set role authenticated`); await db.query(`select set_config('test.uid', $1, false)`, [uid]);
assert.equal((await db.query(`select * from public.credits`)).rows.length, 2, 'sees own credits');
const mine = (await db.query(`select id, state, secret from public.my_plays order by id`)).rows;
assert.ok(mine.every((r) => (r.state === 'settled') === (r.secret !== null)), 'secrets show only for settled plays');
await fails(`update public.credits set left_n = 99`, [], 'the website can\'t change credits');
await fails(`select public.spend_credit($1, 'big')`, [uid], 'the website can\'t call server functions');
assert.equal((await db.query(`select secret from public.plays`)).rows.length, 0, 'the website sees no rows of the plays table (secrets only via my_plays, once settled)');
assert.equal((await db.query(`select * from public.payments`)).rows.length, 0, 'nor payments');
await db.query(`reset role`);
assert.ok(+(await one(`select count(*) as n from public.plays`)).n >= 7, 'the plays really exist (the empty result above is row security, not an empty table)');
console.log('OK: 001–005 apply on real Postgres; credits can\'t be unbalanced, reused or crossed between games; the play order is enforced by the database; the website can only read');
