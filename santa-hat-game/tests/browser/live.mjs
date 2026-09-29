import { createRequire } from 'module'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
const errs = [];
await page.context().route('**/*', async (route) => {
  const url = route.request().url();
  if (/^https:\/\/(buffalobill46\.github\.io|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//.test(url)) {
    try { const out = execSync(`curl -sS -L -D ${require('os').tmpdir()}/h.txt -A "Mozilla/5.0 Chrome/120" "${url}"`, { maxBuffer: 1e8 });
      const ct = (require('fs').readFileSync(`${require('os').tmpdir()}/h.txt`, 'utf8').match(/content-type:\s*([^\r\n]+)/gi) || []).pop()?.split(':')[1]?.trim() || 'text/plain';
      return route.fulfill({ body: out, contentType: ct }); } catch { return route.abort(); }
  }
  return route.abort();
}); page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('https://buffalobill46.github.io/test-stuff/?room=TEST', { timeout: 60000 });
await page.waitForFunction(() => window.__sq, null, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'out/live-phone-home.png' });
console.log('join button says:', await page.textContent('#joinBtn'));
await page.tap('#quick'); await page.waitForTimeout(16000);
console.log('status after Quick play:', JSON.stringify(await page.textContent('#status')));
await page.tap('#practice'); await page.waitForTimeout(4000);
await page.tap('#start'); await page.waitForTimeout(4000);
console.log('practice:', JSON.stringify(await page.evaluate(() => ({ phase: window.__sq.view.phase, ents: window.__sq.view.ents.length }))));
await page.screenshot({ path: 'out/live-phone-practice.png' });
console.log('errors:', errs.length ? errs.slice(0, 8).join('\n ') : 'none');
await browser.close();
