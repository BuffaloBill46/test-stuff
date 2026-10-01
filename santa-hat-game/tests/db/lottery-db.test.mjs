// The Santa Lottery end to end on real Postgres (PGlite), the real SQL (001…011) and the real server code (server/lottery.js):
// tickets bought with checked payments (10% burned, the rest to the lottery wallet), real draws (draws a few seconds apart so the
// test runs in under a minute, against the database's real clock), winners re-checked from PUBLIC data only, exact pot splits,
// late payments moved or refunded, both payout modes, and the website kept out. Run: node lottery-db.test.mjs
import assert from 'node:assert/strict';
import { makeDb, FILES } from './setup.mjs';
import { createLottery } from '../../server/lottery.js';
import { runPayouts } from '../../server/payouts.js';
import { splitPayment, MINT } from '../../mockups/market.js';
import { drawWinners, LOTTERIES } from '../../mockups/lottery.js';

const db = await makeDb([...FILES.filter((f) => f !== '009_lock_my_plays.sql'), '009_lock_my_plays.sql', '010_levels.sql', '011_lottery.sql']);
const PRICE = 0.00085, FEE = { bps: 300, max: 1e15 }, LOTTERY = 'LoTTERYwa11et'.padEnd(44, '1').replace(/[0OIl]/g, '9');
let wn = 0; const W = () => ('LTwa11et' + 'ABCDEFGHJK'[wn++]).padEnd(44, '1');
const mk = async (name) => { const id = (await db.query('insert into auth.users default values returning id'))[0].id, w = W();
  await db.query('insert into public.profiles (id, wallet, name, avatar) values ($1, $2, $3, $4)', [id, w, name, '{}']); return { id, w }; };
const [A, B, C, D] = [await mk('Ann'), await mk('Ben'), await mk('Cy'), await mk('Dee')];
const txs = new Map(); let sigNo = 0;
const pay = (from, total) => { const sig = ('LottoPay' + String(++sigNo).padStart(4, '9') + '5'.repeat(80)).slice(0, 88).replace(/[0OIl]/g, '9'), s = splitPayment(total, 1000, FEE),
  b = (i, o, a) => ({ accountIndex: i, mint: MINT, owner: o, uiTokenAmount: { amount: String(a), decimals: 6 } });
  txs.set(sig, { blockTime: Math.floor(Date.now() / 1000), meta: { err: null, innerInstructions: [], preTokenBalances: [b(1, from, 1e13), b(2, LOTTERY, 1e12)], postTokenBalances: [b(1, from, 1e13 - total), b(2, LOTTERY, 1e12 + s.arrives)] },
    transaction: { message: { accountKeys: [{ pubkey: from, signer: true }], instructions: [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { mint: MINT, authority: from, tokenAmount: { amount: String(s.burn) } } } }] } } });
  return { sig, arrives: s.arrives }; };
let slot = 1000; const BH = () => ('BLoCKhash' + (++slot)).padEnd(44, 'x').replace(/[0OIl]/g, '9');
const chain = { getTransaction: async (s) => txs.get(s) ?? null, latestBlock: async () => ({ blockhash: BH(), slot }) };
// Test schedule: a draw every 6 s; sales close 1.5 s before it. (The real one: midnight UTC, Sundays, Christmas; mockups/lottery.js.)
const EVERY = 6000, CLOSE = 1500, onceAt = { at: null };
const schedule = { nextDraw: (kind, t) => (kind === 'christmas' ? (onceAt.at && t < onceAt.at ? onceAt.at : null) : (Math.floor(t / EVERY) + 1) * EVERY),
  salesFor: (kind, t) => { const at = schedule.nextDraw(kind, t); if (at === null) return { open: false, why: 'this lottery has been drawn' }; return at - t <= CLOSE ? { open: false, at, why: 'sales are closed' } : { open: true, at }; } };
const lot = createLottery({ db, chain, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, wallet: LOTTERY, mint: MINT, schedule });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitOpenWindow = async () => { for (;;) { const t = Date.now(), at = schedule.nextDraw('daily-10', t); if (at - t > CLOSE + 2500) return; await sleep(200); } };
async function buyTickets(p, kind, n) { const q = await lot.quote(p.id, kind, n); assert.ok(q.id, JSON.stringify(q)); const { sig, arrives } = pay(p.w, q.santaRaw); const r = await lot.buy(p.id, q.id, sig); assert.ok(r.ok, JSON.stringify(r)); return { q, sig, arrives, r }; }
// Re-check a draw the way any player could: only the public view (secret revealed after the draw) and the public ticket list.
async function recheck(drawId) {
  const d = (await db.query('select * from public.lottery_public where id = $1', [drawId]))[0];
  const list = await db.query('select first_no, n, wallet_short from public.lottery_ticket_list where draw_id = $1 order by first_no', [drawId]);
  const full = await db.query('select first_no, wallet from public.lottery_buys where draw_id = $1 order by first_no', [drawId]); // to map short → full in this test
  const byFirst = new Map(full.map((r) => [r.first_no, r.wallet]));
  const tickets = list.flatMap((b) => Array.from({ length: b.n }, (_, i) => ({ id: b.first_no + i, wallet: byFirst.get(b.first_no) })));
  return drawWinners({ secret: d.secret, blockhash: d.blockhash, tickets, drawId: +d.id, places: LOTTERIES[d.kind].split.length });
}

console.log('1. Weekly (top 3, 60/25/15): Ann 5 tickets, Ben 3, Cy 1, Dee 2; the website can\'t see the secret before the draw');
await waitOpenWindow();
const bought = [await buyTickets(A, 'weekly-10', 5), await buyTickets(B, 'weekly-10', 3), await buyTickets(C, 'weekly-10', 1), await buyTickets(D, 'weekly-10', 2)];
const drawId = (await db.query(`select id from public.lottery_draws where kind = 'weekly-10' and status = 'open' order by draws_at limit 1`))[0].id;
const potWant = bought.reduce((a, b) => a + b.arrives, 0);
let d = (await db.query('select * from public.lottery_draws where id = $1', [drawId]))[0];
assert.equal(+d.pot_raw, potWant, 'the pot is exactly what arrived'); assert.equal(d.tickets, 11);
assert.deepEqual((await db.query('select first_no, n from public.lottery_buys where draw_id = $1 order by first_no', [drawId])).map((r) => [r.first_no, r.n]), [[1, 5], [6, 3], [9, 1], [10, 2]], 'tickets numbered in sale order');
assert.equal((await db.query('select secret from public.lottery_public where id = $1', [drawId]))[0].secret, null, 'secret hidden until the draw');
await db.query('set role authenticated');
await assert.rejects(() => db.query('select secret from public.lottery_draws'), undefined, 'the website can\'t read the draws table');
await assert.rejects(() => db.query('select * from public.lottery_buys'), undefined, 'nor full wallets of buyers');
assert.ok((await db.query('select * from public.lottery_ticket_list')).length >= 4, 'the public ticket list (shortened wallets) is readable');
await db.query('reset role');
assert.equal((await lot.buy(A.id, bought[0].q.id, bought[0].sig)).error, 'quote already used', 'a payment buys once');

console.log('2. The draw runs once its time passes; winners re-check from public data; the split is exact');
while (Date.now() < +new Date(d.draws_at)) await sleep(200);
const ran = await lot.runDraws(); assert.ok(ran.includes(+drawId)); assert.deepEqual(await lot.runDraws(), [], 'a draw runs once');
d = (await db.query('select * from public.lottery_draws where id = $1', [drawId]))[0];
const pays = await db.query('select place, to_wallet, amount_raw, status from public.lottery_payouts where draw_id = $1 order by place', [drawId]);
assert.equal(pays.length, 3); assert.equal(new Set(pays.map((p) => p.to_wallet)).size, 3, 'three different wallets');
assert.equal(pays.reduce((a, p) => a + +p.amount_raw, 0), potWant, 'the payouts add up to the pot exactly');
assert.deepEqual(pays.slice(1).map((p) => +p.amount_raw), [Math.floor(potWant * 25 / 100), Math.floor(potWant * 15 / 100)], '2nd 25%, 3rd 15%');
assert.ok(pays.every((p) => p.status === 'manual'), 'payout mode starts as manual (Cody hasn\'t decided): they wait for Cody');
const again = await recheck(drawId);
assert.deepEqual(again.map((w) => [w.place, w.ticket.wallet]), pays.map((p) => [p.place, p.to_wallet]), 'anyone re-running the draw from public data gets the same winners');

console.log('3. Daily (1 winner) and an empty draw');
await waitOpenWindow();
const solo = [await buyTickets(A, 'daily-100', 2), await buyTickets(B, 'daily-100', 1)];
const dailyId = (await db.query(`select id, draws_at from public.lottery_draws where kind = 'daily-100' and status = 'open' order by draws_at limit 1`))[0];
const emptyId = (await lot.drawFor('daily-10', Date.now())).id; // nobody buys this one
while (Date.now() < +new Date(dailyId.draws_at)) await sleep(200);
await lot.runDraws();
const dp = await db.query('select place, amount_raw from public.lottery_payouts where draw_id = $1', [dailyId.id]);
assert.equal(dp.length, 1); assert.equal(+dp[0].amount_raw, solo[0].arrives + solo[1].arrives, 'one winner takes the whole pot');
assert.equal((await db.query('select status from public.lottery_draws where id = $1', [emptyId]))[0].status, 'drawn', 'an empty draw is drawn too');
assert.equal((await db.query('select count(*)::int n from public.lottery_payouts where draw_id = $1', [emptyId]))[0].n, 0, '…and pays nothing');

console.log('4. A payment confirmed after its draw: moved to the next draw (or refunded when there is none)');
await waitOpenWindow();
const lateQ = await lot.quote(C.id, 'weekly-100', 4); const lateDraw = (await db.query('select draws_at from public.lottery_quotes q join public.lottery_draws d on d.id = q.draw_id where q.id = $1', [lateQ.id]))[0];
while (Date.now() < +new Date(lateDraw.draws_at) + 200) await sleep(200); // the draw's time passes before the payment confirms
const late = pay(C.w, lateQ.santaRaw); const lr = await lot.buy(C.id, lateQ.id, late.sig);
assert.ok(lr.ok && lr.moved, 'moved to the next draw: ' + JSON.stringify(lr)); assert.ok(lr.drawsAt > +new Date(lateDraw.draws_at));
// The narrow race, straight at the database: the draw's time has passed but nothing has run it yet, and a payment lands.
// Its tickets must not join that draw (its ticket list is final once it's due): they go to the next one.
const dueId = (await db.query(`insert into public.lottery_draws (kind, draws_at, commit, secret) values ('weekly-100', now() - interval '1 second', $1, 's') returning id`, ['a'.repeat(64)]))[0].id;
const nextId = (await db.query(`insert into public.lottery_draws (kind, draws_at, commit, secret) values ('weekly-100', now() + interval '1 hour', $1, 's') returning id`, ['b'.repeat(64)]))[0].id;
const rq = (await db.query(`insert into public.lottery_quotes (profile_id, draw_id, n, usd, santa_raw, price_usd) values ($1, $2, 2, 2, 1000, 0.001) returning id`, [A.id, dueId]))[0].id;
const into = (await db.query('select public.buy_lottery($1, $2, $3, 1000, 100, 870, $4) as d', [rq, 'RaceSig'.padEnd(88, '5'), A.w, nextId]))[0].d;
assert.equal(+into, +nextId, 'a payment landing after the draw\'s time (before it ran) goes to the next draw');
assert.equal((await db.query('select tickets from public.lottery_draws where id = $1', [dueId]))[0].tickets, 0, 'the due draw\'s ticket list stayed final');
await db.query('delete from public.lottery_buys where draw_id = $1', [nextId]); await db.query('delete from public.lottery_quotes where id = $1', [rq]);
await db.query('delete from public.lottery_draws where id in ($1, $2)', [dueId, nextId]); // (test rows only: buys, then the quote, then the draws)
onceAt.at = Date.now() + 4000; // a one-off (Christmas-style) lottery
const xq = await lot.quote(D.id, 'christmas', 3);
while (Date.now() < onceAt.at + 200) await sleep(200);
const xl = pay(D.w, xq.santaRaw), xr = await lot.buy(D.id, xq.id, xl.sig);
assert.ok(xr.ok && xr.refunded, 'Christmas: paid after the draw → refunded in full');
const refund = (await db.query(`select amount_raw, place, to_wallet from public.lottery_payouts where place = 0`))[0];
assert.equal(+refund.amount_raw, xl.arrives); assert.equal(refund.to_wallet, D.w);

console.log('5. Cheats refused: someone else\'s quote, the wrong payer, a closed sale');
await waitOpenWindow();
const cq = await lot.quote(A.id, 'daily-10', 1);
assert.equal((await lot.buy(B.id, cq.id, pay(B.w, cq.santaRaw).sig)).error, 'unknown quote', 'someone else\'s quote');
assert.match((await lot.buy(A.id, cq.id, pay(B.w, cq.santaRaw).sig)).error, /not signed by the player|no SANTA left/, 'paid from another wallet');
for (;;) { const t = Date.now(), at = schedule.nextDraw('daily-10', t); if (at - t <= CLOSE && at - t > 300) break; await sleep(100); }
assert.equal((await lot.quote(A.id, 'daily-10', 1)).closed, true, 'no tickets in the last minutes before a draw');
assert.match((await lot.quote(A.id, 'nope', 1)).error, /unknown lottery/); assert.match((await lot.quote(A.id, 'daily-10', 0)).error, /between 1 and 10,000/);

console.log('6. Escrow mode: the payout worker sends what is owed, once');
await db.query(`update public.lottery_settings set payout_mode = 'auto'`);
await waitOpenWindow();
await buyTickets(A, 'daily-10', 1); await buyTickets(B, 'daily-10', 1);
const ad = (await db.query(`select id, draws_at from public.lottery_draws where kind = 'daily-10' and status = 'open' order by draws_at limit 1`))[0];
while (Date.now() < +new Date(ad.draws_at)) await sleep(200);
await lot.runDraws();
const ap = await db.query('select * from public.lottery_payouts where draw_id = $1', [ad.id]); assert.equal(ap[0].status, 'queued', 'auto mode: queued for the worker');
const sent = []; const fakeChain = { sign: async (r) => ({ signature: ('PayLottery' + r.id).padEnd(88, '5').replace(/[0OIl]/g, '9'), tx: r, blockhash: 'bh' }), send: async (tx) => sent.push(tx.id), status: async () => 'landed' };
await runPayouts({ db, chain: fakeChain, table: 'lottery_payouts' }); await runPayouts({ db, chain: fakeChain, table: 'lottery_payouts' });
assert.equal((await db.query(`select status from public.lottery_payouts where draw_id = $1`, [ad.id]))[0].status, 'sent');
assert.equal(sent.filter((id) => id === +ap[0].id).length, 1, 'sent exactly once');
const man = await db.query(`select tx, attempts from public.lottery_payouts where status = 'manual'`);
assert.ok(man.length >= pays.length + dp.length + 1 && man.every((r) => r.tx === null && r.attempts === 0), 'the worker never touched a payout waiting for Cody');

console.log('7. Books: every drawn draw\'s winners add up to its pot; the lottery wallet = every pot + refunds');
for (const r of await db.query(`select id, pot_raw from public.lottery_draws where status = 'drawn'`)) {
  const s = +(await db.query('select coalesce(sum(amount_raw), 0) s from public.lottery_payouts where draw_id = $1 and place > 0', [r.id]))[0].s;
  assert.equal(s, +r.pot_raw, `draw ${r.id}: winners = pot`);
}
const arrived = +(await db.query('select sum(arrived_raw) s from public.lottery_buys'))[0].s;
const owed = +(await db.query('select sum(pot_raw) s from public.lottery_draws'))[0].s + +(await db.query('select coalesce(sum(amount_raw), 0) s from public.lottery_payouts where place = 0'))[0].s;
assert.equal(arrived, owed, 'everything that arrived is in a pot or owed back as a refund (nothing lost, nothing made up)');
console.log('8. Paid by hand (manual mode): Cody records each send; the chain must show it left the lottery wallet and arrived');
const { createAdmin, adminMessage, b58encode } = await import('../../server/admin.js');
const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']), cody = b58encode(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)));
const nonce = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
const signed = async (fields) => { const message = adminMessage({ at: new Date().toISOString(), nonce: nonce(), ...fields });
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(message))); return { wallet: cody, message, signature: [...sig].map((b) => b.toString(16).padStart(2, '0')).join('') }; };
// Cody's send as the chain records it: the lottery wallet down by `sent`, the winner up by 97% of it (the token's tax).
const handTx = (to, sent, from = LOTTERY) => { const sig = ('HandPay' + (++sigNo)).padEnd(88, '5').replace(/[0OIl]/g, '9'), b = (i, o, x) => ({ accountIndex: i, mint: MINT, owner: o, uiTokenAmount: { amount: String(x), decimals: 6 } });
  txs.set(sig, { blockTime: Math.floor(Date.now() / 1000), meta: { err: null, preTokenBalances: [b(1, from, 1e13), b(2, to, 1e9)], postTokenBalances: [b(1, from, 1e13 - sent), b(2, to, 1e9 + Math.floor(sent * 0.97))] }, transaction: { message: { accountKeys: [] } } }); return sig; };
const admin = createAdmin({ db, adminWallets: [cody], chain, poolWallets: { lottery: LOTTERY }, mint: MINT });
const due = (await db.query(`select id, to_wallet, amount_raw from public.lottery_payouts where status = 'manual' and place = 1 order by id limit 1`))[0];
assert.match((await admin.run(await signed({ action: 'lottery-paid', game: 'lottery', settings: { payout: +due.id, tx: handTx(due.to_wallet, +due.amount_raw - 1) } }))).error, /owed/, 'less than owed: refused');
assert.match((await admin.run(await signed({ action: 'lottery-paid', game: 'lottery', settings: { payout: +due.id, tx: handTx(due.to_wallet, +due.amount_raw, D.w) } }))).error, /lottery wallet sent/, 'not from the lottery wallet: refused (the books must match it)');
assert.match((await admin.run(await signed({ action: 'lottery-paid', game: 'lottery', settings: { payout: +due.id, tx: handTx(A.w === due.to_wallet ? B.w : A.w, +due.amount_raw) } }))).error, /arrived in the winner/, 'sent to someone else: refused');
const good = handTx(due.to_wallet, +due.amount_raw), ok = await admin.run(await signed({ action: 'lottery-paid', game: 'lottery', settings: { payout: +due.id, tx: good } }));
assert.ok(ok.ok, JSON.stringify(ok)); assert.equal((await db.query('select status, tx from public.lottery_payouts where id = $1', [due.id]))[0].tx, good);
const other = (await db.query(`select id from public.lottery_payouts where status = 'manual' order by id limit 1`))[0];
assert.match((await admin.run(await signed({ action: 'lottery-paid', game: 'lottery', settings: { payout: +other.id, tx: good } }))).error, /already recorded/, 'one transaction, one payout');
assert.match((await admin.run(await signed({ action: 'lottery-paid', game: 'lottery', settings: { payout: +due.id, tx: handTx(due.to_wallet, +due.amount_raw) } }))).error, /isn't waiting/, 'already paid: refused');
const replay = await signed({ action: 'lottery-mode', game: 'lottery', settings: { mode: 'manual' } });
assert.equal((await admin.run(replay)).mode, 'manual'); assert.match((await admin.run(replay)).error, /already used/, 'a signed message works once');
assert.equal((await db.query('select payout_mode from public.lottery_settings'))[0].payout_mode, 'manual');
assert.match((await admin.run(await signed({ action: 'lottery-mode', game: 'lottery', settings: { mode: 'sometimes' } }))).error, /auto or manual/);
assert.match((await admin.run(await signed({ action: 'lottery-mode', game: 'spin', settings: { mode: 'auto' } }))).error, /unknown action or game/, 'lottery actions only on the lottery');
console.log('9. Through the real web door: results are public; buying needs sign-in');
const { makeHandler } = await import('../../server/http.js');
const door = makeHandler({ server: {}, lottery: lot, limiter: null, profileFor: async (t) => (t === 'ann' ? A.id : null) });
const ask = async (token, body) => { const r = await door(new Request('http://localhost/', { method: 'POST', headers: { origin: 'http://localhost', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })); return { status: r.status, ...(await r.json()) }; };
const pub = await ask(null, { action: 'lottery' });
assert.equal(pub.status, 200); assert.deepEqual(pub.open.map((o) => o.lottery).sort(), ['daily-10', 'daily-100', 'weekly-10', 'weekly-100'], 'every lottery with a draw ahead is listed (the one-off Christmas-style test draw has run, so it is not)'); assert.ok(pub.recent.length >= 1 && pub.recent[0].secret, 'recent draws show their revealed secret');
assert.ok(pub.open.every((o) => !('secret' in o)), 'open draws never show the secret');
assert.equal((await ask(null, { action: 'lottery-quote', lottery: 'daily-10', n: 1 })).status, 401, 'buying needs sign-in');
await waitOpenWindow(); const wq = await ask('ann', { action: 'lottery-quote', lottery: 'daily-10', n: 2 });
assert.ok(wq.id && wq.pool === LOTTERY && wq.burnBps === 1000 && wq.payer === A.w, 'a signed-in quote: pay the lottery wallet, 10% burned, from your own wallet');
console.log(`OK: lottery end to end: checked payments → numbered tickets → fair draws (re-checked from public data) → exact splits (60/25/15, 1 winner, empty draws), late payments moved or refunded, cheats refused, manual (Cody records each send, checked on the chain) and escrow payouts, books balanced`);
process.exit(0);
