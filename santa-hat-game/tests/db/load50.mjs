// LOAD TEST: 50 PLAYERS AT ONCE (Cody 2026-10-05: "if we have 25 people playing the same game over and over what happens";
// "do a 50 person version of it to be safe"). Runs on THIS computer only: the REAL game server code (server/games.js: price
// quotes, payment checks, plays, the $30 floor), a REAL Postgres database with every migration and many connections at once
// (tests/db/realpg.mjs; as live), the REAL payout worker loop (server/payouts.js) behind the REAL fast-payment gate
// (server/paymentgate.js), and a stand-in Solana that answers like the real one with realistic delays (payments read ~150 ms,
// final ~1 s later; payouts land ~300 ms). Nothing live is touched; no money exists here.
// 50 players play at the SAME time for DURATION seconds: each buys a run (Big Hat $1, Snowball Drop or Stocking Stuffer 10¢ or $1,
// 5-20 plays), plays every play like the page does, then the next run, over and over. Measured: how long each step takes (median,
// 95th percentile, worst), every error, every refusal, the pool over time; then the money checks: every finished run paid out once,
// exactly its plays' total; the pool's books = start + what arrived - payouts ± transfers; nothing left half-done.
// Run (WSL, Postgres installed): node load50.mjs [players=50] [seconds=120] [pool dollars=139]
import { readdirSync } from 'node:fs';
import { startPostgres, makeRealDb } from './realpg.mjs';
import { createGameServer } from '../../server/games.js';
import { runPayouts } from '../../server/payouts.js';
import { makePaymentGate } from '../../server/paymentgate.js';
import { splitPayment, MINT } from '../../mockups/market.js';
import { GAME_BURN_BPS } from '../../mockups/credits.js';
import { newSeed } from '../../mockups/fair.js';

const N = +(process.argv[2] || 50), SECONDS = +(process.argv[3] || 120), POOL_USD = +(process.argv[4] || 139);
const PRICE = 0.0004, FEE = { bps: 300, max: 1e15 }, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FILES = readdirSync(new URL('../../supabase/', import.meta.url)).filter((f) => /^0\d\d_.*\.sql$/.test(f) && f !== '031_games_role.sql').sort();
const server = await startPostgres(); if (!server) { console.log('SKIP: no Postgres here (run it in WSL)'); process.exit(0); }
const raw = await makeRealDb(server, { files: FILES });
// LIVE CONDITIONS (measured 2026-10-05): the game server reaches the database in ~12 ms a trip, over MAX connections. LAT=12 MAX=4
// makes this copy behave the same: every query waits LAT ms, and at most MAX run at once (others queue, as on the server).
const LAT = +(process.env.LAT || 0), MAX = +(process.env.MAX || 20);
let busy = 0; const waiters = [];
const slot = async () => { if (busy < MAX) { busy++; return; } await new Promise((r) => waiters.push(r)); busy++; };
const free = () => { busy--; waiters.shift()?.(); };
const lag = () => (LAT ? sleep(LAT) : null);
const db = LAT || process.env.MAX ? { ...raw,
  query: async (q, p) => { await slot(); try { await lag(); return await raw.query(q, p); } finally { free(); } },
  tx: async (fn) => { await slot(); try { await lag(); return await raw.tx((t) => fn({ query: async (q, p) => { await lag(); return t.query(q, p); } })); } finally { free(); } },
  player: raw.player } : raw;
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', b58 = (n) => { let s = ''; do { s = B58[n % 58] + s; n = Math.floor(n / 58); } while (n); return s; };
const wallet = (i) => ('Load' + b58(i + 1000) + 'wa11et').padEnd(44, 'x').replace(/[0OIl]/g, '9').slice(0, 44);
const POOLS = { spin: 'GameP99LwaLLetxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', slots: 'SL9tsP99LwaLLetxxxxxxxxxxxxxxxxxxxxxxxxxxxx' };
const START = Math.round((POOL_USD / PRICE) * 1e6);
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', $1, '{}'), ('slots', 0, '{}')`, [START]);
// ---- the stand-in Solana: payments as the payment tests build them; "final" a second after they're made
const txs = new Map(), madeAt = new Map(); let sigN = 0;
function pay(from, total) {
  const s = splitPayment(total, GAME_BURN_BPS, FEE), b = (i, o, a) => ({ accountIndex: i, mint: MINT, owner: o, uiTokenAmount: { amount: String(a), decimals: 6 } });
  const id = ('Pay' + b58(++sigN).padStart(9, '1') + 'Z'.repeat(88)).slice(0, 88);
  txs.set(id, { blockTime: Math.floor(Date.now() / 1000), meta: { err: null, innerInstructions: [], preTokenBalances: [b(1, from, 1e15), b(2, POOLS.spin, 1e13)], postTokenBalances: [b(1, from, 1e15 - total), b(2, POOLS.spin, 1e13 + s.arrives)] },
    transaction: { message: { accountKeys: [{ pubkey: from, signer: true }], instructions: [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { mint: MINT, authority: from, tokenAmount: { amount: String(s.burn) } } } }] } } });
  madeAt.set(id, Date.now()); return id;
}
const chain = { getTransactionFast: async (s) => { await sleep(150); return txs.get(s) ?? null; }, getTransaction: async (s) => { await sleep(150); return txs.get(s) ?? null; } };
const games = createGameServer({ db, chain, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, mint: MINT, cluster: 'devnet', retired: ['spin'], poolWallets: POOLS });
// price samples so quotes are allowed (the game server needs recent ones)
for (let i = 0; i < 6; i++) await db.query(`insert into public.price_samples (at, usd) values (now() - make_interval(secs => $1), $2)`, [i * 30, PRICE]).catch(() => {});
// ---- the players
const players = [];
for (let i = 0; i < N; i++) players.push({ i, wallet: wallet(i), id: await db.player(wallet(i), 'Load' + i) });
const lat = { quote: [], buy: [], settle: [] }, errors = new Map(), stats = { runs: 0, plays: 0, low: 0, refusedPlays: 0, quotes: 0 };
const err = (k) => errors.set(k, (errors.get(k) || 0) + 1);
const timed = async (k, fn) => { const t = performance.now(); try { return await fn(); } finally { lat[k].push(performance.now() - t); } };
const GAMES = [['big', 1], ['drop', 0.1], ['drop', 1], ['stocking', 0.1], ['stocking', 1]];
const end = Date.now() + SECONDS * 1000;
async function playerLoop(p) {
  await sleep(Math.random() * 2000); // they don't all click on the same millisecond
  while (Date.now() < end) {
    const [kind, bet] = GAMES[Math.floor(Math.random() * GAMES.length)], n = 5 + Math.floor(Math.random() * 16);
    stats.quotes++;
    const q = await timed('quote', () => games.quote(p.id, kind, n, bet)).catch((e) => ({ error: 'quote threw: ' + e.message }));
    if (q.low) { stats.low++; await sleep(3000); continue; } // the $30 floor: "the prize pool is refilling"
    if (q.busy) { await sleep(500); continue; }
    if (!q.id) { err('quote: ' + (q.error || JSON.stringify(q)).slice(0, 80)); await sleep(1000); continue; }
    await sleep(800 + Math.random() * 700); // the wallet approval + "confirmed" (~1-2 s)
    const sig = pay(p.wallet, q.santaRaw);
    const b = await timed('buy', () => games.buy(p.id, q.id, sig)).catch((e) => ({ error: 'buy threw: ' + e.message }));
    if (!b.ok) { err('buy: ' + (b.error || '').slice(0, 80)); continue; }
    stats.runs++;
    for (const pl of b.plays) {
      const r = await timed('settle', () => games.settle(p.id, pl.ticket, newSeed(16))).catch((e) => ({ error: 'settle threw: ' + e.message }));
      if (r.r) stats.plays++; else if (r.refunded !== undefined || r.refused) stats.refusedPlays++; else err('settle: ' + (r.error || JSON.stringify(r)).slice(0, 80));
      await sleep(80 + Math.random() * 120); // the page's animation between plays (fast mode)
    }
  }
}
// ---- the payout worker, every 2 s, behind the fast-payment gate
let n = 0; const sentSigs = new Map(), poolLog = [];
const payoutChain = makePaymentGate({ db, statuses: async (sig) => (Date.now() - (madeAt.get(sig) || 0) > 1000 ? { confirmationStatus: 'finalized', err: null } : { confirmationStatus: 'confirmed', err: null }) })
  .gate({ sign: async (row) => { const s = 'out-' + row.id + '-' + ++n; return { signature: s, tx: 'tx', blockhash: 'bh' }; }, send: async () => { await sleep(300); },
    status: async (s) => { const id = s.split('-')[1]; sentSigs.set(id, (sentSigs.get(id) || new Set()).add(s)); return 'landed'; } });
let workerOn = true;
const worker = (async () => { while (workerOn) { try { await runPayouts({ db, chain: payoutChain, table: 'payouts', limit: 50 }); } catch (e) { err('worker: ' + e.message.slice(0, 80)); }
  poolLog.push(+(await db.query(`select santa_raw from public.pools where game = 'spin'`))[0].santa_raw / 1e6 * PRICE); await sleep(2000); } })();
console.log(`${N} players, ${SECONDS} s, Game pool $${POOL_USD}...`);
const t0 = Date.now();
await Promise.all(players.map(playerLoop));
const playSecs = (Date.now() - t0) / 1000;
// let the worker finish every queued winning (payments final after 1 s)
for (let i = 0; i < 30; i++) { const q = +(await db.query(`select count(*)::int n from public.payouts where status in ('queued', 'sending')`))[0].n; if (!q) break; await sleep(2000); }
workerOn = false; await worker;
// ---- report
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const ms = (k) => `median ${pct(lat[k], 0.5).toFixed(0)} ms · 95% under ${pct(lat[k], 0.95).toFixed(0)} ms · worst ${Math.max(0, ...lat[k]).toFixed(0)} ms (${lat[k].length})`;
console.log(`\nIN ${playSecs.toFixed(0)} s: ${stats.runs} runs bought, ${stats.plays} plays (${(stats.plays / playSecs).toFixed(1)} a second), ${stats.low} quotes refused by the $30 floor, ${stats.refusedPlays} plays refunded`);
console.log(`  price quote: ${ms('quote')}\n  payment check + run start: ${ms('buy')}\n  one play: ${ms('settle')}`);
console.log(`  pool: start $${POOL_USD}, lowest $${Math.min(...poolLog).toFixed(2)}, highest $${Math.max(...poolLog).toFixed(2)}, end $${poolLog.at(-1)?.toFixed(2)}`);
{ const m = (await db.query(`select r.kind, r.bet, count(pl.*)::int plays, sum(pl.bet)::numeric bet_usd, sum(pl.pay)::numeric won_usd, count(*) filter (where pl.result->>'jackpot' = 'true')::int jackpots, max(pl.pay)::numeric biggest
    from public.plays pl join public.runs r on r.id = pl.run_id where pl.state = 'settled' group by r.kind, r.bet order by r.kind, r.bet`));
  for (const x of m) console.log(`  ${x.kind} $${x.bet}: ${x.plays} plays, bet $${(+x.bet_usd).toFixed(2)}, won $${(+x.won_usd).toFixed(2)} (payback ${((+x.won_usd / +x.bet_usd) * 100).toFixed(0)}%), ${x.jackpots} pool jackpots, biggest single win $${(+x.biggest).toFixed(2)}`); }
console.log(`  errors: ${errors.size ? [...errors].map(([k, v]) => `${v}× ${k}`).join(' | ') : 'none'}`);
const fails = [], check = (ok, m) => { console.log((ok ? '  ✓ ' : '  ✗ ') + m); if (!ok) fails.push(m); };
const q1 = async (s, p) => (await db.query(s, p))[0];
check(!errors.size, 'no errors for any player');
const runBad = await db.query(`select r.id from public.runs r left join public.payouts po on po.run_id = r.id where r.paid_at is not null and coalesce(po.amount_raw, 0) <> (select coalesce(sum(pay_raw), 0) from public.plays where run_id = r.id)`);
check(!runBad.length, `every finished run's payout = its plays' total (${stats.runs} runs)`);
const po = await db.query(`select id, status from public.payouts`), unsent = po.filter((x) => x.status !== 'sent');
check(!unsent.length, `every winning was sent (${po.length} payouts; not sent: ${unsent.length} ${JSON.stringify(unsent.slice(0, 3))})`);
check([...sentSigs.values()].every((s) => s.size === 1), 'each winning sent exactly ONCE (never twice)');
const arrived = +(await q1('select coalesce(sum(arrived_raw), 0)::text n from public.payments')).n, paidOut = +(await q1('select coalesce(sum(amount_raw), 0)::text n from public.payouts')).n;
const tr = +(await q1(`select coalesce(sum(case when kind = 'skim' then -amount_raw else amount_raw end), 0)::text n from public.pool_transfers where game = 'spin'`)).n;
const book = +(await q1(`select santa_raw from public.pools where game = 'spin'`)).santa_raw;
check(book === START + arrived - paidOut + tr, `the pool's books add up to the unit: start + arrived − payouts ± transfers = ${(book / 1e6).toFixed(0)} SANTA`);
const half = await db.query(`select id from public.plays where state not in ('settled', 'refunded') and run_id in (select id from public.runs where paid_at is not null)`);
check(!half.length, 'no play left half-done in a finished run');
const dupPay = await db.query('select signature from public.payments group by signature having count(*) > 1');
check(!dupPay.length, 'no payment used twice');
console.log(fails.length ? `\nFAILED ${fails.length}` : '\nALL CHECKS PASSED');
await server.stop(); process.exit(fails.length ? 1 : 0);
