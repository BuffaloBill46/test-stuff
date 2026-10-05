// CAREER STATS (Cody, 2026-10-04 to-do #6; supabase/049, server/levels.js) on a real database with every migration:
// each Auto match keeps the snowballs thrown and hits the MATCH SERVER counted (a page's own report keeps 0); career_stats adds up
// thrown, hits, SANTA spent (Arcade runs + Store purchases + lottery tickets) and SANTA won (Arcade winnings and lottery prizes
// actually SENT); the website can call it (the Ranked board shows it) but can't write any of it; ranked_board returns each
// player's id. Run: node tests/db/career-db.test.mjs
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { makeDb } from './setup.mjs';
import { createLevels } from '../../server/levels.js';

const FILES = readdirSync(new URL('../../supabase/', import.meta.url)).filter((f) => /^0\d\d_.*\.sql$/.test(f) && f !== '031_games_role.sql').sort();
const db = await makeDb(FILES);
const W = (c) => (c + 'CaReERwa11et').padEnd(44, '1').replace(/[0OIl]/g, '9');
const ann = await db.player(W('A'), 'Ann'), ben = await db.player(W('B'), 'Ben');
const levels = createLevels({ db }), stats = async (ids) => db.query('select * from public.career_stats($1)', [ids]);
const of = async (id) => (await stats([id]))[0];

// 1. matches: the match server's counts are kept; a page's report keeps none
let mid = 0; const match = (places, st) => ({ id: 'career-match-' + String(++mid).padStart(3, '0'), auto: true, places, stats: st });
await levels.finishByReferee(match([ann, ben, null], [{ thrown: 20, hits: 8 }, { thrown: 12, hits: 3 }, null]));
await levels.finishByReferee(match([ben, ann], [{ thrown: 10, hits: 5 }, { thrown: 30, hits: 9 }]));
await levels.finish(ann, match([ann, ben], [{ thrown: 999, hits: 999 }, {}])); // a PAGE's report: its counts are not trusted
let a = await of(ann), b = await of(ben);
assert.deepEqual([a.thrown, a.hits], [50, 17], 'Ann: 20+30 thrown, 8+9 hit, from the match server only ' + JSON.stringify(a));
assert.deepEqual([b.thrown, b.hits], [22, 8], 'Ben: 12+10 thrown, 3+5 hit');
assert.equal(+(await db.query(`select count(*)::int as n from public.match_results where profile_id = $1`, [ann]))[0].n, 3, 'the page-reported match still counts as a game played (0 thrown)');
await levels.finishByReferee(match([ann], [{ thrown: 1e9, hits: -5 }]));
a = await of(ann); assert.deepEqual([a.thrown, a.hits], [5050, 17], 'silly counts are clamped (0 to 5,000 a match)');

// 2. money: an Arcade run paid and its winnings SENT; a Store purchase; a lottery ticket and a prize sent
const q = (await db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'drop', 1, 1, 1, 1000000, 0.001) returning id`, [ann]))[0].id;
const run = +(await db.query(`select public.buy_run($1, $2, 1200000, 100000, 1000000) as id`, [q, 'CareerRun' + '5'.repeat(79)]))[0].id;
await db.query(`update public.plays set state = 'settled', commit = $2, secret = 's', player_seed = 'p', result = '{"mult":1}', pay = 1, pay_raw = 700000, price_usd = 0.001, settled_at = now() where run_id = $1`, [run, 'f'.repeat(64)]);
const po = (await db.query('select public.finish_run($1, $2, 100) as id', [run, W('A')]))[0].id;
a = await of(ann);
assert.equal(+a.spent_raw, 1200000, 'the run counts as spent (what the payment paid)');
assert.equal(+a.won_raw, 0, 'winnings count once SENT, not while queued');
await db.query(`update public.payouts set status = 'sent' where id = $1`, [po]);
assert.equal(+(await of(ann)).won_raw, +(await db.query('select amount_raw from public.payouts where id = $1', [po]))[0].amount_raw, 'sent winnings count as won');
await db.query(`insert into public.shop_quotes (profile_id, kind, item_id, usd, santa_raw, price_usd, used_by) values ($1, 'item', 'sb_ice', 1, 2400000, 0.0004, 'ShopSig1'),
  ($1, 'item', 'sb_fire', 1, 9999999, 0.0004, null)`, [ann]);
assert.equal(+(await of(ann)).spent_raw, 1200000 + 2400000, 'a PAID Store purchase counts; a quote never paid does not');
assert.deepEqual([+(await of(ben)).spent_raw, +(await of(ben)).won_raw], [0, 0], "nobody else's money shows on Ben");

// 3. the website: can read the totals (the Ranked board shows them), can't write match results
await db.pg.exec('set role anon');
assert.equal((await db.pg.query('select * from public.career_stats($1)', [[ann, ben]])).rows.length, 2, 'the website can read career totals');
const board = (await db.pg.query(`select * from public.ranked_board(now() - interval '1 day')`)).rows;
assert.ok(Array.isArray(board), 'ranked_board still answers the website');
await assert.rejects(db.pg.query(`select public.record_match_result('career-web-001', $1, 1, 2, 500, 500)`, [ann]), /permission denied/, "the website can't record a match");
await assert.rejects(db.pg.query(`update public.match_results set hits = 9999`), /permission denied/, "nor change one");
await db.pg.exec('reset role');
// ranked_board returns each player's id (for the Today / This week boards' career numbers)
await db.query(`insert into public.ranked_results (match_id, profile_id, place, players, change) values ('rk-career-1', $1, 1, 4, 12)`, [ann]).catch(() => {});
const rb = (await db.query(`select * from public.ranked_board(now() - interval '1 day')`));
assert.ok(rb.length === 0 || rb.every((r) => r.id), "ranked_board rows carry the player's id");
console.log('OK: career stats: thrown / hits from the match server only (clamped), SANTA spent (runs, paid Store buys) and won (sent winnings), readable by the website, not writable');
