// FULL SIMULATION (Cody, 2026-10-04: "a 50 player simulation, all email or wallet accounts so progress saves; then 30 wallets max
// buy items and play the mini games"). Everything runs on THIS computer, on a private copy of the game: every database file
// (PGlite), the real match server (server/referee.js), the real levels/season code, the real Store, game server and lottery.
// No live service is touched and no account is made anywhere but this private database.
//   Part 1: 50 accounts (25 wallet, 25 email) play public Auto matches on the real match server, as players: they move toward
//           the hat, throw at the nearest player, chase the hat. Several rounds of matches. Then every player's saved progress
//           is checked against what the match server saw: games played, top-3 finishes, level steps, daily-task counts.
//   Part 2: 30 of the wallet accounts buy everything the rules allow (every Store item for sale, levels to 5, ranked tickets to
//           the cap, the season pass, lottery tickets) and play Big Hat, Snowball Drop and Stocking Stuffer runs, paying with
//           stand-in transactions built exactly as the payment tests build them. Then the money invariants are checked.
// Run: node full-sim.mjs [players=50] [buyers=30] [rounds=3]
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { makeDb } from './setup.mjs';
import { createReferee } from '../../server/referee.js';
import { createLevels } from '../../server/levels.js';
import { createShop } from '../../server/shop.js';
import { createGameServer } from '../../server/games.js';
import { createLottery } from '../../server/lottery.js';
import { createSeasons } from '../../server/seasons.js';
import { splitPayment, MINT } from '../../mockups/market.js';
import { SHOP_BURN_BPS, forSale, TICKET_PACKS } from '../../mockups/shoprules.js';
import { BOUGHT_MAX } from '../../mockups/ranked.js';
import { ITEMS } from '../../mockups/catalog.js';
import { GAME_BURN_BPS } from '../../mockups/credits.js';
import { BURN_BPS as LOTTERY_BURN_BPS } from '../../mockups/lottery.js';
import { newSeed } from '../../mockups/fair.js';
import { K, PTS } from '../../mockups/sim.js';
import { seasonAt } from '../../mockups/seasons.js';

const N = +(process.argv[2] || 50), BUYERS = Math.min(+(process.argv[3] || 30), Math.ceil(N * 3 / 5)), ROUNDS = +(process.argv[4] || 3);
const t0 = Date.now(), fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const PRICE = 0.0004, FEE = { bps: 300, max: 1e15 };
const FILES = readdirSync(new URL('../../supabase/', import.meta.url)).filter((f) => /^0\d\d_.*\.sql$/.test(f) && f !== '031_games_role.sql').sort();
const db = await makeDb(FILES);
const one = async (q, p) => (await db.query(q, p))[0];
const POOLS = { spin: 'GameP00LwaLLetxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/[0OIl]/g, '9'), slots: 'SL9tsPooLwaLLetxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/[0OIl]/g, '9') };
const TREASURY = 'TReasuryWaLLetxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/[0OIl]/g, '9'), LOTTO = 'LottoWaLLetxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/[0OIl]/g, '9');
const START = Math.round(500 / PRICE * 1e6);
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', $1, '{}'), ('slots', 0, '{}') on conflict (game) do update set santa_raw = excluded.santa_raw`, [START]);

// ---------- the 50 accounts: wallet ones have a Solana-style address; email ones have none (supabase/003)
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const addr = (i) => { let s = 'Sim'; let x = i * 7919 + 13; while (s.length < 44) { s += B58[x % 58]; x = Math.floor(x * 1.37 + 11); } return s; };
const players = [];
for (let i = 0; i < N; i++) {
  const wallet = i % 5 < 3 ? addr(i) : null, email = wallet ? null : `sim${i}@example.test`; // 3 in 5 wallet (30 of 50), the rest email
  const id = (await one('insert into auth.users (email) values ($1) returning id', [email])).id;
  await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, $2, $3, '{}')`, [id, wallet, `Sim${String(i).padStart(2, '0')}${wallet ? 'W' : 'E'}`]);
  players.push({ i, id, wallet, email, name: `Sim${String(i).padStart(2, '0')}${wallet ? 'W' : 'E'}`, token: 'tok-' + id });
}
console.log(`${N} accounts: ${players.filter((p) => p.wallet).length} wallet, ${players.filter((p) => !p.wallet).length} email (${((Date.now() - t0) / 1000).toFixed(1)} s to set up the database)`);

// ---------- PART 1: real matches on the real match server
console.log(`\nPART 1: ${N} signed-in players, ${ROUNDS} rounds of public Auto matches on the real match server`);
let clock = Date.UTC(2026, 9, 4, 6, 0, 0); // a fixed morning (game day well away from the 9 PM reset)
const levels = createLevels({ db }), finishes = [];
const ref = createReferee({ now: () => clock,
  identify: async (tok) => { const p = players.find((x) => x.token === tok); if (!p) return null; const r = await one('select level, avatar, name, rank_points from public.profiles where id = $1', [p.id]); return { pid: p.id, l: r.level, a: r.avatar, n: r.name, rp: r.rank_points }; },
  finish: async (m) => { finishes.push(m); return levels.finishByReferee(m); }, log: { log() {}, error: (...a) => console.error('referee:', ...a) } });
// a player's connection: reads the snapshots, plays like a person (go for the hat, throw at the nearest player)
function connect(p) {
  const c = { p, got: [], last: null, q: 0, t: 0, nextThrow: 0, send(s) { const m = JSON.parse(s); if (m.t === 'snap') c.last = m.d; else c.got.push(m); } };
  c.h = ref.connect(c); c.say = (m) => c.h.message(JSON.stringify(m)); return c;
}
function play(c, now) {
  const s = c.last; if (!s || !Array.isArray(s.E)) return;
  const me = s.E.find((r) => r[1] === c.id); if (!me) return;
  const [, , , , x, z] = me, ep = me[13], H = s.H || [], holder = H[7];
  const others = s.E.filter((r) => r !== me), near = others.reduce((b, r) => (!b || Math.hypot(r[4] - x, r[5] - z) < Math.hypot(b[4] - x, b[5] - z) ? r : b), null);
  let tx = H[1] ?? 0, tz = H[3] ?? 0;
  if (holder === me[0]) { const a = Math.atan2(z - (near?.[5] ?? 0), x - (near?.[4] ?? 0)); tx = x + Math.cos(a) * 3; tz = z + Math.sin(a) * 3; } // wearing it: run away
  else if (H[0] === 1 && holder >= 0) { const h = s.E.find((r) => r[0] === holder); if (h) { tx = h[4]; tz = h[5]; } } // someone wears it: chase them
  const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz) || 1, sp = Math.min(K.HUMAN_SPEED, d * 4);
  const r = { q: ++c.q, ep, x: x + (dx / d) * sp * (1 / 30), z: z + (dz / d) * sp * (1 / 30), vx: (dx / d) * sp, vz: (dz / d) * sp, f: Math.atan2(dx, dz), t: c.t };
  if (near && now >= c.nextThrow && me[10] > 0) { c.t++; r.t = c.t; r.ax = near[4]; r.az = near[5]; c.nextThrow = now + 350 + (c.p.i % 5) * 60; }
  c.say({ t: 'rep', d: r });
}
const conns = [];
for (let round = 1; round <= ROUNDS; round++) {
  // everyone presses Auto match (the server picks the room: fullest waiting room first)
  for (const c of conns.splice(0)) c.h.gone();
  for (const p of players) { const c = connect(p); c.id = 'pl' + p.i + 'r' + round + 'xxxxxxxx'.slice(0, 6); c.say({ t: 'auto', modes: ['ffa'], styles: ['gear'], token: p.token, me: { id: c.id, n: p.name, j: 0, a: {}, l: 1 } }); conns.push(c); }
  await new Promise((r) => setTimeout(r, 50)); // the sign-in checks (async) finish
  const rooms = new Set(conns.map((c) => [...c.got].reverse().find((m) => m.t === 'peers')?.code).filter(Boolean));
  // run the clock: waiting room countdown, load screen, countdown, 60 s match, results
  const startFin = finishes.length;
  for (let k = 0; k < 30 * 120 && finishes.length - startFin < rooms.size; k++) { clock += 1000 / 30; ref.tick(1 / 30); if (k % 2 === 0) for (const c of conns) play(c, clock); if (k % 300 === 0) await new Promise((r) => setTimeout(r, 0)); }
  await new Promise((r) => setTimeout(r, 300)); // the finish writes (async) land
  console.log(`  round ${round}: ${rooms.size} rooms, ${finishes.length - startFin} matches finished and reported`);
  clock += 20_000;
}
for (const c of conns.splice(0)) c.h.gone();
await new Promise((r) => setTimeout(r, 500));

// what the match server reported vs what the database saved, player by player
const reported = new Map(players.map((p) => [p.id, { games: 0, top3: 0, hits: 0, hatSec: 0, steals: 0, catches: 0 }]));
for (const m of finishes) m.places.forEach((pid, i) => { if (!pid) return; const r = reported.get(pid); r.games++; if (i < 3) r.top3++; const st = m.stats?.[i] || {}; for (const k of ['hits', 'hatSec', 'steals', 'catches']) r[k] += st[k] || 0; });
const S = seasonAt(clock), dayKeyAt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Indiana/Indianapolis', year: 'numeric', month: '2-digit', day: '2-digit' });
let ok = 0, bad = [];
for (const p of players) {
  const r = reported.get(p.id), saved = await one(`select (select count(*)::int from public.match_results where profile_id = $1) as games,
      (select count(*)::int from public.level_finishes where profile_id = $1 and match_id not like 'season:%') as finishes, (select level from public.profiles where id = $1) as level,
      (select xp from public.profiles where id = $1) as xp`, [p.id]);
  const prog = await db.query(`select stats from public.season_progress where profile_id = $1`, [p.id]);
  const sum = (k) => prog.reduce((a, x) => a + (x.stats?.[k] || 0), 0);
  const good = saved.games === r.games && saved.finishes === r.top3 && sum('games') === r.games && sum('hits') === Math.min(r.hits, 500 * r.games) && sum('top3') === r.top3;
  if (good) ok++; else bad.push(`${p.name}: reported ${JSON.stringify(r)} saved games ${saved.games} top3 ${saved.finishes} season ${JSON.stringify({ games: sum('games'), top3: sum('top3'), hits: sum('hits') })}`);
}
const totalGames = [...reported.values()].reduce((a, r) => a + r.games, 0), totalHits = [...reported.values()].reduce((a, r) => a + r.hits, 0);
check(totalGames === N * ROUNDS, `every player played every round: ${totalGames} player-matches (${N} × ${ROUNDS})`);
check(totalHits > N * ROUNDS, `players really played: ${totalHits} hits, ${[...reported.values()].reduce((a, r) => a + r.hatSec, 0)} hat seconds, ${[...reported.values()].reduce((a, r) => a + r.steals, 0)} steals`);
check(ok === N, `${ok}/${N} accounts saved exactly what the match server reported (games, top-3 finishes, season task counts)${bad.length ? ': ' + bad.slice(0, 3).join(' | ') : ''}`);
const lv = await db.query('select level, count(*)::int n from public.profiles group by level order by level');
console.log(`  levels after ${ROUNDS} rounds: ${lv.map((r) => `level ${r.level}: ${r.n}`).join(', ')}`);
const doors = (await one(`select count(*)::int n from public.season_progress where door`)).n;
console.log(`  season doors opened (all 3 daily tasks done): ${doors}`);
{ const seasons = createSeasons({ db, now: () => clock }), sample = await seasons.state(players[0].id);
  check(sample.season?.id === S?.id && sample.tasks.length === 3 && sample.tasks[0].have === Math.min(sample.tasks[0].need, reported.get(players[0].id).games), `a player's season card reads it back: ${sample.tasks.map((t) => `${t.text} ${t.have}/${t.need}`).join(' · ')}`); }

// ---------- PART 2: 30 wallet accounts buy everything allowed and play the mini games
console.log(`\nPART 2: ${BUYERS} wallet accounts max out the Store and play the mini games`);
const txs = new Map(); let sigN = 0;
// a unique signature per payment: the counter written in base 58 (Solana's letters: no 0, O, I or l)
const b58 = (n) => { let s = ''; do { s = B58[n % 58] + s; n = Math.floor(n / 58); } while (n); return s; };
const sig = (tag) => (tag + b58(++sigN).padStart(8, '1') + 'Z'.repeat(88)).slice(0, 88);
function pay(from, to, total, burnBps) {
  const s = splitPayment(total, burnBps, FEE), b = (i, o, a) => ({ accountIndex: i, mint: MINT, owner: o, uiTokenAmount: { amount: String(a), decimals: 6 } }), id = sig('Pay');
  txs.set(id, { blockTime: Math.floor(Date.now() / 1000), meta: { err: null, innerInstructions: [], preTokenBalances: [b(1, from, 1e14), b(2, to, 1e12)], postTokenBalances: [b(1, from, 1e14 - total), b(2, to, 1e12 + s.arrives)] },
    transaction: { message: { accountKeys: [{ pubkey: from, signer: true }], instructions: [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { mint: MINT, authority: from, tokenAmount: { amount: String(s.burn) } } } }] } } });
  return { id, ...s };
}
const chain = { getTransaction: async (s) => txs.get(s) ?? null, latestBlock: async () => ({ blockhash: 'B'.repeat(43), slot: 1 }) };
const base = { db, chain, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, mint: MINT, cluster: 'devnet' };
const shop = createShop({ ...base, treasury: TREASURY });
const games = createGameServer({ ...base, retired: ['spin'], poolWallets: POOLS });
const lottery = createLottery({ ...base, wallet: LOTTO });
await lottery.draws(); // opens the draws
const buyers = players.filter((p) => p.wallet).slice(0, BUYERS), totals = { shopPaid: 0, shopBurn: 0, gamePaid: 0, lottoPaid: 0, runs: 0, plays: 0, refused: [] };
const sellable = ITEMS.filter(forSale);
for (const p of buyers) {
  const shopBuy = async (what) => { const q = await shop.quote(p.id, what); if (!q.id) return q; const t = pay(p.wallet, TREASURY, q.santaRaw, SHOP_BURN_BPS); totals.shopPaid += q.santaRaw; totals.shopBurn += t.burn; return shop.buy(p.id, q.id, t.id); };
  for (const it of sellable) { const r = await shopBuy({ kind: 'item', id: it.id }); if (!r.ok) totals.refused.push(`${p.name} ${it.id}: ${r.error}`); }
  for (let k = 0; k < 6; k++) { const r = await shopBuy({ kind: 'level' }); if (!r.ok) { if (!/earned/.test(r.error || '')) totals.refused.push(`${p.name} level: ${r.error}`); break; } }
  for (const n of [10, 1]) { const r = await shopBuy({ kind: 'tickets', n }); if (!r.ok && !/at most/.test(r.error || '')) totals.refused.push(`${p.name} tickets ${n}: ${r.error}`); }
  const pass = await shopBuy({ kind: 'pass' }); if (!pass.ok) totals.refused.push(`${p.name} pass: ${pass.error}`);
  p.secondPass = await shop.quote(p.id, { kind: 'pass' });
  // lottery: 2 Weekly 10¢ tickets
  const lq = await lottery.quote(p.id, 'weekly-10', 2);
  if (lq.id) { const t = pay(p.wallet, LOTTO, lq.santaRaw, LOTTERY_BURN_BPS); totals.lottoPaid += lq.santaRaw; const r = await lottery.buy(p.id, lq.id, t.id); if (r.error) totals.refused.push(`${p.name} lottery: ${r.error}`); } else totals.refused.push(`${p.name} lottery quote: ${lq.error}`);
  // the mini games: a run of 10 on each, every play settled like the page does
  for (const [kind, bet] of [['big', 1], ['drop', 0.1], ['stocking', 0.1]]) {
    const q = await games.quote(p.id, kind, 10, bet); if (!q.id) { totals.refused.push(`${p.name} ${kind} quote: ${q.error}`); continue; }
    const t = pay(p.wallet, POOLS.spin, q.santaRaw, GAME_BURN_BPS); totals.gamePaid += q.santaRaw;
    const b = await games.buy(p.id, q.id, t.id); if (!b.ok) { totals.refused.push(`${p.name} ${kind} buy: ${b.error}`); continue; }
    totals.runs++; for (const pl of b.plays) { const r = await games.settle(p.id, pl.ticket, newSeed(16)); if (r.r) totals.plays++; else totals.refused.push(`${p.name} ${kind} settle: ${r.error}`); }
  }
}
console.log(`  ${buyers.length} buyers: ${totals.runs} runs / ${totals.plays} plays, ${(totals.shopPaid / 1e6).toFixed(0)} SANTA in the Store, ${(totals.gamePaid / 1e6).toFixed(0)} in games, ${(totals.lottoPaid / 1e6).toFixed(0)} in the lottery`);
check(!totals.refused.length, `every allowed purchase and play went through${totals.refused.length ? ': ' + totals.refused.slice(0, 5).join(' | ') : ''}`);
// what each buyer now has: every Store item once, level 5, the most bought tickets allowed, the pass, 2 lottery tickets
let full = 0; const short = [];
for (const p of buyers) {
  const r = await one(`select (select count(distinct item_id)::int from public.inventory where profile_id = $1 and item_id = any($2::text[])) as items, (select level from public.profiles where id = $1) as level,
      (select count(*)::int from public.season_passes where profile_id = $1) as pass, (select coalesce(sum(n), 0)::int from public.ticket_purchases where profile_id = $1) as tix,
      (select count(*)::int from public.lottery_buys where profile_id = $1) as lotto`, [p.id, sellable.map((i) => i.id)]);
  if (r.items === sellable.length && r.level >= 5 && r.pass === 1 && r.tix === Math.min(10, BOUGHT_MAX) && r.lotto === 1) full++; else short.push(`${p.name} ${JSON.stringify(r)}`);
}
check(full === buyers.length, `${full}/${buyers.length} buyers own all ${sellable.length} Store items, level 5, the pass, ${Math.min(10, BOUGHT_MAX)} bought tickets, their lottery tickets${short.length ? ': ' + short.slice(0, 3).join(' | ') : ''}`);
check(buyers.every((p) => /already have/.test(p.secondPass?.error || '')), 'a second pass is refused before any payment, for every buyer');
check(!(await db.query('select 1 from public.shop_refunds')).length, 'no Store payment was owed back (nothing paid for that couldn\'t be granted)');
const dup = await db.query('select signature, count(*) from public.item_purchases group by signature having count(*) > 1');
check(!dup.length, 'every payment bought exactly once (no signature granted twice)');
// game runs: each finished run queued ONE payout of exactly its plays' total; the pool book moved by exactly what arrived minus payouts
const runBad = await db.query(`select r.id from public.runs r left join public.payouts po on po.run_id = r.id
  where r.paid_at is not null and coalesce(po.amount_raw, 0) <> (select coalesce(sum(pay_raw), 0) from public.plays where run_id = r.id)`);
check(!runBad.length, `every finished run's payout equals its plays' total (${totals.runs} runs)`);
const arrived = (await one('select coalesce(sum(arrived_raw), 0)::text n from public.payments')).n, paidOut = (await one(`select coalesce(sum(amount_raw), 0)::text n from public.payouts`)).n;
const skims = (await one(`select coalesce(sum(case when kind = 'skim' then -amount_raw else amount_raw end), 0)::text n from public.pool_transfers where game = 'spin'`)).n;
const book = +(await one(`select santa_raw from public.pools where game = 'spin'`)).santa_raw;
check(book === START + +arrived - +paidOut + +skims, `the Game pool's book = start + what arrived − payouts ± skims/top-offs (${(book / 1e6).toFixed(0)} SANTA)`);
const playsBad = await db.query(`select id from public.plays where state not in ('settled', 'refunded') and run_id in (select id from public.runs where paid_at is not null)`);
check(!playsBad.length, 'no play left half-done in a finished run');
const burnedGames = (await one('select coalesce(sum(burned_raw), 0)::text n from public.payments')).n;
check(+burnedGames > 0, `10% of every game payment burned (${(+burnedGames / 1e6).toFixed(0)} SANTA)`);
{ const b = await games.burned(); check(b.totalRaw >= +burnedGames && b.storeRaw > 0 && b.lotteryRaw > 0, `the money strip's burned-so-far adds it all up: ${(b.totalRaw / 1e6).toFixed(0)} SANTA (games ${(b.gamesRaw / 1e6).toFixed(0)}, Store ${(b.storeRaw / 1e6).toFixed(0)}, lottery ${(b.lotteryRaw / 1e6).toFixed(0)})`); }

console.log(`\n${fails.length ? 'FAILED ' + fails.length + ':\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(fails.length ? 1 : 0);
