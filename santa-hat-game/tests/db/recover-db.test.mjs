// UNREPORTED PAYMENTS (Cody 2026-10-05: his page froze, he refreshed and approved the old screen's payment; it reached the pool
// but nothing reported it, so there was no play; server/games.js recoverUnreported + recent). Real game server code on real
// SQL (PGlite, every migration), a stand-in chain: Ann paid and her page never reported it → found, played out, in her "last
// turns", paid like any play; an unrelated payment of hers is not taken for it; Ben asked and never paid → nothing, and he is
// looked at only 3 times; Cal's page reported his normally → left alone; running it again changes nothing.
// Run: node tests/db/recover-db.test.mjs
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { makeDb } from './setup.mjs';
import { createGameServer } from '../../server/games.js';
import { splitPayment, MINT } from '../../mockups/market.js';
import { newSeed } from '../../mockups/fair.js';

const FILES = readdirSync(new URL('../../supabase/', import.meta.url)).filter((f) => /^0\d\d_.*\.sql$/.test(f) && f !== '031_games_role.sql').sort();
const db = await makeDb(FILES);
const wal = (s) => s.padEnd(44, '1').replace(/[0OIl]/g, '9');
const ANN = wal('ANNwa11et'), BEN = wal('BENwa11et'), CAL = wal('CALwa11et'), POOL = wal('SPINpoo1');
const ann = await db.player(ANN, 'Ann'), ben = await db.player(BEN, 'Ben'), cal = await db.player(CAL, 'Cal');
const USD = 0.001, FEE = { bps: 300, max: 1e15 };
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', $1, '{}') on conflict (game) do update set santa_raw = $1`, [Math.round((500 / USD) * 1e6)]);
const txs = new Map(), S = (n) => (n + '5'.repeat(88)).slice(0, 88).replace(/[0OIl]/g, '9');
function pay(sig, { from, to = POOL, total, at }) {
  const s = splitPayment(total, 1000, FEE), b = (i, o, a) => ({ accountIndex: i, mint: MINT, owner: o, uiTokenAmount: { amount: String(a), decimals: 6 } });
  txs.set(sig, { at, blockTime: Math.floor(at / 1000), meta: { err: null, innerInstructions: [], preTokenBalances: [b(1, from, 1e13), b(2, to, 1e12)], postTokenBalances: [b(1, from, 1e13 - total), b(2, to, 1e12 + s.arrives)] },
    transaction: { message: { accountKeys: [{ pubkey: from, signer: true }], instructions: [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { mint: MINT, authority: from, tokenAmount: { amount: String(s.burn) } } } }] } } });
}
const get = async (s) => { const t = txs.get(s); return t ? { blockTime: t.blockTime, meta: t.meta, transaction: t.transaction } : null; };
const gs = createGameServer({ retired: [], db, chain: { getTransaction: get, getTransactionFast: get }, livePrice: async () => ({ usd: USD }), liveFee: async () => FEE, poolWallets: { spin: POOL, slots: POOL } });
// make a quote look `mins` old (the server only looks at quotes 3+ minutes old: a page reports within seconds)
const age = async (id, mins) => { await db.query(`update public.quotes set created_at = now() - make_interval(secs => $2) where id = $1`, [id, mins * 60]); return Date.now() - mins * 60_000; };

const qa = await gs.quote(ann, 'stocking', 1, 1), qb = await gs.quote(ben, 'stocking', 1, 1), qc = await gs.quote(cal, 'stocking', 1, 1);
assert.ok(qa.id && qb.id && qc.id, 'three quotes');
const atA = await age(qa.id, 4), atB = await age(qb.id, 4), atC = await age(qc.id, 4);
pay(S('AnnOther'), { from: ANN, to: wal('SOMEONEe1se'), total: qa.santaRaw, at: atA + 10_000 }); // Ann paid someone else then
pay(S('AnnGame'), { from: ANN, total: qa.santaRaw, at: atA + 36_000 });                     // ...and the game, 36 s after her quote
pay(S('CalGame'), { from: CAL, total: qc.santaRaw, at: atC + 20_000 });
assert.ok((await gs.buy(cal, qc.id, S('CalGame'))).ok, "Cal's page reported his payment itself");
const asked = [];
// the player's wallet's transactions near the quote (the worker asks Solana: a minute before to two minutes after)
const signaturesOf = async (w, at) => { asked.push(w); return [...txs].filter(([, t]) => t.meta.preTokenBalances[0].owner === w && t.at >= at - 60_000 && t.at <= at + 120_000).sort((a, b) => a[1].at - b[1].at).map(([s]) => s); };
const tries = new Map();
let found = await gs.recoverUnreported({ signaturesOf, seed: () => newSeed(16), tries });
assert.deepEqual(found.map((f) => [f.wallet, f.kind, f.plays, f.usd, f.signature]), [[ANN, 'stocking', 1, 1, S('AnnGame')]], "only Ann's unreported game payment is found (not her other payment, not Ben's unpaid quote, not Cal's reported one) " + JSON.stringify(found));
assert.ok(!asked.includes(CAL), "Cal's bought quote isn't looked at");
const run = await db.query('select r.id, r.signature, (select count(*)::int from public.plays p where p.run_id = r.id and p.state = $2) as settled from public.runs r where r.signature = $1', [S('AnnGame'), 'settled']);
assert.equal(run.length, 1); assert.equal(run[0].settled, 1, 'her play is recorded and played out');
const po = await db.query('select status, amount_usd from public.payouts where run_id = $1', [run[0].id]);
assert.equal(po.length ? +po[0].amount_usd : 0, found[0].won, 'what she won is paid like any play (' + found[0].won + ')');
const turns = await gs.recent(ann, 'stocking');
assert.equal(turns.turns.length, 1); assert.ok(Number.isInteger(turns.turns[0].found), 'it shows in her "Your last turns": ' + JSON.stringify(turns.turns));
assert.deepEqual((await gs.recent(cal, 'stocking')).turns, [], "Cal's (not played yet) isn't a turn");
assert.equal((await gs.recent(ann, 'nope')).error, 'unknown game');
// again: nothing new, nothing played twice; Ben (4 minutes old) waits for his next look at 10 minutes
const before = asked.length;
found = await gs.recoverUnreported({ signaturesOf, seed: () => newSeed(16), tries });
assert.deepEqual(found, [], 'running it again finds nothing new');
assert.equal(asked.length, before, 'and asks the network nothing (Ben is next looked at when his quote is 10 minutes old)');
await age(qb.id, 11); await gs.recoverUnreported({ signaturesOf, seed: () => newSeed(16), tries });
await age(qb.id, 31); await gs.recoverUnreported({ signaturesOf, seed: () => newSeed(16), tries });
await age(qb.id, 60); await gs.recoverUnreported({ signaturesOf, seed: () => newSeed(16), tries });
assert.equal(asked.filter((w) => w === BEN).length, 3, 'an unpaid quote is looked at 3 times (about 3, 10, 30 minutes), then left alone');
assert.equal((await db.query('select count(*)::int as n from public.runs where profile_id = $1', [ben]))[0].n, 0, 'Ben gets nothing he did not pay for');
console.log('OK: unreported payments: found on the chain (only the right one), played out, paid, shown in "Your last turns"; unpaid quotes looked at 3 times; nothing twice');
