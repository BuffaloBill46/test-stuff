// The speed limit's counts (server/ratelimit.js) on every store it can run on: in memory (the planned always-on game server),
// in the database on PGlite, and in the database on a REAL Postgres server with 200 requests at the same moment (the
// count must be exact, or a flood slips through). Same rules on all three, so moving servers changes only the store.
// Also: old counts are deleted after an hour, and the website can't read the table (it holds internet addresses).
import assert from 'node:assert/strict';
import { makeDb } from './setup.mjs';
import { startPostgres, makeRealDb } from './realpg.mjs';
import { makeLimiter, memoryStore, dbStore } from '../../server/ratelimit.js';

async function sameRules(name, store) {
  let clock = Date.UTC(2026, 9, 1, 12, 0, 0);
  const lim = makeLimiter({ store, now: () => clock, rules: { windowSeconds: 10, perConnection: 6, perPlayer: 4 } });
  for (let i = 1; i <= 4; i++) assert.deepEqual(await lim.player('p1'), { ok: true, n: i }, `${name}: player hit ${i}`);
  clock += 2500; assert.deepEqual(await lim.player('p1'), { ok: false, retryAfter: 8 }, `${name}: 5th hit slowed, try again in 8 s`);
  assert.equal((await lim.player('p2')).ok, true, `${name}: players counted separately`);
  for (let i = 0; i < 6; i++) assert.equal((await lim.connection('1.2.3.4')).ok, true);
  assert.equal((await lim.connection('1.2.3.4')).ok, false, `${name}: 7th from one connection slowed`);
  assert.equal((await lim.player('1.2.3.4')).ok, true, `${name}: a player and a connection never share a count`);
  clock += 7500; assert.equal((await lim.player('p1')).n, 1, `${name}: new window, count starts again (no ban)`);
  console.log(`✓ ${name}: same rules (limits, separate counts, try-again time, fresh window)`);
}

await sameRules('in memory', memoryStore());
const lite = await makeDb();
await sameRules('database (PGlite)', dbStore(lite));

const server = await startPostgres();
if (!server) console.log('SKIP real Postgres part: Postgres is not installed here');
else {
  const db = await makeRealDb(server);
  await sameRules('database (real Postgres)', dbStore(db));
  // 200 requests from one connection at the same moment, each on its own database connection.
  const lim = makeLimiter({ store: dbStore(db), now: () => Date.UTC(2026, 9, 1, 13, 0, 0) });
  const out = await Promise.all(Array.from({ length: 200 }, () => lim.connection('6.6.6.6')));
  assert.deepEqual(out.map((x) => x.n).filter(Boolean).sort((a, b) => a - b), Array.from({ length: 60 }, (_, i) => i + 1), 'counts 1..60 each exactly once');
  assert.equal(out.filter((x) => x.ok).length, 60, 'exactly 60 let through, not one more');
  assert.equal(out.filter((x) => !x.ok).length, 140);
  const [row] = await db.query(`select n from public.rate_hits where key = 'ip:6.6.6.6'`); assert.equal(+row.n, 200, 'every hit counted, none lost');
  // Old counts are deleted (they hold internet addresses): a store first used two hours later clears everything over an hour old.
  await dbStore(db).hit('ip:later', Math.floor(Date.UTC(2026, 9, 1, 15, 0, 0) / 1000), Date.UTC(2026, 9, 1, 15, 0, 0));
  assert.deepEqual((await db.query('select key from public.rate_hits')).map((r) => r.key), ['ip:later'], 'counts over an hour old are gone');
  // The website (signed out or signed in) can't read or write the counts.
  for (const role of ['anon', 'authenticated']) {
    const c = await server.pool.connect();
    try {
      await c.query('begin'); await c.query(`set local role ${role}`);
      await assert.rejects(c.query('select * from public.rate_hits'), /permission denied/, `${role} can't read it`);
      await c.query('rollback');
    } finally { c.release(); }
  }
  // A real Supabase project grants the website roles access to new tables by default, which the test database never did, so
  // the check above alone would pass even without 007's lock-down. Grant what Supabase would: row security must still hide
  // every row and refuse every write.
  await db.query('grant select, insert, update, delete on public.rate_hits to anon, authenticated');
  for (const role of ['anon', 'authenticated']) {
    const c = await server.pool.connect();
    try {
      await c.query('begin'); await c.query(`set local role ${role}`);
      assert.equal((await c.query('select * from public.rate_hits')).rows.length, 0, `${role} sees no rows even with Supabase's grants`);
      await assert.rejects(c.query(`insert into public.rate_hits (key, window_start, n) values ('ip:x', 0, 0)`), /row-level security/, `${role} can't write`);
      await c.query('rollback');
    } finally { c.release(); }
  }
  assert.equal((await db.query('select count(*)::int as n from public.rate_hits'))[0].n, 1, 'the row is there; the website just can\'t see it');
  console.log('✓ real Postgres: 200 requests at the same moment → exactly 60 let through, all 200 counted; old counts deleted; website locked out');
  await server.stop();
}
console.log('speed limit store test: all passed');
