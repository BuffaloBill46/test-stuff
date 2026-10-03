// Stocking Stuffer through the REAL server code (server/games.js) on real Postgres (PGlite) with the project's SQL + 025:
// quote → pay (a finalized-transaction stand-in) → buy a run → settle each turn → ONE payout at the end; every turn re-checks
// to the same stockings; money lands in the Drop pool; the payout cap is 250× the turn (a real all-8-gifts win is never
// frozen, an impossible amount is); $1 turns are refused up front while the Drop pool is between $100 and $250 (the open
// question for Cody); a published pay table is used by new turns and by their re-checks. Without 025 the database refuses
// the new kind; 025 can be run twice.
// REALPG=1: the same steps on a throwaway REAL Postgres server (realpg.mjs; in WSL on Windows), else PGlite.
import assert from 'node:assert/strict';
import { makeDb as makePglite, FILES } from './setup.mjs';
import { startPostgres, makeRealDb } from './realpg.mjs';
import { createGameServer, maxPerPlay } from '../../server/games.js';
import { check } from '../../mockups/house.js';
import { newSeed } from '../../mockups/fair.js';
import { splitPayment, MINT } from '../../mockups/market.js';
import { DEFAULT_SETTINGS, build } from '../../mockups/settings.js';
import { readFileSync } from 'node:fs';

const PLAYER = 'PLAYERwa11et111111111111111111111111111111';
const POOLS = { spin: 'SPINpoo1wa11et11111111111111111111111111111', slots: 'SLOTSpoo1wa11et1111111111111111111111111111' };
const FEE = { bps: 300, max: 1e15 }, PRICE = 0.0008508;
const S = (name) => (name + '5'.repeat(88)).slice(0, 88).replace(/[0OIl]/g, '9');
const txs = new Map();
function pay(sig, { from = PLAYER, to, total, at = Date.now() }) {
  const s = splitPayment(total, 1000, FEE), b = (i, o, a) => ({ accountIndex: i, mint: MINT, owner: o, uiTokenAmount: { amount: String(a), decimals: 6 } });
  txs.set(sig, { blockTime: Math.floor(at / 1000), meta: { err: null, innerInstructions: [], preTokenBalances: [b(1, from, 1e13), b(2, to, 1e12)], postTokenBalances: [b(1, from, 1e13 - total), b(2, to, 1e12 + s.arrives)] },
    transaction: { message: { accountKeys: [{ pubkey: from, signer: true }], instructions: [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { mint: MINT, authority: from, tokenAmount: { amount: String(s.burn) } } } }] } } });
}
const mkServer = (db) => createGameServer({ db, chain: { getTransaction: async (s) => txs.get(s) ?? null }, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, poolWallets: POOLS });
const raw = (usd) => Math.round(usd / PRICE * 1e6);
const REAL = process.env.REALPG === '1', servers = [];
async function makeDb(files) {
  if (!REAL) return makePglite(files);
  const srv = await startPostgres(); if (!srv) { console.log('SKIP: no Postgres installed here (REALPG=1 needs Linux Postgres)'); process.exit(0); }
  servers.push(srv); const db = await makeRealDb(srv, { files }); db.pg = { exec: (sql) => db.query(sql) }; return db;
}
console.log(REAL ? 'on a REAL Postgres server' : 'on PGlite');

// 0. Without 025 the database itself refuses the new kind (so 025 is really needed), and 025 is safe to run twice.
{ const db = await makeDb(FILES); const me = await db.player(PLAYER);
  await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', $1, '{}'), ('slots', $2, '{}')`, [raw(300), raw(500)]);
  await assert.rejects(mkServer(db).quote(me, 'stocking', 1, 0.1), /quotes_kind_check/, 'before 025: the quote is refused by the kind check');
  const sql = readFileSync(new URL('../../supabase/025_stocking.sql', import.meta.url), 'utf8');
  await db.pg.exec(sql); await db.pg.exec(sql);
  const defs = await db.query(`select conname, pg_get_constraintdef(oid) as d from pg_constraint where conname in ('quotes_kind_check', 'runs_kind_check') order by conname`);
  assert.deepEqual(defs.map((x) => x.conname), ['quotes_kind_check', 'runs_kind_check'], 'run twice: still exactly one check each');
  assert.ok(defs.every((x) => /'spin'.*'big'.*'drop'.*'stocking'/.test(x.d)), 'both allow the old kinds and stocking');
  assert.ok((await mkServer(db).quote(me, 'stocking', 1, 0.1)).id, 'after 025: Stocking Stuffer can be quoted');
  await assert.rejects(db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'stockings', 1, 1, 1, 1, 1)`, [me]), /quotes_kind_check/, 'a made-up kind is still refused');
  console.log('025: needed (the database refused the kind before it), idempotent, keeps the old kinds'); }

const db = await makeDb([...FILES, '025_stocking.sql']);
const one = async (q, p) => (await db.query(q, p))[0];
const me = await db.player(PLAYER);
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', $1, '{}'), ('slots', $2, '{}')`, [raw(300), raw(500)]);
const server = mkServer(db);
const pool = async (g) => +(await one('select santa_raw from public.pools where game = $1', [g])).santa_raw;
let sigN = 0;
async function buyRun(kind, n, bet, srv = server) {
  const q = await srv.quote(me, kind, n, bet); assert.ok(q.id, JSON.stringify(q));
  const sig = S('Stock' + 'abcdefghjkmnpqrstuvwxyz'[sigN % 23] + (sigN++)); pay(sig, { to: POOLS.spin, total: q.santaRaw });
  const b = await srv.buy(me, q.id, sig); assert.ok(b.ok, JSON.stringify(b)); return { ...b, q };
}

// 1. The cap: the most one turn can pay is all 8 gifts, 250× the turn, from the prize table the play ran on.
assert.equal(maxPerPlay(build(DEFAULT_SETTINGS), 'stocking', 1), 250); assert.equal(maxPerPlay(build(DEFAULT_SETTINGS), 'stocking', 0.1), 25);
assert.match((await server.quote(me, 'stocking', 1, 0.37)).error, /size/, 'only 10¢ or $1');
assert.match((await server.quote(me, 'stocking', 101, 1)).error, /1 to 100/);

// 2. Runs at both sizes: paid into the Drop pool, every turn re-checks, the pool moves by exactly the turn's movements, ONE payout.
for (const bet of [0.1, 1]) {
  const pool0 = await pool('spin'), b = await buyRun('stocking', 10, bet);
  assert.equal(b.q.pool, POOLS.spin, 'Stocking Stuffer is paid into the Drop pool');
  assert.equal(await pool('spin'), pool0 + splitPayment(b.q.santaRaw, 1000, FEE).arrives, 'exactly what arrived reached the Drop pool');
  let expect = await pool('spin'), wonRaw = 0;
  for (const [i, p] of b.plays.entries()) {
    const s = await server.settle(me, p.ticket, newSeed(16)); assert.ok(s.r, JSON.stringify(s));
    assert.equal(s.proof.commit, p.commit, 'the fingerprint locked at purchase');
    const c = await check(s.proof, build(DEFAULT_SETTINGS)); assert.ok(c.matches);
    assert.deepEqual([c.outcome.opened, c.outcome.coal, c.outcome.found, c.outcome.mult], [s.r.opened, s.r.coal, s.r.found, s.r.mult], 'the re-check opens the same stockings');
    const row = await one('select result, pay, pay_raw from public.plays where id = $1', [p.ticket]);
    assert.deepEqual([row.result.found, row.result.mult, row.result.opened], [s.r.found, s.r.mult, s.r.opened], 'the database keeps what was opened');
    assert.ok(Math.abs(+row.pay_raw - raw(s.r.pay)) <= 1, 'SANTA paid = the exact prize at the locked price (17.5¢ is not rounded first)');
    expect += s.poolDelta; wonRaw += s.payRaw; assert.equal(await pool('spin'), expect);
    if (i < 9) assert.equal(s.runDone, undefined, 'nothing sent mid-run');
  }
  const po = await one('select * from public.payouts where run_id = $1', [b.run]);
  if (wonRaw) assert.deepEqual([+po.amount_raw, po.status], [wonRaw, 'queued'], 'ONE payout of the whole run'); else assert.equal(po, undefined);
}

// 3. A real top win is never frozen; an amount no turn can pay is. A $1 run of 2: one turn is made an all-8-gifts win (250×)
//    after it settles, as if it had happened; the run's payout ($250 + the other turn) is queued. Then $600 from one $1 turn
//    (impossible: more than 250×) is held for Cody.
for (const [label, fake, want] of [['all 8 gifts', 250, 'queued'], ['an impossible $600', 600, 'held']]) {
  const b = await buyRun('stocking', 2, 1);
  await server.settle(me, b.plays[0].ticket, newSeed(16));
  await db.query(`update public.plays set pay = $2, pay_raw = $3, result = result || '{"found": 8, "mult": 250}' where id = $1`, [b.plays[0].ticket, fake, raw(fake)]);
  const last = await server.settle(me, b.plays[1].ticket, newSeed(16)); assert.equal(last.runDone, true);
  const po = await one('select status, amount_usd from public.payouts where run_id = $1', [b.run]);
  assert.equal(po.status, want, `${label}: ${want} (run cap 2 × 250 × $1 = $500)`);
  if (want === 'queued') await db.query(`update public.pools set santa_raw = $1 where game = 'spin'`, [raw(600)]); // put the pool back for the next steps
}

// 4. Cody's open question, as the server enforces it today: a $1 turn needs $250 in the Drop pool; between $100 and $250 it is
//    refused BEFORE any payment (below $100 the top-off to $300 comes first). 10¢ turns still sell.
await db.query(`update public.pools set santa_raw = $1 where game = 'spin'`, [raw(200)]);
assert.deepEqual(await server.quote(me, 'stocking', 1, 1), { refused: true, stopped: false }, 'a $200 pool refuses a $1 turn (it could not cover 250×)');
assert.ok((await server.quote(me, 'stocking', 1, 0.1)).id, 'a 10¢ turn still sells');
assert.ok((await server.quote(me, 'drop', 1, 1)).id, 'and a $1 Snowball Drop (100×) still sells from the same pool');
await db.query(`update public.pools set santa_raw = $1 where game = 'spin'`, [raw(99)]);
assert.ok((await server.quote(me, 'stocking', 1, 1)).id, 'a $99 pool is topped up to $300 first, so a $1 turn sells');
await db.query(`update public.pools set santa_raw = $1, rules = '{"paused": true}' where game = 'spin'`, [raw(600)]);
assert.deepEqual(await server.quote(me, 'stocking', 1, 0.1), { refused: true, stopped: true }, 'the emergency stop stops it');
await db.query(`update public.pools set rules = '{}' where game = 'spin'`);

// 5. A pay table Cody publishes (settings version 1: 1 gift pays 0.6× instead of 0.5×) is used by new turns, by the cap, and by
//    their re-checks (on the version each turn ran on).
{ const v1 = structuredClone(DEFAULT_SETTINGS); delete v1.version; v1.stocking.pays = [0, 0.6, 1.75, 4, 8, 16, 40, 90, 200];
  await db.query(`insert into public.game_settings (version, settings, by_wallet, nonce, message, signature) values (1, $1, 'codyAdmin', 'n1', 'm', 's')`, [JSON.stringify(v1)]);
  const srv = mkServer(db), b = await buyRun('stocking', 30, 0.1, srv);
  let ones = 0;
  for (const p of b.plays) {
    const s = await srv.settle(me, p.ticket, newSeed(16));
    assert.equal(s.proof.settingsVersion, 1); assert.equal(s.r.mult, v1.stocking.pays[s.r.found], 'paid on the published table');
    const c = await check(s.proof, build(v1)); assert.equal(c.outcome.mult, s.r.mult, 're-checks on the table it ran on');
    if (s.r.found === 1) { ones++; assert.ok(Math.abs(s.r.pay - 0.06) < 1e-12, '1 gift now 6¢'); }
  }
  assert.ok(ones > 0, 'at least one 1-gift turn in 30 (75% chance each to miss: 1 in 5,600 to fail)');
  assert.equal(maxPerPlay(build(v1), 'stocking', 1), 200, 'the cap follows the published top prize'); }

// 6. The public winners list names the game and the gifts, never a wallet.
const w = (await server.winners()).filter((x) => /^stock/.test(x.game));
assert.ok(w.every((x) => (x.game === 'stock10' || x.game === 'stock100') && / gifts · /.test(x.note) && x.gainPct > 0), JSON.stringify(w.slice(0, 2)));
assert.ok(!JSON.stringify(w).includes('wa11et'));
// every winner is shown at its EXACT prize (multiple × the turn), not the database's rounded cents (half-cent prizes like
// 1.75 × 10¢ = 17.5¢ under a published table); checked on every win, never on an empty list (it once filtered on a prize the
// table no longer had, which passed with nothing checked)
assert.ok(w.length > 0, 'there are stocking winners to check');
for (const x of w) { const mult = +/ ([\d.]+)×/.exec(x.note)[1], bet = x.game === 'stock100' ? 1 : 0.1;
  assert.ok(Math.abs(x.amount - mult * bet) < 1e-12 && Math.abs(x.gainPct - (mult - 1) * 100) < 1e-6, 'winner shown at the exact prize: ' + JSON.stringify(x)); }
// every finished run paid exactly its plays' total
const bad = await db.query(`select r.id from public.runs r left join public.payouts po on po.run_id = r.id
  where r.paid_at is not null and coalesce(po.amount_raw, 0) <> (select coalesce(sum(pay_raw), 0) from public.plays where run_id = r.id)`);
assert.equal(bad.length, 0);
for (const s of servers) await s.stop();
console.log(`OK: Stocking Stuffer on ${REAL ? 'a REAL Postgres server' : 'real Postgres (PGlite)'}: quote → pay → buy → settle (10¢ and $1 runs), every turn re-checked, Drop pool exact, ONE payout per run; cap 250× ($250 win queued, $600 held); $1 refused at a $200 pool, sold at $99 (top-off) ; published pay table used and re-checked; winners list ${w.length} stocking wins`);
