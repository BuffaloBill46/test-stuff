// Locks on REAL Postgres (several connections at once), the check PGlite can't do (it runs one transaction at a time).
// 1. Plays settling on one pool at the same moment take turns: each play's rule check sees the balance the play before it
//    left (the pool row lock in server/games.js → settle). Then the lock is removed ON PURPOSE and the same check must fail,
//    so we know the test can see a missing lock (LESSONS: break it once and watch it go red).
// 2. Many buys of one quote at once: exactly one run.
// 3. Four payout workers running at once (overlapping scheduled runs): every payout is sent exactly once.
// Run: npm install, then node lock.test.mjs (needs Postgres installed; skips politely if it isn't).
import assert from 'node:assert/strict';
import { startPostgres, makeRealDb } from './realpg.mjs';
import { directRun } from './setup.mjs';
import { createGameServer } from '../../server/games.js';
import { runPayouts } from '../../server/payouts.js';
import { newSeed } from '../../mockups/fair.js';

const server = await startPostgres();
if (!server) { console.log('SKIP: Postgres is not installed on this machine (the lock test needs a real server).'); process.exit(0); }
const hooks = {};
const db = await makeRealDb(server, { hooks });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PRICE = 0.00085, DEC = 1e6;
const START = Math.round(50 / PRICE * DEC); // $50 Spin pool
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', $1, '{}'), ('slots', $2, '{}')`, [START, Math.round(500 / PRICE * DEC)]);
const games = createGameServer({ db, chain: { getTransaction: async () => null }, livePrice: async () => ({ usd: PRICE }), liveFee: async () => ({ bps: 300, max: 1e15 }), poolWallets: {} });
const pool = async () => +(await db.query(`select santa_raw from public.pools where game = 'spin'`))[0].santa_raw;
const W = (i) => ('PLAYER' + 'abcdefghjk'[i] + 'wa11et').padEnd(44, '1');

// ---- 1. The pool lock ------------------------------------------------------------------------------------------------
// Every settle transaction is watched: when it read the pool (and what it saw), how much it changed the pool, when it asked
// to commit (not when the reply came: the database frees the lock at the commit, so the next play's read can arrive first).
// A 20 ms pause right after the pool read holds the transaction open, so without the lock the others WOULD read in between.
const POOL_READ = 'from public.pools where game = $1 for update';
let clock = 0, seen;
hooks.afterQuery = async (q, rows, tx, params) => {
  if (!seen) return;
  if (q.includes(POOL_READ)) { seen.set(tx, { read: ++clock, saw: +rows[0].santa_raw, delta: 0 }); await sleep(20); }
  if (q.includes('public.settle_play(') && seen.has(tx)) seen.get(tx).delta = +params[6]; // poolDelta, exactly what settle_play adds
};
hooks.beforeCommit = (tx) => { if (seen?.has(tx)) seen.get(tx).commit = ++clock; };

// 8 players, a run of 10 $1 spins each, all settling at once (each player's own plays in order, the players in parallel).
async function settleCrowd(tag) {
  const players = []; for (let i = 0; i < 8; i++) players.push(await db.player(W(i).replace('wa11et', tag), 'P' + i));
  const runs = []; for (const p of players) runs.push({ p, ...(await directRun(db, p, 'spin', 10, 1)) });
  const before = await pool(); seen = new Map();
  const results = await Promise.all(runs.map(async ({ p, tickets }) => { const out = []; for (const t of tickets) out.push(await games.settle(p, t, newSeed(16)).catch((e) => ({ error: e.message }))); return out; }));
  const plays = [...seen.values()].filter((x) => x.commit), rolledBack = seen.size - plays.length; seen = null; // a refused transaction changed nothing
  return { before, plays, rolledBack, results: results.flat(), after: await pool() };
}
// The rule: plays took turns. Each play saw exactly the starting balance plus every change committed before it read, and
// no two plays were ever between "read the pool" and "commit" at the same time.
function stale({ before, plays }) {
  let bad = 0;
  for (const x of plays) {
    const expect = before + plays.filter((y) => y.commit < x.read).reduce((s, y) => s + y.delta, 0);
    const overlap = plays.some((y) => y !== x && y.read < x.commit && x.read < y.commit);
    if (x.saw !== expect || overlap) bad++;
  }
  return bad;
}

const refill = () => db.query(`update public.pools set santa_raw = $1 where game = 'spin'`, [START]); // test runs carry no entry money
let r = await settleCrowd('Lock');
assert.equal(r.plays.length, 80, 'all 80 plays settled through the pool read');
assert.ok(r.results.every((x) => x.r && !x.refused && !x.failed && !x.error), 'every play settled normally (none refused, failed or errored)');
assert.ok(r.plays.some((x) => x.delta !== 0), 'some plays changed the pool (wins), so a stale read would show');
assert.equal(stale(r), 0, 'WITH the lock: every play saw the balance the play before it left, and none overlapped');
assert.equal(r.after, r.before + r.plays.reduce((s, x) => s + x.delta, 0), 'the pool moved by exactly the sum of the plays');
console.log(`✓ pool lock: 80 plays from 8 players settled at once on real Postgres; all took turns (${r.plays.filter((x) => x.delta).length} changed the pool)`);

// Now remove the lock on purpose: the same check must catch it.
await refill();
hooks.rewrite = (q) => q.replace(POOL_READ, 'from public.pools where game = $1');
r = await settleCrowd('NoLk');
hooks.rewrite = null;
const n = stale(r) + r.rolledBack, overdraws = r.results.filter((x) => /pools_santa_raw_check/.test(x.error || '')).length;
assert.ok(n > 0, 'WITHOUT the lock the check must fail, or it proves nothing');
assert.equal(r.after, r.before + r.plays.reduce((s, x) => s + x.delta, 0), 'balances only add/subtract, so no SANTA is lost even then');
console.log(`✓ the check has teeth: with the lock removed, ${n} of 80 plays read a stale or overlapping pool balance` +
  (overdraws ? ` and ${overdraws} tried to pay out more than the pool held (stopped only by the database's never-below-zero rule)` : ''));

// ---- 2. Many buys of ONE quote at the same moment --------------------------------------------------------------------
{
  const p = await db.player(W(8), 'Q');
  const q = (await db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'spin', 5, 1, 5, 1, $2) returning id`, [p, PRICE]))[0].id;
  const tries = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => db.query('select public.buy_run($1, $2, 1, 0, 0, 0) as id', [q, ('SameQuote' + 'abcdef'[i]).padEnd(88, '5')])));
  assert.equal(tries.filter((t) => t.status === 'fulfilled').length, 1, 'six payments racing for one quote: exactly one buys a run');
  assert.equal(+(await db.query('select count(*) as n from public.runs where profile_id = $1', [p]))[0].n, 1);
  assert.equal(+(await db.query('select count(*) as n from public.plays where profile_id = $1', [p]))[0].n, 5, 'and that run has exactly its 5 plays');
  console.log('✓ six payments racing for one quote at once: exactly one run of 5 plays');
}

// ---- 3. Four payout workers at the same moment ------------------------------------------------------------------------
{
  // 12 queued payouts (one per run, as finish_run leaves them).
  const ids = [];
  for (let i = 0; i < 12; i++) {
    const p = await db.player(('Payout' + 'abcdefghjkmn'[i]).padEnd(44, '1'), 'W' + i), { run } = await directRun(db, p, 'spin', 1, 1);
    ids.push(+(await db.query(`insert into public.payouts (run_id, to_wallet, amount_usd, amount_raw, price_usd) values ($1, $2, 2, $3, $4) returning id`, [run, ('Payout' + 'abcdefghjkmn'[i]).padEnd(44, '1'), Math.round(2 / PRICE * DEC), PRICE]))[0].id);
  }
  // A stand-in chain: every transaction it signs is unique; it counts what was SENT for each payout. Sending takes a moment.
  const sent = new Map(); let k = 0; const landed = new Set();
  const chain = {
    sign: async (p) => { await sleep(5); return { signature: `sig-${p.id}-${++k}`.padEnd(88, '5'), tx: { id: +p.id, sig: `sig-${p.id}-${k}`.padEnd(88, '5') }, blockhash: 'bh' }; },
    send: async (tx) => { await sleep(15); sent.set(tx.id, (sent.get(tx.id) || 0) + 1); landed.add(tx.sig); },
    status: async (sig) => (landed.has(sig) ? 'landed' : 'pending'),
  };
  // Every payout waiting to be sent (these 12, plus the runs finished in part 1).
  const all = (await db.query(`select id from public.payouts where status = 'queued' order by id`)).map((x) => +x.id);
  // Workers start while others are part-way through (as overlapping scheduled runs would), at staggered moments so each
  // one's "recover anything left half-done" step meets payouts the others are still sending.
  const workers = []; for (const ms of [0, 3, 8, 13]) { await sleep(ms ? 3 + (ms % 5) : 0); workers.push(runPayouts({ db, chain, limit: 50 })); }
  await Promise.all(workers);
  const twice = all.filter((id) => (sent.get(id) || 0) > 1);
  assert.deepEqual(twice, [], `payouts sent more than once by overlapping workers: ${twice.join(', ')}`);
  assert.ok(all.every((id) => sent.get(id) === 1), 'every payout sent exactly once');
  const st = await db.query(`select status, count(*)::int as n from public.payouts group by status`);
  assert.deepEqual(st.map((x) => [x.status, x.n]), [['sent', all.length]]);
  console.log(`✓ four payout workers running at the same moment: each of ${all.length} payouts sent exactly once`);
}

await server.stop();
console.log('lock test: all passed');
