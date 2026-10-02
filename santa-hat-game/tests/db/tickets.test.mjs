// Ranked tickets on real Postgres (006): 10 free a day, held on joining, spent at the start, released if you leave before,
// extra ones never expire, at most 10 bought per 24 hours, each payment used once.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const pg = new PGlite();
await pg.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), last_sign_in_at timestamptz);
  create table auth.identities (id uuid primary key default gen_random_uuid(), provider_id text, user_id uuid references auth.users, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
for (const f of ['001_profiles.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql', '006_ranked_tickets.sql', '022_ticket_cap.sql']) await pg.exec(readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8'));
const q = async (sql, p) => (await pg.query(sql, p)).rows;
const me = (await q('insert into auth.users default values returning id'))[0].id;
await q(`insert into public.profiles (id, wallet, name, avatar) values ($1, 'PLAYERwa11et111111111111111111111111111111', 'P', '{}')`, [me]);
const T0 = new Date('2026-12-01T10:00:00Z'), at = (h) => new Date(T0.getTime() + h * 3600e3).toISOString();
const status = async (h) => (await q('select * from public.ticket_status($1, $2)', [me, at(h)]))[0];
const hold = async (m, h) => (await q('select public.hold_ticket($1, $2, $3) as r', [me, m, at(h)]))[0].r;
const release = async (m) => (await q('select public.release_ticket($1, $2) as r', [me, m]))[0].r;

assert.deepEqual([(await status(0)).free_left, (await status(0)).extra], [10, 0], '10 free a day');
for (let i = 1; i <= 10; i++) assert.equal(await hold('m' + i, 0), 'free');
assert.equal(await hold('m11', 0), 'none', 'no 11th ticket');
assert.equal(await hold('m1', 0), 'already', 'one ticket per match');
// Leave before the start: it comes back. Start: spent, nothing to release.
assert.equal(await release('m10'), true); assert.equal((await status(0)).free_left, 1);
assert.equal((await q(`select public.start_ranked_match('m1') as n`))[0].n, 1);
assert.equal(await release('m1'), false, 'a started match keeps its ticket');
// Buy extra: they're used after the free ones and don't expire; at most 10 per 24 hours; a payment counts once.
assert.equal((await q(`select public.buy_tickets($1, 6, 'sigA', $2) as n`, [me, at(1)]))[0].n, 6);
await assert.rejects(() => q(`select public.buy_tickets($1, 5, 'sigB', $2)`, [me, at(2)]), /at most 10 extra tickets per 24 hours \(4 left\)/);
await assert.rejects(() => q(`select public.buy_tickets($1, 1, 'sigA', $2)`, [me, at(3)]), /duplicate key/, 'each payment once');
assert.equal(await hold('m20', 3), 'free', 'the last free one goes first'); assert.equal(await hold('m21', 3), 'extra');
assert.equal((await q(`select public.buy_tickets($1, 4, 'sigC', $2) as n`, [me, at(3)]))[0].n, 9, '6 + 4 = 10 bought in 24 h is fine');
assert.equal(await release('m21'), true); assert.equal((await status(3)).extra, 10, 'an extra ticket comes back as extra');
// 24 hours later: free tickets reset; extras are still there; a new purchase window too.
const next = await status(25); assert.deepEqual([next.free_left, next.extra], [10, 10]);
await assert.rejects(() => q(`select public.buy_tickets($1, 10, 'sigD', $2)`, [me, at(26)]), /6 left/, 'the purchase limit is a rolling 24 hours: hour 3\'s 4 still count at hour 26');
// 022 (Cody: 25 max = 10 free + 10 bought + 5 given): at most 10 BOUGHT held; the 24-hour limit alone would allow 10 more here
await assert.rejects(() => q(`select public.buy_tickets($1, 10, 'sigD', $2)`, [me, at(28)]), /at most 10 bought ranked tickets; room for 0 more/, 'holding 10 bought: none more, though the 24-hour limit would allow it');
await assert.rejects(() => q(`select public.buy_tickets($1, 1, 'sigD', $2)`, [me, at(28)]), /room for 0 more/, 'not even one');
// use up the 10 free and 3 bought: room for exactly 3 bought again
for (let i = 0; i < 13; i++) assert.notEqual(await hold('u' + i, 28), 'none');
await q(`select public.start_ranked_match('u' || g) from generate_series(0, 12) g`);
await assert.rejects(() => q(`select public.buy_tickets($1, 5, 'sigD', $2)`, [me, at(28)]), /room for 3 more/);
assert.equal((await q(`select public.buy_tickets($1, 1, 'sigD', $2) as n`, [me, at(28)]))[0].n, 8, 'back under the cap: buying works');
assert.equal((await q('select count(*)::int as n from public.ticket_purchases where profile_id = $1', [me]))[0].n, 3, 'refused purchases leave no record behind');
const full = await status(28); assert.ok(full.extra <= 10 && full.free_left + full.extra <= 25, 'never above 10 bought, never above 25');
// A free ticket held before the reset and released after it doesn't add a bonus free ticket today.
{ // a second player, on their own clock
  const you = (await q('insert into auth.users default values returning id'))[0].id;
  await q(`insert into public.profiles (id, wallet, name, avatar) values ($1, 'THEMwa11et11111111111111111111111111111111', 'Y', '{}')`, [you]);
  const st = async (h) => (await q('select * from public.ticket_status($1, $2)', [you, at(h)]))[0];
  assert.equal((await q('select public.hold_ticket($1, $2, $3) as r', [you, 'x1', at(23)]))[0].r, 'free');
  assert.equal((await st(23.5)).free_left, 9);
  assert.equal((await st(47.5)).free_left, 10, 'reset 24 hours after the window began');
  assert.equal((await q('select public.release_ticket($1, $2) as r', [you, 'x1']))[0].r, true);
  assert.equal((await st(47.5)).free_left, 10, 'no bonus 11th free ticket from yesterday\'s hold');
}
console.log('OK: ranked tickets: at most 10 bought held, 10 free a day, held/spent/released, extras first-free-then-extra, 10 bought per 24 h, payments once, daily reset');
