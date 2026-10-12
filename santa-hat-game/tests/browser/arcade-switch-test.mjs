// THE ARCADE SWITCH (Cody 2026-10-12: "make the arcade tab hidden for now. I will turn it back on later"; tabs.js ARCADE_LIVE).
// The page as the LIVE site serves it (its address is santahatgames.com; the files are this computer's, every call to the real
// game server is refused here, so nothing live is touched or counted): no Arcade tab, a #games link lands on Home. And on this
// computer (the tests, the test site) the Arcade is still there. Run: node arcade-switch-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname;
const fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(origin, qs = '') {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 780 } });
  let liveCalls = 0;
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith(origin + '/')) { const p = url.slice(origin.length + 1).split(/[?#]/)[0] || 'online.html', f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    if (/santahatgames\.com|supabase\.co|solana|helius/.test(url)) liveCalls++; // the real servers: refused here
    return route.abort(); });
  const p = await ctx.newPage(), errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(origin + '/online.html' + qs, { timeout: 90000, waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(800);
  return { p, ctx, errors, live: () => liveCalls };
}
const tabShown = (p) => p.evaluate(() => { const b = document.querySelector('#t-games'); return !!b && !b.hidden && b.offsetParent !== null; });
const pageShown = (p) => p.evaluate(() => { const g = document.querySelector('#tab-games'); return !!g && !g.hidden; });

console.log('1. The live site (santahatgames.com): the Arcade is switched off');
{ const L = await open('https://santahatgames.com');
  check(!(await tabShown(L.p)), 'no Arcade tab in the menu');
  check(await L.p.evaluate(() => [...document.querySelectorAll('#nav .tabs button')].filter((b) => !b.hidden).map((b) => b.textContent).join(',')) === 'Home,Play,Store,Avatar,Ranks', 'the menu: Home, Play, Store, Avatar, Ranks');
  await L.p.evaluate(() => { location.hash = '#games'; }); await L.p.waitForTimeout(600);
  check(!(await pageShown(L.p)) && await L.p.evaluate(() => !document.querySelector('#tab-home').hidden), 'a link to #games lands on Home');
  check(await L.p.evaluate(() => document.querySelector('#jpbar').hidden), 'no pool jackpot bar');
  check(L.errors.length === 0, 'no page errors ' + L.errors.join(' | '));
  await L.p.screenshot({ path: 'out/arcade-off.png' }); await L.ctx.close(); }
console.log('2. This computer (tests) and the test site: the Arcade is still there');
{ const T = await open('http://localhost', '?net=local');
  check(await tabShown(T.p), 'the Arcade tab is shown');
  await T.p.click('#t-games'); await T.p.waitForTimeout(800);
  check(await pageShown(T.p), 'and it opens');
  await T.ctx.close(); }
await browser.close();
if (fails.length) { console.log(`\nFAILED: ${fails.length}`); process.exit(1); }
console.log('\nOK: Arcade switch: off on the live site (no tab, #games → Home, no jackpot bar); still on for tests and the test site');
