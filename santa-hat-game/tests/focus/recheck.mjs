// Re-check the focus-group fixes on a phone: the result line is on screen after a play; the buy counter focuses Buy.
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url); const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, THREE = new URL('../browser/node_modules/three/build/', import.meta.url).pathname;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); const fails = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(THREE + url.split('/build/')[1]), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.g/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: '' }); return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.fulfill({ status: 503, body: '' }); });
const p = await ctx.newPage(); await p.goto('http://localhost/online.html?net=local'); await p.waitForFunction(() => window.__sq, null, { timeout: 60000 });
await p.evaluate(() => document.querySelector('#t-games').click()); await p.waitForFunction(() => window.__spin, null, { timeout: 90000 }); await p.waitForTimeout(2000);
// visible = above the bottom tab bar, which covers the page on phones
const inView = (sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(), t = document.querySelector('#nav .tabs').getBoundingClientRect(); return r.top >= 0 && r.bottom <= Math.min(innerHeight, t.top); }, sel);
for (const [game, btn, res] of [['spin', '#spin .spinbtn', '#spin .res'], ['slots', '.machine .pull', '#slots .machine .res']]) {
  await p.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'end' }), btn); await p.waitForTimeout(300);
  await p.evaluate((s) => document.querySelector(s).click(), btn); await p.waitForTimeout(400);
  if (!(await p.evaluate(() => document.activeElement?.id === 'buyGo'))) fails.push(`${game}: the buy counter should focus Buy`);
  await p.evaluate(() => document.querySelector('#buyGo').click());
  await p.waitForTimeout(600); await p.waitForFunction(() => !(window.__slots?.busy || window.__spin?.busy), null, { timeout: 120000 }); await p.waitForTimeout(900);
  if (!(await inView(res))) fails.push(`${game}: the result line is off-screen after the play`);
  await p.screenshot({ path: `out/recheck-${game}.png` });
}
await b.close(); console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'OK: results on screen after a play on a phone; the buy counter focuses Buy');
