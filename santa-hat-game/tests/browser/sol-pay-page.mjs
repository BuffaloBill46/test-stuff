// PAY WITH SOL, THE REAL PAGE PATH (Cody 2026-10-04), checked on mainnet WITHOUT SPENDING ANYTHING. In a real browser:
//   1. the "Pay with" switch: hidden until the server says mainnet; then on the Store and under each game; Auto by default;
//      picking SOL shows everywhere and is remembered after a reload;
//   2. the page's own wallet step (wallet.js santaPay: the Solana toolkit from the CDN, Jupiter called from the browser, the
//      lookup tables) builds the payment for a REAL mainnet wallet. A stand-in wallet, instead of signing and sending, hands
//      the transaction to Solana's simulator: the network runs it against the live chain and reports what would happen, but
//      nothing is signed and nothing moves. A game run ($1) and a Store item ($1) must both come out exactly as the quote says.
// Run: node --import ./win-chrome.mjs sol-pay-page.mjs   (needs the internet: CDN, Jupiter, public Solana servers)
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
import { MINT, livePrice, liveFee, splitPayment, liveSolPrice, lamportsFor } from '../../mockups/market.js';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const SIM_RPC = 'https://api.mainnet-beta.solana.com';
const call = async (method, params) => { for (let i = 0; ; i++) {
  const j = await (await fetch(SIM_RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json().catch(() => ({ error: { message: 'Too many requests' } }));
  if (!j.error) return j.result; if (!/too many/i.test(j.error.message) || i > 8) throw new Error(method + ': ' + j.error.message); await new Promise((r) => setTimeout(r, 1500 * (i + 1))); } };

// Real wallets: the people behind recent SANTA trades, ordinary wallets holding at least 0.1 SOL and a SANTA account.
const solReq = createRequire(new URL('../solana/package.json', import.meta.url)); // the Solana toolkit the tests/solana folder installs
const T22 = solReq('@solana-program/token-2022');
const ata = async (o) => (await T22.findAssociatedTokenPda({ owner: o, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS, mint: MINT }))[0];
const wallets = [], seen = new Set();
for (const g of (await call('getSignaturesForAddress', [MINT, { limit: 40 }])).filter((x) => !x.err)) {
  const t = await call('getTransaction', [g.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 }]).catch(() => null);
  const who = t?.transaction?.message?.accountKeys?.[0]?.pubkey; if (!who || seen.has(who)) continue; seen.add(who);
  const [acc, tok] = (await call('getMultipleAccounts', [[who, await ata(who)], { encoding: 'base64' }])).value;
  if (acc && acc.owner === '11111111111111111111111111111111' && acc.lamports > 0.1e9 && tok) wallets.push(who);
  if (wallets.length >= 2) break;
}
if (wallets.length < 2) throw new Error('no wallets to simulate with');
const [PAYER, POOL] = wallets, TREASURY = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdVnHbSqazR4t'.replace(/[0OIl]/g, '9');
const [price, fee, sol] = [await livePrice(), await liveFee(MINT, [SIM_RPC]), await liveSolPrice()];
const base = (usd, burnBps, pool) => ({ id: 'sim', kind: 'x', usd, santaRaw: Math.round((usd / price.usd) * 1e6), price: price.usd, mint: MINT, fee: { bps: fee.bps, max: fee.max }, burnBps, payer: PAYER, cluster: 'mainnet', pool });
const gameQ = base(1, 1000, POOL), itemQ = base(1, 5000, TREASURY);
{ const s = splitPayment(itemQ.santaRaw, 5000, itemQ.fee); itemQ.solLamports = lamportsFor((1 * (itemQ.santaRaw - s.burn)) / itemQ.santaRaw, sol.usd); itemQ.solUsd = sol.usd; }

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), errors = [];
let cluster = 'mainnet', relayed = 0;
await ctx.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.startsWith('http://localhost:8797/')) { const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'rpc') { relayed++; // the game server's relay (server/relay.js), answered from here
      const j = await call(b.method, b.params).then((result) => ({ jsonrpc: '2.0', result }), (e) => ({ jsonrpc: '2.0', error: { code: -32602, message: e.message.replace(/^\w+: /, '') } }));
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(j) }); }
    if (b.action === 'market') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ cluster, usd: price.usd }) });
    return route.fulfill({ contentType: 'application/json', body: b.action === 'burned' ? '{"gamesRaw":0,"lotteryRaw":0,"storeRaw":0,"totalRaw":0}' : '{"error":"stand-in"}' }); }
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (/solana-rpc\.publicnode\.com/.test(url)) return route.abort(); // as on a home network that blocks it: the page must read Solana through the game server
  if (/lite-api\.jup\.ag|api\.mainnet-beta\.solana\.com/.test(url)) return route.continue(); // the real thing
  if (url.startsWith('https://local.test/')) { const f = path.join(ROOT, url.replace('https://local.test/', '').split('#')[0].split('?')[0]); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.abort();
});
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
p.on('requestfailed', (r) => { if (!/local.test|localhost/.test(r.url())) console.log('    (request failed: ' + r.url().slice(0, 90) + ' ' + r.failure()?.errorText + ')'); });
const open = async () => { await p.goto('https://local.test/online.html?net=local&server=http://localhost:8797&token=test&t=' + Date.now() + '#store', { timeout: 90000 }) /* a fresh address each time: the same one ending in #store only scrolls, it doesn't reload */; await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(2500); };
const switches = () => p.evaluate(() => [...document.querySelectorAll('[data-paywith-slot]')].map((e) => ({ hidden: e.hidden, on: e.querySelector('[aria-pressed="true"]')?.textContent })));

console.log('1. the Pay with switch');
cluster = 'devnet'; await open();
check((await switches()).every((s) => s.hidden), 'devnet: no Pay with switch (no swaps there)');
cluster = 'mainnet'; await open();
let sw = await switches();
check(sw.length === 4 && sw.every((s) => !s.hidden && s.on === 'Auto'), `mainnet: the switch on the Store and under each game, Auto (${JSON.stringify(sw)})`);
await p.click('#tab-store [data-paywith="sol"]'); sw = await switches();
check(sw.every((s) => s.on === 'SOL'), 'picking SOL on the Store shows SOL everywhere');
await open(); sw = await switches();
check(sw.every((s) => s.on === 'SOL'), 'remembered after a reload');
await p.screenshot({ path: 'out/sol-pay-switch.png', clip: { x: 0, y: 0, width: 1280, height: 700 } });

console.log('2. the page\'s own wallet step, simulated on mainnet');
await p.exposeFunction('__rpc', (method, params) => call(method, params).then((result) => ({ result }), (e) => ({ error: { message: e.message } })));
const run = (quote, watch) => p.evaluate(async ({ quote, watch, rpc }) => {
  const sim = {};
  window.santaWallet = { chains: ['solana:mainnet'], accounts: [{ address: quote.payer }], features: {
    'solana:signAndSendTransaction': { signAndSendTransaction: async ({ transaction }) => {
      const wire = btoa(String.fromCharCode(...transaction)); sim.size = transaction.length;
      const body = (method, params) => window.__rpc(method, params); // run by the test program: Solana's public server refuses browsers
      sim.pre = (await body('getMultipleAccounts', [watch, { encoding: 'jsonParsed' }])).result?.value;
      const r = (await body('simulateTransaction', [wire, { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, accounts: { addresses: watch, encoding: 'jsonParsed' } }]));
      sim.err = r.error?.message || r.result?.value?.err || null; sim.post = r.result?.value?.accounts; sim.logs = r.result?.value?.logs?.slice(-6);
      throw new Error('captured (stand-in wallet: simulated, not sent)'); } } } };
  const { santaPay } = await import('./wallet.js');
  try { await santaPay(quote); } catch (e) { sim.thrown = e.message; }
  return sim;
}, { quote, watch, rpc: SIM_RPC });
const lam = (a) => (a ? +a.lamports : 0), tok = (a) => (a?.data?.parsed?.info?.tokenAmount ? +a.data.parsed.info.tokenAmount.amount : 0), sup = (a) => (a ? +a.data.parsed.info.supply : 0);
const delta = (s, i, f) => f(s.post?.[i]) - f(s.pre?.[i]);
{ const watch = [PAYER, await ata(PAYER), await ata(POOL), MINT], s = await run(gameQ, watch), sp = splitPayment(gameQ.santaRaw, 1000, gameQ.fee);
  check(/captured/.test(s.thrown || '') && !s.err, `game run $1 built by the page and simulated: ${s.err ? JSON.stringify(s.err) + ' ' + (s.logs || []).join(' | ') : s.size ? s.size + ' bytes, ok' : 'never reached the wallet: ' + s.thrown}`);
  check(delta(s, 3, sup) === -sp.burn && delta(s, 2, tok) >= sp.arrives && delta(s, 1, tok) >= 0,
    `game run: burned ${-delta(s, 3, sup) / 1e6} (quote ${sp.burn / 1e6}), pool +${delta(s, 2, tok) / 1e6} (≥ ${sp.arrives / 1e6}), the player's own SANTA untouched (+${delta(s, 1, tok) / 1e6}); SOL spent ${(-delta(s, 0, lam) / 1e9).toFixed(6)}`); }
{ const watch = [PAYER, await ata(PAYER), TREASURY, MINT], s = await run(itemQ, watch), sp = splitPayment(itemQ.santaRaw, 5000, itemQ.fee);
  check(/captured/.test(s.thrown || '') && !s.err, `Store item $1 built by the page and simulated: ${s.err ? JSON.stringify(s.err) + ' ' + (s.logs || []).join(' | ') : s.size ? s.size + ' bytes, ok' : 'never reached the wallet: ' + s.thrown}`);
  check(delta(s, 3, sup) === -sp.burn && delta(s, 2, lam) === itemQ.solLamports && delta(s, 1, tok) >= 0,
    `Store item: burned ${-delta(s, 3, sup) / 1e6} (quote ${sp.burn / 1e6}), treasury +${delta(s, 2, lam)} lamports (quote ${itemQ.solLamports}); SOL spent ${(-delta(s, 0, lam) / 1e9).toFixed(6)}`); }
check(relayed > 0, `with publicnode blocked, the page read Solana through the game server (${relayed} reads)`);
check(!errors.length, 'no page errors ' + errors.slice(0, 3).join(' | '));
await browser.close();
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
