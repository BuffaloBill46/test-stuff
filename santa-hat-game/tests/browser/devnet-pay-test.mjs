// The REAL payment path on DEVNET, in a real browser: the page's own wallet step (mockups/wallet.js → pay.js) builds the
// purchase, a stand-in Wallet Standard wallet signs it with the devnet test player's key and SENDS IT TO DEVNET (exactly what
// Phantom does after the player taps Approve), wallet.js waits for FINALIZED, and the real server code checks that real
// finalized transaction before making the plays. Then the payout worker (live chain adapter) sends the winnings on devnet.
// Only stand-ins: the wallet's approval popup, and the database (PGlite, the real SQL). Uses the chain test's own pool
// wallet, so the live pools stay untouched. Needs: tests/solana/devnet-setup.mjs and chain.devnet.mjs run once (keys).
// Run (WSL, Playwright installed globally): node devnet-pay-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path'; import http from 'http';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const kit = await import('../solana/node_modules/@solana/kit/dist/index.node.mjs');
const T22 = await import('../solana/node_modules/@solana-program/token-2022/dist/src/index.mjs');
const { makeDb } = await import('../db/setup.mjs');
const { createGameServer } = await import('../../server/games.js');
const { makeHandler } = await import('../../server/http.js');
const { makeLimiter, memoryStore } = await import('../../server/ratelimit.js');
const { runPayouts } = await import('../../server/payouts.js');
const { makeSolanaChain } = await import('../../server/solanachain.js');
const { liveFee } = await import('../../mockups/market.js');
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const cfg = JSON.parse(readFileSync(new URL('../../devnet.json', import.meta.url), 'utf8')), { mint } = cfg;
const KEYS = process.env.SANTA_KEYS || '/mnt/c/santa-devnet-keys';
const keyBytes = (n) => new Uint8Array(JSON.parse(readFileSync(path.join(KEYS, n + '.json'), 'utf8')));
const player = await kit.createKeyPairSignerFromBytes(keyBytes('player')), pool = await kit.createKeyPairSignerFromBytes(keyBytes('chainTestPool'));
const playerKeys = await kit.createKeyPairFromBytes(keyBytes('player'));
const rpc = kit.createSolanaRpc(cfg.rpc);
const ata = async (o) => (await T22.findAssociatedTokenPda({ owner: o, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS, mint }))[0];
const bal = async (o) => BigInt((await rpc.getTokenAccountBalance(await ata(o), { commitment: 'finalized' }).send()).value.amount);

// --- the server: real code, real SQL (PGlite), REAL devnet for reading payments
const db = await makeDb();
const me = await db.player(player.address, 'Cody');
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', $1, '{}'), ('slots', $1, '{}')`, [String(await bal(pool.address))]);
const chain = { async getTransaction(sig) { // what the Edge Function does (supabase/functions/games/index.ts)
  const r = await fetch(cfg.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [sig, { encoding: 'jsonParsed', commitment: 'finalized', maxSupportedTransactionVersion: 0 }] }) });
  return (await r.json()).result ?? null; } };
const PRICE = cfg.priceUsdAtSetup, feeOf = () => liveFee(mint, [cfg.rpc]);
const server = createGameServer({ db, chain, livePrice: async () => ({ usd: PRICE }), liveFee: feeOf, poolWallets: { spin: pool.address, slots: pool.address }, mint, cluster: 'devnet' });
// The real server always has a lottery (supabase/functions/games/index.ts); without one the page's public "lottery" request got
// 400 "unknown action". This payment test needs no real draws (lottery-test.mjs covers them), so: none open.
const noDraws = { draws: async () => ({ open: [], recent: [] }), tickets: async () => ({ error: 'no such draw' }) };
const noShop = { tickets: async () => ({ free: 10, extra: 0, held: 0, resetsAt: Date.now() + 864e5 }) }; // the ticket chip (shop-db.test.mjs covers the real one)
const handle = makeHandler({ lottery: noDraws, shop: noShop, limiter: makeLimiter({ store: memoryStore() }), server, profileFor: async (t) => (t === 'test-token' ? me : null) });
const web = http.createServer(async (req, res) => {
  if (req.method === 'GET') { const pth = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'online.html');
    if (!pth.startsWith(ROOT) || !existsSync(pth)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': pth.endsWith('.js') ? 'text/javascript' : pth.endsWith('.png') ? 'image/png' : 'text/html' }); return res.end(readFileSync(pth)); }
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await handle(new Request('http://localhost:8788' + req.url, { method: req.method, headers: req.headers, body: Buffer.concat(chunks) }));
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8788);

// --- the page, with a stand-in wallet that signs with the devnet player key and sends to devnet
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }); const errors = [];
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.startsWith('http://localhost:8788/') || url.startsWith(cfg.rpc)) return route.continue(); // the page talks to devnet for real
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  return route.fulfill({ status: 503, body: 'offline in tests' }); });
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/503/.test(m.text())) errors.push(m.text()); });
let signed = 0;
await p.exposeFunction('walletSignAndSend', async (bytes) => { // Phantom's job: sign the bytes it was given, send them
  const tx = kit.getTransactionDecoder().decode(new Uint8Array(bytes));
  const s = await kit.signTransaction([playerKeys], tx); signed++;
  await rpc.sendTransaction(kit.getBase64EncodedWireTransaction(s), { encoding: 'base64', preflightCommitment: 'confirmed' }).send();
  return [...kit.getBase58Encoder().encode(kit.getSignatureFromTransaction(s))];
});
await p.addInitScript((addr) => { window.santaWallet = { name: 'Test wallet', chains: ['solana:devnet'], accounts: [{ address: addr }],
  features: { 'solana:signAndSendTransaction': { signAndSendTransaction: async ({ transaction }) => [{ signature: new Uint8Array(await window.walletSignAndSend([...transaction])) }] } } }; }, player.address);

const before = { player: await bal(player.address), pool: await bal(pool.address) };
await p.goto('http://localhost:8788/online.html?net=local&server=' + encodeURIComponent('http://localhost:8788/api') + '&token=test-token', { timeout: 90000 });
await p.waitForFunction(() => window.__sq, null, { timeout: 60000 });
await p.evaluate(() => document.querySelector('#t-games').click()); await p.waitForFunction(() => window.__slots, null, { timeout: 90000 });
console.log('Buying Snowball Drop 5 × 10¢ with a real devnet transaction (finalizing takes ~15–30 s)…');
// The Drop board only animates while it is on screen (it rests otherwise, to save phones), so bring it into view first.
await p.evaluate(() => document.querySelector('#drop').scrollIntoView({ block: 'start' })); await p.waitForTimeout(600);
await p.evaluate(() => { document.querySelector('#drop [data-dbet="0.1"]').click(); document.querySelector('#drop [data-run="5"]').click(); });
await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 });
await p.evaluate(() => document.querySelector('#buyGo').click());
const t0 = Date.now();
await p.waitForFunction(() => window.__drop?.opening || /Not paid|cancelled|isn't confirmed|error/i.test(document.querySelector('#buyNote').textContent), null, { timeout: 180000 }).catch(() => {});
console.log(`  buy note: "${await p.textContent('#buyNote')}" after ${Math.round((Date.now() - t0) / 1000)} s`);
await p.waitForTimeout(800); await p.evaluate(() => document.querySelector('#drop .skip:not([hidden])')?.click());
await p.waitForFunction(() => !window.__drop?.opening && window.__drop?.flying === 0, null, { timeout: 400000 });

const run = (await db.query('select * from public.runs where profile_id = $1', [me]))[0];
check(signed === 1, 'the wallet was asked to sign exactly once');
check(!!run && run.n === 5 && !!run.paid_at, 'the server accepted the REAL finalized devnet payment and finished the run of 5');
const pay = (await db.query('select * from public.payments'))[0];
const after = { player: await bal(player.address), pool: await bal(pool.address) };
check(pay && before.player - after.player === BigInt(pay.paid_raw), `the player's devnet balance fell by exactly what the server booked (${pay?.paid_raw})`);
check(pay && after.pool - before.pool === BigInt(pay.arrived_raw), `the pool's devnet balance rose by exactly what the server booked as arrived (${pay?.arrived_raw})`);
const q = (await db.query('select santa_raw from public.quotes where used_by is not null'))[0];
check(pay && +pay.paid_raw === +q.santa_raw, 'paid exactly the quoted SANTA');
const plays = await db.query('select state, pay_raw from public.plays where run_id = $1', [run?.id ?? 0]);
check(plays.length === 5 && plays.every((x) => x.state === 'settled'), 'all 5 plays settled');
const wonRaw = plays.reduce((a, x) => a + +x.pay_raw, 0);
console.log(`  run won ${wonRaw / 1e6} test SANTA; result line: "${(await p.textContent('#drop .res')).slice(0, 80)}"`);
check(!(await p.isVisible('#spin')), 'Spin is not on the page (retired)');
if (wonRaw > 0) {
  const adapter = makeSolanaChain({ kit, T22, rpcUrl: cfg.rpc, mint, keyFor: async () => pool, to: async (row) => row.to_wallet, feeOf, label: (row) => `Santa Hat payout #${row.id}` });
  const pBefore = await bal(player.address);
  for (let i = 0; i < 30; i++) { await runPayouts({ db, chain: adapter }); if ((await db.query(`select status from public.payouts`))[0].status === 'sent') break; await new Promise((r) => setTimeout(r, 3000)); }
  check((await db.query(`select status from public.payouts`))[0].status === 'sent', 'the run\'s ONE payout was sent on devnet');
  await new Promise((r) => setTimeout(r, 20000)); // let it finalize before reading the balance at 'finalized'
  const fee = await feeOf(), net = BigInt(wonRaw) - BigInt(Math.min(Math.ceil((wonRaw * fee.bps) / 10000), fee.max));
  check((await bal(player.address)) - pBefore === net, `the player received the winnings less the 3% tax, to the unit (${net})`);
} else check((await db.query('select count(*)::int n from public.payouts'))[0].n === 0, 'no win, no payout');
check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); web.close(); process.exit(0);
