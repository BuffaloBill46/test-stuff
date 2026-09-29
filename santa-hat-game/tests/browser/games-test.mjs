// Games tab: Slots demo. Opens the tab, checks the pool and jackpot readouts, pulls both machines, forces a win and a
// jackpot, and checks the money adds up. Screenshots in out/games/.
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, OUT = 'out/games'; mkdirSync(OUT, { recursive: true });
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [], fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const money = (s) => +s.replace('$', '');
for (const [label, vp] of [['desk', { width: 1200, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://local.test/')) { const p = url.replace('http://local.test/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' }); return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.abort(); });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(label + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(label + ': ' + m.text()); });
  await p.goto('http://local.test/online.html?net=local'); await p.waitForFunction(() => window.__sq, null, { timeout: 60000 }); await p.waitForTimeout(1500);
  await p.evaluate(() => document.querySelector('#t-games').click());
  await p.waitForFunction(() => window.__slots, null, { timeout: 60000 }).catch((e) => { console.log('errors so far:', errors); throw e; }); await p.waitForTimeout(3000);
  const read = () => p.evaluate(() => ({ pool: document.querySelector('#slotPool').textContent, bal: document.querySelector('#demoBal').textContent,
    mini: [...document.querySelectorAll('.machine[data-m="mini"] .jp b')].map((e) => e.textContent), big: [...document.querySelectorAll('.machine[data-m="big"] .jp b')].map((e) => e.textContent),
    res: [...document.querySelectorAll('.machine .res')].map((e) => e.textContent), wide: document.documentElement.scrollWidth > innerWidth }));
  let r = await read(); console.log(label, 'at rest:', JSON.stringify(r));
  check(r.pool === '$50.00' && r.bal === '$10.00', 'starting pool/balance');
  check(r.mini[0] === '1%' && r.mini[1] === '$0.50' && r.big[0] === '10%' && r.big[1] === '$5.00', 'jackpot readouts at rest');
  check(!r.wide, label + ': page wider than screen');
  await p.screenshot({ path: `${OUT}/${label}-1-rest.png`, fullPage: false });
  await p.evaluate(() => document.querySelector('.machines').scrollIntoView({ block: 'start' })); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${label}-2-machines.png` });
  // a plain losing pull on Mini Hat
  await p.evaluate(() => { window.__slots.force.mini = 'none'; document.querySelector('.machine[data-m="mini"] .pull').click(); });
  await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${label}-3-spinning.png` });
  await p.waitForFunction(() => !document.querySelector('.machine[data-m="mini"] .pull').disabled, null, { timeout: 60000 });
  r = await read(); console.log(label, 'after mini loss:', r.bal, r.pool, r.res[0]);
  check(r.bal === '$9.90', 'mini loss should cost $0.10, balance ' + r.bal);
  const poolAfterLoss = await p.evaluate(() => window.__slots.state.pool);
  check(Math.abs(poolAfterLoss - (50 + 0.10 * 0.875909)) < 1e-6, 'pool after loss ' + poolAfterLoss);
  // a forced 3 x Star on Big Hat: 20x $1 = $20, player gets $19.40
  await p.evaluate(() => { window.__slots.force.big = 'star'; document.querySelector('.machine[data-m="big"] .pull').click(); });
  await p.waitForFunction(() => !document.querySelector('.machine[data-m="big"] .pull').disabled, null, { timeout: 60000 });
  await p.waitForTimeout(250); await p.screenshot({ path: `${OUT}/${label}-4-win.png` });
  r = await read(); console.log(label, 'after big star win:', r.bal, r.pool, r.res[1]);
  check(r.bal === '$28.30', 'balance after star win should be 9.90 - 1.00 + 19.40 = $28.30, got ' + r.bal);
  const shown = await p.evaluate(() => window.__slots.views.big.shown());
  const line = await p.evaluate(async (st) => { const m = await import('./slots.js'); const res = m.readLine(st); return res && res.sym; }, shown);
  check(line === 'star', 'Big Hat reels should show 3 stars on the payline, read ' + line);
  // a forced jackpot on Big Hat: 10% of the pool after this pull's entry
  const before = await p.evaluate(() => window.__slots.state.pool);
  await p.evaluate(() => { window.__slots.force.big = 'hat'; document.querySelector('.machine[data-m="big"] .pull').click(); });
  await p.waitForFunction(() => !document.querySelector('.machine[data-m="big"] .pull').disabled, null, { timeout: 60000 });
  await p.screenshot({ path: `${OUT}/${label}-5-jackpot.png` });
  check(await p.evaluate(() => document.querySelector('.machine[data-m="big"] .flash').textContent) === 'JACKPOT!', 'jackpot stamp shown');
  const after = await p.evaluate(() => window.__slots.state.pool), jp = (before + 0.875909) * 0.10;
  check(Math.abs(after - (before + 0.875909 - jp)) < 1e-4, `jackpot pool math: before ${before} after ${after}`);
  r = await read(); console.log(label, 'after jackpot:', r.bal, r.pool, r.big, r.res[1]);
  check(Math.abs(money(r.pool) - Math.floor(after * 100) / 100) < 0.011, 'pool readout matches state');
  check(Math.abs(money(r.big[1]) - Math.floor(after * 0.10 * 100) / 100) < 0.011, 'Big Hat jackpot readout = 10% of pool');
  // paytable opens and lists 9 winning lines + the no-win line
  await p.evaluate(() => { const d = document.querySelector('.paytable'); d.open = true; d.scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(300);
  check(await p.locator('.paytable li').count() === 10, 'paytable rows');
  await p.screenshot({ path: `${OUT}/${label}-6-paytable.png` });
  await ctx.close();
}
console.log('errors:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close();
