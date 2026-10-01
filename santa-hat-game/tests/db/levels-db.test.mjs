// Levels in the database (supabase/010_levels.sql) on real Postgres (PGlite), the live files in order, with Supabase's grants.
// Gilded goes (its user moved to white); a top-3 finish counts once per match; 5 per level; bought levels to 5, one per payment;
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
assert.equal((await db.query(`select avatar->>'snow' as s from public.profiles where id = $1`, [goldie]))[0].s, 'snow_white', 'Gilded user moved to the white snowball');
assert.equal((await db.query(`select count(*)::int n from public.items where id = 'snow_gold'`))[0].n, 0, 'Gilded is gone');
await db.query(`select set_config('test.uid', $1, false)`, [goldie]);
const save = (a) => db.query('select avatar from public.save_profile($1, $2)', ['Goldie', JSON.stringify(a)]).then((r) => r[0].avatar, (e) => ({ refused: e.message }));
assert.match((await save({ shirt: 'shirt_red', pants: 'pants_navy', face: 'face_dots', skin: 'skin_2', snow: 'snow_gold' })).refused, /isn't unlocked/, 'Gilded can\'t be saved any more');

// Top-3 finishes: 5 per level, once per match, places 1–3 only.
const p = await mk('Pat');
const fin = async (m, place) => (await db.query('select * from public.record_level_finish($1, $2, $3)', [m, p, place]))[0];
for (let i = 1; i <= 4; i++) assert.deepEqual(await fin('match-000' + i, 1 + (i % 3)), { level: 1, xp: i, up: false });
assert.deepEqual(await fin('match-0004', 1), { level: 1, xp: 4, up: false }, 'the same match counts once');
assert.deepEqual(await fin('match-0005', 3), { level: 2, xp: 0, up: true }, 'the 5th top-3 finish is a level');
await fails('select * from public.record_level_finish($1, $2, 4)', ['match-0006', p], '4th place doesn\'t count');
// Level 9 → 10 (Cody): FIRST-place wins only, 10 of them.
await db.query('update public.profiles set level = 9, xp = 7 where id = $1', [p]);
assert.deepEqual(await fin('match-0901', 2), { level: 9, xp: 7, up: false }, 'at level 9, 2nd place does not count');
assert.deepEqual(await fin('match-0901', 1), { level: 9, xp: 7, up: false }, 'and that match can\'t count again as a win');
assert.deepEqual(await fin('match-0902', 1), { level: 9, xp: 8, up: false });
assert.deepEqual(await fin('match-0903', 1), { level: 9, xp: 9, up: false });
assert.deepEqual(await fin('match-0904', 1), { level: 10, xp: 0, up: true }, 'the 10th first-place win reaches level 10');
await fails('update public.profiles set level = 8, xp = 7 where id = $1', [p], 'below level 9, progress stops at 4');
await db.query('update public.profiles set level = 10, xp = 0 where id = $1', [p]);
assert.deepEqual(await fin('match-0007', 1), { level: 10, xp: 0, up: false }, 'level 10 is the top');
await fails('update public.profiles set level = 11 where id = $1', [p], 'the database refuses level 11');
await fails('update public.profiles set xp = 5 where id = $1', [p], 'progress is 0–4');

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
console.log(`OK: levels in the database: Gilded gone (its user moved to white); 5 top-3 finishes a level, once per match; buy to 5 ($1,$1,$1,$5), one per payment; the website can't touch it; database = levels.js over 400 random steps (ended at level ${js.level})`);
process.exit(0);
