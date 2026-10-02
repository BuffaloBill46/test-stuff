// The shop end to end on real Postgres (PGlite), the real SQL (001…016) and the real server code (server/shop.js): Store items
// (special snowballs, special gear, looks), a level, extra ranked tickets — each a checked payment (50% burned, the rest to the
// treasury) granted exactly once; a payment that can't be granted is owed back in full; worn-out gear can be bought again for a
// fresh 7 days; nothing for sale that isn't; the website can't touch any of it. Run: node shop-db.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDb } from './setup.mjs';
import { createShop } from '../../server/shop.js';
import { splitPayment, MINT } from '../../mockups/market.js';
import { SHOP_BURN_BPS, TICKET_PACKS } from '../../mockups/shoprules.js';

const db = await makeDb(['001_profiles.sql', '002_items_seed.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql', '006_ranked_tickets.sql', '008_hats_backpacks.sql', '009_lock_my_plays.sql', '010_levels.sql', '011_lottery.sql', '012_special_snowballs.sql']);
for (const f of ['015_special_gear.sql', '016_shop.sql']) await db.pg.exec(readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8'));
const PRICE = 0.00085, FEE = { bps: 300, max: 1e15 }, TREASURY = 'TReASURYwa11et'.padEnd(44, '1').replace(/[0OIl]/g, '9');
let wn = 0; const W = () => { const c = 'ABCDEFGHJK'[wn++]; return (c + 'Swa11et').padEnd(43, '1') + c; };
const mk = async (name, level = 1) => { const id = (await db.query('insert into auth.users default values returning id'))[0].id, w = W();
  await db.query('insert into public.profiles (id, wallet, name, avatar, level) values ($1, $2, $3, $4, $5)', [id, w, name, '{}', level]); return { id, w }; };
const [A, B] = [await mk('Ann'), await mk('Ben', 4)];
const txs = new Map(); let sigNo = 0;
// a payment on the stand-in chain: what left the player, what was burned, what reached the treasury (or `short` less)
const pay = (from, total, { short = 0, to = TREASURY } = {}) => { const sig = ('ShopPay' + String(++sigNo).padStart(4, '9') + '5'.repeat(80)).slice(0, 88).replace(/[0OIl]/g, '9'), s = splitPayment(total, SHOP_BURN_BPS, FEE),
  b = (i, o, a) => ({ accountIndex: i, mint: MINT, owner: o, uiTokenAmount: { amount: String(a), decimals: 6 } });
  txs.set(sig, { blockTime: Math.floor(Date.now() / 1000), meta: { err: null, innerInstructions: [], preTokenBalances: [b(1, from, 1e13), b(2, to, 1e12)], postTokenBalances: [b(1, from, 1e13 - total), b(2, to, 1e12 + s.arrives - short)] },
    transaction: { message: { accountKeys: [{ pubkey: from, signer: true }], instructions: [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { mint: MINT, authority: from, tokenAmount: { amount: String(s.burn) } } } }] } } });
  return sig; };
const chain = { getTransaction: async (s) => txs.get(s) ?? null };
const shop = createShop({ db, chain, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, treasury: TREASURY, mint: MINT, cluster: 'devnet' });
const owns = async (p, id) => !!(await db.query('select 1 from public.inventory where profile_id = $1 and item_id = $2', [p.id, id]))[0];
const buy = async (p, what, opts) => { const q = await shop.quote(p.id, what); assert.ok(q.id, JSON.stringify(q)); return { q, r: await shop.buy(p.id, q.id, pay(p.w, q.santaRaw, opts)) }; };

// 1. Items: a special snowball, a gear, a look. The quote is the catalog price at the live price, paid 50% burned / 50% treasury.
{ const { q, r } = await buy(A, { kind: 'item', id: 'sb_ice' });
  assert.deepEqual([q.usd, q.burnBps, q.pool, q.payer], [0.5, 5000, TREASURY, A.w], 'Ice Ball: $0.50, half burned, to the treasury, from my wallet');
  assert.equal(q.santaRaw, Math.round(0.5 / PRICE * 1e6)); assert.ok(r.ok && r.item === 'sb_ice', JSON.stringify(r)); assert.ok(await owns(A, 'sb_ice'), 'owned');
  assert.ok((await buy(A, { kind: 'item', id: 'gear_pumpkin' })).r.ok && await owns(A, 'gear_pumpkin'), 'a gear');
  const look = (await db.query(`select id from public.items where price_usd is not null and slot = 'shirt' limit 1`))[0];
  if (look) assert.ok((await buy(A, { kind: 'item', id: look.id })).r.ok && await owns(A, look.id), 'a look (bought on the Avatar screen)'); }
// owned: no second quote, so no payment is ever taken for it
assert.match((await shop.quote(A.id, { kind: 'item', id: 'sb_ice' })).error, /already own/);
assert.match((await shop.quote(A.id, { kind: 'item', id: 'sb_none' })).error, /isn't for sale/, 'an empty slot is not for sale');
assert.match((await shop.quote(A.id, { kind: 'item', id: 'nope' })).error, /isn't for sale/);
assert.match((await shop.quote(A.id, { kind: 'item', id: 'shirt_red' })).error, /isn't for sale|already own/, 'a level-unlock look is earned, not sold');

// 2. Cheats: a payment reused, a quote reused, short to the treasury, someone else's payment, no payment at all.
{ const q1 = await shop.quote(A.id, { kind: 'item', id: 'sb_fire' }), sig = pay(A.w, q1.santaRaw);
  assert.ok((await shop.buy(A.id, q1.id, sig)).ok);
  const q2 = await shop.quote(A.id, { kind: 'item', id: 'sb_sky' });
  assert.match((await shop.buy(A.id, q2.id, sig)).error, /already used|paid/, 'the same payment can\'t buy twice');
  assert.match((await shop.buy(A.id, q1.id, pay(A.w, q1.santaRaw))).error, /already used/, 'a used quote can\'t buy again');
  assert.match((await shop.buy(A.id, q2.id, pay(A.w, q2.santaRaw, { short: 1000 }))).error, /received/, 'short to the treasury: refused');
  assert.match((await shop.buy(A.id, q2.id, pay(B.w, q2.santaRaw))).error, /not signed by the player/, 'paid from someone else\'s wallet: refused');
  assert.match((await shop.buy(A.id, q2.id, 'NoSuchTx'.padEnd(88, '5'))).error, /not found/, 'no such transaction');
  assert.ok(!(await owns(A, 'sb_sky')), 'none of those granted anything');
  assert.match((await shop.buy(B.id, q2.id, pay(B.w, q2.santaRaw))).error, /unknown quote/, 'someone else\'s quote'); }

// 3. A level: $1 to level 2, one at a time; level 4 → 5 costs $5; levels above 5 aren't sold.
{ const { q, r } = await buy(A, { kind: 'level' }); assert.deepEqual([q.usd, q.to_level, r.level], [1, 2, 2], JSON.stringify(r));
  const b = await buy(B, { kind: 'level' }); assert.deepEqual([b.q.usd, b.r.level], [5, 5], 'level 4 → 5: $5');
  assert.match((await shop.quote(B.id, { kind: 'level' })).error, /earned/, 'level 5: no more for sale'); }

// 4. Ranked tickets: packs of 1/5/10 at 10¢/45¢/90¢, at most 10 extra a day.
{ const { q, r } = await buy(A, { kind: 'tickets', n: 5 }); assert.deepEqual([q.usd, r.tickets], [TICKET_PACKS[5], 5], JSON.stringify(r));
  assert.match((await shop.quote(A.id, { kind: 'tickets', n: 10 })).error, /5 left/, '10 more would pass the daily 10');
  assert.match((await shop.quote(A.id, { kind: 'tickets', n: 3 })).error, /1, 5 or 10/);
  assert.ok((await buy(A, { kind: 'tickets', n: 5 })).r.ok, 'up to 10 a day'); }

// 5. A checked payment that can't be granted is OWED BACK in full (never kept for nothing): two level quotes, both paid.
{ const C = await mk('Cy'); const q1 = await shop.quote(C.id, { kind: 'level' }), q2 = await shop.quote(C.id, { kind: 'level' });
  assert.ok((await shop.buy(C.id, q1.id, pay(C.w, q1.santaRaw))).ok);
  const sig = pay(C.w, q2.santaRaw), r = await shop.buy(C.id, q2.id, sig);
  assert.ok(r.ok && r.refunded && /owed back/.test(r.note), 'the second level payment is owed back: ' + JSON.stringify(r));
  const owed = (await db.query('select to_wallet, amount_raw, status from public.shop_refunds where signature = $1', [sig]))[0];
  assert.deepEqual([owed.to_wallet, +owed.amount_raw, owed.status], [C.w, q2.santaRaw, 'owed'], 'the full amount, to their wallet');
  assert.equal(+(await db.query('select level from public.profiles where id = $1', [C.id]))[0].level, 2, 'only one level granted'); }

// 6. Worn-out gear can be bought again: a fresh 7 days.
{ await db.query(`insert into public.gear_wear (profile_id, item_id, first_worn_at) values ($1, 'gear_pumpkin', now() - interval '8 days')`, [A.id]);
  assert.ok((await buy(A, { kind: 'item', id: 'gear_pumpkin' })).r.ok, 'bought again after it wore out');
  assert.equal((await db.query(`select count(*)::int as n from public.gear_wear where profile_id = $1 and item_id = 'gear_pumpkin'`, [A.id]))[0].n, 0, 'its clock starts again at the next match'); }

// 7. Closed shop (no treasury set): nothing can be quoted, so no payment is ever taken.
assert.match((await createShop({ db, chain, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, treasury: null }).quote(A.id, { kind: 'item', id: 'sb_split' })).error, /not open/);

// 8. The website (signed-in or not) can't read or write any shop table, or run the grant.
for (const role of ['anon', 'authenticated']) {
  await db.pg.exec(`set role ${role}`);
  for (const t of ['shop_quotes', 'item_purchases', 'shop_refunds']) await assert.rejects(db.pg.query(`select * from public.${t}`), /permission denied/, `${role} can't read ${t}`);
  await assert.rejects(db.pg.query(`select public.shop_buy('00000000-0000-0000-0000-000000000000'::uuid, 'x', 1, 'w')`), /permission denied/, `${role} can't grant`);
  await db.pg.exec('reset role');
}
// 9. Cody refunds an owed purchase by hand from the admin screen: checked on the chain (from the treasury, at least the amount, to
// that player), recorded once, and the same transaction can't count for anything else.
{ const { createAdmin, adminMessage, b58encode } = await import('../../server/admin.js');
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']), cody = b58encode(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)));
  const nonce = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const signed = async (fields) => { const message = adminMessage({ at: new Date().toISOString(), nonce: nonce(), ...fields });
    const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(message))); return { wallet: cody, message, signature: [...sig].map((b) => b.toString(16).padStart(2, '0')).join('') }; };
  const handTx = (to, sent, from = TREASURY) => { const sig = ('HandRefund' + (++sigNo)).padEnd(88, '5').replace(/[0OIl]/g, '9'), b = (i, o, x) => ({ accountIndex: i, mint: MINT, owner: o, uiTokenAmount: { amount: String(x), decimals: 6 } });
    txs.set(sig, { blockTime: Math.floor(Date.now() / 1000), meta: { err: null, preTokenBalances: [b(1, from, 1e13), b(2, to, 1e9)], postTokenBalances: [b(1, from, 1e13 - sent), b(2, to, 1e9 + Math.floor(sent * 0.97))] }, transaction: { message: { accountKeys: [] } } }); return sig; };
  const admin = createAdmin({ db, adminWallets: [cody], chain, poolWallets: { treasury: TREASURY }, mint: MINT });
  const owed = await admin.run(await signed({ action: 'shop-owed', game: 'shop' }));
  assert.ok(owed.ok && owed.owed.length === 1, 'one refund owed: ' + JSON.stringify(owed)); const o = owed.owed[0];
  const tryPay = async (tx) => admin.run(await signed({ action: 'shop-refund-paid', game: 'shop', settings: { refund: o.id, tx } }));
  assert.match((await tryPay(handTx(o.wallet, o.raw - 1))).error, /owed/, 'less than owed: refused');
  assert.match((await tryPay(handTx(o.wallet, o.raw, A.w))).error, /treasury sent/, 'not from the treasury: refused');
  assert.match((await tryPay(handTx(A.w, o.raw))).error, /arrived in the player/, 'to someone else: refused');
  const r = await tryPay(handTx(o.wallet, o.raw)); assert.ok(r.ok, JSON.stringify(r));
  assert.equal((await db.query('select status from public.shop_refunds where signature = $1', [o.id]))[0].status, 'paid');
  assert.match((await tryPay(handTx(o.wallet, o.raw))).error, /already paid/, 'paid twice: refused');
  assert.equal((await admin.run(await signed({ action: 'shop-owed', game: 'shop' }))).owed.length, 0, 'nothing owed now');
  assert.ok((await admin.run(await signed({ action: 'shop-owed', game: 'spin' }))).error, 'wrong game in the signed message: refused'); }
console.log('OK: shop: items (special snowballs, gear, looks), a level and ranked tickets, each a checked payment (50% burned / 50% treasury) granted once; reused payments/quotes, short, wrong wallet refused; a paid-but-ungrantable purchase owed back in full; worn-out gear re-bought for a fresh 7 days; nothing unsellable quoted; the website kept out');
