// Paying with SOL, checked on REAL MAINNET without spending anything (Cody, 2026-10-04). Solana can "simulate" a transaction: it
// runs it against the live chain and reports what would happen, but nothing is signed and nothing moves. We build the exact
// transaction the page builds (mockups/pay.js solPurchaseInstructions + purchaseMessage), for a real wallet that holds SOL,
// against the real Jupiter routes and SANTA pools, and check where every coin would land:
//   a game run ($1): the SOL buys the SANTA; 10% of it burned, the rest reaches the pool; the player's own SANTA is untouched
//   a Store item ($1): SOL buys only the burn half, which is burned; the other half reaches the treasury as SOL
//   the season pass ($2): a plain SOL transfer to the treasury, no swap, nothing burned
// Run: node tests/solana/sol-pay-sim.mjs   (read-only: public mainnet RPC + Jupiter's free API)
import assert from 'node:assert/strict';
import * as kit from '@solana/kit';
import * as T22 from '@solana-program/token-2022';
import { solPurchaseInstructions, purchaseMessage } from '../../mockups/pay.js';
import { MINT, livePrice, liveFee, liveSolPrice, lamportsFor, splitPayment, solShares, SOL_FLOOR } from '../../mockups/market.js';
import { JUPITER } from '../../server/verify.js';

const RPC = process.env.RPC || 'https://api.mainnet-beta.solana.com', rpc = kit.createSolanaRpc(RPC);
const call = async (method, params) => { for (let i = 0; ; i++) { // the free public server says "too many requests" quickly: wait and ask again
  const j = await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json().catch(() => ({ error: { message: 'Too many requests' } }));
  if (!j.error) return j.result; if (!/too many/i.test(j.error.message) || i > 8) throw new Error(method + ': ' + j.error.message); await new Promise((r) => setTimeout(r, 1500 * (i + 1))); } };
const lib = { ...T22, get: async (u) => (await fetch(u)).json(), post: async (u, b) => (await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json() };
const ata = async (o) => (await T22.findAssociatedTokenPda({ owner: o, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS, mint: MINT }))[0];

// Real wallets to simulate with: the people behind recent SANTA trades (who paid the fee), ordinary wallets (owned by the
// System program) holding at least 0.1 SOL and a SANTA account (the pool side needs one to receive SANTA).
const sigs = await call('getSignaturesForAddress', [MINT, { limit: 40 }]), wallets = [], seen = new Set();
for (const g of sigs.filter((x) => !x.err)) {
  const t = await call('getTransaction', [g.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 }]).catch(() => null);
  const who = t?.transaction?.message?.accountKeys?.[0]?.pubkey; if (!who || seen.has(who)) continue; seen.add(who);
  const [acc, tok] = (await call('getMultipleAccounts', [[who, await ata(who)], { encoding: 'base64' }])).value;
  if (acc && acc.owner === '11111111111111111111111111111111' && acc.lamports > 0.1e9 && tok) wallets.push(who);
  if (wallets.length >= 2) break;
}
assert.equal(wallets.length, 2, 'found two ordinary wallets holding SOL and SANTA to simulate with');
const [playerAddr, poolAddr] = wallets, treasury = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdVnHbSqazR4t'.replace(/[0OIl]/g, '9'); // any address: SOL just arrives
const [price, fee, solUsd] = [await livePrice(), await liveFee(), (await liveSolPrice()).usd] // the game's own lookup (new Jupiter address, the old as backup);
console.log(`SANTA $${price.usd}, SOL $${solUsd.toFixed(2)}, SANTA's tax ${fee.bps / 100}%`);

const lamportsOf = (a) => (a ? +a.lamports : 0), santaOf = (a) => (a?.data?.parsed?.info?.tokenAmount ? +a.data.parsed.info.tokenAmount.amount : 0);
async function simulate(name, quote, tokens = true) {
  const player = kit.createNoopSigner(kit.address(playerAddr));
  const built = await solPurchaseInstructions(lib, quote, player);
  const msg = await purchaseMessage(kit, rpc, player.address, built);
  const tx = kit.compileTransaction(msg), wire = kit.getBase64EncodedWireTransaction(tx), size = Buffer.from(wire, 'base64').length;
  // the simulator reports at most as many accounts as the transaction touches: the pass (no swap) touches only SOL accounts
  const all = [playerAddr, await ata(playerAddr), await ata(poolAddr), treasury, MINT], watch = tokens ? all : [playerAddr, treasury];
  const at = (list) => all.map((a) => (watch.includes(a) ? list[watch.indexOf(a)] : null)), supply = (a) => (a ? +a.data.parsed.info.supply : 0);
  const pre = at((await call('getMultipleAccounts', [watch, { encoding: 'jsonParsed' }])).value);
  const sim = (await call('simulateTransaction', [wire, { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, accounts: { addresses: watch, encoding: 'jsonParsed' } }])).value;
  if (sim.err) { console.log(sim.logs?.slice(-15).join('\n')); throw new Error(`${name}: the simulation failed: ${JSON.stringify(sim.err)}`); }
  const post = at(sim.accounts), p = built.plan;
  const r = { size, units: sim.unitsConsumed, solIn: built.solIn, solSpent: lamportsOf(pre[0]) - lamportsOf(post[0]), santaLeft: santaOf(post[1]) - santaOf(pre[1]),
    pool: santaOf(post[2]) - santaOf(pre[2]), treasury: lamportsOf(post[3]) - lamportsOf(pre[3]), burned: supply(pre[4]) - supply(post[4]) };
  console.log(`${name}: ${size} bytes (max 1232), ${r.units} compute units; SOL spent ${(r.solSpent / 1e9).toFixed(6)} (~$${(r.solSpent / 1e9 * solUsd).toFixed(3)}), burned ${r.burned / 1e6} SANTA, pool +${r.pool / 1e6} SANTA, treasury +${r.treasury / 1e9} SOL, leftover to the player ${r.santaLeft / 1e6} SANTA`);
  return { r, p, built };
}
const base = (usd, burnBps, pool, store = false) => { const santaRaw = Math.round((usd / price.usd) * 1e6);
  return { id: 'sim', usd, santaRaw, price: price.usd, mint: MINT, fee: { bps: fee.bps, max: fee.max }, burnBps, payer: playerAddr, cluster: 'mainnet', pool,
    solLamports: lamportsFor(usd, solUsd), solUsd, ...(store ? { solStore: true } : {}) }; };
// The player pays EXACTLY the price in SOL (Cody 2026-10-04); the swap's fees come out of what arrives (at least SOL_FLOOR of it).
const FEES = 20_000; // lamports: the network fee and a little slack (no new accounts: these wallets already hold SANTA)
const pct = (a, b) => ((100 * a) / b).toFixed(1) + '%';
// 1. a game run: $1 of SOL, all swapped; 10% of what it bought burned, the rest to the pool
{ const q = base(1, 1000, poolAddr), { r, p, built } = await simulate('game run $1', q), want = splitPayment(q.santaRaw, 1000, q.fee), got = splitPayment(built.santa, 1000, q.fee);
  console.log('   delivered to the pool: ' + pct(r.pool, want.arrives) + ' of what $1 of SANTA would (floor ' + SOL_FLOOR * 100 + '%)');
  assert.ok(built.instructions.some((i) => i.programAddress === JUPITER), 'the swap goes through Jupiter (the server requires it)');
  assert.ok(r.solSpent >= q.solLamports && r.solSpent <= q.solLamports + FEES, 'the player paid exactly the price in SOL (plus the network fee): ' + r.solSpent + ' vs ' + q.solLamports);
  assert.ok(r.burned === got.burn && r.pool >= got.arrives && r.pool >= SOL_FLOOR * want.arrives && r.santaLeft >= 0 && r.treasury === 0, 'game: what the SOL bought is burned 10% and sent on, above the floor'); }
// 2. a Store item: $1; exactly 50% of the price swapped and ALL of it burned; the other 50% to the treasury as SOL
{ const q = base(1, 5000, treasury, true), { r, p, built } = await simulate('Store item $1', q), sh = solShares(q.solLamports, 5000, true);
  console.log('   burned: ' + pct(r.burned, q.santaRaw / 2) + ' of what 50¢ of SANTA would (floor ' + SOL_FLOOR * 100 + '%)');
  assert.ok(r.solSpent >= q.solLamports && r.solSpent <= q.solLamports + FEES, 'the player paid exactly the price in SOL: ' + r.solSpent + ' vs ' + q.solLamports);
  assert.ok(r.burned === built.santa && r.burned >= SOL_FLOOR * q.santaRaw / 2 && r.treasury === sh.treasury && r.santaLeft >= 0, 'item: half bought and all burned, half to the treasury in SOL'); }
// 3. the season pass: $2, all to the treasury as SOL, no swap
{ const q = base(2, 0, treasury, true), { r, p, built } = await simulate('season pass $2', q, false);
  assert.ok(r.burned === 0 && r.treasury === q.solLamports && built.solIn === 0 && r.solSpent <= q.solLamports + FEES, 'pass: a plain SOL transfer of exactly the price, nothing burned, no swap'); }
console.log('OK: paying with SOL at exactly the price works on real mainnet routes (simulated: nothing signed, nothing moved)');