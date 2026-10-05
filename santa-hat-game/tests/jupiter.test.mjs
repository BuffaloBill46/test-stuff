// JUPITER'S ADDRESSES (to-do #12, 2026-10-05; mockups/pay.js viaJupiter): a SOL payment asks the NEW address (api.jup.ag) first;
// when it's busy (429) or down it waits a moment and asks the OLD one (lite-api.jup.ag); it never asks twice when the first
// answers; when both fail, the player sees the real reason. Then, LIVE (read-only, nothing spent): the new address answers a
// real SOL → SANTA quote and the SOL price. Run: node tests/jupiter.test.mjs   (OFFLINE=1 or CI skips the live part: GitHub's shared machines hit Jupiter's no-key limit)
import assert from 'node:assert/strict';
import { JUPS, JUP, viaJupiter } from '../mockups/pay.js';
import { MINT } from '../mockups/market.js';

assert.equal(JUP, 'https://api.jup.ag/swap/v1', 'the new address is the one used');
assert.deepEqual(JUPS.map((u) => new URL(u).host), ['api.jup.ag', 'lite-api.jup.ag'], 'new first, old as the backup');
const B = ['new', 'old'];
let asked = [];
const answer = (plan) => async (b) => { asked.push(b); const r = plan[b]; if (r instanceof Error) throw r; return r; };

asked = []; assert.equal(await viaJupiter(answer({ new: 'A' }), B, 1), 'A'); assert.deepEqual(asked, ['new'], 'the new one answers: asked once');
asked = []; const t0 = Date.now();
assert.equal(await viaJupiter(answer({ new: new Error('the swap service answered 429'), old: 'B' }), B, 300), 'B');
assert.ok(asked.join() === 'new,old' && Date.now() - t0 >= 280, 'busy (429): waits, then the old one');
asked = []; assert.equal(await viaJupiter(answer({ new: new Error('Failed to fetch'), old: 'C' }), B, 5000), 'C');
assert.deepEqual(asked, ['new', 'old'], "down: the old one, at once");
await assert.rejects(viaJupiter(answer({ new: new Error('the swap service answered 429'), old: new Error('the swap service answered 503') }), B, 1),
  /503/, 'both fail: the last real reason reaches the player');

if (process.env.OFFLINE !== '1' && !process.env.CI) {
  const WSOL = 'So11111111111111111111111111111111111111112';
  const q = await (await fetch(`${JUP}/quote?inputMint=${WSOL}&outputMint=${MINT}&amount=10000000&slippageBps=50`)).json();
  assert.ok(+q.otherAmountThreshold > 0 && q.outputMint === MINT, 'LIVE: the new address quotes SOL → SANTA ' + JSON.stringify(q).slice(0, 120));
  const p = await (await fetch(`https://api.jup.ag/price/v3?ids=${WSOL}`)).json();
  assert.ok(+p?.[WSOL]?.usdPrice > 0, 'LIVE: and the SOL price');
}
console.log('OK: Jupiter: the new address first; busy → wait → the old one; down → the old one; both down → the real reason' + (process.env.OFFLINE === '1' || process.env.CI ? '' : '; live quote + price from the new address'));
