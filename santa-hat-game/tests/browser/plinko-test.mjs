// Snowball Drop preview in a real browser, phone and desktop: drops land where their path says, the balance is exactly
// start − drops + prizes, several can fly at once, no errors. Screenshots: out/plinko-<size>.png (mid-drop).
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const fails = []; const check = (ok, what) => { if (!ok) fails.push(what); };
for (const [label, w, h] of [['phone', 384, 740], ['desk', 1280, 800]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: label === 'phone', deviceScaleFactor: 1 });
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (/fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : 'font/woff2' }); } catch { return route.abort(); } }
    if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' }); return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.fulfill({ status: 503, body: '' }); });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost/plinko.html', { timeout: 90000 }); await page.waitForFunction(() => window.__drop, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.click('[data-bet="0.1"]');
  let most = 0;
  for (let i = 0; i < 20; i++) { await page.click('#drop'); most = Math.max(most, await page.evaluate(() => window.__drop.flying)); await page.waitForTimeout(90); }
  await page.screenshot({ path: `out/plinko-${label}.png` });
  check(most > 1, `${label}: several snowballs in the air at once (most ${most})`);
  await page.click('[data-bet="1"]'); for (let i = 0; i < 10; i++) { await page.click('#drop'); await page.waitForTimeout(120); }
  await page.waitForFunction(() => window.__drop.flying === 0, null, { timeout: 30000 });
  const s = await page.evaluate(() => ({ bal: window.__drop.bal, recent: window.__drop.recent.map((r) => ({ bet: r.bet, pay: r.pay, bin: r.bin, rights: r.path.reduce((a, b) => a + b, 0) })), shown: document.querySelector('#bal').textContent, strip: document.querySelectorAll('#strip span').length }));
  const all = await page.evaluate(() => window.__drop.recent.length);
  check(all === 14, `${label}: last-drops strip keeps 14 (got ${all})`);
  check(s.recent.every((r) => r.bin === r.rights), `${label}: every drop landed in the bin its path says`);
  check(s.shown === '$' + s.bal.toFixed(2), `${label}: balance shown matches`);
  const ledger = await page.evaluate(() => window.__drop.log.map((r) => [r.bet, r.pay]));
  const exact = Math.round((10 - ledger.reduce((a, [b]) => a + b, 0) + ledger.reduce((a, [, p]) => a + p, 0)) * 100) / 100;
  const dropped = await page.evaluate(() => window.__drop.dropped);
  check(ledger.length === dropped && dropped >= 25, `${label}: every paid drop landed (${ledger.length} of ${dropped}; drops with too little demo money are refused)`);
  check(Math.abs(s.bal - exact) < 1e-9, `${label}: balance = start − drops + prizes, to the cent (${s.bal} vs ${exact})`);
  const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check(!over, `${label}: nothing wider than the screen`);
  check(!errors.length, `${label}: page errors: ${errors.join('; ')}`);
  console.log(label, 'balance after 20×10¢ + 10×$1:', s.shown);
  await ctx.close();
}
await browser.close();
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED'); process.exit(fails.length ? 1 : 0);
