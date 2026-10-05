// TOURNAMENTS in the database (supabase/054), every migration in order, run AS THE MATCH SERVER'S OWN LOGIN (santa_referee),
// the way the live server will (LESSONS 2026-10-05: test money code under the login that will really run it): it can read a
// profile's wallet (to know the admin) and save a tournament; a tournament's points can be over 100 (a match's still can't);
// the website can't read or write tournaments. Run: node tests/db/tourney-db.test.mjs
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { makeDb } from './setup.mjs';

const FILES = readdirSync(new URL('../../supabase/', import.meta.url)).filter((f) => /^0\d\d_.*\.sql$/.test(f) && f !== '031_games_role.sql').sort();
const db = await makeDb(FILES);
const id = (await db.query('insert into auth.users default values returning id'))[0].id;
await db.query("insert into public.profiles (id, wallet, name, avatar) values ($1, 'DpgDK31RNyA96qYoFgigjxxLScKBG3BAwdPeDfTCB7uN', 'Deputy', '{}')", [id]);

await db.query('set role santa_referee');
assert.equal((await db.query('select wallet from public.profiles where id = $1', [id]))[0].wallet, 'DpgDK31RNyA96qYoFgigjxxLScKBG3BAwdPeDfTCB7uN', 'the match server can read a wallet (to know the admin)');
await db.query('select public.record_tournament($1::jsonb)', [JSON.stringify({ id: 'abc123xyz', code: 'K7QRT', rules: { mode: 'ffa', style: 'gear' }, by: id, createdAt: new Date().toISOString(), startedAt: new Date().toISOString(), entrants: 11, standings: [{ place: 1, name: 'Deputy', profile: id, points: 130 }], why: '' })]);
assert.equal(Number((await db.query('select public.record_ranked_result($1, $2, $3) as p', ['tour-abc123xyz', id, 130]))[0].p), 130, 'a tournament result may be over 100');
await assert.rejects(db.query('select public.record_ranked_result($1, $2, $3)', ['ref-match-1', id, 130]), /check constraint|violates/, 'a normal match still can not');
await assert.rejects(db.query('select public.record_ranked_result($1, $2, $3)', ['tour-abc123xyz2', id, -5]), /check constraint|violates/, 'a tournament never takes points away');
await assert.rejects(db.query('select * from public.tournaments'), /permission denied/, 'the match server writes tournaments through the function only');
await db.query('reset role');
const row = (await db.query('select * from public.tournaments'))[0];
assert.deepEqual([row.code, row.entrants, row.standings[0].points, row.created_by], ['K7QRT', 11, 130, id], 'the tournament was saved');
await db.query('set role anon');
await assert.rejects(db.query('select * from public.tournaments'), /permission denied/, "the website can't read tournaments");
await assert.rejects(db.query("select public.record_tournament('{}'::jsonb)"), /permission denied/, "nor save one");
await db.query('reset role');
console.log('OK: tournaments in the database: the match server reads wallets and saves tournaments under its own login; tournament points may pass 100 (never below 0), a match keeps ±100; the website is locked out');
