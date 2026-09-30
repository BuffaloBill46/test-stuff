// The smoothed SANTA price: a short pump or dump barely moves the price the game uses (audit 2026-09-30).
import assert from 'node:assert/strict';
import { makeDb } from './setup.mjs';
import { makePrice } from '../../server/price.js';

const db = await makeDb(); let t = Date.parse('2026-12-01T10:00:00Z'), live = 0.00085, fetches = 0;
const price = makePrice({ db, livePrice: async () => { fetches++; return { usd: live }; }, now: () => t });
const step = async (min, usd) => { t += min * 60_000; live = usd; return (await price()).usd; };
for (let i = 0; i < 10; i++) await step(1, 0.00085);                     // a calm 10 minutes
assert.equal(await step(1, 0.0017), 0.00085, 'a 1-minute pump to 2× moves nothing');
assert.equal(await step(1, 0.0017), 0.00085, 'a 2-minute pump still moves nothing');
assert.equal(await step(1, 0.0017), 0.00085, 'nor 3 minutes');
for (let i = 0; i < 8; i++) await step(1, 0.0017);
assert.equal((await price()).usd, 0.0017, 'a price that really stays up is followed (within about 5 minutes)');
// Called often: at most one live reading per minute (the rest come from the database).
const before = fetches; for (let i = 0; i < 20; i++) { t += 1000; await price(); }
assert.ok(fetches - before <= 1, 'many requests, at most one live reading per minute');
// The price feed goes down: keep using recent samples; with none at all, refuse (a play can't be priced).
const down = makePrice({ db, livePrice: async () => { throw new Error('feed down'); }, now: () => t + 30_000 });
assert.ok((await down()).usd > 0);
const empty = makePrice({ db: await makeDb(), livePrice: async () => { throw new Error('feed down'); }, now: () => t });
await assert.rejects(() => empty(), /feed down|no recent/);
console.log('OK: smoothed price: 1–3 minute pumps change nothing, a lasting move is followed, one live reading per minute, feed outages handled');
