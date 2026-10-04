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
for (const f of ['015_special_gear.sql', '016_shop.sql', '022_ticket_cap.sql', '023_item_prices.sql', '028_look_rewards.sql', '030_daily_reset.sql']) await db.pg.exec(readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8'));
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
  assert.deepEqual([q.usd, q.burnBps, q.pool, q.payer], [1, 5000, TREASURY, A.w], 'Ice Ball: $1.00 (Cody sheet 2026-10-02), half burned, to the treasury, from my wallet');
  assert.equal(q.santaRaw, Math.round(1 / PRICE * 1e6)); assert.ok(r.ok && r.item === 'sb_ice', JSON.stringify(r)); assert.ok(await owns(A, 'sb_ice'), 'owned');
  assert.ok((await buy(A, { kind: 'item', id: 'gear_kevlar' })).r.ok && await owns(A, 'gear_kevlar'), 'a gear');
  // looks sold since 028 (Cody 2026-10-02): only the three faces (Snowman $1, Panda $1.50, Gorilla $2); every other look is a level reward
  const look = (await db.query(`select id, price_usd::float8 as usd from public.items where price_usd is not null and slot = 'face' order by id limit 1`))[0];
  assert.ok(look, 'a face is still sold'); const lq = await buy(A, { kind: 'item', id: look.id });
  assert.ok(lq.r.ok && await owns(A, look.id) && lq.q.usd === look.usd, 'a look (bought on the Avatar screen) at its price'); }
// the looks that became level rewards are not sold any more (refused before paying)
for (const id of ['shirt_coal', 'hat_antlers', 'pack_sack', 'snow_ember']) assert.match((await shop.quote(A.id, { kind: 'item', id })).error, /isn't for sale/, id + ' is a level reward now');
// retired gear (gear.js RETIRED, 2026-10-03: the Pumpkin Costume keeps its price row) and season-pass items are never sold
for (const id of ['gear_pumpkin', 'face_pumpkinking']) assert.match((await shop.quote(A.id, { kind: 'item', id })).error, /isn't for sale/, id + ' is not for sale');
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
  // the ranked lobby's ticket line ('tickets'): 10 free today + the 5 bought, nothing held, refill time ahead
  const tx = await shop.tickets(A.id);
  assert.deepEqual([tx.free, tx.extra, tx.held], [10, 5, 0], JSON.stringify(tx)); assert.ok(tx.resetsAt > Date.now(), 'the free ones refill later');
  assert.match((await shop.quote(A.id, { kind: 'tickets', n: 3 })).error, /1, 5 or 10/);
  { // ranked paused (the Droplet's pause file): no ticket sales, refused BEFORE any payment; other things still sell; back on reopening
    let paused = true; const s2 = createShop({ db, chain, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, treasury: TREASURY, mint: MINT, cluster: 'devnet', rankedPaused: () => paused });
    const before = (await db.query('select count(*)::int n from public.shop_quotes'))[0].n;
    assert.match((await s2.quote(A.id, { kind: 'tickets', n: 1 })).error, /Ranked is paused/, 'tickets refused while ranked is paused');
    assert.equal((await db.query('select count(*)::int n from public.shop_quotes'))[0].n, before, 'no price was made, so nothing can be paid');
    { const owned = new Set((await db.query('select item_id from public.inventory where profile_id = $1', [A.id])).map((x) => x.item_id));
      const free = (await db.query(`select id from public.items where price_usd is not null and slot in ('sball', 'gear', 'face') order by id`)).map((x) => x.id).find((id) => !owned.has(id));
      const r = await s2.quote(A.id, { kind: 'item', id: free }); assert.ok(free && !r.error, `items still sell while ranked is paused (${free}): ${r.error}`); }
    paused = false; assert.ok(!(await s2.quote(A.id, { kind: 'tickets', n: 1 })).error, 'tickets sell again once ranked reopens'); }
  assert.ok((await buy(A, { kind: 'tickets', n: 5 })).r.ok, 'up to 10 a day');
  // 25 at once (022): a day later, with 8 bought, a 5-pack would pass the 10-bought cap: refused at the QUOTE, before paying
  await db.query(`update public.ticket_purchases set at = at - interval '2 days' where profile_id = $1`, [A.id]); await db.query('update public.tickets set extra = 8 where profile_id = $1', [A.id]);
  assert.match((await shop.quote(A.id, { kind: 'tickets', n: 5 })).error, /at most 10 bought ranked tickets; room for 2 more/, 'refused before paying');
  assert.ok((await shop.quote(A.id, { kind: 'tickets', n: 1 })).id, 'a 1-pack still fits'); }

// 5. A checked payment that can't be granted is OWED BACK in full (never kept for nothing): two level quotes, both paid.
{ const C = await mk('Cy'); const q1 = await shop.quote(C.id, { kind: 'level' }), q2 = await shop.quote(C.id, { kind: 'level' });
  assert.ok((await shop.buy(C.id, q1.id, pay(C.w, q1.santaRaw))).ok);
  const sig = pay(C.w, q2.santaRaw), r = await shop.buy(C.id, q2.id, sig);
  assert.ok(r.ok && r.refunded && /owed back/.test(r.note), 'the second level payment is owed back: ' + JSON.stringify(r));
  const owed = (await db.query('select to_wallet, amount_raw, status from public.shop_refunds where signature = $1', [sig]))[0];
  assert.deepEqual([owed.to_wallet, +owed.amount_raw, owed.status], [C.w, q2.santaRaw, 'owed'], 'the full amount, to their wallet');
  assert.equal(+(await db.query('select level from public.profiles where id = $1', [C.id]))[0].level, 2, 'only one level granted'); }

// 6. Worn-out gear can be bought again: a fresh 7 days.
{ await db.query(`insert into public.gear_wear (profile_id, item_id, first_worn_at) values ($1, 'gear_kevlar', now() - interval '8 days')`, [A.id]);
  assert.ok((await buy(A, { kind: 'item', id: 'gear_kevlar' })).r.ok, 'bought again after it wore out');
  assert.equal((await db.query(`select count(*)::int as n from public.gear_wear where profile_id = $1 and item_id = 'gear_kevlar'`, [A.id]))[0].n, 0, 'its clock starts again at the next match'); }

// 7. Closed shop (no treasury set): nothing can be quoted, so no payment is ever taken.
assert.match((await createShop({ db, chain, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, treasury: null }).quote(A.id, { kind: 'item', id: 'sb_split' })).error, /not open/);

// 7b. Paying with SOL at the price (Cody 2026-10-04; 044, 045): on mainnet, with a SOL price, every quote also carries the WHOLE
//     price in SOL (lamports, rounded up), kept on the quote. A payment that swaps half of it (through Jupiter), burns all that
//     bought, and sends the other half to the treasury as SOL is granted; the treasury a lamport short, or SOL spent under the
//     price, is refused. Before 044, on devnet, or with the SOL price down: SANTA only, nothing breaks.
{ const SOLUSD = 121.42, sh = (o = {}) => createShop({ db, chain, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, treasury: TREASURY, mint: MINT, cluster: 'mainnet', liveSol: async () => ({ usd: SOLUSD }), ...o });
  const { JUPITER } = await import('../../server/verify.js'), { lamportsFor } = await import('../../mockups/market.js');
  const C = await mk('Cy');
  assert.equal((await sh().quote(C.id, { kind: 'item', id: 'sb_split' })).solLamports, undefined, 'before 044: SANTA only');
  for (let i = 0; i < 2; i++) await db.pg.exec(readFileSync(new URL('../../supabase/044_pay_with_sol.sql', import.meta.url), 'utf8')); // safe twice
  assert.equal((await sh({ cluster: 'devnet' }).quote(C.id, { kind: 'item', id: 'sb_split' })).solLamports, undefined, 'devnet: SANTA only (no swaps there)');
  assert.equal((await sh({ liveSol: async () => { throw new Error('down'); } }).quote(C.id, { kind: 'item', id: 'sb_split' })).solLamports, undefined, 'SOL price down: SANTA only');
  // what the page sends (pay.js): half the price's SOL into the swap, 90% of the burn share's SANTA comes out and is all burned
  const solPay = (q, { toTreasury = Math.floor(q.solLamports / 2), spend = q.solLamports } = {}) => {
    const sig = ('SolPay' + String(++sigNo).padStart(4, '9') + '5'.repeat(80)).slice(0, 88).replace(/[0OIl]/g, '9'), burn = Math.floor(q.santaRaw * 0.5 * 0.9),
      b = (i, o, a) => ({ accountIndex: i, mint: MINT, owner: o, uiTokenAmount: { amount: String(a), decimals: 6 } });
    txs.set(sig, { blockTime: Math.floor(Date.now() / 1000), meta: { err: null, fee: 5000, innerInstructions: [], preBalances: [5e9, 0, 1e9], postBalances: [5e9 - spend - 5000, 0, 1e9 + toTreasury],
      preTokenBalances: [b(1, C.w, 0)], postTokenBalances: [b(1, C.w, 0)] },
      transaction: { message: { accountKeys: [{ pubkey: C.w, signer: true }, { pubkey: 'CyATA', signer: false }, { pubkey: TREASURY, signer: false }],
        instructions: [{ programId: JUPITER, accounts: [], data: '' }, { program: 'spl-token', parsed: { type: 'burnChecked', info: { mint: MINT, authority: C.w, tokenAmount: { amount: String(burn) } } } }] } } });
    return sig; };
  const q = await sh().quote(C.id, { kind: 'item', id: 'sb_split' });
  assert.ok(q.solLamports === lamportsFor(q.usd, SOLUSD) && q.solUsd === SOLUSD && q.solStore === true, 'the whole price in SOL, rounded up: ' + q.solLamports);
  assert.equal(+(await db.query('select sol_lamports from public.shop_quotes where id = $1', [q.id]))[0].sol_lamports, q.solLamports, 'kept on the quote');
  assert.match((await sh().buy(C.id, q.id, solPay(q, { toTreasury: Math.floor(q.solLamports / 2) - 1 }))).error, /treasury received/, 'the treasury a lamport short: refused');
  const qb = await sh().quote(C.id, { kind: 'item', id: 'sb_split' });
  assert.match((await sh().buy(C.id, qb.id, solPay(qb, { spend: qb.solLamports - 1 }))).error, /the price was/, 'SOL spent under the price: refused');
  assert.ok(!(await owns(C, 'sb_split')));
  const q2 = await sh().quote(C.id, { kind: 'item', id: 'sb_split' }), ok = await sh().buy(C.id, q2.id, solPay(q2));
  assert.ok(ok.ok && await owns(C, 'sb_split'), 'paid with SOL: granted ' + JSON.stringify(ok));
  assert.equal(+(await db.query('select paid_raw from public.item_purchases where profile_id = $1', [C.id]))[0].paid_raw, q2.santaRaw, 'recorded at the quote\'s SANTA amount'); }

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
// The money strip's "burned so far" (server/games.js burned, Cody 2026-10-03): the Store's 50% of every PAID quote (a refund
// doesn't un-burn: the burn already happened on chain), plus game runs and lottery tickets exactly as recorded. Kept a minute.
{ const { createGameServer } = await import('../../server/games.js');
  const gs = createGameServer({ retired: [], db, chain, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, poolWallets: {} });
  const paid = await db.query('select santa_raw from public.shop_quotes where used_by is not null');
  const refunds = (await db.query('select count(*)::int n from public.shop_refunds'))[0].n;
  const perQuote = paid.reduce((a, q) => a + splitPayment(+q.santa_raw, SHOP_BURN_BPS, FEE).burn, 0);
  const sums = (await db.query('select (select coalesce(sum(burned_raw), 0) from public.payments)::text g, (select coalesce(sum(burned_raw), 0) from public.lottery_buys)::text l'))[0];
  const b = await gs.burned();
  assert.ok(paid.length >= 3 && refunds >= 1, `the test made paid Store buys (${paid.length}) and a refunded one (${refunds})`);
  assert.ok(Math.abs(b.storeRaw - perQuote) <= paid.length, `Store burn = 50% of every paid quote after the tax (${b.storeRaw} vs ${perQuote}, rounding ≤ 1 per buy)`);
  assert.deepEqual([b.gamesRaw, b.lotteryRaw, b.totalRaw], [+sums.g, +sums.l, +sums.g + +sums.l + b.storeRaw], 'games and lottery exactly as recorded; total adds up');
  await db.query(`update public.shop_quotes set santa_raw = santa_raw * 2 where used_by is not null`);
  assert.equal((await gs.burned()).storeRaw, b.storeRaw, 'kept a minute: no new database read for every visitor');
  await db.query(`update public.shop_quotes set santa_raw = santa_raw / 2 where used_by is not null`); }
// My wallet under the games (server/games.js wallet, Cody 2026-10-03): only the asking player's OWN linked wallet is read,
// remembered 10 s (one network read for many asks), dollars at the live price; an account with no wallet says so.
{ const { createGameServer } = await import('../../server/games.js');
  const reads = []; const held = { };
  const gs = createGameServer({ retired: [], db, chain: { ...chain, tokenBalance: async (owner) => { reads.push(owner); return held[owner] ?? 0; } }, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, poolWallets: {} });
  const a = await mk('WalletAva'), b = await mk('WalletBen'); held[a.w] = 2_500_000 * 1e6; held[b.w] = 7 * 1e6;
  const ra = await gs.wallet(a.id);
  assert.deepEqual([ra.wallet, ra.santaRaw, +ra.usd.toFixed(4)], [a.w, 2_500_000 * 1e6, +(2_500_000 * PRICE).toFixed(4)], 'my wallet: its SANTA and dollars at the live price');
  const rb = await gs.wallet(b.id);
  assert.ok(rb.wallet === b.w && rb.santaRaw === 7e6 && reads.every((w) => w === a.w || w === b.w), 'each player gets only their own wallet');
  await gs.wallet(a.id); await gs.wallet(a.id);
  assert.equal(reads.filter((w) => w === a.w).length, 1, 'asked 3 times within 10 s: read from the network once');
  const email = (await db.query('insert into auth.users default values returning id'))[0].id;
  await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, null, 'Emailer', '{}')`, [email]); // a real email account (003: no wallet)
  const re = await gs.wallet(email);
  assert.equal(re.wallet ?? null, null, 'an account with no wallet linked: says so (no read)'); }
console.log('OK: my wallet under the games: own wallet only, read once per 10 s, dollars at the live price; no wallet → says so');
console.log('OK: the money strip\'s burned-so-far: the Store\'s share of every paid buy (refunds included), games and lottery as recorded, kept a minute');
console.log('OK: shop: items (special snowballs, gear, looks), a level and ranked tickets, each a checked payment (50% burned / 50% treasury) granted once; reused payments/quotes, short, wrong wallet refused; a paid-but-ungrantable purchase owed back in full; worn-out gear re-bought for a fresh 7 days; nothing unsellable quoted; the website kept out');
