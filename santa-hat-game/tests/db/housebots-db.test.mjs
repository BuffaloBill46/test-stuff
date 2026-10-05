// HOUSE BOTS (Cody 2026-10-05; supabase/050, server/housebots.js) on a real database with every migration: 18 bot accounts start at
// level 1; 10 rounds of REAL simulated matches of 4-5 bots each give every bot 10 games (give or take one); their levels, ranked points
// and snowballs thrown/hit come only from those matches (the books add up); nothing touches money; the website can't list them as bots.
// Run: node tests/db/housebots-db.test.mjs
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { makeDb } from './setup.mjs';
import { createLevels } from '../../server/levels.js';
import { houseBots, playRounds } from '../../server/housebots.js';
import { BOT_NAMES } from '../../mockups/refcore.js';

const FILES = readdirSync(new URL('../../supabase/', import.meta.url)).filter((f) => /^0\d\d_.*\.sql$/.test(f) && f !== '031_games_role.sql').sort();
const db = await makeDb(FILES);
let seed = 42; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const bots = await houseBots(db);
assert.equal(bots.length, 18, '18 house bots');
assert.ok(bots.every((b) => b.level === 1 && b.points === 0), 'all start at level 1 with 0 points');
{ // 053 (Cody: "too easy to pick out"): no house bot is named like a practice bot, and every name is different
  const practice = new Set(BOT_NAMES.map((n) => n.toLowerCase()));
  assert.ok(bots.every((b) => !practice.has(b.name.toLowerCase())), 'no house bot shares a practice bot name: ' + bots.filter((b) => practice.has(b.name.toLowerCase())).map((b) => b.name));
  assert.equal(new Set(bots.map((b) => b.name.toLowerCase())).size, 18, 'all 18 names different');
}
const sizes = [];
const matches = await playRounds({ db, levels: createLevels({ db }), rounds: 10, rand, log: (m) => sizes.push(m.places.length) });
assert.ok(sizes.every((n) => n === 4 || n === 5) && sizes.includes(4) && sizes.includes(5), `every match had 4 or 5 bots (${sizes.join('')})`);
const games = await db.query(`select p.name, count(m.*)::int n from public.profiles p left join public.match_results m on m.profile_id = p.id where p.is_bot group by p.name`);
assert.ok(games.every((g) => g.n >= 10 && g.n <= 11), 'every bot played 10 games (give or take one): ' + games.map((g) => g.n).join(','));
const after = await houseBots(db);
// level progress: every top-3 finish is a tick (10 ticks a level, 043), so the ticks given equal the top-3 places played
const xp = (await db.query(`select coalesce(sum((p.level - 1) * 10 + p.xp), 0)::int t from public.profiles p where p.is_bot`))[0].t;
assert.equal(xp, matches.length * 3, `top-3 finishes give level ticks (${xp} ticks from ${matches.length} matches)`);
const sums = await db.query(`select p.id, p.rank_points, coalesce(sum(r.change), 0)::int s from public.profiles p left join public.ranked_results r on r.profile_id = p.id where p.is_bot group by p.id`);
// points never go below 0 on the profile (ranked.js applyPoints), so the profile is at least the sum of its changes
assert.ok(sums.every((x) => x.rank_points >= x.s && x.rank_points >= 0) && sums.some((x) => x.rank_points > 0), 'ranked points come from their match results');
const c = (await db.query('select coalesce(sum(thrown), 0)::int t, coalesce(sum(hits), 0)::int h from public.career_stats($1)', [bots.map((b) => b.id)]))[0];
assert.ok(c.t > 0 && c.h > 0 && c.h <= c.t * 3, `their snowballs thrown and hits are counted (${c.t} thrown, ${c.h} hits)`);
const money = (await db.query(`select (select count(*) from public.payments x join public.profiles p on p.id = x.profile_id where p.is_bot)::int pay,
  (select count(*) from public.payouts po join public.runs r on r.id = po.run_id join public.profiles p on p.id = r.profile_id where p.is_bot)::int po`))[0];
assert.deepEqual([money.pay, money.po], [0, 0], 'no money: no payments, no payouts');
await db.pg.exec('set role anon');
await assert.rejects(db.pg.query('select * from public.house_bots()'), /permission denied/, "the website can't list who the bots are");
await db.pg.exec('reset role');
console.log(`OK: house bots: 18 accounts, ${matches.length} real simulated matches of 4-5 bots, 10 games each; levels up to ${Math.max(...after.map((b) => b.level))}, points and stats from results; no money; not listable by the website`);
