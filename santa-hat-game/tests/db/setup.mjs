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
