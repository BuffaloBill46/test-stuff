// UNREPORTED PAYMENTS for LOTTERY TICKETS and the STORE (Cody 2026-10-05: "go ahead and make a fix for this"; server/recover.js
// with lottery.js / shop.js recoverUnreported), through their REAL buy steps on real SQL (PGlite, every migration) and a
// stand-in chain: Ann paid for 3 lottery tickets and Ben for an Ice Ball, and neither page reported it → both found, Ann's
// tickets are in the draw and Ben owns the Ice Ball; Cy asked for tickets and never paid → nothing; running it again changes
// nothing. Run: node tests/db/recover-all-db.test.mjs
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { makeDb } from './setup.mjs';
import { createLottery } from '../../server/lottery.js';
import { createShop } from '../../server/shop.js';
import { splitPayment, MINT } from '../../mockups/market.js';
import { SHOP_BURN_BPS } from '../../mockups/shoprules.js';

const FILES = readdirSync(new URL('../../supabase/', import.meta.url)).filter((f) => /^0\d\d_.*\.sql$/.test(f) && f !== '031_games_role.sql').sort();
const db = await makeDb(FILES);
const PRICE = 0.00085, FEE = { bps: 300, max: 1e15 }, wal = (s) => s.padEnd(44, '1').replace(/[0OIl]/g, '9');
const LOTTERY = wal('LoTTERYwa11et'), TREASURY = wal('TReASURYwa11et');
const ANN = wal('ANNwa11et'), BEN = wal('BENwa11et'), CY = wal('CYwa11et');
const ann = await db.player(ANN, 'Ann'), ben = await db.player(BEN, 'Ben'), cy = await db.player(CY, 'Cy');
const txs = new Map(); let n = 0;
function pay({ from, to, total, burnBps, at }) {
  const sig = ('Recov' + String(++n).padStart(4, '9') + '5'.repeat(88)).slice(0, 88).replace(/[0OIl]/g, '9'), s = splitPayment(total, burnBps, FEE);
  const b = (i, o, a) => ({ accountIndex: i, mint: MINT, owner: o, uiTokenAmount: { amount: String(a), decimals: 6 } });
  txs.set(sig, { from, at, tx: { blockTime: Math.floor(at / 1000), meta: { err: null, innerInstructions: [], preTokenBalances: [b(1, from, 1e13), b(2, to, 1e12)], postTokenBalances: [b(1, from, 1e13 - total), b(2, to, 1e12 + s.arrives)] },
    transaction: { message: { accountKeys: [{ pubkey: from, signer: true }], instructions: [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { mint: MINT, authority: from, tokenAmount: { amount: String(s.burn) } } } }] } } } });
  return sig;
}
const chain = { getTransaction: async (s) => txs.get(s)?.tx ?? null, latestBlock: async () => ({ blockhash: 'B'.repeat(44), slot: 1 }) };
// a weekly draw a day away (sales open)
const schedule = { nextDraw: () => Date.now() + 86_400_000, salesFor: () => ({ open: true, at: Date.now() + 86_400_000 }) };
const lot = createLottery({ db, chain, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, wallet: LOTTERY, mint: MINT, schedule, paused: [] });
const shop = createShop({ db, chain, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, treasury: TREASURY, mint: MINT, cluster: 'devnet' });
const age = async (table, id, mins) => { await db.query(`update public.${table} set created_at = now() - make_interval(secs => $2) where id = $1`, [id, mins * 60]); return Date.now() - mins * 60_000; };

const lq = await lot.quote(ann, 'weekly-10', 3); assert.ok(lq.id, JSON.stringify(lq));
const sq = await shop.quote(ben, { kind: 'item', id: 'sb_ice' }); assert.ok(sq.id, JSON.stringify(sq));
const cq = await lot.quote(cy, 'weekly-10', 1); assert.ok(cq.id);
const atL = await age('lottery_quotes', lq.id, 4), atS = await age('shop_quotes', sq.id, 4); await age('lottery_quotes', cq.id, 4);
pay({ from: ANN, to: LOTTERY, total: lq.santaRaw, burnBps: 1000, at: atL + 25_000 });     // paid; the page never said so
pay({ from: BEN, to: TREASURY, total: sq.santaRaw, burnBps: SHOP_BURN_BPS, at: atS + 30_000 });
const asked = [];
const signaturesOf = async (w, at) => { asked.push(w); return [...txs].filter(([, t]) => t.from === w && t.at >= at - 60_000 && t.at <= at + 120_000).map(([s]) => s); };
const tries = new Map();
const L = await lot.recoverUnreported({ signaturesOf, tries }), S = await shop.recoverUnreported({ signaturesOf, tries });
assert.deepEqual(L.map((f) => [f.wallet, f.n, f.refunded, f.table]), [[ANN, 3, false, 'lottery_quotes']], "Ann's ticket payment found (not Cy's unpaid quote) " + JSON.stringify(L.map((f) => f.result)));
assert.deepEqual(S.map((f) => [f.wallet, f.kind, f.item, f.refunded]), [[BEN, 'item', 'sb_ice', false]], "Ben's Store payment found " + JSON.stringify(S.map((f) => f.result)));
const mine = (await lot.mine(ann)).mine;
assert.equal(mine.reduce((a, m) => a + m.tickets, 0), 3, 'her 3 tickets are in the draw ' + JSON.stringify(mine));
assert.ok((await db.query("select 1 from public.inventory where profile_id = $1 and item_id = 'sb_ice'", [ben]))[0], 'he owns the Ice Ball');
assert.equal((await lot.mine(cy)).mine.length, 0, 'Cy paid nothing: no tickets');
const before = asked.length;
assert.deepEqual([...(await lot.recoverUnreported({ signaturesOf, tries })), ...(await shop.recoverUnreported({ signaturesOf, tries }))], [], 'again: nothing new');
assert.equal(asked.length, before, 'and the network is not asked again until the next look (10 minutes)');
assert.equal((await lot.buy(ann, lq.id, [...txs.keys()][0])).error, 'quote already used', 'the page reporting it late changes nothing (already bought)');
console.log('OK: unreported lottery and Store payments: found on the chain, recorded through their real buy steps (tickets in the draw, the item owned), unpaid quotes left alone, nothing twice');
