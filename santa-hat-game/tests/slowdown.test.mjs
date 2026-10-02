// The page waits out the server's speed limit instead of failing a play (mockups/slowdown.js): a "slowDown" reply is sent
// again after the wait it asks for (1–10 s), any other reply comes straight back, and it gives up after 20 waits.
// Run: node slowdown.test.mjs
import assert from 'assert/strict';
import { withSlowDown } from '../mockups/slowdown.js';
const slept = [], sleep = async (ms) => { slept.push(ms); };
let n = 0;
let r = await withSlowDown(async () => (++n <= 2 ? { error: 'slow down', slowDown: true, retryAfter: n === 1 ? 3 : 99 } : { r: { pay: 1 } }), { sleep });
assert.deepEqual(r, { r: { pay: 1 } }); assert.equal(n, 3, 'sent again until it went through'); assert.deepEqual(slept, [3000, 10000], 'waits what it asks for, at most 10 s');
slept.length = 0; n = 0;
r = await withSlowDown(async () => { n++; return { error: 'the pool is refilling', refunded: true }; }, { sleep });
assert.equal(n, 1); assert.equal(slept.length, 0, 'other answers (even errors) are not retried'); assert.equal(r.refunded, true);
n = 0; r = await withSlowDown(async () => { n++; return { slowDown: true, retryAfter: 1 }; }, { sleep });
assert.equal(n, 21, 'gives up after 20 waits'); assert.equal(r.slowDown, true);
console.log('OK: slow-down replies are waited out and resent (1–10 s each, up to 20 times); everything else comes straight back');
