// The game server's backup Solana reads for the wallet step (server/relay.js, 2026-10-04): only the five read-only lookups pass;
// sending a transaction, or anything else, is refused before Solana is asked; oversized or malformed params refused; Solana's
// own answer (a result, or an error like "no such account") comes back as Solana gave it. Run: node tests/relay.test.mjs
import assert from 'node:assert/strict';
import { makeRelay, RELAY_METHODS } from '../server/relay.js';
const asked = [], relay = makeRelay(async (m, p) => { asked.push(m); return m === 'getTokenAccountBalance' ? { error: { code: -32602, message: 'Invalid param: could not find account' } } : { result: { m } }; });
assert.deepEqual(RELAY_METHODS, ['getLatestBlockhash', 'getTokenAccountBalance', 'getMultipleAccounts', 'getAccountInfo', 'getSignatureStatuses']);
for (const m of ['sendTransaction', 'requestAirdrop', 'getProgramAccounts', 'simulateTransaction', '__proto__', '']) assert.match((await relay(m, [])).error, /not relayed/, m + ' refused');
assert.match((await relay('getAccountInfo', 'x')).error, /bad lookup/); assert.match((await relay('getAccountInfo', ['a'.repeat(9000)])).error, /bad lookup/);
assert.equal(asked.length, 0, 'nothing refused ever reached Solana');
assert.deepEqual(await relay('getLatestBlockhash', []), { jsonrpc: '2.0', result: { m: 'getLatestBlockhash' } });
assert.deepEqual((await relay('getTokenAccountBalance', ['x'])).error.message, 'Invalid param: could not find account', 'Solana\'s own error comes back as an answer');
console.log('OK: relay: only the 5 read-only lookups; sending and everything else refused before Solana is asked; Solana\'s answers passed back as given');
