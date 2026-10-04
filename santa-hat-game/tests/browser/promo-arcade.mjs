// Marketing clips of the three quick games (video 4, 2026-10-04): each game's own screen recorded while it plays a run of 5
// on the private copy's demo credits (net=local: no money, no server). Headed Chrome (see promo-gameplay.mjs).
// Writes marketing/raw/arcade-<game>.webm. Run: node promo-arcade.mjs [slots,drop,stocking] [seconds=9]
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = path.resolve('../../mockups'), OUT = path.resolve('../../marketing/raw'); mkdirSync(OUT, { recursive: true });
const GAMES = (process.argv[2] || 'slots,drop,stocking').split(','), SECS = +(process.argv[3] || 9);
const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 3, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem('santa.coached', '1'));
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.fulfill({ status: 503, body: '' }); } }
  if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : p.endsWith('.css') ? 'text/css' : 'text/html' }); }
  return route.fulfill({ status: 503, body: '' }); });
const page = await ctx.newPage(); page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost/online.html?net=local', { timeout: 90000 }); await page.waitForFunction(() => window.__sq, null, { timeout: 90000 });
await page.evaluate(() => document.querySelector('#t-games').click()); await page.waitForFunction(() => window.__drop && window.__slots, null, { timeout: 90000 }); await page.waitForTimeout(1500);
for (const game of GAMES) {
  const sel = `#${game}`;
  await page.evaluate((s) => document.querySelector(s + ' canvas').scrollIntoView({ block: 'center' }), sel); await page.waitForTimeout(800);
  await page.evaluate((s) => { const c = document.querySelector(s + ' canvas'); const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 12e6 });
    const parts = []; rec.ondataavailable = (e) => parts.push(e.data); window.__rec = { rec, parts }; rec.start(500); }, sel);
  await page.waitForTimeout(700);
  // a run of 5, confirmed in the same dialog players see
  const run = await page.$(`${sel} [data-run="5"]`) ? '5' : '1';
  await page.evaluate(([s, n]) => document.querySelector(`${s} [data-run="${n}"]`).click(), [sel, run]);
  await page.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 }); await page.evaluate(() => document.querySelector('#buyGo').click());
  // Stocking Stuffer: open stockings by tapping the canvas, as a player does
  const t0 = Date.now();
  while (Date.now() - t0 < SECS * 1000) {
    if (game === 'stocking') { const b = await page.evaluate((s) => { const r = document.querySelector(s + ' canvas').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }, sel);
      await page.mouse.click(b[0] + b[2] * (0.15 + Math.random() * 0.7), b[1] + b[3] * (0.1 + Math.random() * 0.26)); }
    await page.waitForTimeout(700);
  }
  const b64 = await page.evaluate(() => new Promise((done) => { const { rec, parts } = window.__rec; rec.onstop = async () => { const buf = new Uint8Array(await new Blob(parts).arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode(...buf.subarray(i, i + 32768)); done(btoa(s)); }; rec.stop(); }));
  writeFileSync(path.join(OUT, `arcade-${game}.webm`), Buffer.from(b64, 'base64')); console.log('saved', `arcade-${game}.webm`);
  await page.evaluate(() => document.querySelector('#buyDlg').open && document.querySelector('#buyCancel').click()).catch(() => {});
  await page.waitForTimeout(1500);
}
await browser.close();
