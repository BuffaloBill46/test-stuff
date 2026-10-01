// The REAL Edge Function (supabase/functions/games/index.ts) run under Deno against a real Postgres with every SQL file
// applied, then flooded from one connection: 60 requests answered, then "slow down" (429 + retry-after); another connection
// unaffected; every request counted in rate_hits. Proves the wiring, the 007 table and the limit together, as deployed.
// Needs Postgres (installed in the cloud workspace) and Deno: `npm install deno` in any folder, then
//   DENO=/that/folder/node_modules/.bin/deno node edge-limit.mjs        (skips politely if either is missing)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { startPostgres, makeRealDb } from './realpg.mjs';

const DENO = process.env.DENO || new URL('./node_modules/.bin/deno', import.meta.url).pathname;
if (!existsSync(DENO)) { console.log('SKIP: no Deno (npm install deno somewhere, then DENO=<path to .bin/deno> node edge-limit.mjs)'); process.exit(0); }
const pg = await startPostgres({ tcp: true });
if (!pg) { console.log('SKIP: Postgres is not installed here'); process.exit(0); }
const db = await makeRealDb(pg);
// Deno.serve listens on 8000 by default (the deployed wiring is not changed for a test).
const PORT = 8000, fn = new URL('../../supabase/functions/games/index.ts', import.meta.url).pathname;
const deno = spawn(DENO, ['run', '-A', fn], { env: { ...process.env, SUPABASE_DB_URL: `postgres://postgres@127.0.0.1:${pg.pool.options.port}/postgres`,
  SUPABASE_URL: 'http://localhost:1', SUPABASE_SERVICE_ROLE_KEY: 'test-only' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; deno.stdout.on('data', (d) => { log += d; }); deno.stderr.on('data', (d) => { log += d; });
const stop = async () => { deno.kill(); await pg.stop(); };
try {
  for (let i = 0; i < 120 && !/Listening on/.test(log); i++) await new Promise((r) => setTimeout(r, 500));
  assert.match(log, /Listening on/, 'the Edge Function started:\n' + log);
  const url = `http://127.0.0.1:${PORT}/`;
  const ask = (addr) => fetch(url, { method: 'POST', headers: { origin: 'https://buffalobill46.github.io', 'x-forwarded-for': addr, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'winners' }) });
  const codes = []; let last;
  for (let i = 0; i < 64; i++) { last = await ask('203.0.113.9'); codes.push(last.status); if (i < 63) await last.arrayBuffer(); }
  assert.deepEqual(codes, [...Array(60).fill(200), ...Array(4).fill(429)], 'from one connection: 60 answered, then slowed');
  assert.ok(+last.headers.get('retry-after') >= 1, 'says when to try again'); assert.equal((await last.json()).slowDown, true);
  assert.equal((await ask('198.51.100.7')).status, 200, 'another connection is unaffected');
  const rows = await db.query('select key, n from public.rate_hits order by key');
  assert.deepEqual(rows.map((r) => [r.key, +r.n]), [['ip:198.51.100.7', 1], ['ip:203.0.113.9', 64]], 'every request counted in the database');
  assert.doesNotMatch(log, /counting failed/, 'no counting faults');
  console.log('OK: the real Edge Function under Deno: 60 answered, then "slow down" (429, retry-after); other connections fine; all counted in rate_hits');
} finally { await stop(); }
