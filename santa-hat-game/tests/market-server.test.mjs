// The server's public "market" answer (server/games.js market(), server/http.js): the price quotes use and the token's tax, for
// the page's info line. A half that can't be read is LEFT OUT, never guessed; the tax is kept a minute (one network call per
// minute, not one per visitor); it answers without a sign-in. Run: node market-server.test.mjs
import assert from 'node:assert/strict';
import { createGameServer } from '../server/games.js';
import { makeHandler } from '../server/http.js';

let feeCalls = 0, feeFails = false, priceFails = false;
const server = createGameServer({ db: { query: async () => { throw new Error('market must not need the database here'); } }, chain: {},
  livePrice: async () => { if (priceFails) throw new Error('no price'); return { usd: 0.0021, samples: 7 }; },
  liveFee: async () => { feeCalls++; if (feeFails) throw new Error('no fee'); return { bps: 300, max: 5e15 }; }, poolWallets: {} });

assert.deepEqual(await server.market(), { usd: 0.0021, fee: { bps: 300, max: 5e15 } }, 'both halves');
await server.market(); await server.market();
assert.equal(feeCalls, 1, 'the tax is read once a minute, not per request');

const bare = createGameServer({ db: {}, chain: {}, livePrice: async () => { throw new Error('x'); }, liveFee: async () => { throw new Error('y'); }, poolWallets: {} });
assert.deepEqual(await bare.market(), {}, 'nothing readable → nothing claimed (no made-up 3%)');
priceFails = true;
assert.deepEqual(await server.market(), { fee: { bps: 300, max: 5e15 } }, 'price down → only the tax');

// Through the web door: public (no sign-in), answers 200.
const handle = makeHandler({ server, limiter: null, profileFor: async () => null });
const r = await handle(new Request('http://x/', { method: 'POST', headers: { origin: 'https://buffalobill46.github.io' }, body: JSON.stringify({ action: 'market' }) }));
assert.equal(r.status, 200, 'public: no sign-in needed');
assert.deepEqual(await r.json(), { fee: { bps: 300, max: 5e15 } });
console.log('OK: market answers the price + tax, leaves out what it cannot read, reads the tax once a minute, and is public');
