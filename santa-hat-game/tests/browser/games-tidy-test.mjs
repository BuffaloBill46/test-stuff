// A TIDIER GAMES TAB (Cody's list, 2026-10-03): jump buttons to each game and to Recent winners, each landing with the game's
// heading in view below the fixed top bar; the two money notes folded into "Good to know" (closed until opened, both inside);
// the Test version warning still visible. Computer and phone. Run: node games-tidy-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync('out', { recursive: true });
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
for (const [name, viewport] of [['computer', { width: 1280, height: 800 }], ['phone', { width: 375, height: 667 }]]) {
  console.log(name);
  const ctx = await browser.newContext({ viewport, ...(viewport.width < 600 ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('https://api.santahatgames.com')) return route.fulfill({ contentType: 'application/json', body: '{"gamesRaw":0,"lotteryRaw":0,"storeRaw":0,"totalRaw":0}' });
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://local.test/')) { const f = path.join(ROOT, url.replace('http://local.test/', '').split('#')[0].split('?')[0]); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.abort();
  });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://local.test/online.html?net=local#games', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(3000);
  const g = await p.evaluate(() => { const d = document.querySelector('#tab-games .goodtoknow'); return { jumps: [...document.querySelectorAll('#tab-games .jumps button')].map((b) => b.textContent),
    open: d.open, inside: [...d.querySelectorAll('p')].map((x) => x.querySelector('b')?.textContent), test: !!document.querySelector('#tab-games .testnote')?.offsetParent }; });
  check(g.jumps.join() === 'Big Hat,Snowball Drop,Stocking Stuffer,Recent winners', `jump buttons: ${g.jumps.join(' · ')}`);
  check(!g.open && g.inside.join() === 'Price locked per run,3% SANTA tax' && g.test, 'Good to know is folded with both notes; the Test version note stays visible');
  await p.screenshot({ path: `out/games-tidy-${name}.png` });
  // each jump: the game's heading must end up below the fixed top bar's lower edge (its logo row) and on screen
  for (const id of ['stocking', 'drop', 'winners', 'slots']) {
    await p.click(`#tab-games [data-jump="${id}"]`).catch(async () => { await p.evaluate(() => scrollTo(0, 0)); await p.click(`#tab-games [data-jump="${id}"]`); });
    await p.waitForTimeout(1200);
    const r = await p.evaluate((id) => { const h = document.querySelector('#' + id + ' h2').getBoundingClientRect(), bar = document.querySelector('#nav .brand')?.getBoundingClientRect();
      const top = bar ? bar.bottom : 999; return { h: Math.round(h.top), bar: Math.round(top), inView: h.top >= top - 1 && h.bottom <= innerHeight }; }, id);
    check(r.inView, `${id}: its heading lands in view below the top bar (heading at ${r.h}px, bar ends ${r.bar}px)`);
    await p.evaluate(() => scrollTo(0, 0));
  }
  await ctx.close();
}
check(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
if (fails.length) { console.log('FAIL:', fails.length); process.exit(1); }
console.log('OK: Games tab: jump buttons land each game in view, money notes folded in Good to know, Test version still shown; computer and phone');
