// SHARE A WIN: the picture (sharecard.js; the button after a real winning run is checked in games-test). The real module in the
// page: no button unless a run won more than it cost; the card is a 1200×630 picture with the run's own numbers; on a computer
// (no share sheet) "Share this win" saves it as santa-hat-win.png and says so. Picture saved to out/share-win.png.
// Run: node share-win-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync('out', { recursive: true });
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const errors = [];
await ctx.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.startsWith('https://api.santahatgames.com')) return route.fulfill({ contentType: 'application/json', body: '{"error":"stand-in"}' });
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('http://local.test/')) { const f = path.join(ROOT, url.replace('http://local.test/', '').split('#')[0].split('?')[0]); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.abort();
});
// a computer without a share sheet (the test browser says it has one but can't show it): the picture is saved instead
await ctx.addInitScript(() => { Object.defineProperty(navigator, 'canShare', { value: () => false }); });
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://local.test/online.html?net=local#games', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1500);
const btn = await p.evaluate(async () => { const m = await import('./sharecard.js');
  return { even: m.shareButton({ kind: 'big', sent: 1, cost: 1 }), lost: m.shareButton({ kind: 'drop', sent: 0.4, cost: 1 }), won: m.shareButton({ kind: 'stocking', sent: 12.4, cost: 5, jackpot: 0 }) }; });
check(btn.even === '' && btn.lost === '', 'no button when the run got back its cost or less');
check(/data-share-win/.test(btn.won) && /"sent":12\.4/.test(btn.won) && /"cost":5/.test(btn.won), 'a button with the run\'s numbers when it won more');
// put that button on the page and press it, like a player
await p.evaluate((h) => { const d = document.createElement('div'); d.id = 'sharebox'; d.innerHTML = h; document.body.append(d); }, btn.won.replace('"stocking"', '"drop"').replace('"jackpot":0', '"jackpot":125').replace('"sent":12.4', '"sent":126.2'));
const dl = p.waitForEvent('download', { timeout: 20000 });
await p.evaluate(() => document.querySelector('#sharebox [data-share-win]').click()); // (the test's own box sits under the full-screen game canvas)
const file = await dl.catch(() => null);
check(!!file && file.suggestedFilename() === 'santa-hat-win.png', `a computer saves the picture (${file?.suggestedFilename()})`);
if (file) { await file.saveAs('out/share-win.png'); const b = readFileSync('out/share-win.png'); check(b.readUInt32BE(16) === 1200 && b.readUInt32BE(20) === 630, `1200×630 PNG (${b.readUInt32BE(16)}×${b.readUInt32BE(20)})`); }
await p.waitForTimeout(400);
check(/Saved/.test(await p.textContent('#sharebox [data-share-win]')), 'the button says it was saved');
check(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
if (fails.length) { console.log('FAIL:', fails.length); process.exit(1); }
console.log('OK: Share this win: only for a run that won more than it cost, the run\'s own numbers, a 1200×630 picture saved on a computer');
