// Levels in the database (supabase/010_levels.sql) on real Postgres (PGlite), the live files in order, with Supabase's grants.
// Gilded goes (its user moved to white); a top-3 finish counts once per match; 10 per level (043; 5 until 2026-10-04); bought levels to 5, one per payment;
// the website can't touch any of it; and the database's rules agree with mockups/levels.js over a long random run.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDb } from './setup.mjs';
import { afterMatch, afterBuy } from '../../mockups/levels.js';

const db = await makeDb(['001_profiles.sql', '002_items_seed.sql', '003_email_profiles.sql', '004_linked_logins.sql', '008_hats_backpacks.sql']);
// Valid base58 test wallets (no 0, O, I or l: the live database rule refuses them; LESSONS).
let wn = 0; const W = () => ('LVwa11et' + 'ABCDEFGH'[wn++]).padEnd(44, '1');
const mk = async (name, level = 1, avatar = {}) => { const id = (await db.query('insert into auth.users default values returning id'))[0].id;
  await db.query(`insert into public.profiles (id, wallet, name, avatar, level) values ($1, $2, $3, $4, $5)`, [id, W(name), name, JSON.stringify(avatar), level]);
  await db.query(`insert into public.logins (user_id, profile_id, kind) values ($1, $1, 'wallet')`, [id]); return id; };
const fails = async (q, p, why) => { await assert.rejects(() => db.query(q, p), undefined, why); };

// Before 010: a level-5 player wearing Gilded (as could exist on the live project).
const goldie = await mk('Goldie', 5, { shirt: 'shirt_red', pants: 'pants_navy', face: 'face_dots', skin: 'skin_2', snow: 'snow_gold' });
await db.pg.exec(readFileSync(new URL('../../supabase/010_levels.sql', import.meta.url), 'utf8'));
await db.pg.exec(readFileSync(new URL('../../supabase/013_match_stats.sql', import.meta.url), 'utf8')); // match stats (load screen)
await db.pg.exec(readFileSync(new URL('../../supabase/043_ten_ticks_per_level.sql', import.meta.url), 'utf8')); // 10 a level (Cody, 2026-10-04)
await db.pg.exec(readFileSync(new URL('../../supabase/043_ten_ticks_per_level.sql', import.meta.url), 'utf8')); // safe twice
assert.equal((await db.query(`select avatar->>'snow' as s from public.profiles where id = $1`, [goldie]))[0].s, 'snow_white', 'Gilded user moved to the white snowball');
assert.equal((await db.query(`select count(*)::int n from public.items where id = 'snow_gold'`))[0].n, 0, 'Gilded is gone');
await db.query(`select set_config('test.uid', $1, false)`, [goldie]);
const save = (a) => db.query('select avatar from public.save_profile($1, $2)', ['Goldie', JSON.stringify(a)]).then((r) => r[0].avatar, (e) => ({ refused: e.message }));
assert.match((await save({ shirt: 'shirt_red', pants: 'pants_navy', face: 'face_dots', skin: 'skin_2', snow: 'snow_gold' })).refused, /isn't unlocked/, 'Gilded can\'t be saved any more');

// Top-3 finishes: 10 per level, once per match, places 1–3 only.
const p = await mk('Pat');
const fin = async (m, place) => (await db.query('select * from public.record_level_finish($1, $2, $3)', [m, p, place]))[0];
for (let i = 1; i <= 9; i++) assert.deepEqual(await fin('match-000' + i, 1 + (i % 3)), { level: 1, xp: i, up: false });
assert.deepEqual(await fin('match-0009', 1), { level: 1, xp: 9, up: false }, 'the same match counts once');
assert.deepEqual(await fin('match-0010', 3), { level: 2, xp: 0, up: true }, 'the 10th top-3 finish is a level');
await fails('select * from public.record_level_finish($1, $2, 4)', ['match-0006', p], '4th place doesn\'t count');
// Level 9 → 10 (Cody): FIRST-place wins only, 10 of them.
await db.query('update public.profiles set level = 9, xp = 7 where id = $1', [p]);
assert.deepEqual(await fin('match-0901', 2), { level: 9, xp: 7, up: false }, 'at level 9, 2nd place does not count');
assert.deepEqual(await fin('match-0901', 1), { level: 9, xp: 7, up: false }, 'and that match can\'t count again as a win');
assert.deepEqual(await fin('match-0902', 1), { level: 9, xp: 8, up: false });
assert.deepEqual(await fin('match-0903', 1), { level: 9, xp: 9, up: false });
assert.deepEqual(await fin('match-0904', 1), { level: 10, xp: 0, up: true }, 'the 10th first-place win reaches level 10');
await fails('update public.profiles set level = 8, xp = 10 where id = $1', [p], 'progress stops at 9');
await db.query('update public.profiles set level = 10, xp = 0 where id = $1', [p]);
assert.deepEqual(await fin('match-0007', 1), { level: 10, xp: 0, up: false }, 'level 10 is the top');
await fails('update public.profiles set level = 11 where id = $1', [p], 'the database refuses level 11');
await fails('update public.profiles set xp = 10 where id = $1', [p], 'progress is 0–9');

// Bought levels: one per payment, $1 $1 $1 then $5, never past 5, progress kept.
const b = await mk('Bea'); await db.query('update public.profiles set xp = 3 where id = $1', [b]);
const levelOf = async (id) => (await db.query('select level from public.profiles where id = $1', [id]))[0].level;
const buy = async (sig) => db.query('select public.buy_level($1, $2, 1000, $3) as l', [b, sig, (await levelOf(b)) + 1]).then((r) => r[0].l);
for (const [i, want] of [[1, 2], [2, 3], [3, 4], [4, 5]]) assert.equal(await buy('payment' + i), want);
await fails('select public.buy_level($1, $2, 1000, 6)', [b, 'payment5'], 'no buying past level 5');
await db.query('update public.profiles set level = 2 where id = $1', [b]);
await fails('select public.buy_level($1, $2, 1000, 3)', [b, 'payment1'], 'a payment buys one level, once');
// A price given for level 4 ($1), paid after the player already reached level 4: refused, never turned into the $5 level.
await db.query('update public.profiles set level = 4 where id = $1', [b]);
await fails('select public.buy_level($1, $2, 1000, 4)', [b, 'stalepayment'], 'a $1 price for level 4 cannot buy level 5');
assert.equal(await levelOf(b), 4, 'and the level did not change');
await db.query('update public.profiles set level = 2 where id = $1', [b]);
assert.deepEqual((await db.query('select usd from public.level_purchases order by from_level')).map((r) => +r.usd), [1, 1, 1, 5], 'prices: $1, $1, $1, $5');
assert.equal((await db.query('select xp from public.profiles where id = $1', [b]))[0].xp, 3, 'progress kept through buying');

// A level unlocks the items of that level (the existing rule): Lantern Gold (level 2) saves for a level-2 player.
await db.query(`select set_config('test.uid', $1, false)`, [b]);
const bsave = (a) => db.query('select avatar from public.save_profile($1, $2)', ['Bea', JSON.stringify(a)]).then((r) => r[0].avatar, (e) => ({ refused: e.message }));
assert.equal((await bsave({ shirt: 'shirt_gold', pants: 'pants_navy', face: 'face_dots', skin: 'skin_2', snow: 'snow_white' })).shirt, 'shirt_gold');

// The website: can read nothing private, change nothing, call nothing.
await db.query('set role authenticated');
await fails('select * from public.record_level_finish($1, $2, 1)', ['match-web1', b], 'the website can\'t record a finish');
await fails('select public.buy_level($1, $2, 1, 3)', [b, 'webpayment'], 'the website can\'t buy a level without the server');
await fails('update public.profiles set level = 9 where id = $1', [b], 'the website can\'t set its level');
await fails('select * from public.level_finishes', [], 'the website can\x27t read who finished where');
await fails('select * from public.level_purchases', [], 'nor the purchase records');
await db.query('reset role');

// The database and levels.js agree over a long random run of matches and purchases.
const c = await mk('Cal'); let js = { level: 1, xp: 0 }, seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
for (let i = 0; i < 400; i++) {
  if (rnd() < 0.08 && js.level < 5) { js = afterBuy(js); await db.query('select public.buy_level($1, $2, 1, $3)', [c, 'mix' + i, js.level]); }
  else { const place = 1 + Math.floor(rnd() * 6); js = afterMatch(js, place, { auto: true });
    if (place <= 3) await db.query('select * from public.record_level_finish($1, $2, $3)', ['mixmatch' + i, c, place]); }
  const row = (await db.query('select level, xp from public.profiles where id = $1', [c]))[0];
  assert.deepEqual({ level: row.level, xp: row.xp }, { level: js.level, xp: js.xp }, `step ${i}: database = levels.js`);
}
console.log(`OK: levels in the database: Gilded gone (its user moved to white); 10 top-3 finishes a level, once per match; buy to 5 ($1,$1,$1,$5), one per payment; the website can't touch it; database = levels.js over 400 random steps (ended at level ${js.level})`);


// The server's level actions (server/levels.js) through the real web door (server/http.js), on this database.
const { createLevels } = await import('../../server/levels.js');
const { makeHandler } = await import('../../server/http.js');
const lv = createLevels({ db });
const host = await mk('Hal'), guest2 = await mk('Gus'), other = await mk('Oto');
const door = makeHandler({ server: {}, levels: lv, limiter: null, profileFor: async (t) => ({ th: host, tg: guest2, to: other })[t] ?? null });
const ask = async (token, body) => { const r = await door(new Request('http://localhost/', { method: 'POST', headers: { origin: 'http://localhost', authorization: 'Bearer ' + token }, body: JSON.stringify(body) })); return { status: r.status, ...(await r.json()) }; };
let pr = await ask('th', { action: 'progress' });
assert.equal(pr.text, '0 of 10 top-3 finishes to level 2'); assert.deepEqual(pr.gives, { start: 5, sb: 1, gear: 1 });
// The host reports: host 1st, a bot 2nd, Gus 3rd, Oto 4th → host and Gus counted, the bot skipped, Oto not counted.
let fr = await ask('th', { action: 'finish', match: { id: 'auto-match-0001', auto: true, places: [host, null, guest2, other] } });
assert.deepEqual(fr.counted.map((c) => [c.place, c.xp, !!c.you]), [[1, 1, true], [3, 1, false]], 'top 3 with accounts counted, the bot skipped');
assert.equal((await ask('to', { action: 'progress' })).xp, 0, '4th place counts nothing');
fr = await ask('th', { action: 'finish', match: { id: 'auto-match-0001', auto: true, places: [host, null, guest2] } });
assert.deepEqual(fr.counted.map((c) => c.xp), [1, 1], 'reporting the same match again counts nothing');
assert.match((await ask('to', { action: 'finish', match: { id: 'auto-match-0002', auto: true, places: [host, guest2] } })).error, /only a player in the match/, 'only a player in the match can report it');
// …and a page can't claim to be the referee server (byReferee is only a code path, never read from a request)
assert.match((await ask('to', { action: 'finish', byReferee: true, match: { id: 'auto-match-0002', auto: true, byReferee: true, places: [host, guest2] } })).error, /only a player in the match/, 'the referee path is not reachable from the web');
// The referee server's own report (it ran the match): counts with no host; 'auto-match-0002' wasn't counted above
fr = await lv.finishByReferee({ id: 'auto-match-0002', auto: true, places: [guest2, null] });
assert.deepEqual(fr.counted.map((c) => [c.place, c.xp, !!c.you]), [[1, 2, false]], 'the referee server reports a finish: Gus 1st counted');
assert.deepEqual((await lv.finishByReferee({ id: 'auto-match-0002', auto: true, places: [guest2] })).counted.map((c) => c.xp), [2], 'once per match');
assert.deepEqual((await ask('th', { action: 'finish', match: { id: 'practice-0003', auto: true, practice: true, places: [host] } })).counted, [], 'practice counts nothing');
assert.deepEqual((await ask('th', { action: 'finish', match: { id: 'private-0004', auto: false, places: [host] } })).counted, [], 'private rooms count nothing');
assert.match((await ask('th', { action: 'finish', match: { id: 'x', auto: true, places: [host] } })).error, /bad match id/);
assert.equal((await ask('', { action: 'progress' })).status, 401, 'progress needs sign-in');
// Match stats for the load screen (013): every account's finish counts (4th too), once per match; public totals.
const st = await ask('', { action: 'stats', profiles: [host, guest2, other, 'not-a-uuid'] });
const byId = Object.fromEntries(st.players.map((x) => [x.id, x]));
assert.equal(st.status, 200, 'stats are public (no sign-in)');
assert.deepEqual([byId[host].games, byId[host].top3, byId[host].top3Pct], [1, 1, 100], 'host: 1 game, 1 top-3 (the resent report counted nothing)');
assert.deepEqual([byId[other].games, byId[other].top3, byId[other].top3Pct], [1, 0, 0], '4th place: a game played, not a top-3');
assert.ok(byId[host].level >= 1 && 'rankPoints' in byId[host], 'level and rank points included');
await db.query('set role authenticated');
await assert.rejects(() => db.query('select * from public.match_results'), undefined, 'the per-match rows are private');
await db.query('reset role');
console.log('OK: level actions through the web door: progress; the host\'s Auto match report counts top-3 accounts once (bots, 4th, practice, private, replays: nothing); only a player in the match can report');
process.exit(0);
