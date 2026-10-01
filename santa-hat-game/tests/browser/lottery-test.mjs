// The Santa Lottery on the Store tab, end to end in a real browser: the real server code (server/lottery.js) behind the real
// web door on real Postgres (PGlite, 001…011), draws a few seconds apart (test schedule). The stand-in wallet "pays" (a
// realistic finalized transaction), as in server-mode-test.mjs. Then the draw runs, the winner shows, and "Check this draw"
// re-runs it in the page from public data. Also: without a game server, buying says sales open soon. Run: node lottery-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path'; import http from 'http';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const { makeDb, FILES } = await import('../db/setup.mjs');
const { createLottery } = await import('../../server/lottery.js');
const { makeHandler } = await import('../../server/http.js');
const { splitPayment, MINT } = await import('../../mockups/market.js');
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };

const db = await makeDb([...FILES, '010_levels.sql', '011_lottery.sql']);
const PLAYER = 'PLAYERwa11et111111111111111111111111111111Q', LOT = 'LoTTwa11et11111111111111111111111111111111Z', FEE = { bps: 300, max: 1e15 }, PRICE = 0.00085;
const me = await db.player(PLAYER, 'Cody');
const txs = new Map(); let n = 0;
const chain = { getTransaction: async (s) => txs.get(s) ?? null, latestBlock: async () => ({ blockhash: 'Bh' + 'x'.repeat(42), slot: 7 }) };
const EVERY = 15000, CLOSE = 2000; // a draw every 15 s, sales close 2 s before (the real ones: mockups/lottery.js)
const schedule = { nextDraw: (k, t) => (k === 'christmas' ? null : (Math.floor(t / EVERY) + 1) * EVERY),
  salesFor: (k, t) => { const at = schedule.nextDraw(k, t); return at === null ? { open: false, why: 'drawn' } : at - t <= CLOSE ? { open: false, at, why: 'Sales are closed for this draw.' } : { open: true, at }; } };
const lot = createLottery({ db, chain, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, wallet: LOT, mint: MINT, cluster: 'devnet', schedule });
const handle = makeHandler({ server: { winners: async () => [], settings: async () => ({}), pools: async () => ({}) }, lottery: lot, limiter: null, profileFor: async (t) => (t === 'test-token' ? me : null) });
function payFor(q) { // what the chain records for the page's one payment: 10% burned, the rest arriving in the lottery wallet
  const sig = ('LotPay' + (++n)).padEnd(88, '5'), sp = splitPayment(q.santaRaw, 1000, FEE), b = (i, o, a) => ({ accountIndex: i, mint: MINT, owner: o, uiTokenAmount: { amount: String(a) } });
  txs.set(sig, { blockTime: Math.floor(Date.now() / 1000), meta: { err: null, innerInstructions: [], preTokenBalances: [b(1, PLAYER, 1e13), b(2, q.pool, 1e12)], postTokenBalances: [b(1, PLAYER, 1e13 - q.santaRaw), b(2, q.pool, 1e12 + sp.arrives)] },
    transaction: { message: { accountKeys: [{ pubkey: PLAYER, signer: true }], instructions: [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { mint: MINT, authority: PLAYER, tokenAmount: { amount: String(sp.burn) } } } }] } } });
  return sig;
}
const web = http.createServer(async (req, res) => {
  if (req.method === 'GET') { const pth = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'online.html');
    if (!pth.startsWith(ROOT) || !existsSync(pth)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': pth.endsWith('.js') ? 'text/javascript' : pth.endsWith('.png') ? 'image/png' : 'text/html' }); return res.end(readFileSync(pth)); }
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await handle(new Request('http://localhost:8795' + req.url, { method: req.method, headers: req.headers, body: Buffer.concat(chunks) }));
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8795);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function page(qs, viewport = { width: 1100, height: 900 }) {
  const ctx = await browser.newContext({ viewport }); const errors = [];
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.startsWith('http://localhost:8795/')) return route.continue();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    return route.fulfill({ status: 503, body: '' }); });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:8795/online.html?net=local' + qs, { timeout: 90000 }); await p.waitForFunction(() => window.__sq && window.__lottery, null, { timeout: 90000 });
  await p.evaluate(() => document.querySelector('#t-store').click()); await p.waitForTimeout(1200);
  return { p, errors };
}

console.log('1. Without a game server (today\'s site): the lotteries show, buying says sales open soon');
{ const { p, errors } = await page('');
  const cards = await p.evaluate(() => [...document.querySelectorAll('.lotcard h3')].map((h) => h.textContent));
  check(cards.join() === 'Daily 10¢,Daily $1,Weekly 10¢,Weekly $1,Christmas', `five lotteries: ${cards.join(', ')}`);
  const target = +(await p.getAttribute('.lotcard[data-lot="daily-10"] [data-left]', 'data-left')), midnight = (Math.floor(Date.now() / 86400000) + 1) * 86400000;
  check(target === midnight, `Daily counts down to the next 00:00 UTC (${new Date(target).toISOString()})`);
  await p.fill('.lotcard[data-lot="weekly-10"] input', '37'); await p.evaluate(() => window.__lottery.render());
  check(await p.inputValue('.lotcard[data-lot="weekly-10"] input') === '37', 'a number being typed survives a refresh');
  await p.evaluate(() => document.querySelector('.lotcard [data-buy="5"]').click()); await p.waitForTimeout(400);
  check(/open soon/.test(await p.textContent('.lotcard .lotnote')), 'buying says sales open soon (nothing sold)');
  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await p.locator('#lottery').screenshot({ path: 'out/lottery-demo.png' }); await p.context().close(); }

console.log('2. With the game server: buy 5 tickets in Weekly 10¢, see the pot; the draw runs; the winner shows; Check this draw matches');
{ const { p, errors } = await page('&server=' + encodeURIComponent('http://localhost:8795/api') + '&token=test-token');
  await p.exposeFunction('testPay', (q) => payFor(q)); await p.evaluate(() => { window.santaPay = (q) => window.testPay(q); });
  for (;;) { const t = Date.now(), at = schedule.nextDraw('weekly-10', t); if (at - t > CLOSE + 7000) break; await p.waitForTimeout(500); } // room to buy before the close
  const weekly = '.lotcard[data-lot="weekly-10"]';
  await p.evaluate((s) => document.querySelector(s + ' [data-buy="5"]').click(), weekly);
  await p.waitForFunction((s) => /tickets #|Not paid|error|closed/i.test(document.querySelector(s + ' .lotnote').textContent), weekly, { timeout: 20000 }).catch(() => {});
  const note = await p.textContent(weekly + ' .lotnote');
  check(/You have tickets #1–#5/.test(note), 'bought: ' + note);
  await p.evaluate(() => window.__lottery.refresh()); await p.waitForTimeout(800);
  check(/5 tickets/.test(await p.textContent(weekly)) && /pot \d/.test(await p.textContent(weekly)), 'the card shows the pot and 5 tickets sold');
  check(/You have tickets #1–#5/.test(await p.textContent(weekly + ' .lotnote')), 'the buy message is still there after the refresh');
  const drawAt = schedule.nextDraw('weekly-10', Date.now()); while (Date.now() < drawAt + 500) await p.waitForTimeout(500);
  await p.evaluate(() => window.__lottery.refresh());
  await p.waitForFunction(() => /Weekly 10¢/.test(document.querySelector('#lotResults')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
  const res = (await p.textContent('#lotResults')).replace(/\s+/g, ' ');
  check(/Recent draws/.test(res) && /1st Cody/.test(res), 'the draw shows its winner: ' + res.slice(0, 140));
  await p.evaluate(() => document.querySelector('#lotResults [data-check]').click());
  await p.waitForFunction(() => /Matches|NOT match|Could not/.test(document.querySelector('.lotcheck').textContent), null, { timeout: 20000 }).catch(() => {});
  check(/^Matches/.test(await p.textContent('.lotcheck')), 'Check this draw: ' + (await p.textContent('.lotcheck')));
  const pays = await db.query('select status, amount_raw from public.lottery_payouts');
  check(pays.length === 1 && pays[0].status === 'manual', 'the winner waits to be paid by hand (manual mode)');
  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await p.locator('#lottery').screenshot({ path: 'out/lottery-live.png' }); await p.context().close(); }

console.log('3. A phone: the cards fit, no sideways scrolling');
{ const { p, errors } = await page('', { width: 360, height: 760 });
  const over = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  check(!over, 'no sideways scrolling at 360 px'); check(!errors.length, 'no page errors');
  await p.locator('#lottery').screenshot({ path: 'out/lottery-phone.png' }); await p.context().close(); }
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); web.close(); process.exit(0);
