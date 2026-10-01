// Opens the PUBLISHED site's Games tab on a phone-sized screen and pulls the Big Hat once.
import { createRequire } from 'module'; import { execSync } from 'child_process'; import { mkdirSync, readFileSync } from 'fs'; import path from 'path'; import os from 'os';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
mkdirSync('out', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
const errs = [], hdr = path.join(os.tmpdir(), 'h.txt');
await page.context().route('**/*', async (route) => { const url = route.request().url();
  if (/^https:\/\/(buffalobill46\.github\.io|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//.test(url)) {
    try { const out = execSync(`curl -sS -L -D ${hdr} -A "Mozilla/5.0 Chrome/120" "${url}"`, { maxBuffer: 1e8 });
      const ct = (readFileSync(hdr, 'utf8').match(/content-type:\s*([^\r\n]+)/gi) || []).pop()?.split(':')[1]?.trim() || 'text/plain';
      return route.fulfill({ body: out, contentType: ct }); } catch { return route.abort(); } }
  return route.abort(); });
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('https://buffalobill46.github.io/test-stuff/#games', { timeout: 60000 });
await page.waitForFunction(() => window.__slots, null, { timeout: 90000 });
await page.waitForTimeout(2000);
await page.evaluate(() => document.querySelector('#slots [data-run="1"]').click()); // Pull 1: confirm, then it plays
await page.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 15000 });
await page.evaluate(() => document.querySelector('#buyGo').click());
await page.waitForTimeout(500);
await page.waitForFunction(() => window.__slots && !window.__slots.busy, null, { timeout: 90000 });
console.log('live pool:', await page.textContent('#slotPool'), '| balance:', await page.textContent('#demoBal'), '| result:', await page.textContent('.machine .res'));
await page.evaluate(() => { document.querySelector('#spin').scrollIntoView(); document.querySelector('#spin [data-run="1"]').click(); });
await page.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 15000 });
await page.evaluate(() => document.querySelector('#buyGo').click());
await page.waitForTimeout(500);
await page.waitForFunction(() => window.__spin && !window.__spin.busy, null, { timeout: 90000 });
console.log('live spin: pool', await page.textContent('#spinPool'), '| wheel shows', await page.evaluate(() => window.__spin.view.shownMult() + '×'), '| result:', await page.textContent('#spin .res'));
await page.screenshot({ path: 'out/live-games.png' });
await page.evaluate(() => document.querySelector('[data-proof="big"]').click());
await page.evaluate(() => document.querySelector('#proofCheck').click());
await page.waitForFunction(() => /atch/.test(document.querySelector('#proofOut').textContent), null, { timeout: 15000 });
console.log('live fair check:', (await page.textContent('#proofOut')).slice(0, 60));
console.log('errors:', errs.length ? errs : 'none'); await browser.close();
