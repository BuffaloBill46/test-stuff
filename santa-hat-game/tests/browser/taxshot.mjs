// Screenshots of the 3% SANTA tax notices (Play hero, Wager card, Lottery) on desktop and phone.
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, OUT = 'out/tax'; mkdirSync(OUT, { recursive: true });
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
for (const [label, vp] of [['desk', { width: 1100, height: 760 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://local.test/')) { const p = url.replace('http://local.test/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' }); return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.abort(); });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://local.test/online.html?net=local'); await p.waitForFunction(() => window.__sq, null, { timeout: 60000 }); await p.waitForTimeout(2500);
  const vis = async () => p.$$eval('.taxnote', (els) => els.filter((e) => e.getBoundingClientRect().width > 0).length);
  const notes = await p.$$eval('.taxnote', (els) => els.map((e) => ({ text: e.textContent.trim().slice(0, 40), w: Math.round(e.getBoundingClientRect().width) })));
  console.log(label, 'play notes:', JSON.stringify(notes), '| page wider than screen:', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  await p.screenshot({ path: `${OUT}/${label}-hero.png` });
  await p.evaluate(() => document.querySelector('.mode.locked').scrollIntoView({ block: 'center' })); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${label}-wager.png` });
  await p.evaluate(() => document.querySelector('#t-store').click()); await p.waitForTimeout(500); console.log(label, 'visible tax notes on Store:', await vis());
  await p.evaluate(() => document.querySelector('.lottery').scrollIntoView({ block: 'center' })); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${label}-lottery.png` });
  await ctx.close();
}
console.log('errors:', errors.length ? errors : 'none'); await browser.close();
