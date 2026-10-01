// A throwaway REAL Postgres server (not PGlite): several connections at once, so row locks can actually be tested.
// PGlite runs one transaction at a time and can't catch a missing lock (LESSONS). Needs Postgres installed on the machine
// (the cloud workspace has Postgres 16); if it isn't, startPostgres() returns null and the test skips politely.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, chmodSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { FILES } from './setup.mjs';

function binDir() {
  try { return execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim(); } catch {}
  const base = '/usr/lib/postgresql';
  if (!existsSync(base)) return null;
  const v = readdirSync(base).sort((a, b) => b - a)[0];
  return v ? join(base, v, 'bin') : null;
}

// tcp: also listen on 127.0.0.1 (for programs that can't use the socket folder, e.g. the Edge Function's database library).
export async function startPostgres({ tcp = false } = {}) {
  const bin = binDir();
  if (!bin || !existsSync(join(bin, 'initdb'))) return null;
  const dir = mkdtempSync(join(tmpdir(), 'santa-pg-')); chmodSync(dir, 0o777);
  const data = join(dir, 'data'), port = 15432 + Math.floor(Math.random() * 1000);
  // Postgres refuses to run as root; the workspace runs as root, so run it as the 'postgres' user there.
  const asRoot = process.getuid?.() === 0;
  const run = (cmd, args) => asRoot ? execFileSync('runuser', ['-u', 'postgres', '--', join(bin, cmd), ...args], { stdio: 'pipe' })
    : execFileSync(join(bin, cmd), args, { stdio: 'pipe' });
  run('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '-E', 'UTF8']);
  writeFileSync(join(dir, 'log'), ''); chmodSync(join(dir, 'log'), 0o666);
  run('pg_ctl', ['-D', data, '-l', join(dir, 'log'), '-w', '-o', `-p ${port} -k ${dir} -c listen_addresses=${tcp ? '127.0.0.1' : "''"}`, 'start']);
  const stop = () => { try { run('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']); } catch {} rmSync(dir, { recursive: true, force: true }); };
  process.on('exit', stop);
  const pool = new pg.Pool({ host: dir, port, user: 'postgres', database: 'postgres', max: 20 });
  // bigint/numeric come back as text from node-postgres; the server code turns every number it reads into a number itself.
  return { pool, stop: async () => { await pool.end(); stop(); }, log: () => readFileSync(join(dir, 'log'), 'utf8') };
}

// The same database the PGlite tests build (Supabase's auth stand-ins + the project's SQL files, in order), on real Postgres.
// hooks.rewrite(sql) can change a query before it runs (used to remove a lock on purpose and watch the test fail);
// hooks.afterQuery(sql, rows, txId, params) sees every query's answer inside a transaction; hooks.beforeCommit(txId) runs just before COMMIT.
export async function makeRealDb(server, { files = FILES, hooks = {} } = {}) {
  const { pool } = server;
  await pool.query(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), last_sign_in_at timestamptz);
    create table auth.identities (id uuid primary key default gen_random_uuid(), provider_id text, user_id uuid references auth.users, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
  for (const f of files) await pool.query(readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8'));
  const rw = (q) => (hooks.rewrite ? hooks.rewrite(q) : q);
  let txNo = 0;
  const db = {
    query: async (q, p) => (await pool.query(rw(q), p)).rows,
    // One connection per transaction, exactly like a real server: BEGIN … COMMIT, ROLLBACK on any error.
    tx: async (fn) => {
      const c = await pool.connect(), id = ++txNo;
      try {
        await c.query('begin');
        const out = await fn({ query: async (q, p) => { const rows = (await c.query(rw(q), p)).rows; if (hooks.afterQuery) await hooks.afterQuery(q, rows, id, p); return rows; } });
        if (hooks.beforeCommit) hooks.beforeCommit(id); // the moment it ASKS to commit: a lock waiter's read can reach us before the commit's reply
        await c.query('commit');
        return out;
      } catch (e) { await c.query('rollback').catch(() => {}); throw e; }
      finally { c.release(); }
    },
  };
  db.player = async (wallet, name = 'P') => { const id = (await db.query('insert into auth.users default values returning id'))[0].id;
    await db.query('insert into public.profiles (id, wallet, name, avatar) values ($1, $2, $3, $4)', [id, wallet, name, '{}']); return id; };
  return db;
}
