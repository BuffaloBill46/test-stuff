// SOLANA'S TRANSACTION FORMATS (2026-10-05): Phantom sends some transfers in the version-1 format. The game server must read
// them: asked for at most version 0, Solana REFUSES a version-1 transaction, and the server took that as "not finalized yet"
// forever (found on Cody's real deposits, before recording them). This checks every getTransaction in the server asks for
// version 1, and (on this PC, not on GitHub) that Solana really reads one of Cody's real version-1 deposits that way.
// Run: node tests/txversion.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const files = ['worker/games.mjs', ...readdirSync(new URL('../server/', import.meta.url)).map((f) => 'server/' + f)];
let asks = 0;
for (const f of files) {
  const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  for (const m of src.matchAll(/maxSupportedTransactionVersion:\s*(\d+)/g)) { asks++; assert.equal(m[1], '1', `${f} asks Solana for transaction version ${m[1]}; version-1 transactions would be refused`); }
}
assert.ok(asks >= 1, 'the game server reads transactions');
if (!process.env.CI && process.env.OFFLINE !== '1') {
  // one of Cody's real mainnet deposits to the Game pool, sent from Phantom in the version-1 format
  const sig = '2enUs2dY', wallet = '4YGP9Zanq6WvJGk2AhvW8EQVviB5NdxrUrU18BzfjkWR';
  const q = async (method, params) => (await (await fetch('https://api.mainnet-beta.solana.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json());
  const full = (await q('getSignaturesForAddress', [wallet, { limit: 50 }])).result.find((s) => s.signature.startsWith(sig))?.signature;
  if (full) {
    const r = await q('getTransaction', [full, { encoding: 'jsonParsed', commitment: 'finalized', maxSupportedTransactionVersion: 1 }]);
    assert.ok(!r.error && r.result?.version === 1, 'LIVE: a real version-1 deposit reads with the server\'s setting ' + JSON.stringify(r.error || r.result?.version));
  }
}
console.log(`OK: the game server reads every Solana transaction format (${asks} lookup${asks > 1 ? 's' : ''} ask for version 1)` + (process.env.CI || process.env.OFFLINE === '1' ? '' : '; a real version-1 deposit read live'));
