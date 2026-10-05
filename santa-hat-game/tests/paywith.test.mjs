// Pay with SANTA or SOL (Cody 2026-10-04): which one the wallet step uses (mockups/wallet.js chooseMethod). Devnet: always SANTA
// (no swaps there). A remembered choice wins. "Auto": SANTA when the wallet holds enough for this price, otherwise SOL (also with
// no SANTA account at all); if the balance can't be read for another reason, SANTA, as before SOL existed. Run: node tests/paywith.test.mjs
import assert from 'node:assert/strict';
globalThis.window = new EventTarget(); // wallet.js listens for wallets announcing themselves
const { chooseMethod } = await import('../mockups/wallet.js');
const { payWithHtml } = await import('../mockups/paywith.js');
const t22 = { TOKEN_2022_PROGRAM_ADDRESS: 'T22', findAssociatedTokenPda: async ({ owner }) => [owner + '-ata'] };
const rpcWith = (answer) => ({ getTokenAccountBalance: () => ({ send: async () => { if (answer instanceof Error) throw answer; return { value: { amount: String(answer) } }; } }) });
const q = (cluster = 'mainnet') => ({ cluster, mint: 'M', santaRaw: 1_000_000 });
assert.equal(await chooseMethod(q('devnet'), rpcWith(0), t22, 'me', 'sol'), 'santa', 'devnet: SANTA even if SOL was picked');
assert.equal(await chooseMethod(q(), rpcWith(5e9), t22, 'me', 'sol'), 'sol', 'picked SOL: SOL, even with SANTA in the wallet');
assert.equal(await chooseMethod(q(), rpcWith(0), t22, 'me', 'santa'), 'santa', 'picked SANTA: SANTA');
assert.equal(await chooseMethod(q(), rpcWith(1_000_000), t22, 'me', 'auto'), 'santa', 'auto, exactly enough SANTA: SANTA');
assert.equal(await chooseMethod(q(), rpcWith(999_999), t22, 'me', 'auto'), 'sol', 'auto, one short: SOL');
assert.equal(await chooseMethod(q(), rpcWith(Object.assign(new Error('Solana error #8100002'), { context: { __code: -32602, __serverMessage: 'Invalid param: could not find account' } })), t22, 'me', 'auto'), 'sol', 'auto, no SANTA account: SOL');
assert.equal(await chooseMethod(q(), rpcWith(new Error('fetch failed')), t22, 'me', 'auto'), 'santa', 'auto, balance unreadable: SANTA');
// the switch (Cody 2026-10-05: "Remove the auto option"; "Default to santa"): just SANTA | SOL, SANTA unless SOL was picked
const { payWith } = await import('../mockups/paywith.js');
const h = payWithHtml();
assert.ok(/aria-pressed="true">SANTA/.test(h) && (h.match(/data-paywith=/g) || []).length === 2 && !/Auto/.test(h), 'the switch: SANTA | SOL, SANTA pressed, no Auto');
assert.equal(payWith(), 'santa', 'nothing picked: SANTA');
console.log('OK: pay with: devnet SANTA only; a picked SANTA or SOL wins; the switch is SANTA | SOL with SANTA by default (no Auto)');
