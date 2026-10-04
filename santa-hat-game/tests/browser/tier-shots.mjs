// Pictures of the tiered win celebrations (celebrate.js) mid-flight on a phone: tiers 2-5 on Big Hat, 4 on Drop, 3 on
// Stocking. For looking (no checks). Run: node tier-shots.mjs → out/tiers/
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = path.resolve('../../mockups'), OUT = 'out/tiers'; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem('santa.coached', '1'));
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.fulfill({ status: 503, body: '' }); } }
  if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.fulfill({ status: 503, body: '' }); });
const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost/online.html?net=local'); await page.waitForFunction(() => window.__sq, null, { timeout: 90000 });
await page.evaluate(() => document.querySelector('#t-games').click()); await page.waitForFunction(() => window.__drop && window.__slots, null, { timeout: 90000 }); await page.waitForTimeout(1500);
for (const [sel, tier, stampTxt, amount] of [['#slots .machine', 2, 'WIN $5.40', 5.4], ['#slots .machine', 3, 'WIN $14.00', 14], ['#slots .machine', 4, '100×!', 100], ['#slots .machine', 5, 'JACKPOT!', 127.6],
  ['#drop .dropcard', 4, '25× WIN', 25], ['#stocking .stockcard', 3, '15× WIN', 15]]) {
  await page.evaluate((s) => document.querySelector(s + ' .screen').scrollIntoView({ block: 'center' }), sel); await page.waitForTimeout(500);
  await page.evaluate(async ([s, tier, txt, amount]) => { const { celebrate } = await import('./celebrate.js'); const card = document.querySelector(s), fl = card.querySelector('.flash');
    card.classList.toggle('jackpot', tier === 5); fl.textContent = txt; fl.classList.remove('show'); void fl.offsetWidth; fl.classList.add('show');
    celebrate(card, tier, { amount, money: (v) => '$' + v.toFixed(2) }); }, [sel, tier, stampTxt, amount]);
  await page.waitForTimeout(tier >= 4 ? 1100 : 750);
  const box = await page.evaluate((s) => { const r = document.querySelector(s + ' .screen').getBoundingClientRect(); return { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 }; }, sel);
  await page.screenshot({ path: `${OUT}/${sel.split(' ')[0].slice(1)}-t${tier}.png`, clip: box }); await page.waitForTimeout(tier >= 4 ? 4500 : 2500);
}
console.log('errors:', errors.length ? errors : 'none'); await browser.close();
