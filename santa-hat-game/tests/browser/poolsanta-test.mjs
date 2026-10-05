// Run: node --import ./win-chrome.mjs poolsanta-test.mjs   (what it checks: see the note above the first check below)
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW ? path.join(process.env.PW, 'node_modules/playwright') : path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const cache = new Map(), curl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }), errors = [];
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.startsWith('https://api.santahatgames.com')) return route.fulfill({ contentType: 'application/json', body: '{"error":"stand-in"}' });
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: curl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('https://local.test/')) { const f = path.join(ROOT, url.replace('https://local.test/', '').split('#')[0].split('?')[0] || 'online.html'); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.abort(); });
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
const open = async () => { await p.goto(`https://local.test/online.html?net=local&t=${Date.now()}#games`, { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(800); };
// THE GAME POOL IN SANTA TOO (Cody 2026-10-05: "the total prize pool in santa also"; mockups/poolsanta.js), in a real browser:
// under each game's Game pool dollar total (Slots, Snowball Drop, Stocking Stuffer) and in the money strip, the SANTA it is at
// the live price; it follows the dollar total when it changes; with no live price it shows nothing (never a guess).
await open();
const lines = () => p.evaluate(() => Object.fromEntries(['slotPool', 'dropPool', 'stockPool', 'msPool'].map((id) => { const el = document.getElementById(id), s = document.querySelector('[data-pool-santa="' + id + '"]');
  return [id, { usd: el?.textContent || '', santa: s && !s.hidden ? s.textContent : '' }]; })));
let L = await lines();
check(Object.values(L).every((x) => !x.santa), 'no live price (this test blocks it): no SANTA line, never a guess ' + JSON.stringify(L).slice(0, 120));
await p.evaluate(async () => (await import('./poolsanta.js')).setPoolPrice({ usd: 0.0004 }));
L = await lines();
const want = (usd) => '≈ ' + Math.round(Number(/\$\s*([\d,]+(?:\.\d+)?)/.exec(usd)[1].replace(/,/g, '')) / 0.0004).toLocaleString('en-US') + ' SANTA';
for (const id of ['slotPool', 'dropPool', 'stockPool', 'msPool']) check(L[id].santa === want(L[id].usd), `${id}: ${L[id].usd} → "${L[id].santa}"`);
await p.evaluate(() => { document.getElementById('slotPool').textContent = '$200.00'; }); await p.waitForTimeout(100);
check((await lines()).slotPool.santa === '≈ 500,000 SANTA', 'it follows the dollar total when it changes ($200 → 500,000 SANTA at $0.0004)');
await p.evaluate(() => document.querySelector('#slots').scrollIntoView()); await p.waitForTimeout(300);
await p.screenshot({ path: '../../out/pool-santa-phone.png' });
check(!errors.length, 'no page errors ' + errors.slice(0, 2).join(' | '));
await browser.close();
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
