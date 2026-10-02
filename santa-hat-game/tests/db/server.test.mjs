// The game server's steps (server/games.js) end to end on real Postgres (PGlite) with the real 001–005 SQL:
// quote → pay (a finalized-transaction stand-in) → buy (a run of 1/5/10 plays) → settle each → ONE payout when the run is done;
// cheating attempts, refunds, stuck plays, and plays settling at the same time. (Runs: Cody, 2026-10-01.)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createGameServer } from '../../server/games.js';
import { directRun } from './setup.mjs';
import { check } from '../../mockups/house.js';
import { newSeed } from '../../mockups/fair.js';
import { splitPayment, MINT } from '../../mockups/market.js';

const pg = new PGlite();
await pg.exec(`
  create role anon; create role authenticated; create role service_role; create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb,
    created_at timestamptz default now(), updated_at timestamptz default now(), last_sign_in_at timestamptz);
  create table auth.identities (id uuid primary key default gen_random_uuid(), provider_id text, user_id uuid references auth.users, identity_data jsonb,
    provider text, last_sign_in_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
for (const f of ['001_profiles.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql', '014_run_sizes.sql']) await pg.exec(readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8'));
const db = { query: async (q, p) => (await pg.query(q, p)).rows, tx: (fn) => pg.transaction((t) => fn({ query: async (q, p) => (await t.query(q, p)).rows })) };
const one = async (q, p) => (await db.query(q, p))[0];

const PLAYER = 'PLAYERwa11et111111111111111111111111111111', OTHER = 'THEMwa11et11111111111111111111111111111111';
const POOLS = { spin: 'SPINpoo1wa11et11111111111111111111111111111', slots: 'SLOTSpoo1wa11et1111111111111111111111111111' };
const FEE = { bps: 300, max: 1e15 }; let PRICE = 0.0008508; // changes mid-test: the pools float with it
const mk = async (wallet) => { const id = (await one('insert into auth.users default values returning id')).id; await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, $2, 'P', '{}')`, [id, wallet]); return id; };
const me = await mk(PLAYER), them = await mk(OTHER);
const START = { spin: Math.round(50 / PRICE * 1e6), slots: Math.round(500 / PRICE * 1e6) }; // $50 / $500 of SANTA at today's price
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', $1, '{}'), ('slots', $2, '{}')`, [START.spin, START.slots]);

// Finalized transactions the stand-in chain returns (shaped like Solana's getTransaction jsonParsed).
// fake but realistically shaped Solana transaction signatures (base58, 88 characters)
const S = (name) => (name + '5'.repeat(88)).slice(0, 88).replace(/[0OIl]/g, '9');
const txs = new Map();
function pay(sig, { from = PLAYER, to, total, at = Date.now() }) {
  const s = splitPayment(total, 1000, FEE), b = (i, o, a) => ({ accountIndex: i, mint: MINT, owner: o, uiTokenAmount: { amount: String(a), decimals: 6 } });
  txs.set(sig, { blockTime: Math.floor(at / 1000), meta: { err: null, innerInstructions: [], preTokenBalances: [b(1, from, 1e13), b(2, to, 1e12)], postTokenBalances: [b(1, from, 1e13 - total), b(2, to, 1e12 + s.arrives)] },
    transaction: { message: { accountKeys: [{ pubkey: from, signer: true }], instructions: [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { mint: MINT, authority: from, tokenAmount: { amount: String(s.burn) } } } }] } } });
}
const server = createGameServer({ retired: [], db, chain: { getTransaction: async (s) => txs.get(s) ?? null }, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, poolWallets: POOLS });
const pool = async (g) => +(await one('select santa_raw from public.pools where game = $1', [g])).santa_raw; // SANTA, smallest unit
const payoutOf = async (run) => one('select * from public.payouts where run_id = $1', [run]);
// quote → pay → buy, in one go (the page does exactly this). Returns the buy result (the run's plays with their fingerprints).
let sigN = 0;
async function buyRun(who, wallet, kind, n, bet) {
  const q = await server.quote(who, kind, n, bet); assert.ok(q.id, JSON.stringify(q));
  const sig = S('Run' + 'abcdefghjkmnpqrstuvwxyz'[sigN % 23] + (sigN++)); pay(sig, { from: wallet, to: POOLS[kind === 'big' ? 'slots' : 'spin'], total: q.santaRaw });
  const b = await server.buy(who, q.id, sig); assert.ok(b.ok, JSON.stringify(b)); return { ...b, q };
}
const settleAll = async (who, b) => { const out = []; for (const p of b.plays) out.push(await server.settle(who, p.ticket, newSeed(16))); return out; };

// Buy a run of ten $1 spins.
let q = await server.quote(me, 'spin', 10, 1);
assert.equal(q.usd, 10); assert.equal(q.santaRaw, Math.round(10 / PRICE * 1e6));
pay(S('A'), { to: POOLS.spin, total: q.santaRaw });
let b = await server.buy(me, q.id, S('A'));
assert.equal(b.ok, true); assert.equal(b.plays.length, 10, 'ten plays, each with its locked fingerprint');
assert.ok(b.plays.every((p) => /^[0-9a-f]{64}$/.test(p.commit)));
assert.equal(await pool('spin'), START.spin + splitPayment(q.santaRaw, 1000, FEE).arrives, 'exactly the SANTA that arrived reached the Spin pool at purchase');
for (const [n, bet, why] of [[101, 1, /1 to 100/], [0, 1, /1 to 100/], [5, 0.37, /size/], [5, 2, /size/]]) assert.match((await server.quote(me, 'spin', n, bet)).error, why);
assert.match((await server.quote(me, 'big', 1, 0.1)).error, /size/, 'Big Hat is $1 a pull');
assert.deepEqual(await server.quote(me, 'spin', 1, 1), { busy: true }, 'one run at a time: this one still has plays to go');

// Cheats and mistakes: nothing is bought.
const runsNow = async () => +(await one('select count(*)::int as n from public.runs')).n;
const runs0 = await runsNow();
assert.equal((await server.buy(me, q.id, S('A'))).error, 'quote already used');
assert.equal((await server.buy(them, q.id, S('A'))).error, 'unknown quote', 'someone else can\'t use my quote');
{ // a fresh quote, paid wrongly three ways (the one-run-at-a-time rule is lifted by a different player)
  const who = await mk('CHEATwa11et11111111111111111111111111111111'), q2 = await server.quote(who, 'spin', 5, 1);
  pay(S('WrongPool'), { from: 'CHEATwa11et11111111111111111111111111111111', to: POOLS.slots, total: q2.santaRaw }); assert.match((await server.buy(who, q2.id, S('WrongPool'))).error, /pool received/);
  pay(S('Theirs'), { from: OTHER, to: POOLS.spin, total: q2.santaRaw }); assert.match((await server.buy(who, q2.id, S('Theirs'))).error, /not signed/);
  pay(S('Late'), { from: 'CHEATwa11et11111111111111111111111111111111', to: POOLS.spin, total: q2.santaRaw, at: Date.now() + 5 * 60_000 }); assert.match((await server.buy(who, q2.id, S('Late'))).error, /quote window/);
  pay(S('Short'), { from: 'CHEATwa11et11111111111111111111111111111111', to: POOLS.spin, total: Math.round(q2.santaRaw / 2) }); assert.match((await server.buy(who, q2.id, S('Short'))).error, /quote was/);
}
assert.equal(await runsNow(), runs0, 'none of those bought anything');

// Play the run: every result re-checks; the pool moves only by what's won (+ skim / top-off); nothing is sent until the end,
// then ONE payout of the whole run's winnings.
let expectPool = await pool('spin'), wonRaw = 0;
for (const [i, p] of b.plays.entries()) {
  assert.equal((await one('select state from public.plays where id = $1', [p.ticket])).state, 'open');
  const s = await server.settle(me, p.ticket, newSeed(16));
  assert.ok(s.r, JSON.stringify(s));
  const c = await check(s.proof); assert.ok(c.matches); assert.equal(c.outcome.mult, s.r.mult, 'anyone can re-check the result');
  assert.equal(s.proof.commit, p.commit, 'the revealed play matches the fingerprint shown when it was bought');
  expectPool += s.poolDelta; wonRaw += s.payRaw;
  assert.equal(await pool('spin'), expectPool, 'the pool\'s SANTA changes by exactly the play\'s movements');
  if (i < 9) assert.equal(s.runDone, undefined, 'nothing sent mid-run');
  else { assert.equal(s.runDone, true); const po = await payoutOf(+b.run);
    if (wonRaw) assert.deepEqual([+po.amount_raw, po.to_wallet, po.status], [wonRaw, PLAYER, 'queued'], 'ONE payout of the run\'s winnings, to the linked wallet');
    else assert.equal(po, undefined); }
  assert.equal((await server.settle(me, p.ticket, newSeed(16))).error, 'no open play with that ticket', 'settles once');
}
assert.equal(+(await one('select count(*)::int as n from public.payouts where run_id = $1', [b.run])).n, wonRaw ? 1 : 0);

// Pull runs of Big Hat at the same time by 10 players: every pool movement counted.
// NOTE: PGlite runs transactions one at a time, so this can't catch a missing pool lock (checked: removing "for update" still
// passes here). The lock must be proven on a real multi-connection Postgres before launch (FOR_MAIN_CLAUDE).
const others = [];
// fake wallet addresses must be valid base58: no 0, O, I or l
for (let i = 0; i < 10; i++) { const w = 'PLAYR' + 'abcdefghjk'[i].repeat(3) + 'wa11et'.padEnd(34, '1'); others.push([await mk(w), w]); }
const bought = []; for (const [id, w] of others) bought.push(await buyRun(id, w, 'big', 1, 1));
const startSlots = await pool('slots');
const settled = await Promise.all(bought.map((x, i) => server.settle(others[i][0], x.plays[0].ticket, newSeed(16))));
assert.equal(await pool('slots'), startSlots + settled.reduce((a, x) => a + x.poolDelta, 0), 'settles at the same time: every SANTA movement counted');
assert.ok(settled.every((x) => x.runDone), 'a run of 1 is done after its play');

// Snowball Drop runs at both sizes, paid into the Spin pool; each re-checks.
for (const bet of [0.1, 1]) {
  const d = await buyRun(me, PLAYER, 'drop', 5, bet); assert.equal(d.q.pool, POOLS.spin, 'Snowball Drop pays the Spin pool');
  const out = await settleAll(me, d);
  for (const s of out) { assert.equal(s.proof.bet, bet); const c = await check(s.proof); assert.deepEqual([c.outcome.path, c.outcome.mult], [s.r.path, s.r.mult]); }
  assert.ok(out.at(-1).runDone);
}

// SANTA's price halves (Cody: pools float with the token). Balances don't change; a $1 spin now costs twice the SANTA.
{
  const rawBefore = await pool('spin'), usdBefore = rawBefore / 1e6 * PRICE;
  PRICE /= 2;
  assert.equal(await pool('spin'), rawBefore, 'a price move changes no balance');
  const { jackpotAmount } = await import('../../mockups/slots.js');
  console.log(`price halved: Spin pool now worth $${(rawBefore / 1e6 * PRICE).toFixed(2)} (was $${usdBefore.toFixed(2)}); Slots pool jackpot now about $${jackpotAmount('big', (await pool('slots')) / 1e6 * PRICE).toFixed(2)}`);
  const x = await buyRun(me, PLAYER, 'spin', 1, 1);
  assert.equal(x.q.santaRaw, Math.round(1 / PRICE * 1e6), 'a $1 spin now costs twice the SANTA');
  const [ss] = await settleAll(me, x);
  assert.ok(Math.abs(ss.payRaw - Math.round(ss.r.pay / PRICE * 1e6)) <= 1, 'prizes paid at the new price');
}

// THE RUN'S LOCKED PRICE (Cody, 2026-10-01): a run's winnings are converted at the price locked when it was bought, even if
// SANTA's live price moves while it plays. Invariant: every play of the run records the quote's price; its SANTA = its dollars at
// that price; the run's one payout = the sum of its plays' SANTA, at that same price.
{
  const lockedAt = PRICE, x = await buyRun(me, PLAYER, 'drop', 30, 0.1); // 10¢ drops: a lucky run can't drain the shared pool the later tests use
  assert.equal(+x.q.price, lockedAt);
  const out = [];
  for (const [i, p] of x.plays.entries()) {
    if (i === 10) PRICE = lockedAt * 3;   // the live price triples a third of the way through the run…
    if (i === 20) PRICE = lockedAt / 4;   // …then falls to a quarter
    out.push(await server.settle(me, p.ticket, newSeed(16)));
  }
  const plays = await db.query('select pay, pay_raw, price_usd from public.plays where run_id = $1 order by play_no', [x.run]);
  assert.equal(plays.length, 30);
  for (const pl of plays) {
    assert.equal(+pl.price_usd, lockedAt, 'every play is converted at the run\'s locked price');
    assert.ok(Math.abs(+pl.pay_raw - +pl.pay / lockedAt * 1e6) <= 1 + 0.005 / lockedAt * 1e6, `its SANTA = its dollars at the locked price (${pl.pay} → ${pl.pay_raw})`);
  }
  const won = plays.reduce((a, pl) => a + +pl.pay_raw, 0), po = await payoutOf(x.run);
  if (won) { assert.equal(+po.amount_raw, won, 'the payout is exactly the sum of the plays\' SANTA'); assert.equal(+po.price_usd, lockedAt, 'at the locked price'); }
  else assert.equal(po, undefined);
  assert.ok(out.every((s) => s.price === undefined || s.price === lockedAt), 'the page is told the locked price too');
  PRICE = lockedAt;
  console.log(`locked price: a 30-drop run settled while the live price went ×3 then ÷4; all 30 plays and the payout (${won} raw) at the price it was bought at`);
}

// Someone else can't settle my play. A stopped pool: no new quote (so no payment is taken), and plays already bought are
// refunded with the run.
{
  const x = await buyRun(me, PLAYER, 'spin', 5, 0.1);
  assert.equal((await server.settle(them, x.plays[0].ticket, newSeed(16))).error, 'no open play with that ticket');
  const first = await server.settle(me, x.plays[0].ticket, newSeed(16));
  await db.query(`update public.pools set rules = '{"paused": true}' where game = 'spin'`);
  let last; for (const p of x.plays.slice(1)) { last = await server.settle(me, p.ticket, newSeed(16)); assert.deepEqual([last.refused, last.stopped, last.refunded], [true, true, 0.1]); }
  assert.equal(last.runDone, true); assert.ok(Math.abs(last.sent - (first.r.pay + 0.4)) < 1e-9, `the run sends its winnings + the four refused 10¢ spins: ${last.sent}`);
  assert.deepEqual(await server.quote(me, 'spin', 1, 0.1), { refused: true, stopped: true }, 'a stopped pool takes no new payment');
  await db.query(`update public.pools set rules = '{}' where game = 'spin'`);
}

// Stuck plays: the page closed mid-run. A minute later the next quote finishes them (a server-made number), and the run is paid.
// A play whose secret was never made (the server died right after the payment) is refunded instead.
{
  const x = await buyRun(me, PLAYER, 'spin', 5, 1);
  await server.settle(me, x.plays[0].ticket, newSeed(16));
  await db.query(`update public.plays set state = 'spent', commit = null, secret = null, opened_at = null where id = $1`, [x.plays[4].ticket]); // as if its secret never got made
  assert.deepEqual(await server.quote(me, 'spin', 1, 1), { busy: true }, 'a fresh unfinished run blocks a new one');
  await db.query(`update public.plays set spent_at = now() - interval '2 minutes', opened_at = case when opened_at is null then null else now() - interval '2 minutes' end where run_id = $1`, [x.run]);
  const nq = await server.quote(me, 'spin', 1, 1); assert.ok(nq.id, 'after a minute the stuck run is finished and a new one can start');
  const states = (await db.query('select state from public.plays where run_id = $1 order by play_no', [x.run])).map((r) => r.state);
  assert.deepEqual(states, ['settled', 'settled', 'settled', 'settled', 'refunded'], 'the three left open were finished; the one with no secret was refunded');
  assert.ok((await one('select paid_at from public.runs where id = $1', [x.run])).paid_at, 'and the run was paid');
}

// Skims and top-offs are real transfers (audit): force both on the Spin pool, then reconcile books vs wallets.
{
  const price = PRICE, usd = (raw) => raw / 1e6 * price;
  await db.query(`update public.pools set rules = $1 where game = 'spin'`, [JSON.stringify({ skimAt: usd(await pool('spin')) - 1, skim: 2 })]); // next play skims
  let x = await buyRun(me, PLAYER, 'spin', 1, 0.1); let [s] = await settleAll(me, x); assert.ok(s.r.skim, 'a skim happened');
  await db.query(`update public.pools set santa_raw = $1, rules = $2 where game = 'spin'`, [Math.round(6 / price * 1e6), JSON.stringify({ topOffBelow: 8, topOffTo: 20 })]); // below the top-off line
  x = await buyRun(me, PLAYER, 'spin', 1, 0.1);
  const spinAfterForce = await pool('spin');
  [s] = await settleAll(me, x); assert.ok(s.r.topOff, 'a top-off happened');
  const tr = await db.query(`select kind, status, amount_raw from public.pool_transfers where game = 'spin' order by id`);
  assert.deepEqual(tr.map((t) => [t.kind, t.status]), [['skim', 'queued'], ['top-off', 'needs_approval']], 'queued as real transfers; the top-off waits for Cody');
  const { reconcile } = await import('../../server/reconcile.js');
  const since = await db.query(`select status, amount_raw from public.payouts where run_id = $1`, [x.run]);
  const rc = reconcile({ bookRaw: await pool('spin'), walletRaw: spinAfterForce, payouts: since, transfers: tr.filter((t) => t.kind === 'top-off') });
  assert.ok(rc.ok, `books vs wallet after a top-off play: drift ${rc.drift}`);
}
// The shared winners list: only plays that paid more than they cost, newest first, names only (never a wallet).
const wins = await server.winners();
const realWins = (await db.query(`select count(*)::int as n from public.plays where state = 'settled' and pay > bet`))[0].n;
assert.equal(wins.length, Math.min(30, realWins));
assert.ok(wins.every((w) => w.gainPct > 0), 'only real wins');
assert.ok(!JSON.stringify(wins).includes('wa11et'), 'no wallet addresses in the public list');
assert.ok(wins.every((w, i) => i === 0 || wins[i - 1].at >= w.at), 'newest first');
// Every finished run paid exactly once, exactly its plays' total.
const bad = await db.query(`select r.id from public.runs r left join public.payouts po on po.run_id = r.id
  where r.paid_at is not null and coalesce(po.amount_raw, 0) <> (select coalesce(sum(pay_raw), 0) from public.plays where run_id = r.id)`);
assert.equal(bad.length, 0, 'every finished run paid exactly its plays\' total');
// Spin is retired (Cody, 2026-10-01): a server with the default settings sells no Spin, still sells Snowball Drop (which plays
// from the same pool), and a Spin run bought BEFORE the change still finishes and pays (nobody's paid plays are stranded).
const live = createGameServer({ db, chain: { getTransaction: async (s) => txs.get(s) ?? null }, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, poolWallets: POOLS });
assert.equal((await live.quote(me, 'spin', 1, 0.1)).error, 'that game has been retired', 'no new Spin runs');
assert.ok((await live.quote(me, 'drop', 1, 0.1)).id, 'Snowball Drop still sells, from the same pool');
const old = await directRun(db, me, 'spin', 5, 0.1);
let lastSpin; for (const t of old.tickets) { lastSpin = await live.settle(me, t, 'aa'.repeat(16)); assert.ok(lastSpin.r, JSON.stringify(lastSpin)); }
assert.equal(lastSpin.runDone, true, 'a Spin run bought before the change still finishes on the new server');
assert.ok((await db.query('select paid_at from public.runs where id = $1', [old.run]))[0].paid_at, 'and is paid');
console.log('OK: quote → pay → buy a run → settle on real Postgres; cheats refused; every play re-checked; ONE payout per run, only at its end; refunds ride along; stuck runs finished; 10 settles at once all counted; price halving checked');
