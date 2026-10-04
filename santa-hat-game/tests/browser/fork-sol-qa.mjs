// PAY-WITH-SOL QA ON A PRIVATE COPY OF MAINNET (Cody, 2026-10-04 final launch QA: "have a few of them buy everything in sol and a
// few buy in santa ... and have them play all mini games 1000+ times"). SOL payments only exist on mainnet (Jupiter isn't on
// devnet), and nobody spends real money here: Surfpool (C:\santa-tools\surfpool, Cody's OK to download) runs a private copy of
// mainnet on this PC that copies real accounts on demand (the real SANTA token and its 3% tax, the real Jupiter program and swap
// pools) and lets us hand test wallets fake SOL. Everything else is the real thing:
//   the real game server code (games, Store, lottery, the Solana relay) on a real database (PGlite, every supabase/0xx file),
//   cluster 'mainnet' with the live SANTA and SOL prices; the real page (online.html, wallet.js → pay.js) in real Chrome, with a
//   stand-in wallet that signs with the test key and SENDS to the copy (Phantom's job after Approve); Jupiter's real API;
//   the real payout worker (payouts.js + solanachain.js) sending winnings from the pool wallet on the copy.
// Three SOL players buy EVERY Store item once between them (+ a level each, Weekly lottery tickets, the pass, 5 ranked tickets)
// and play Snowball Drop, Stocking Stuffer and Big Hat 1,000+ times each with SOL; a SANTA player buys every item once with SANTA
// (+ level, lottery, pass) and plays a run of each. Then the money is checked against the copy's balances: each SOL purchase
// cost exactly its price; the treasury got exactly its SOL share; the pool's books = its wallet after payouts; the lottery pot =
// its wallet; all winnings sent. After every swap the swap pools on the copy are reset to mainnet's live state (surfnet_
// resetAccount), so the copy's prices can't drift from the real ones Jupiter quotes (they would, after ~$1,000 of test buys).
// Needs Surfpool running:  surfpool start --ci --no-deploy -q 0   (datasource: mainnet; LESSONS 2026-10-04)
// Run (Windows, real Chrome): PW=<folder with node_modules/playwright> node fork-sol-qa.mjs [SOL runs per game=10]
import { createRequire } from 'module'; import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from 'fs'; import { execSync } from 'child_process';
import path from 'path'; import http from 'http';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW ? path.join(process.env.PW, 'node_modules/playwright') : path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const solReq = createRequire(new URL('../solana/package.json', import.meta.url)), kit = solReq('@solana/kit'), T22 = solReq('@solana-program/token-2022');
const { makeDb } = await import('../db/setup.mjs');
const { createGameServer } = await import('../../server/games.js'), { createShop } = await import('../../server/shop.js'), { createLottery } = await import('../../server/lottery.js');
const { makeHandler } = await import('../../server/http.js'), { makeLimiter, memoryStore } = await import('../../server/ratelimit.js'), { makeRelay } = await import('../../server/relay.js');
const { runPayouts } = await import('../../server/payouts.js'), { makeSolanaChain } = await import('../../server/solanachain.js');
const { MINT, livePrice, liveFee, liveSolPrice, solShares } = await import('../../mockups/market.js');
const { purchaseMessage } = await import('../../mockups/pay.js');

const RUNS = +(process.argv[2] || 10), FORK = 'http://127.0.0.1:8899', PORT = 8796, OUT = './out/forksol/'; mkdirSync(OUT, { recursive: true });
const ROOT = new URL('../../mockups', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), fails = [], check = (ok, m) => { m = hide(m); console.log((ok ? '  ✓ ' : '  ✗ ') + m); if (!ok) fails.push(m); };
const rpc = kit.createSolanaRpc(FORK), JUP = 'https://lite-api.jup.ag/swap/v1', WSOL = 'So11111111111111111111111111111111111111112';
// Errors are passed on with any connection address cut out (2026-10-04: an error from the copy printed the Helius address, which
// holds Cody's key, into a log; LESSONS). The copy fetches mainnet accounts on demand; if that fetch fails for a moment, ask again.
const hide = (m) => String(m).replace(/https?:\/\/[^\s"')]+/g, '<a server address>');
const raw = async (method, params) => { for (let i = 0; ; i++) {
  const j = await (await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json();
  if (!j.error) return j.result;
  if (/fetch accounts from remote|error sending request|429|timed out/i.test(j.error.message) && i < 6) { await new Promise((r) => setTimeout(r, 2000 * (i + 1))); continue; }
  throw new Error(method + ': ' + hide(j.error.message)); } };
process.on('uncaughtException', (e) => { console.log('Error: ' + hide(e?.message || e)); process.exit(1); });
process.on('unhandledRejection', (e) => { console.log('Error: ' + hide(e?.message || e)); process.exit(1); });
const ata = async (o) => (await T22.findAssociatedTokenPda({ owner: o, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS, mint: MINT }))[0];
const santaOf = async (o) => { try { return BigInt((await raw('getTokenAccountBalance', [await ata(o)])).value.amount); } catch { return 0n; } };
const solOf = async (o) => BigInt((await raw('getBalance', [o])).value);
const supply = async () => BigInt((await raw('getTokenSupply', [MINT])).value.amount);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!(await raw('getGenesisHash', []).catch(() => null) === '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')) { console.log('Surfpool (a copy of MAINNET) is not running on ' + FORK); process.exit(2); }

// The copy's clock drifts behind real time (143 s seen); the server only accepts a payment stamped within ~1.5 min of its price
// quote, so the copy's clock is set to real time now and every few seconds (surfnet_timeTravel).
const clock = () => raw('surfnet_timeTravel', [{ absoluteTimestamp: Date.now() }]).catch(() => {});
await clock(); const ticking = setInterval(clock, 4000);
// One transaction at a time on the copy, and each one's swap pools reset to mainnet BEFORE the next goes (two players swapping
// at once on the copy would see each other's price impact, which real arbitrage removes on mainnet in moments).
let turn = Promise.resolve();
const inTurn = (fn) => { const run = turn.then(fn, fn); turn = run.catch(() => {}); return run; };
// Keep the copy's swap pools in step with mainnet: after a transaction, every writable account it touched that isn't ours
// (players, our wallets, the SANTA token) is reset to mainnet's live state.
const OURS = new Set();
async function resync(sig) {
  const tx = await raw('getTransaction', [sig, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]).catch(() => null);
  for (const k of tx?.transaction?.message?.accountKeys || []) if (k.writable && !OURS.has(k.pubkey)) await raw('surfnet_resetAccount', [k.pubkey]).catch(() => {});
}
async function sendSigned(signers, instructions, lookupTables = []) { return inTurn(async () => {
  const msg = await purchaseMessage(kit, rpc, signers[0].address, { instructions, lookupTables });
  const tx = await kit.signTransactionMessageWithSigners(kit.setTransactionMessageFeePayerSigner(signers[0], msg));
  const sig = kit.getSignatureFromTransaction(tx);
  await raw('sendTransaction', [kit.getBase64EncodedWireTransaction(tx), { encoding: 'base64' }]);
  for (let i = 0; i < 60; i++) { const [s] = (await raw('getSignatureStatuses', [[sig]])).value; if (s?.err) throw new Error('failed: ' + JSON.stringify(s.err)); if (s?.confirmationStatus === 'finalized' || s?.confirmationStatus === 'confirmed') break; await sleep(500); }
  await resync(sig); return sig; }); }
// buy SANTA with SOL through Jupiter for a wallet we hold (the pool's float, the SANTA player's money)
async function buySanta(signer, lamports) {
  const q = await (await fetch(`${JUP}/quote?inputMint=${WSOL}&outputMint=${MINT}&amount=${lamports}&slippageBps=100&maxAccounts=40`)).json();
  const sw = await (await fetch(`${JUP}/swap-instructions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quoteResponse: q, userPublicKey: signer.address, wrapAndUnwrapSol: true }) })).json();
  const b64 = (s) => Uint8Array.from(Buffer.from(s, 'base64')), fromJup = (i) => ({ programAddress: i.programId, data: b64(i.data), accounts: i.accounts.map((a) => ({ address: a.pubkey, role: (a.isSigner ? 2 : 0) + (a.isWritable ? 1 : 0) })) });
  const sig = await sendSigned([signer], [...(sw.setupInstructions || []).map(fromJup), fromJup(sw.swapInstruction), ...(sw.cleanupInstruction ? [fromJup(sw.cleanupInstruction)] : [])], sw.addressLookupTableAddresses || []);
  return sig;
}

// --- wallets: 3 SOL players, 1 SANTA player, and the game's own pool / lottery / treasury, all fresh, funded with FAKE SOL
const W = {}; for (const n of ['S1', 'S2', 'S3', 'N1', 'pool', 'lottery', 'treasury', 'funder']) { W[n] = await kit.generateKeyPairSigner(); OURS.add(W[n].address); }
const FAKE_SOL = { S1: 40, S2: 40, S3: 40, N1: 6, pool: 6, lottery: 0.1, treasury: 0.05, funder: 1 };
for (const [n, sol] of Object.entries(FAKE_SOL)) await raw('surfnet_setAccount', [W[n].address, { lamports: Math.round(sol * 1e9) }]);
for (const n of ['pool', 'lottery', 'treasury']) {
  OURS.add(await ata(W[n].address));
  await sendSigned([W.funder], [T22.getCreateAssociatedTokenIdempotentInstruction({ payer: W.funder, ata: await ata(W[n].address), owner: W[n].address, mint: MINT, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS })]);
}
for (const n of ['S1', 'S2', 'S3', 'N1']) OURS.add(await ata(W[n].address));
OURS.add(MINT);
console.log('Funding the pool (~$500 of SANTA) and the SANTA player (~$600) with real swaps on the copy…');
await buySanta(W.pool, 4.2e9); await buySanta(W.N1, 5e9);
const [price, sol] = [await livePrice(), await liveSolPrice()];
console.log(`SANTA $${price.usd}, SOL $${sol.usd.toFixed(2)}; pool ${Number(await santaOf(W.pool.address)) / 1e6} SANTA, SANTA player ${Number(await santaOf(W.N1.address)) / 1e6} SANTA`);

// --- the server: real code on a real database, mainnet settings
const FILES = readdirSync(new URL('../../supabase/', import.meta.url)).filter((f) => /^0\d\d_.*\.sql$/.test(f) && f !== '031_games_role.sql').sort();
const db = await makeDb(FILES), prof = {};
for (const n of ['S1', 'S2', 'S3', 'N1']) prof[n] = await db.player(W[n].address, n);
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', $1, '{}'), ('slots', 0, '{}') on conflict (game) do update set santa_raw = excluded.santa_raw`, [String(await santaOf(W.pool.address))]);
const chain = { getTransaction: (s) => raw('getTransaction', [s, { encoding: 'jsonParsed', commitment: 'finalized', maxSupportedTransactionVersion: 0 }]).catch(() => null),
  latestBlock: async () => { const r = await raw('getLatestBlockhash', [{ commitment: 'finalized' }]); return { blockhash: r.value.blockhash, slot: r.context.slot }; } };
const opts = { db, chain, livePrice: async () => price, liveFee: () => liveFee(MINT, [FORK]), mint: MINT, cluster: 'mainnet', liveSol: async () => sol };
const server = createGameServer({ ...opts, poolWallets: { spin: W.pool.address, slots: W.pool.address } });
const shop = createShop({ ...opts, treasury: W.treasury.address, rankedPaused: () => false });
const lottery = createLottery({ ...opts, wallet: W.lottery.address });
const tokens = Object.fromEntries(Object.entries(prof).map(([n, id]) => ['tok-' + n, id]));
const handle = makeHandler({ server, shop, lottery, relay: makeRelay(raw), limiter: makeLimiter({ store: memoryStore() }), profileFor: async (t) => tokens[t] ?? null });
const web = http.createServer(async (req, res) => {
  if (req.method === 'GET') { const pth = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'online.html');
    if (!pth.startsWith(ROOT) || !existsSync(pth)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': pth.endsWith('.js') ? 'text/javascript' : pth.endsWith('.png') ? 'image/png' : 'text/html' }); return res.end(readFileSync(pth)); }
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await handle(new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers: req.headers, body: Buffer.concat(chunks) }));
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT);

// --- the page, one per player, with a stand-in wallet that signs with the player's test key and sends to the copy
const cache = new Map(), curl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist'] });
async function open(n, payWith) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), errors = [];
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.startsWith(`http://localhost:${PORT}/`) || /lite-api\.jup\.ag/.test(url)) return route.continue();
    if (/solana-rpc\.publicnode\.com/.test(url)) { // the page's Solana reads and sends go to the COPY of mainnet
      const r = await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: route.request().postData() });
      return route.fulfill({ status: r.status, contentType: 'application/json', body: await r.text(), headers: { 'access-control-allow-origin': '*' } }); }
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: curl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    return route.fulfill({ status: 503, body: 'offline in tests' }); });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
  const signer = W[n];
  await p.exposeFunction('walletSignAndSend', async (bytes) => {
    const tx = await kit.signTransaction([signer.keyPair], kit.getTransactionDecoder().decode(new Uint8Array(bytes)));
    const sig = kit.getSignatureFromTransaction(tx);
    await inTurn(async () => { // one at a time; once it has landed, the copy's swap pools go back in step with mainnet
      await raw('sendTransaction', [kit.getBase64EncodedWireTransaction(tx), { encoding: 'base64' }]);
      for (let i = 0; i < 40; i++) { const [st] = (await raw('getSignatureStatuses', [[sig]])).value; if (st?.err || st?.confirmationStatus) break; await sleep(250); }
      await resync(sig); });
    return [...kit.getBase58Encoder().encode(sig)];
  });
  await p.addInitScript(({ addr, payWith }) => { try { localStorage.setItem('santa.payWith', payWith); } catch {}
    window.santaWallet = { name: 'Test wallet', chains: ['solana:mainnet'], accounts: [{ address: addr }],
      features: { 'solana:signAndSendTransaction': { signAndSendTransaction: async ({ transaction }) => [{ signature: new Uint8Array(await window.walletSignAndSend([...transaction])) }] } } }; },
  { addr: signer.address, payWith });
  await p.goto(`http://localhost:${PORT}/online.html?net=local&server=${encodeURIComponent(`http://localhost:${PORT}/api`)}&token=tok-${n}&t=${Date.now()}#store`, { timeout: 90000 });
  await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1500);
  return { n, p, errors, payWith };
}
// one purchase through the page's own modules: quote → the wallet step (Auto/SANTA/SOL as set) → the server checks and grants
const buy = (pl, quoteAction, buyAction, body) => pl.p.evaluate(async ({ quoteAction, buyAction, body }) => {
  const { call } = await import('./gameserver.js'), sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const q = await call(quoteAction, body); if (!q?.id) return { stage: 'quote', error: q?.error || JSON.stringify(q) };
  let sig; try { sig = await window.santaPay(q); } catch (e) { return { stage: 'pay', error: e.message }; }
  let b; for (let i = 0; i < 40; i++) { b = await call(buyAction, { quote: q.id, signature: sig }); if (b?.ok || !/not found|not finalized|slow down/i.test(b?.error || '')) break; await sleep(2000); }
  return b?.ok ? { ok: true, usd: q.usd, solLamports: q.solLamports, solStore: !!q.solStore, burnBps: q.burnBps, sig, result: b } : { stage: 'buy', error: b?.error, sig };
}, { quoteAction, buyAction, body });
// a run of n plays: buy it, then settle every play (the house's draw, the player's number) — as the page does
const playRun = (pl, kind, bet, n) => pl.p.evaluate(async ({ kind, bet, n }) => {
  const { call } = await import('./gameserver.js'), sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const ask = async (a, b) => { for (let i = 0; ; i++) { const o = await call(a, b); if (/slow down/i.test(o?.error || '') && i < 30) { await sleep(2500); continue; } return o; } };
  const q = await ask('quote', { kind, n, bet }); if (!q?.id) return { stage: 'quote', error: q?.error || JSON.stringify(q) };
  let sig; try { sig = await window.santaPay(q); } catch (e) { return { stage: 'pay', error: e.message }; }
  let b; for (let i = 0; i < 40; i++) { b = await ask('buy', { quote: q.id, signature: sig }); if (b?.ok || !/not found|not finalized/.test(b?.error || '')) break; await sleep(2000); }
  if (!b?.ok) return { stage: 'buy', error: b?.error };
  const hex = () => [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('');
  const out = { usd: q.usd, solLamports: q.solLamports, plays: 0, payUsd: 0, errors: [], runDone: false };
  for (const pl of b.plays) { const s = await ask('settle', { ticket: pl.ticket, seed: hex() }); if (s?.error) { out.errors.push(s.error); continue; }
    out.plays++; out.payUsd += s.r?.pay || 0; if (s.runDone) out.runDone = true; await sleep(240); }
  return out;
}, { kind, bet, n });

const startSupply = await supply(), solBefore = {};
const players = { S1: await open('S1', 'sol'), S2: await open('S2', 'sol'), S3: await open('S3', 'sol'), N1: await open('N1', 'santa') };
for (const n of Object.keys(players)) solBefore[n] = await solOf(W[n].address);
const items = await players.S1.p.evaluate(async () => { const { ITEMS } = await import('./catalog.js'), { forSale } = await import('./shoprules.js'); return ITEMS.filter(forSale).map((i) => ({ id: i.id, name: i.name, price: i.price })); });
const bought = [], runs = [];

console.log(`\n1. Every Store item (${items.length}) bought once with SOL between 3 players, and once with SANTA; levels, lottery, the pass, ranked tickets`);
const SOLP = [players.S1, players.S2, players.S3];
await Promise.all([...SOLP.map(async (pl, k) => {
  for (const it of items.filter((_, j) => j % 3 === k)) { const r = await buy(pl, 'shop-quote', 'shop-buy', { kind: 'item', id: it.id }); bought.push({ who: pl.n, what: it.id, ...r });
    check(r.ok && r.solLamports > 0, `${pl.n} (SOL) bought ${it.name} ($${it.price})${r.ok ? '' : ' — ' + r.stage + ': ' + r.error}`); }
  for (const [what, qa, ba, body] of [['a level', 'shop-quote', 'shop-buy', { kind: 'level' }], ['2 Weekly lottery tickets', 'lottery-quote', 'lottery-buy', { lottery: 'weekly-10', n: 2 }]]) {
    const r = await buy(pl, qa, ba, body); bought.push({ who: pl.n, what, ...r }); check(r.ok, `${pl.n} (SOL) bought ${what}${r.ok ? '' : ' — ' + r.stage + ': ' + r.error}`); }
}), (async () => { const pl = players.N1;
  for (const it of items) { const r = await buy(pl, 'shop-quote', 'shop-buy', { kind: 'item', id: it.id }); bought.push({ who: 'N1', what: it.id, ...r });
    check(r.ok, `N1 (SANTA) bought ${it.name}${r.ok ? '' : ' — ' + r.stage + ': ' + r.error}`); }
  for (const [what, qa, ba, body] of [['a level', 'shop-quote', 'shop-buy', { kind: 'level' }], ['2 Weekly lottery tickets', 'lottery-quote', 'lottery-buy', { lottery: 'weekly-10', n: 2 }], ['the season pass', 'shop-quote', 'shop-buy', { kind: 'pass' }]]) {
    const r = await buy(pl, qa, ba, body); bought.push({ who: 'N1', what, ...r }); check(r.ok, `N1 (SANTA) bought ${what}${r.ok ? '' : ' — ' + r.stage + ': ' + r.error}`); }
})()]);
for (const [what, body] of [['the season pass', { kind: 'pass' }], ['5 ranked tickets', { kind: 'tickets', n: 5 }]]) {
  const r = await buy(players.S1, 'shop-quote', 'shop-buy', body); bought.push({ who: 'S1', what, ...r }); check(r.ok, `S1 (SOL) bought ${what}${r.ok ? '' : ' — ' + r.stage + ': ' + r.error}`); }

console.log(`\n2. The mini games with SOL: ${RUNS} runs of 100 of each game, spread over the 3 SOL players; then a run of each with SANTA`);
const GAMES = [['drop', 0.1], ['stocking', 0.1], ['big', 1]];
await Promise.all(SOLP.map(async (pl, k) => {
  for (let r = k; r < RUNS; r += 3) for (const [kind, bet] of GAMES) { const res = await playRun(pl, kind, bet, 100); runs.push({ who: pl.n, kind, bet, ...res });
    if (res.error || res.errors?.length || !res.runDone) check(false, `${pl.n} ${kind} run: ${res.error ? res.stage + ': ' + res.error : res.errors.length + ' errors, finished ' + res.runDone}`);
    else console.log(`  ${pl.n} ${kind}: 100 plays, paid $${res.usd} in SOL, won $${res.payUsd.toFixed(2)}`); }
}));
for (const [kind, bet] of GAMES) { const res = await playRun(players.N1, kind, bet, 100); runs.push({ who: 'N1', kind, bet, ...res });
  check(!res.error && !res.errors?.length && res.runDone, `N1 (SANTA) ${kind}: ${res.error ? res.stage + ': ' + res.error : res.plays + ' plays, won $' + res.payUsd.toFixed(2)}`); }
for (const [kind] of GAMES) { const rs = runs.filter((r) => r.kind === kind && r.who !== 'N1' && !r.error), plays = rs.reduce((a, r) => a + r.plays, 0);
  const paid = rs.reduce((a, r) => a + r.usd, 0), won = rs.reduce((a, r) => a + r.payUsd, 0);
  check(plays >= RUNS * 100, `${kind}: ${plays} plays paid with SOL ($${paid.toFixed(2)} in, $${won.toFixed(2)} won, payback ${(100 * won / (paid || 1)).toFixed(1)}%)`); }

console.log('\n3. The payout worker sends every win from the pool wallet (on the copy)');
const feeOf = () => liveFee(MINT, [FORK]);
const worker = makeSolanaChain({ kit, T22, rpcUrl: FORK, mint: MINT, keyFor: async () => W.pool, to: async (row) => row.to_wallet, feeOf, label: (row) => `Santa Hat payout #${row.id}` });
for (let i = 0; i < 40; i++) { await runPayouts({ db, chain: worker, limit: 50 }); const [{ n }] = await db.query(`select count(*)::int as n from public.payouts where status <> 'sent'`); if (!n) break; await sleep(3000); }
const [po] = await db.query(`select count(*)::int as n, count(*) filter (where status = 'sent')::int as sent from public.payouts`);
check(po.n > 0 && po.sent === po.n, `every finished run's winnings sent: ${po.sent}/${po.n}`);

console.log('\n4. The money, checked against the copy\'s balances');
await sleep(3000);
const [{ book }] = await db.query(`select santa_raw::text as book from public.pools where game = 'spin'`);
const [{ unsentT }] = await db.query(`select count(*)::int as "unsentT" from public.pool_transfers where status <> 'sent'`);
const poolWallet = await santaOf(W.pool.address);
check(unsentT === 0 ? BigInt(book) === poolWallet : true, `Game pool: books ${book} = wallet ${poolWallet} (to the smallest unit; ${unsentT} transfers waiting)`);
const [{ pot }] = await db.query(`select coalesce(sum(pot_raw), 0)::text as pot from public.lottery_draws`);
check(BigInt(pot) === await santaOf(W.lottery.address), `lottery: the pots (${pot}) = the lottery wallet`);
const storeSol = bought.filter((b) => b.ok && b.who !== 'N1' && b.solLamports && b.solStore) /* paid in SOL: every mainnet quote OFFERS a SOL price, so the SANTA player's must not count */, treasuryWant = storeSol.reduce((a, b) => a + BigInt(solShares(b.solLamports, b.burnBps, true).treasury), 0n);
const treasuryGot = await solOf(W.treasury.address) - BigInt(Math.round(FAKE_SOL.treasury * 1e9));
check(treasuryGot === treasuryWant, `treasury: received ${treasuryGot} lamports of SOL = exactly the SOL share of ${storeSol.length} Store purchases paid in SOL (${treasuryWant})`);
for (const pl of SOLP) {
  const mine = [...bought.filter((b) => b.who === pl.n && b.ok), ...runs.filter((r) => r.who === pl.n && !r.error)], priced = mine.reduce((a, b) => a + BigInt(b.solLamports || 0), 0n);
  const spent = solBefore[pl.n] - await solOf(W[pl.n].address), extra = Number(spent - priced) / 1e9;
  check(mine.every((b) => b.solLamports > 0) && extra >= 0 && extra < 0.004 + mine.length * 0.00003, `${pl.n} paid exactly the prices in SOL: spent ${(Number(spent) / 1e9).toFixed(6)} SOL for ${mine.length} purchases priced ${(Number(priced) / 1e9).toFixed(6)} (+${extra.toFixed(6)}: network fees, its SANTA account once)`);
}
const burnedNow = startSupply - await supply();
const [{ gb }] = await db.query(`select (coalesce((select sum(burned_raw) from public.payments), 0) + coalesce((select sum(burned_raw) from public.lottery_buys), 0))::text as gb`);
check(burnedNow >= BigInt(gb) && burnedNow > 0n, `burned on the copy: ${Number(burnedNow) / 1e6} SANTA (games + lottery recorded ${Number(gb) / 1e6}; the Store's burns on top)`);
const [{ refunds }] = await db.query(`select count(*)::int as refunds from public.shop_refunds`);
check(refunds === 0, 'no purchase had to be refunded');
for (const pl of Object.values(players)) check(!pl.errors.length, `${pl.n}: no page errors ${pl.errors.slice(0, 2).join(' | ')}`);
writeFileSync(OUT + 'summary.json', JSON.stringify({ price, sol, bought, runs }, null, 1));
clearInterval(ticking); await browser.close(); web.close();
console.log(`\n${bought.filter((b) => b.ok).length}/${bought.length} purchases, ${runs.filter((r) => !r.error).reduce((a, r) => a + r.plays, 0)} plays. ${fails.length ? 'FAILED ' + fails.length : 'ALL CHECKS PASSED'}`);
process.exit(fails.length ? 1 : 0);
