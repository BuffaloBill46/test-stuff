// Shared test setup: real Postgres (PGlite) with Supabase's auth stand-ins and the project's SQL files applied in order.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
export const FILES = ['001_profiles.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql', '006_ranked_tickets.sql'];
export async function makeDb(files = FILES) {
  const pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), last_sign_in_at timestamptz);
    create table auth.identities (id uuid primary key default gen_random_uuid(), provider_id text, user_id uuid references auth.users, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
  for (const f of files) await pg.exec(readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8'));
  const db = { pg, query: async (q, p) => (await pg.query(q, p)).rows, tx: (fn) => pg.transaction((t) => fn({ query: async (q, p) => (await t.query(q, p)).rows })) };
  db.player = async (wallet, name = 'P') => { const id = (await db.query('insert into auth.users default values returning id'))[0].id;
    await db.query('insert into public.profiles (id, wallet, name, avatar) values ($1, $2, $3, $4)', [id, wallet, name, '{}']); return id; };
  return db;
}
// A paid-for run without a real payment (tests only): the quote, the run and its plays, each play's secret locked, exactly
// as server.buy() leaves them. Returns { run, tickets }. Plays settle through the real server.settle().
import { newSeed, fingerprint } from '../../mockups/fair.js';
let sigNo = 0;
export async function directRun(db, profile, kind, n, bet, version = 0) {
  const q = (await db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, $2, $3, $4, $5, 1, 0.00085) returning id`, [profile, kind, n, bet, n * bet]))[0].id;
  const sig = 'TEST' + String(++sigNo).padStart(4, '9') + '5'.repeat(80);
  const run = +(await db.query('select public.buy_run($1, $2, 1, 0, 0, $3) as id', [q, sig, version]))[0].id;
  const tickets = [];
  for (const p of await db.query('select id from public.plays where run_id = $1 order by play_no', [run])) {
    const secret = newSeed(); await db.query('select public.lock_play($1, $2, $3)', [p.id, await fingerprint(secret), secret]); tickets.push(String(p.id));
  }
  return { run, tickets };
}
