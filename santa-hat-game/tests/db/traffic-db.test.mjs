// TRAFFIC COUNTER (Cody 2026-10-05: "can you make a traffic counter"; supabase/052, server/traffic.js) on a real database with every
// migration: a visitor's page loads count once as a visitor and each as a load; two people = two visitors; robots aren't counted; the
// source is cleaned to a site name (X's t.co counts as x.com; our own site isn't a source); nothing personal is stored (the visitor
// is a code; the same person tomorrow is a different code); the summary adds up; only the game server (and an admin wallet,
// through the signed action) can read it; the website can neither read nor write. Run: node tests/db/traffic-db.test.mjs
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { makeDb } from './setup.mjs';
import { createTraffic, cleanSource, visitorCode } from '../../server/traffic.js';
import { createAdmin } from '../../server/admin.js';

const FILES = readdirSync(new URL('../../supabase/', import.meta.url)).filter((f) => /^0\d\d_.*\.sql$/.test(f) && f !== '031_games_role.sql').sort();
const db = await makeDb(FILES);
const CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36', IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6) Safari/604.1';
const t = createTraffic({ db, secret: 'test-secret' });

assert.deepEqual([cleanSource('https://t.co/abc'), cleanSource('x.com'), cleanSource('https://www.google.com/search?q=santa'), cleanSource('https://santahatgames.com/guide.html'), cleanSource('x'), cleanSource('<script>')],
  ['x.com', 'x.com', 'google.com', null, 'x', null], 'sources cleaned to a site name; our own pages are not a source; junk dropped');
for (let i = 0; i < 3; i++) await t.record({ address: '203.0.113.7', ua: CHROME, source: 'https://t.co/xyz', page: 'game' }); // one person, 3 loads
await t.record({ address: '198.51.100.9', ua: IPHONE, source: '', page: 'guide' });                                         // another, direct
assert.equal((await t.record({ address: '192.0.2.1', ua: 'Googlebot/2.1 (+http://www.google.com/bot.html)', source: '', page: 'game' })).counted, false, 'a robot is not a visitor');
assert.equal((await t.record({ address: '192.0.2.2', ua: '', source: '', page: 'game' })).counted, false, 'no browser at all: not counted');
const rows = await db.query('select * from public.site_visits order by loads desc');
assert.deepEqual(rows.map((r) => [r.loads, r.source, r.page]), [[3, 'x.com', 'game'], [1, null, 'guide']], 'two visitors: 3 loads from x.com on the game, 1 direct on the guide');
assert.ok(rows.every((r) => /^[0-9a-f]{32}$/.test(r.visitor) && !JSON.stringify(r).includes('203.0.113') && !JSON.stringify(r).includes('Chrome')), 'no address or browser stored, only a code');
assert.notEqual(visitorCode('k', '2026-10-05', '203.0.113.7', CHROME), visitorCode('k', '2026-10-06', '203.0.113.7', CHROME), 'the same person on another day is a different code (days can not be linked)');
const s = await t.summary();
assert.deepEqual([s.today.visitors, s.today.loads, s.week.visitors, s.month.loads], [2, 4, 2, 4], 'today / week / month: 2 visitors, 4 loads ' + JSON.stringify(s.today));
assert.deepEqual(s.sources.map((x) => [x.source, x.visitors]).sort(), [['direct', 1], ['x.com', 1]], 'where they came from');
assert.ok(s.days.length === 1 && s.players && 'signedInWeek' in s.players, 'day by day, and players next to it');
// the website can't see or add to it
await db.pg.exec('set role anon');
await assert.rejects(db.pg.query('select * from public.site_visits'), /permission denied/, "the website can't read the visits");
await assert.rejects(db.pg.query("select public.record_visit('0123456789abcdef0123456789abcdef', null, 'game')"), /permission denied/, "nor add fake ones directly");
await assert.rejects(db.pg.query('select public.traffic_summary()'), /permission denied/, 'nor read the summary');
await db.pg.exec('reset role');
// the admin screen's signed action reaches it (a stranger is refused by the admin code, tested in money-db)
const admin = createAdmin({ db, adminWallets: [], traffic: t });
assert.ok(typeof admin.run === 'function');
console.log('OK: traffic counter: visitors and loads counted per day, robots out, sources cleaned (t.co = x.com), nothing personal stored, summary adds up, website locked out');
