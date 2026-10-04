// Alerts to Cody's Telegram (server/alerts.js + supabase/021) on real Postgres (PGlite), all live files in order: each problem
// is found and sent once, not again within REPEAT_HOURS, again after; a failed send is retried; nothing without a token; the
// Telegram chat is found from the bot's /start and remembered. Run: node alerts-db.test.mjs
import assert from 'node:assert/strict';
import { makeDb } from './setup.mjs';
import { createAlerts, makeTelegram, REPEAT_HOURS } from '../../server/alerts.js';

const ALL = ['001_profiles.sql', '002_items_seed.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql', '006_ranked_tickets.sql', '007_rate_limits.sql',
  '008_hats_backpacks.sql', '009_lock_my_plays.sql', '010_levels.sql', '011_lottery.sql', '012_special_snowballs.sql', '013_match_stats.sql', '014_run_sizes.sql',
  '015_special_gear.sql', '016_shop.sql', '017_referee_role.sql', '018_ranked_results.sql', '019_ranked_board.sql', '020_worker_role.sql', '021_alerts.sql', '026_shared_pool.sql'];
const db = await makeDb(ALL);
const PLAYER = 'ALwa11etAAAA'.padEnd(44, '1');
const uid = (await db.query('insert into auth.users default values returning id'))[0].id;
await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, $2, 'Tester', '{}')`, [uid, PLAYER]);
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', 100000000, '{}'), ('slots', 500000000, '{"paused": true}')`);
// a finished drop run whose payout got frozen (held), a failed skim, a stuck queued top-off… as the server would leave them
const q = (await db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'drop', 1, 1, 1, 1000000, 0.001) returning id`, [uid]))[0].id;
const run = (await db.query(`select public.buy_run($1, $2, 1000000, 100000, 873000) as id`, [q, 'AlertsBuy' + '5'.repeat(79)]))[0].id;
await db.query(`update public.plays set state = 'settled', commit = $2, secret = 's', player_seed = 'p', result = '{"mult":1}', pay = 1, pay_raw = 1000000, price_usd = 0.001, settled_at = now() where run_id = $1`, [run, 'f'.repeat(64)]);
const payoutId = (await db.query(`select public.finish_run($1, $2, 100) as id`, [run, PLAYER]))[0].id;
await db.query(`update public.payouts set status = 'held' where id = $1`, [payoutId]);
await db.query(`insert into public.pool_transfers (game, kind, amount_raw, status) values ('spin', 'skim', 25000, 'failed'), ('spin', 'top-off', 300000000, 'needs_approval'), ('slots', 'skim', 1000, 'queued')`);
await db.query(`update public.pool_transfers set created_at = now() - interval '20 minutes' where status = 'queued'`);

let t = Date.now(); const sent = [];
let failNext = false, refereeUp = false, slotsOwedExtra = 0;
const telegram = { async send(text) { if (failNext) { failNext = false; throw new Error('network'); } sent.push(text); } };
// wallets: the Game pool wallet (every run payout comes from it since 2026-10-02) = books + the held payout (owed out) − the waiting top-off (owed in) + 7 SANTA nobody booked
const heldRaw = +(await db.query('select amount_raw from public.payouts where id = $1', [payoutId]))[0].amount_raw;
const bookSpin = +(await db.query("select santa_raw from public.pools where game = 'spin'"))[0].santa_raw; // the run's entry already arrived in the books
const expectSpin = bookSpin + heldRaw - 300000000 + 25000, walletRaw = async (g) => (g === 'spin' ? expectSpin + 7000000 : 500000000 + 1000 + slotsOwedExtra);
const alerts = createAlerts({ db, telegram, walletRaw, refereeHealth: async () => { if (!refereeUp) throw new Error('connection refused'); }, now: () => t });
let r = await alerts.run();
const has = (re) => sent.some((x) => re.test(x));
assert.ok(has(/HELD for you: payout #/), 'held payout'); assert.ok(has(/FAILED 5 times: pool_transfers/), 'failed send');
assert.ok(has(/waiting over 10 minutes: is the payout worker running/), 'stuck queue'); assert.ok(has(/TOP-OFF of 300 SANTA/), 'top-off waiting');
assert.ok(has(/EMERGENCY STOP is on for the old Slots pool/), 'emergency stop'); assert.ok(has(/MATCH SERVER isn't answering/), 'match server down');
assert.ok(has(/BOOKS DON'T MATCH the Game pool wallet: the wallet has 7 SANTA MORE/), 'drift found, with direction and size: ' + sent.filter((x) => /BOOKS/.test(x)));
assert.ok(!has(/BOOKS DON'T MATCH the old Slots/), 'the old Slots pool matches (books + its unsent skim)');
// A payment ON ITS WAY (2026-10-04, false alarms during the 1,000-play QA): an open quote from the last few minutes (its SANTA not
// yet recorded) covers a wallet that is ahead of the books; the same difference with no open quote is an alarm (above: 7 SANTA).
{ const [{ id: oq }] = await db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'drop', 10, 1, 10, 9000000, 0.001) returning id`, [uid]);
  const runOnce = async () => { const out = []; await createAlerts({ db, telegram: { send: async (x) => { out.push(x); } }, walletRaw: async (g) => (g === 'spin' ? expectSpin + 7500000 : 500000000 + 1000), refereeHealth: async () => {}, now: () => t }).run(); return out; }; // 7.5 SANTA: a new amount (the same alarm isn't repeated for 6 h)
  assert.ok(!(await runOnce()).some((x) => /BOOKS DON'T MATCH the Game pool/.test(x)), '7.5 SANTA ahead, a 9 SANTA quote still open: a payment on its way, no alarm');
  await db.query(`update public.quotes set created_at = now() - interval '6 minutes' where id = $1`, [oq]);
  assert.ok((await runOnce()).some((x) => /BOOKS DON'T MATCH the Game pool wallet: the wallet has [0-9.]+ SANTA MORE/.test(x)), 'the quote is over 5 minutes old: no longer in flight, alarm');
  await db.query('delete from public.quotes where id = $1', [oq]); }
assert.ok(sent.every((x) => x.startsWith('🎅 Santa Hat: ')));
const first = sent.length; assert.equal(r.sent, first);
// 5 minutes later: nothing new is sent (still the same problems)
t += 5 * 60e3; r = await alerts.run(); assert.equal(r.sent, 0, 'not repeated every 5 minutes');
// the match server comes back: no more alert about it; a new problem (a failed payout) is sent at once
refereeUp = true; await db.query(`insert into public.pool_transfers (game, kind, amount_raw, status) values ('slots', 'skim', 5, 'failed')`); slotsOwedExtra = 5; // still in the wallet: books match
t += 60e3; r = await alerts.run(); assert.equal(r.sent, 1, 'only the new problem'); assert.ok(/FAILED/.test(sent.at(-1)));
// a failed Telegram send isn't recorded: it goes out next time
await db.query(`update public.pools set rules = '{"paused": true}' where game = 'spin'`); failNext = true;
t += 60e3; r = await alerts.run(); assert.equal(r.sent, 0, 'send failed'); t += 60e3; r = await alerts.run(); assert.equal(r.sent, 1, 'retried'); assert.ok(/Game pool \(plays refused\)/.test(sent.at(-1)));
// after REPEAT_HOURS the lasting ones come again
t += (REPEAT_HOURS + 0.1) * 3600e3; r = await alerts.run(); assert.ok(r.sent >= 6, 'lasting problems repeated after ' + REPEAT_HOURS + ' h: ' + r.sent);
// off without a token
{ // no Telegram yet: nothing sent, but every check still runs and each finding goes to the server log
  const logged = [], err = console.error; console.error = (m) => logged.push(String(m));
  const r = await createAlerts({ db, telegram: null }).run(); console.error = err;
  assert.equal(r.off, true); assert.ok(r.found >= 1 && logged.length === r.found && logged.every((l) => l.startsWith('ALERT (no Telegram set up): ')), 'checks still run and are logged: ' + JSON.stringify(r)); }
assert.equal(makeTelegram({ token: '', db }), null);
// the chat: found from the bot's /start, remembered, then used
const calls = [];
const fakeFetch = async (url, o) => { const m = url.split('/').pop(); calls.push(m); const body = JSON.parse(o.body);
  if (m === 'getUpdates') return { json: async () => ({ ok: true, result: [{ message: { chat: { id: 4242, type: 'private' }, text: '/start' } }] }) };
  if (m === 'sendMessage') { assert.equal(body.chat_id, '4242'); return { json: async () => ({ ok: true }) }; } };
const tg = makeTelegram({ token: 'test-token', db, fetchFn: fakeFetch });
await tg.send('hello'); assert.deepEqual(calls, ['getUpdates', 'sendMessage']);
const tg2 = makeTelegram({ token: 'test-token', db, fetchFn: fakeFetch }); await tg2.send('again'); assert.deepEqual(calls.slice(2), ['sendMessage'], 'remembered: no second lookup');
const none = makeTelegram({ token: 'x', db: { query: async () => [] }, fetchFn: async () => ({ json: async () => ({ ok: true, result: [] }) }) });
await assert.rejects(() => none.send('x'), /send your Santa Hat bot \/start/);
console.log(`OK: alerts: ${first} problems found and sent once (frozen payout, failed send, stuck queue, top-off, emergency stop, match server down, books ≠ wallet), not every 5 min, new ones at once, failed sends retried, repeated after ${REPEAT_HOURS} h, off without a token, chat found from /start and remembered`);

// POOL JACKPOTS (Cody's list, 2026-10-03): good news is sent too, once per jackpot, only for ones won in the last 3 hours
{ const jq = (await db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'drop', 1, 1, 1, 1000000, 0.001) returning id`, [uid]))[0].id;
  const jr = (await db.query(`select public.buy_run($1, $2, 1000000, 100000, 873000) as id`, [jq, 'AlertsJack' + '5'.repeat(78)]))[0].id;
  await db.query(`update public.plays set state = 'settled', commit = $2, secret = 's', player_seed = 'p', result = '{"jackpot":true,"mult":125}', pay = 125, pay_raw = 125000000, price_usd = 0.001, settled_at = now() where run_id = $1`, [jr, 'e'.repeat(64)]);
  const oq = (await db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'drop', 1, 1, 1, 1000000, 0.001) returning id`, [uid]))[0].id;
  const or = (await db.query(`select public.buy_run($1, $2, 1000000, 100000, 873000) as id`, [oq, 'AlertsOld' + '5'.repeat(79)]))[0].id;
  await db.query(`update public.plays set state = 'settled', commit = $2, secret = 's', player_seed = 'p', result = '{"jackpot":true,"mult":99}', pay = 99, pay_raw = 99000000, price_usd = 0.001, settled_at = now() - interval '4 hours' where run_id = $1`, [or, 'd'.repeat(64)]);
  const before = sent.length; t += 60e3; await alerts.run();
  const jack = sent.slice(before).filter((s) => /POOL JACKPOT/.test(s));
  assert.equal(jack.length, 1, `one jackpot message: ${JSON.stringify(jack)}`);
  assert.ok(/Tester won \$125\.00 on Snowball Drop \(a \$1\.00 play\)/.test(jack[0]), jack[0]);
  t += 3600e3; const b2 = sent.length; await alerts.run();
  assert.equal(sent.slice(b2).filter((s) => /POOL JACKPOT/.test(s)).length, 0, 'never sent twice'); }
console.log('OK: pool jackpots: one cheerful message each (name, prize, game, play size), never repeated, old ones (over 3 h) not sent');
