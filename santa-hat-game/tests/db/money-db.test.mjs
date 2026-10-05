// THE MONEY DASHBOARD (Cody, 2026-10-04 to-do #8; server/money.js through the admin screen's signed action) on a real database
// with every migration: Arcade runs paid / burned / reached the pool / winnings SENT and the real payback, Store purchases (paid
// quotes only, by kind), for today, the last 7 days and all time (a run from 10 days ago only in all time); the Game pool's books;
// only an admin wallet can read it. Run: node tests/db/money-db.test.mjs
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { makeDb } from './setup.mjs';
import { createMoney } from '../../server/money.js';
import { createAdmin, adminMessage, b58encode } from '../../server/admin.js';

const FILES = readdirSync(new URL('../../supabase/', import.meta.url)).filter((f) => /^0\d\d_.*\.sql$/.test(f) && f !== '031_games_role.sql').sort();
const db = await makeDb(FILES);
const W = 'MoNEYwa11et'.padEnd(44, '1').replace(/[0OIl]/g, '9'), ann = await db.player(W, 'Ann');
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', 500000000, '{}') on conflict (game) do update set santa_raw = 500000000`);
let n = 0;
const run = async (paid, burned, arrived, payRaw, ageDays = 0) => {
  const q = (await db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'drop', 1, 1, 1, $2, 0.001) returning id`, [ann, paid]))[0].id;
  const r = +(await db.query('select public.buy_run($1, $2, $3, $4, $5) as id', [q, 'MoneyRun' + String(++n).padStart(3, '9') + '5'.repeat(77), paid, burned, arrived]))[0].id;
  await db.query(`update public.plays set state = 'settled', commit = $2, secret = 's', player_seed = 'p', result = '{"mult":1}', pay = 1, pay_raw = $3, price_usd = 0.001, settled_at = now() where run_id = $1`, [r, 'f'.repeat(64), payRaw]);
  const po = (await db.query('select public.finish_run($1, $2, 100) as id', [r, W]))[0].id;
  if (po) await db.query(`update public.payouts set status = 'sent' where id = $1`, [po]);
  if (ageDays) { await db.query(`update public.payments set confirmed_at = now() - make_interval(days => $2) where signature like $1`, ['MoneyRun' + String(n).padStart(3, '9') + '%', ageDays]);
    await db.query(`update public.payouts set created_at = now() - make_interval(days => $2) where id = $1`, [po, ageDays]); }
};
await run(10_000_000, 1_000_000, 8_700_000, 6_000_000);       // today
await run(20_000_000, 2_000_000, 17_400_000, 18_000_000);     // today
await run(50_000_000, 5_000_000, 43_500_000, 30_000_000, 10); // ten days ago
await db.query(`insert into public.shop_quotes (profile_id, kind, item_id, usd, santa_raw, price_usd, used_by) values ($1, 'item', 'sb_ice', 1, 2400000, 0.0004, 'MoneyShop1'),
  ($1, 'item', 'sb_fire', 1, 2400000, 0.0004, null)`, [ann]);
const money = createMoney({ db, livePrice: async () => ({ usd: 0.0004 }) });
const s = await money.summary();
assert.ok(s.ok && s.price === 0.0004, 'answers, with the live price');
assert.deepEqual([s.today.arcade.runs, s.today.arcade.paid, s.today.arcade.burned, s.today.arcade.arrived], [2, 30_000_000, 3_000_000, 26_100_000], 'today: 2 runs, what they paid, burned, reached the pool ' + JSON.stringify(s.today.arcade));
const sentToday = +(await db.query(`select coalesce(sum(amount_raw), 0)::text as s from public.payouts where created_at > now() - interval '1 day'`))[0].s;
assert.ok(s.today.arcade.sent === sentToday && Math.abs(s.today.arcade.payback - sentToday / 30_000_000) < 1e-9, `winnings SENT today and the real payback (${(s.today.arcade.payback * 100).toFixed(1)}%)`);
assert.ok(s.week.arcade.runs === 2 && s.all.arcade.runs === 3 && s.all.arcade.paid === 80_000_000, 'the 10-day-old run counts in all time only');
assert.deepEqual([s.today.store.n, s.today.store.items, s.today.store.paid], [1, 1, 2_400_000], 'Store: the PAID purchase only (a quote never paid is not money in)');
assert.equal(s.now.poolRaw, +(await db.query(`select santa_raw from public.pools where game = 'spin'`))[0].santa_raw, "right now: the Game pool's books");
// only an admin wallet
const key = async () => { const k = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']); return { k, address: b58encode(new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey))) }; };
const cody = await key(), stranger = await key(), nonce = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
const signed = async (w, fields) => { const message = adminMessage({ at: new Date().toISOString(), nonce: nonce(), ...fields });
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', w.k.privateKey, new TextEncoder().encode(message)));
  return { wallet: w.address, message, signature: [...sig].map((b) => b.toString(16).padStart(2, '0')).join('') }; };
const admin = createAdmin({ db, adminWallets: [cody.address], money });
assert.match((await admin.run(await signed(stranger, { action: 'money-summary', game: 'money' }))).error, /not an admin wallet/, "a stranger can't see the money");
const a = await admin.run(await signed(cody, { action: 'money-summary', game: 'money' }));
assert.ok(a.ok && a.all.arcade.runs === 3, 'Cody sees it through the signed admin action');
console.log('OK: money dashboard: Arcade in / burned / to the pool / paid out / real payback, paid Store buys, by today / 7 days / all time, the pool now; admin wallet only');
