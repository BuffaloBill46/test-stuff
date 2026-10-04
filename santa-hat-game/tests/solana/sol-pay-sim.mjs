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
import { MINT, livePrice, liveFee } from '../../mockups/market.js';

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
const [price, fee, solUsd] = [await livePrice(), await liveFee(), (await lib.get('https://lite-api.jup.ag/price/v3?ids=' + 'So11111111111111111111111111111111111111112'))['So11111111111111111111111111111111111111112'].usdPrice];
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
  return { r, p };
}
const base = (usd, burnBps) => ({ id: 'sim', usd, santaRaw: Math.round((usd / price.usd) * 1e6), price: price.usd, mint: MINT, fee: { bps: fee.bps, max: fee.max }, burnBps, payer: playerAddr, cluster: 'mainnet' });

// 1. a game run: $1, 10% burned, the rest to the pool, all in SANTA
{ const { r, p } = await simulate('game run $1', { ...base(1, 1000), pool: poolAddr });
  assert.ok(r.burned === p.split.burn && r.pool >= p.split.arrives && r.santaLeft >= 0 && r.treasury === 0, 'game: burn exact, the pool got at least what the split says, the player\'s own SANTA untouched'); }
// 2. a Store item: $1, half burned (SANTA bought with SOL), half to the treasury as SOL
{ const q = { ...base(1, 5000), pool: treasury }, s = (await import('../../mockups/market.js')).splitPayment(q.santaRaw, 5000, q.fee);
  q.solLamports = Math.ceil(((q.usd * (q.santaRaw - s.burn)) / q.santaRaw / solUsd) * 1e9);
  const { r, p } = await simulate('Store item $1', q);
  assert.ok(r.burned === p.split.burn && r.treasury === q.solLamports && r.santaLeft >= 0, 'item: the burn half bought and burned, the other half to the treasury in SOL'); }
// 3. the season pass: $2, all to the treasury as SOL, no swap
{ const q = { ...base(2, 0), pool: treasury }; q.solLamports = Math.ceil((2 / solUsd) * 1e9);
  const { r, p } = await simulate('season pass $2', q, false);
  assert.ok(r.burned === 0 && r.treasury === q.solLamports && r.solIn === 0 && p.gross === 0, 'pass: a plain SOL transfer, nothing burned, no swap'); }
console.log('OK: paying with SOL works on real mainnet routes (simulated: nothing signed, nothing moved)');
