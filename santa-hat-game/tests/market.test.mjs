// Live price and tax: the pure rules, then (if the network answers) the real token.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MINT, pickPrice, pickFee, feeOn, santaFor, livePrice, liveFee } from '../mockups/market.js';

// Deepest pool wins, other tokens ignored.
const dex = { pairs: [
  { baseToken: { address: MINT }, priceUsd: '0.0009', dexId: 'small', liquidity: { usd: 500 } },
  { baseToken: { address: MINT }, priceUsd: '0.00085', dexId: 'raydium', liquidity: { usd: 93000 } },
  { baseToken: { address: 'other' }, priceUsd: '5', dexId: 'x', liquidity: { usd: 1e9 } },
] };
assert.deepEqual(pickPrice(dex), { usd: 0.00085, pool: 'raydium', liquidity: 93000 });
assert.equal(pickPrice({ pairs: [] }), null);
assert.ok(Math.abs(santaFor(1, { usd: 0.00085 }) - 1176.47) < 0.01);

// Older vs newer fee by epoch; fee rounds up and is capped.
const info = { decimals: 6, extensions: [{ extension: 'transferFeeConfig', state: {
  olderTransferFee: { epoch: 900, maximumFee: 1e15, transferFeeBasisPoints: 300 },
  newerTransferFee: { epoch: 1100, maximumFee: 5000, transferFeeBasisPoints: 500 } } }] };
assert.equal(pickFee(info, 1099).bps, 300, 'before the newer fee starts, the older one applies');
assert.equal(pickFee(info, 1100).bps, 500, 'from its epoch on, the newer one applies');
assert.equal(feeOn(1001, { bps: 300, max: 1e15 }), 31, '3% of 1001 is 30.03, rounded up to 31');
assert.equal(feeOn(1e9, { bps: 500, max: 5000 }), 5000, 'capped at the maximum fee');
assert.equal(pickFee({ decimals: 6, extensions: [] }, 1).bps, 0);

// The real thing (skipped quietly only if offline, and says so).
try {
  const [p, f] = await Promise.all([livePrice(), liveFee()]);
  assert.ok(p.usd > 0); assert.equal(f.decimals, 6);
  console.log(`live: 1 SANTA = $${p.usd} (${p.pool}, $${Math.round(p.liquidity).toLocaleString()} liquidity) · $1 ≈ ${Math.round(1 / p.usd).toLocaleString()} SANTA · token tax ${f.bps / 100}% at epoch ${f.epoch}`);
  if (f.bps !== 300) console.log('NOTE: the token tax is no longer 3%; the game math (FEE in slots.js) must be updated.');
  // The server reads the tax of the token IT accepts, on its own network: here the devnet test token, from devnet.
  const { mint: testMint, rpc: devnetRpc } = JSON.parse(readFileSync(new URL('../devnet.json', import.meta.url), 'utf8'));
  const d = await liveFee(testMint, [devnetRpc]);
  assert.equal(d.bps, 300, 'the devnet test token has a 3% tax'); assert.notEqual(d.epoch, f.epoch, 'read from devnet (its own epoch), not mainnet');
  console.log(`live devnet: test token tax ${d.bps / 100}% at devnet epoch ${d.epoch}`);
} catch (e) { if (e.code === 'ERR_ASSERTION') throw e; console.log('live lookup skipped (network):', e.message); }
console.log('OK: price pick, fee by epoch, fee rounding and cap');
