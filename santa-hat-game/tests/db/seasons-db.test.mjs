// SEASONS on real Postgres (PGlite): every live file 001–030, the season items (032, 035, 037), 033 and its rewards (036, 038),
// then 039 SEASON POINTS (Cody, 2026-10-04), twice. Proves:
//   - the database's 30-door plan is exactly seasons.js's (every door, both tracks, all three seasons);
//   - points only from what the servers saw: a page's report counts nothing; each of the day's first 10 public Auto matches +10
//     (+10 more for a top 3); "Log in" +100 once a day, only through season_login; each task met +100; never more than 700 a day;
//   - doors = points ÷ 300 (at most 30); every prize granted exactly once (looks, level steps, costume pieces, gear, tickets);
//     the pass backdates every door already reached; a whole season's track adds up exactly;
//   - season tickets: their own bank, no cap; ranked spends free, then season, then bought; a released one goes back;
//   - nobody but the servers writes any of it.
// Run: node seasons-db.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDb } from './setup.mjs';
import { createLevels } from '../../server/levels.js';
import { SEASONS, seasonAt, dayKey, tasksFor, freeReward, goldReward, seasonDays, dayPoints, doorsFor, DOORS, DOOR_POINTS, SEASON_GEAR, PASS_PRICE } from '../../mockups/seasons.js';

const FILES = ['001_profiles.sql', '002_items_seed.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql', '006_ranked_tickets.sql', '007_rate_limits.sql',
  '008_hats_backpacks.sql', '009_lock_my_plays.sql', '010_levels.sql', '011_lottery.sql', '012_special_snowballs.sql', '013_match_stats.sql', '014_run_sizes.sql',
  '015_special_gear.sql', '016_shop.sql', '017_referee_role.sql', '018_ranked_results.sql', '019_ranked_board.sql', '020_worker_role.sql', '021_alerts.sql',
  '022_ticket_cap.sql', '023_item_prices.sql', '024_reward_claims.sql', '025_stocking.sql', '026_shared_pool.sql', '027_tester_feedback.sql', '028_look_rewards.sql',
  '029_costumes.sql', '030_daily_reset.sql'];
const db = await makeDb(FILES);
const run = async (f, times = 1) => { for (let k = 0; k < times; k++) await db.pg.exec(readFileSync(new URL('../../supabase/' + f, import.meta.url), 'utf8')); };
await run('032_halloween_costume.sql'); await run('033_seasons.sql'); await run('035_thanksgiving.sql'); await run('037_christmas.sql');
await run('036_thanksgiving_rewards.sql'); await run('038_christmas_rewards.sql');
await run('039_season_points.sql', 2); // safe to apply twice
await run('040_pass_price.sql', 2); // the $2 pass
await run('041_season_mixed_prizes.sql', 2); // one mixed prize a door for everyone; the pass is the costume
await run('042_season_ticket_count.sql', 2); // season tickets counted apart from bought ones

const S = seasonAt(); assert.ok(S && S.id === 'halloween', 'the test runs during Halloween (Oct 1–31 2026): ' + S?.id);
const DAY = dayKey(), DAYS = seasonDays(S), TASKS = tasksFor(DAY);
assert.equal((await db.query(`select public.season_day(now())::text as d`))[0].d, DAY, 'the database and the page name the game day the same (9 PM Indiana)');

// 1. the database plan is seasons.js's: 30 doors a season, both tracks, every door
for (const s of SEASONS) {
  const r = (await db.query('select extract(epoch from starts) * 1000 as a, extract(epoch from ends) * 1000 as b, pass_usd from public.seasons where id = $1', [s.id]))[0];
  assert.deepEqual([+r.a, +r.b, +r.pass_usd], [s.start, s.end, PASS_PRICE], `${s.id}: same dates and pass price as seasons.js`);
  const pl = await db.query('select door, track, item_id, xp, tickets from public.season_rewards where season = $1 order by door, track', [s.id]);
  assert.equal(pl.filter((p) => p.track === 'free').length, DOORS, `${s.id}: a prize for everyone on all ${DOORS} doors`);
  assert.equal(pl.filter((p) => p.track === 'gold').length, s.gold.length, `${s.id}: the pass is just the ${s.gold.length} costume pieces`);
  const asRule = (p) => (p.item_id ? { kind: 'item', item: p.item_id } : p.tickets ? { kind: 'tickets', n: p.tickets } : { kind: 'xp', n: p.xp });
  for (let d = 1; d <= DOORS; d++) {
    const f = freeReward(s, d); delete f.gear;
    assert.deepEqual(asRule(pl.find((p) => p.door === d && p.track === 'free')), f, `${s.id} door ${d}: everyone's prize matches seasons.js`);
    const gr = pl.find((p) => p.door === d && p.track === 'gold');
    assert.deepEqual(gr ? asRule(gr) : null, goldReward(s, d), `${s.id} door ${d}: the pass piece (or none) matches seasons.js`);
  }
}
for (const it of SEASON_GEAR) assert.ok((await db.query('select 1 from public.items where id = $1', [it])).length, `the pass's gear ${it} is a real item`);

// players
let wn = 0; const W = () => ('SNwa11et' + 'ABCDEFGHJKLMN'[wn++]).padEnd(44, '1');
const mk = async (name) => { const id = (await db.query('insert into auth.users default values returning id'))[0].id;
  await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, $2, $3, '{}')`, [id, W(), name]); return id; };
const ava = await mk('Ava'), ben = await mk('Ben'), cid = await mk('Cid');
const levels = createLevels({ db });
const tasksJson = JSON.stringify(TASKS.map((t) => ({ id: t.id, stat: t.stat, need: t.need })));
let mid = 0; const match = (places, stats) => ({ id: 'season-test-match-' + (++mid), auto: true, places, stats });
const prog = async (p) => (await db.query(`select stats, door, points, matches_scored, top3_scored from public.season_progress where profile_id = $1 and season = 'halloween' and day = $2::date`, [p, DAY]))[0];
const inv = async (p) => (await db.query('select item_id from public.inventory where profile_id = $1 order by item_id', [p])).map((r) => r.item_id);
const grants = async (p) => (await db.query(`select door, track, item_id, xp, tickets from public.season_grants where profile_id = $1 and season = 'halloween' order by door, track`, [p]));
const login = (p) => db.query(`select public.season_login($1, 'halloween', $2::date, $3) as r`, [p, DAY, tasksJson]).then((r) => r[0].r);
// a match's counts that meet every rotating task except games/top3/wins/login (those come from the places and the login)
const fromMatch = (frac) => Object.fromEntries(TASKS.filter((t) => !['login', 'games', 'top3', 'wins'].includes(t.stat)).map((t) => [t.stat, Math.ceil(t.need * frac)]));

// 2. a PAGE's report never moves anything; the match server's does: +10 a match, +10 more for a top 3
await levels.finish(ava, match([ava, ben], [fromMatch(0.5), {}]));
assert.equal(await prog(ava), undefined, 'a page-reported finish: no season progress');
await levels.finishByReferee(match([ben, null, null, ava], [{}, null, null, {}])); // Ava 4th: +10, no top-3 bonus
let pa = await prog(ava);
assert.deepEqual([pa.stats.games, pa.matches_scored, pa.top3_scored, pa.points], [1, 1, 0, 10], 'one match, 4th place: +10 ' + JSON.stringify(pa));
const pb = await prog(ben); // Ben 1st: +10 +10, and +100 for each of today's tasks a 1st place completes ('wins' and 'top3' both
// need one such finish; which of them are among today's 3 rotating tasks depends on the date: found when the tests first ran on
// GitHub's machines, whose clock is UTC, 2026-10-04)
const firstDone = TASKS.filter((t) => ['wins', 'top3'].includes(t.stat) && t.need <= 1).map((t) => t.stat);
assert.equal(pb.points, 20 + 100 * firstDone.length, `a 1st place: +10, +10 top 3, and +100 for each of today's tasks it completes (${firstDone.join(', ') || 'none today'}): ` + JSON.stringify(pb));

// 3. Log in: +100 once a day, only through season_login; a match can't claim it
await levels.finishByReferee(match([cid], [{ login: 5 }]));
assert.ok(!(await prog(cid)).stats.login, "a match's counts can never tick \"Log in\"");
const l1 = await login(ava), l2 = await login(ava);
pa = await prog(ava);
assert.ok(l1.points === 110 && l2.already && pa.stats.login === 1 && pa.points === 110, `log in: +100 once (${JSON.stringify(l1)} / ${JSON.stringify(l2)})`);

// 4. every task met: +100 each; a perfect day (all 5) marks the calendar; at most 10 matches score; never over 700
for (let i = 0; i < 12; i++) await levels.finishByReferee(match([ava, ben], [fromMatch(1), {}])); // 12 more wins (1st of 2)
pa = await prog(ava);
assert.ok(pa.door, 'all 5 tasks met: a perfect day ' + JSON.stringify(pa.stats));
assert.deepEqual([pa.matches_scored, pa.top3_scored], [10, 9], 'only the day\'s first 10 matches score (9 of them top 3: the first was 4th)');
assert.equal(pa.points, dayPoints({ tasksDone: 5, matches: 10, top3: 9 }), 'points = 5 × 100 + 10 × 10 + 9 × 10, as seasons.js works them out');
assert.equal(pa.points, 690, 'one short of the 700 cap (the first match was 4th)');
assert.equal(doorsFor(pa.points), 2, '690 points: 2 doors');
assert.deepEqual((await grants(ava)).map((g) => [g.door, g.track]), [[1, 'free'], [2, 'free']], 'doors 1 and 2 (free), granted once');
assert.ok((await inv(ava)).includes(S.free[2]), `door 2 gave ${S.free[2]}`);
// counts are capped, unknown counts ignored, bad task lists and other days refused
await assert.rejects(() => db.query(`select public.season_record($1, 'halloween', $2::date, '[]', '{}')`, [cid, DAY]), /bad tasks/);
await assert.rejects(() => db.query(`select public.season_record($1, 'halloween', '2026-10-01', $2, '{}')`, [cid, tasksJson]), /not today/, "only today's game day");
await db.query(`select public.season_record($1, 'halloween', $2::date, $3, '{"hits": 99999, "money": 5}')`, [cid, DAY, tasksJson]);
const pc = await prog(cid);
assert.ok((pc.stats.hits || 0) <= 500 && !('money' in pc.stats), `counts capped at 500 per match, unknown keys ignored ${JSON.stringify(pc.stats)}`);

// 5. the PASS, bought late through the shop's own path: every pass prize for the doors already reached, at once
const dee = await mk('Dee'), iso = (t) => new Date(t).toISOString().slice(0, 10), dayMs = 86_400_000, today = Date.parse(DAY + 'T12:00:00Z');
const past = DAYS.slice(0, DAYS.indexOf(DAY)); // earlier days this season, written directly (as if played): 700 points each
const setDays = async (p, n, pts = 700) => { for (let i = 0; i < n; i++) await db.query(`insert into public.season_progress (profile_id, season, day, door, points) values ($1, 'halloween', $2::date, true, $3) on conflict (profile_id, season, day) do update set points = excluded.points, door = true`, [p, iso(today - (n - 1 - i) * dayMs), pts]); };
await setDays(dee, 3); // 2,100 points: 7 doors
await db.query(`select public.season_grant($1, 'halloween')`, [dee]);
assert.deepEqual((await grants(dee)).filter((g) => g.track === 'free').map((g) => g.door), [1, 2, 3, 4, 5, 6, 7], '2,100 points: 7 free doors');
const q = (await db.query(`insert into public.shop_quotes (profile_id, kind, usd, santa_raw, price_usd, season) values ($1, 'pass', 5, 1000, 0.0003, 'halloween') returning id`, [dee]))[0].id;
const bought = (await db.query(`select public.shop_buy($1, $2, 1000, $3) as r`, [q, 'PassSig'.padEnd(88, '5'), W()]))[0].r;
assert.equal(bought.pass, 'halloween', 'the pass is granted by the shop path: ' + JSON.stringify(bought));
const gd7 = (await grants(dee)).filter((g) => g.track === 'gold');
assert.deepEqual(gd7.map((g) => [g.door, g.item_id]), [[2, S.gold[0]], [6, S.gold[1]]], 'backdated: the costume pieces of doors 2 and 6, the only pass prizes');
const tix = async (p) => (await db.query('select free_used, extra, season_extra from public.tickets where profile_id = $1', [p]))[0];
assert.equal((await tix(dee)).season_extra, 3, 'everyone\'s ranked tickets at doors 1, 4, 6 → 3 in the season bank (with or without the pass)');
const q2 = (await db.query(`insert into public.shop_quotes (profile_id, kind, usd, santa_raw, price_usd, season) values ($1, 'pass', 5, 1000, 0.0003, 'halloween') returning id`, [dee]))[0].id;
const again = (await db.query(`select public.shop_buy($1, $2, 1000, $3) as r`, [q2, 'PassSigTwo'.padEnd(88, '5'), W()]))[0].r;
assert.ok(again.refunded, 'a second pass for the same season is never granted: the payment is owed back in full');

// 5b. the pass through the REAL Store server (server/shop.js) and payment checker: $2, 100% to the treasury, nothing burned
//     (Cody, 2026-10-04); a payment that burns half the old way leaves the treasury short and is refused; the page's payment
//     has no burn step at all.
{ const { createShop } = await import('../../server/shop.js'), { splitPayment, MINT } = await import('../../mockups/market.js'), { purchaseInstructions } = await import('../../mockups/pay.js');
  const TREASURY = 'TReASURYwa11et'.padEnd(44, '1').replace(/[0OIl]/g, '9'), FEE = { bps: 300, max: 1e15 }, txs = new Map(); let sn = 0;
  const pay = (from, total, burnBps) => { const sig = ('PassPay' + String(++sn).padStart(4, '9') + '5'.repeat(80)).slice(0, 88).replace(/[0OIl]/g, '9'), sp = splitPayment(total, burnBps, FEE),
      b = (i, o, a) => ({ accountIndex: i, mint: MINT, owner: o, uiTokenAmount: { amount: String(a), decimals: 6 } });
    txs.set(sig, { blockTime: Math.floor(Date.now() / 1000), meta: { err: null, innerInstructions: [], preTokenBalances: [b(1, from, 1e13), b(2, TREASURY, 1e12)], postTokenBalances: [b(1, from, 1e13 - total), b(2, TREASURY, 1e12 + sp.arrives)] },
      transaction: { message: { accountKeys: [{ pubkey: from, signer: true }], instructions: sp.burn ? [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { mint: MINT, authority: from, tokenAmount: { amount: String(sp.burn) } } } }] : [] } } });
    return sig; };
  const shop = createShop({ db, chain: { getTransaction: async (x) => txs.get(x) ?? null }, livePrice: async () => ({ usd: 0.0003 }), liveFee: async () => FEE, treasury: TREASURY, mint: MINT, cluster: 'devnet' });
  const gus = await mk('Gus'), w = (await db.query('select wallet from public.profiles where id = $1', [gus]))[0].wallet;
  const q = await shop.quote(gus, { kind: 'pass' });
  assert.deepEqual([q.usd, q.burnBps, q.pool], [PASS_PRICE, 0, TREASURY], 'the pass quote: $2, nothing burned, all to the treasury ' + JSON.stringify([q.usd, q.burnBps]));
  assert.equal(PASS_PRICE, 2, 'the pass costs $2');
  const old = await shop.buy(gus, q.id, pay(w, q.santaRaw, 5000));
  assert.ok(old.error && !(await db.query('select 1 from public.season_passes where profile_id = $1', [gus])).length, 'paid the old way (half burned): the treasury is short, refused: ' + old.error);
  const q2 = await shop.quote(gus, { kind: 'pass' }), ok = await shop.buy(gus, q2.id, pay(w, q2.santaRaw, 0));
  assert.ok(ok.ok && ok.pass === 'halloween', 'paid in full to the treasury: the pass is granted ' + JSON.stringify(ok));
  // the page's payment: no burn step when nothing is burned; one when something is (the Store's 50% items)
  const lib = { findAssociatedTokenPda: async ({ owner }) => [owner + '-ata'], TOKEN_2022_PROGRAM_ADDRESS: 'T22',
    getBurnCheckedInstruction: (x) => ({ burn: x.amount }), getTransferCheckedWithFeeInstruction: (x) => ({ send: x.amount }) };
  const passTx = await purchaseInstructions(lib, { santaRaw: q2.santaRaw, mint: MINT, pool: TREASURY, fee: FEE, burnBps: 0 }, { address: w });
  const itemTx = await purchaseInstructions(lib, { santaRaw: 1000000, mint: MINT, pool: TREASURY, fee: FEE, burnBps: 5000 }, { address: w });
  assert.ok(passTx.instructions.length === 1 && passTx.instructions[0].send === BigInt(q2.santaRaw) && itemTx.instructions.length === 2 && itemTx.instructions[0].burn > 0n,
    "the page's pass payment is a single transfer of everything to the treasury (no burn step); a Store item still burns half"); }

// 6. a WHOLE season: 14 perfect days of 700 (9,800 points): all 30 doors, every prize exactly once
const eli = await mk('Eli');
await setDays(eli, 14);
await db.query(`insert into public.season_passes (profile_id, season, signature, usd, paid_raw) values ($1, 'halloween', $2, 5, 1000)`, [eli, 'EliPass'.padEnd(88, '7')]);
for (let k = 0; k < 3; k++) await db.query(`select public.season_grant($1, 'halloween')`, [eli]);
const ge = await grants(eli), invE = await inv(eli);
assert.equal(ge.filter((g) => g.track === 'free').length, 30, 'all 30 free doors (and no 31st: 9,800 points)');
assert.equal(ge.filter((g) => g.track === 'gold').length, 6, 'the pass: the 6 costume pieces');
for (const it of [...Object.values(S.free), ...S.gold, ...SEASON_GEAR]) assert.ok(invE.includes(it), `${it} owned`);
assert.equal((await tix(eli)).season_extra, 15, '15 ranked tickets in the season bank (no cap)');
assert.deepEqual(ge.filter((g) => g.track === 'streak').map((g) => g.door), [7, 14], '14 perfect days in a row: streak bonuses at 7 and 14, once each');
const xpSteps = (await db.query(`select count(*)::int n from public.level_finishes where profile_id = $1 and match_id like 'season:%'`, [eli]))[0].n;
assert.equal(xpSteps, 8 + 2, 'level ticks: 8 doors + 2 streak bonuses, once each (it was 30+ before Cody\'s mix)');
// a gap breaks the streak: 6 perfect days, a missed day, 6 perfect days → no bonus
const fay = await mk('Fay');
for (const back of [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12]) await db.query(`insert into public.season_progress (profile_id, season, day, door, points) values ($1, 'halloween', $2::date, true, 500)`, [fay, iso(today - back * dayMs)]);
await db.query(`select public.season_grant($1, 'halloween')`, [fay]);
assert.equal((await grants(fay)).filter((g) => g.track === 'streak').length, 0, 'a missed day resets the streak (6 + 6 days: no bonus)');

// 7. ranked spends today's free tickets, then season ones, then bought ones; a released ticket goes back where it came from
await db.query('update public.tickets set free_used = 10, extra = 1 where profile_id = $1', [eli]);
const hold = async (m) => (await db.query(`select public.hold_ticket($1, $2) as s`, [eli, m]))[0].s;
assert.equal(await hold('PRN1-a'), 'season', 'free ones used up: a season ticket next');
assert.equal((await tix(eli)).season_extra, 14);
assert.equal((await db.query(`select public.release_ticket($1, 'PRN1-a') as r`, [eli]))[0].r, true);
assert.equal((await tix(eli)).season_extra, 15, 'left before the start: the season ticket comes back');
await db.query('update public.tickets set season_extra = 0 where profile_id = $1', [eli]);
assert.equal(await hold('PRN1-b'), 'extra', 'no season tickets: a bought one');
// season tickets never use up the 'buy at most 10' room (full-sim found it): ticket_status's extra is BOUGHT only; the season count apart
assert.equal((await db.query('select extra from public.ticket_status($1)', [dee]))[0].extra, 0, "season tickets aren't counted as bought ones (the Store's room to buy stays 10)");
assert.equal((await db.query('select public.season_tickets($1) as n', [dee]))[0].n, 3, 'the season bank is counted on its own (3)');

// 8. nobody but the servers writes any of it
await db.query('set role authenticated'); await db.query(`select set_config('test.uid', $1, false)`, [ben]);
for (const [what, q3] of [['progress', `insert into public.season_progress (profile_id, season, day, door) values ('${ben}', 'halloween', '${DAY}', true)`],
  ['a pass', `insert into public.season_passes (profile_id, season) values ('${ben}', 'halloween')`],
  ['a grant', `insert into public.season_grants (profile_id, season, door, track, item_id) values ('${ben}', 'halloween', 3, 'gold', 'face_pumpkinking')`],
  ['season_record', `select public.season_record('${ben}', 'halloween', '${DAY}', '${tasksJson}', '{"hits": 50}')`],
  ['season_login', `select public.season_login('${ben}', 'halloween', '${DAY}', '${tasksJson}')`],
  ['season_grant', `select public.season_grant('${ben}', 'halloween')`]])
  await assert.rejects(() => db.query(q3), /permission denied|row-level security/, `a signed-in player can't write ${what}`);
assert.equal((await db.query(`select count(*)::int n from public.season_grants where profile_id = $1`, [ava]))[0].n, 0, 'and can only read their own grants');
await db.query('reset role');
await db.query('set role santa_referee');
await db.query(`select public.season_record($1, 'halloween', $2::date, $3, '{"hits": 1}')`, [ben, DAY, tasksJson]);
await assert.rejects(() => db.query(`select public.season_grant($1, 'halloween')`, [ben]), /permission denied/, 'the match server can record matches, never grant directly');
await assert.rejects(() => db.query(`select public.season_login($1, 'halloween', $2::date, $3)`, [ben, DAY, tasksJson]), /permission denied/, 'and can never tick "Log in"');
await db.query('reset role');
console.log(`OK: season points on real Postgres (001–030 + 032–039): the 30-door plan equals seasons.js for all three seasons; points only from the servers (+10 a match, +10 a top 3, first 10 matches a day; Log in +100 once; +100 a task; a 690-point day checked against seasons.js); doors = points ÷ ${DOOR_POINTS}; every prize once; the pass backdates; a whole season: 30 doors for everyone (5 looks, 2 gear, 8 level ticks, 15 tickets) + 6 costume pieces with the pass, 10 level ticks with the streak; ranked spends free → season → bought; only the servers write`);
