// Every purchase through the PAGE, start to end (Cody, 2026-10-02: "make sure every button has a complete start to end path ...
// check all items that can be purchased"): Store Buy (a special snowball, a gear), the Avatar screen's Buy (a look), Buy level,
// extra ranked tickets — each: the page asks the real shop (server/shop.js behind server/http.js, real SQL 001…016 on PGlite)
// for a price → the stand-in wallet pays (50% burned / 50% treasury) → the server checks it and grants it → checked in the
// database. Plus: a cancelled payment charges nothing; without a game server every Buy says payments open soon.
// Run: node shop-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path'; import http from 'http';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const { makeDb } = await import('../db/setup.mjs');
const { createShop } = await import('../../server/shop.js');
const { makeHandler } = await import('../../server/http.js');
const { splitPayment, MINT } = await import('../../mockups/market.js');
const { SHOP_BURN_BPS } = await import('../../mockups/shoprules.js');
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };

// --- the server: the real shop on the real SQL
const db = await makeDb(['001_profiles.sql', '002_items_seed.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql', '006_ranked_tickets.sql', '008_hats_backpacks.sql', '010_levels.sql', '012_special_snowballs.sql']);
for (const f of ['015_special_gear.sql', '016_shop.sql']) await db.pg.exec(readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8'));
const PLAYER = 'PLAYERwa11et111111111111111111111111111111', TREASURY = 'TReASURYwa11et'.padEnd(44, '1').replace(/[0OIl]/g, '9'), PRICE = 0.00085, FEE = { bps: 300, max: 1e15 };
const me = (await db.query('insert into auth.users default values returning id'))[0].id;
await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, $2, 'Cody', '{}')`, [me, PLAYER]);
const txs = new Map(); let paid = 0;
const S = (name) => (name + '5'.repeat(88)).slice(0, 88).replace(/[0OIl]/g, '9');
// the stand-in wallet: pays the quote exactly as pay.js would (burn + transfer to the treasury) and returns the signature
function payFor(q) {
  const sig = S('ShopPay' + 'abcdefghjk'[paid++]), sp = splitPayment(q.santaRaw, SHOP_BURN_BPS, FEE), b = (i, o, a) => ({ accountIndex: i, mint: MINT, owner: o, uiTokenAmount: { amount: String(a) } });
  txs.set(sig, { blockTime: Math.floor(Date.now() / 1000), meta: { err: null, innerInstructions: [], preTokenBalances: [b(1, PLAYER, 1e13), b(2, q.pool, 1e12)], postTokenBalances: [b(1, PLAYER, 1e13 - q.santaRaw), b(2, q.pool, 1e12 + sp.arrives)] },
    transaction: { message: { accountKeys: [{ pubkey: PLAYER, signer: true }], instructions: [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { mint: MINT, authority: PLAYER, tokenAmount: { amount: String(sp.burn) } } } }] } } });
  return sig;
}
const shop = createShop({ db, chain: { getTransaction: async (s) => txs.get(s) ?? null }, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, treasury: TREASURY, mint: MINT, cluster: 'devnet' });
const noDraws = { draws: async () => ({ open: [], recent: [] }), tickets: async () => ({ error: 'no such draw' }) };
const handle = makeHandler({ shop, lottery: noDraws, limiter: null, server: { winners: async () => [], settings: async () => ({}), pools: async () => ({}), market: async () => ({ cluster: 'devnet' }) }, profileFor: async (t) => (t === 'test-token' ? me : null) });
const web = http.createServer(async (req, res) => {
  if (req.method === 'GET') { const pth = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'online.html');
    if (!pth.startsWith(ROOT) || !existsSync(pth)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': pth.endsWith('.js') ? 'text/javascript' : pth.endsWith('.png') ? 'image/png' : 'text/html' }); return res.end(readFileSync(pth)); }
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await handle(new Request('http://localhost:8788' + req.url, { method: req.method, headers: req.headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }));
  if (r.status >= 500) console.log('  (server answered', r.status, 'to', Buffer.concat(chunks).toString().slice(0, 80) + ')');
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8788);
const owns = async (id) => !!(await db.query('select 1 from public.inventory where profile_id = $1 and item_id = $2', [me, id]))[0];

// --- the page
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(serverMode) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }), errors = [];
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.startsWith('http://localhost:8788/')) return route.continue();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    return route.fulfill({ status: 503, body: 'offline in tests' }); });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/503|wallet step/.test(m.text())) errors.push(m.text()); });
  await p.goto('http://localhost:8788/online.html?net=local' + (serverMode ? '&server=' + encodeURIComponent('http://localhost:8788/api') + '&token=test-token' : ''), { timeout: 90000 });
  await p.waitForFunction(() => window.__sq, null, { timeout: 60000 }); await p.waitForTimeout(800);
  // signed in (the stand-in account on the page; the server knows this player by the test token)
  await p.click('#signin'); await p.waitForTimeout(400); await p.fill('#email', 'cody@example.com'); await p.click('#emailBtn'); await p.waitForTimeout(900); await p.click('#acctClose').catch(() => {});
  if (serverMode) { await p.exposeFunction('testPay', (q) => payFor(q)); await p.evaluate(() => { window.santaPay = (q) => (window.__cancelNext ? (window.__cancelNext = false, Promise.reject(new Error('User rejected the request'))) : window.testPay(q)); }); }
  return { p, ctx, errors };
}
const waitNote = (p, sel, re) => p.waitForFunction(([s, r]) => new RegExp(r).test(document.querySelector(s)?.textContent || ''), [sel, re.source], { timeout: 30000 }).then(() => true, () => false);
const store = async (p) => { await p.click('#t-store'); await p.waitForFunction(() => document.querySelectorAll('#carousels .shopitem').length, null, { timeout: 30000 }); };
const itemNote = (id) => `[data-buyitem="${id}"]`;
// that ITEM's own note (the card is redrawn after a buy: its Buy button becomes "Owned")
const waitItem = (p, id, re) => p.waitForFunction(([id, r]) => { const el = document.querySelector(`[data-buyitem="${id}"], [data-owned="${id}"]`)?.closest('.shopitem'); return new RegExp(r).test(el?.querySelector('.shopnote')?.textContent || ''); }, [id, re.source], { timeout: 30000 }).then(() => true, () => false);

console.log('1. Store: Buy a special snowball and a gear (server mode, real shop)');
{ const { p, ctx, errors } = await open(true);
  await store(p);
  await p.click(itemNote('sb_ice'));
  check(await waitItem(p, 'sb_ice', /Bought! It's yours/), 'Ice Ball: "Bought! It\'s yours."');
  check(await owns('sb_ice'), 'the database says I own the Ice Ball');
  await p.click(itemNote('gear_shoes'));
  check(await waitItem(p, 'gear_shoes', /Bought/) && await owns('gear_shoes'), 'Elf Shoes bought and owned');
  const q = (await db.query(`select usd, used_by from public.shop_quotes where item_id = 'gear_shoes'`))[0];
  check(+q.usd === 0.75 && !!q.used_by, `charged the catalog price ($${q.usd}) once`);

  console.log('2. A cancelled payment charges nothing');
  await p.evaluate(() => { window.__cancelNext = true; });
  await p.click(itemNote('sb_split'));
  check(await waitItem(p, 'sb_split', /Payment cancelled\. Nothing was charged/) && !(await owns('sb_split')), 'cancelled: nothing charged, nothing granted');

  console.log('3. Buy level (Progress box) and extra ranked tickets (Store)');
  await p.click('#tickets .packs [data-tix="5"], .packs [data-tix="5"]');
  check(await waitNote(p, '#tixNote', /\+5 ranked tickets/), 'tickets: "+5 ranked tickets."');
  check(+(await db.query('select extra from public.tickets where profile_id = $1', [me]))[0]?.extra === 5, 'the database has 5 extra tickets');
  await p.click('#t-play'); await p.waitForTimeout(400); await p.click('#pgBuy');
  check(await waitNote(p, '#pgNote', /You're level 2/), 'Buy level: "You\'re level 2!"');
  check(+(await db.query('select level from public.profiles where id = $1', [me]))[0].level === 2, 'the database says level 2');

  console.log('4. Avatar screen: Buy the look being previewed');
  const look = (await db.query(`select id, name from public.items where price_usd is not null and slot = 'shirt' order by id limit 1`))[0];
  await p.click('#t-avatar'); await p.waitForTimeout(500); await p.click('[data-slot="shirt"]'); await p.waitForTimeout(300);
  await p.click(`#avgrid [data-pick="${look.id}"]`); await p.waitForTimeout(300);
  check(!(await p.isHidden('#avbuy')) && new RegExp(look.name).test(await p.textContent('#avbuy')), `previewing ${look.name}: "${await p.textContent('#avbuy')}"`);
  await p.click('#avbuy');
  check(await waitNote(p, '#avmsg', /Bought/) && await owns(look.id), `${look.name} bought on the Avatar screen and owned`);
  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : '')); await ctx.close(); }

console.log('5. Without a game server (today\'s demo site): every Buy says payments open soon (nothing taken)');
{ const { p, ctx, errors } = await open(false);
  await store(p); await p.click(itemNote('sb_giant'));
  check(await waitItem(p, 'sb_giant', /Payments open soon/), 'Store Buy explains');
  await p.click('.packs [data-tix="1"]'); check(await waitNote(p, '#tixNote', /Payments open soon/), 'tickets explain');
  await p.click('#t-play'); await p.waitForTimeout(300); await p.click('#pgBuy'); check(await waitNote(p, '#pgNote', /Payments open soon/), 'Buy level explains');
  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : '')); await ctx.close(); }

console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); web.close(); process.exit(0);
