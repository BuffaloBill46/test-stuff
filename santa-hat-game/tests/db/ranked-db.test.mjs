// Ranked on the referee server, the database half (supabase/006 tickets + 018 results) as the referee's own login (017), on
// real Postgres (PGlite), every live file in order: a ticket held on joining, spent at the start, given back when leaving
// before; rank points applied once per match and never below 0; a referee restart gives back every ticket its rooms still
// held. Run: node ranked-db.test.mjs
import assert from 'node:assert/strict';
import { makeDb } from './setup.mjs';

const ALL = ['001_profiles.sql', '002_items_seed.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql', '006_ranked_tickets.sql', '007_rate_limits.sql',
  '008_hats_backpacks.sql', '009_lock_my_plays.sql', '010_levels.sql', '011_lottery.sql', '012_special_snowballs.sql', '013_match_stats.sql', '014_run_sizes.sql',
  '015_special_gear.sql', '016_shop.sql', '017_referee_role.sql', '018_ranked_results.sql', '030_daily_reset.sql'];
const db = await makeDb(ALL);
let wn = 0; const W = () => ('RKwa11et' + 'ABCDEFGH'[wn++]).padEnd(44, '1');
const mk = async (name, rp = 0) => { const id = (await db.query('insert into auth.users default values returning id'))[0].id;
  await db.query('insert into public.profiles (id, wallet, name, avatar, rank_points) values ($1, $2, $3, $4, $5)', [id, W(), name, '{}', rp]);
  await db.query(`insert into public.logins (user_id, profile_id, kind) values ($1, $1, 'wallet')`, [id]); return id; };
const ann = await mk('Ann', 3), ben = await mk('Ben', 40);
const one = async (q, p) => Object.values((await db.query(q, p))[0])[0];
const left = (id) => db.query('select free_left, extra, held from public.ticket_status($1)', [id]).then((r) => r[0]);

await db.query('set role santa_referee');
assert.equal((await db.query('select rank_points from public.referee_profile($1)', [ben]))[0].rank_points, 40, 'the lookup includes rank points');
// joining holds a ticket; twice for one room is refused; leaving before the start gives it back
assert.equal(await one(`select public.hold_ticket($1, 'ref-r1')`, [ann]), 'free');
assert.equal(await one(`select public.hold_ticket($1, 'ref-r1')`, [ann]), 'already');
assert.deepEqual(await left(ann), { free_left: 9, extra: 0, held: 1 });
assert.equal(await one(`select public.release_ticket($1, 'ref-r1')`, [ann]), true);
assert.deepEqual(await left(ann), { free_left: 10, extra: 0, held: 0 }, 'left before the start: ticket back');
// …and rejoining that same room takes a ticket again (006 said 'already' for a released hold: the player could never rejoin)
assert.equal(await one(`select public.hold_ticket($1, 'ref-r1')`, [ann]), 'free', 'rejoin after leaving: held again');
assert.deepEqual(await left(ann), { free_left: 9, extra: 0, held: 1 }, 'charged again');
assert.equal(await one(`select public.hold_ticket($1, 'ref-r1')`, [ann]), 'already', 'a live hold is still already');
await one(`select public.release_ticket($1, 'ref-r1')`, [ann]);
// both hold, the match starts: spent (leaving now gives nothing back)
await one(`select public.hold_ticket($1, 'ref-r2')`, [ann]); await one(`select public.hold_ticket($1, 'ref-r2')`, [ben]);
assert.equal(await one(`select public.start_ranked_match('ref-r2')`), 2);
assert.equal(await one(`select public.release_ticket($1, 'ref-r2')`, [ann]), false, 'after the start nothing comes back');
assert.deepEqual(await left(ann), { free_left: 9, extra: 0, held: 0 });
// results: once per match; never below 0
assert.equal(await one(`select public.record_ranked_result('m-0001', $1, -5)`, [ann]), 0, '3 − 5 → 0 (never below 0)');
assert.equal(await one(`select public.record_ranked_result('m-0001', $1, 24)`, [ben]), 64);
assert.equal(await one(`select public.record_ranked_result('m-0001', $1, 24)`, [ben]), 64, 'the same match again changes nothing');
// a restart: held tickets in referee rooms come back; spent ones and other prefixes don't
await one(`select public.hold_ticket($1, 'ref-r3')`, [ann]); await one(`select public.hold_ticket($1, 'ref-r4')`, [ben]); await one(`select public.hold_ticket($1, 'other-1')`, [ben]);
assert.equal(await one(`select public.release_room_holds('ref-')`), 2, 'both referee-room holds released');
assert.deepEqual([(await left(ann)).held, (await left(ben)).held], [0, 1], "the other server's hold is untouched");
await assert.rejects(() => db.query(`select public.release_room_holds('r')`), /prefix too short/);
// still refused: buying tickets (that's the shop's job, with a payment), reading results directly
await assert.rejects(() => db.query(`select public.buy_tickets($1, 5, 'sig')`, [ann]), /permission denied/);
await assert.rejects(() => db.query('select * from public.ranked_results'), /permission denied/);
await db.query('reset role');
for (const role of ['anon', 'authenticated']) { await db.query('set role ' + role); await assert.rejects(() => db.query(`select public.record_ranked_result('m-9', $1, 50)`, [ann]), /permission denied/, role); await db.query('reset role'); }
console.log('OK: ranked (006 + 018) as the referee login: hold/spend/release tickets, points once per match and never below 0, restart gives held tickets back; players and guests can\'t touch it');
