// The big "Play now" button (Cody, 2026-10-03): on the Play page's first screen, no scrolling, on a phone and a computer, and
// one tap lands in a free public Auto match (the lobby's own Auto match path). Screenshots in out/. Run: node playbtn-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync('out', { recursive: true });
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function open(viewport) {
  const ctx = await browser.newContext({ viewport, ...(viewport.width < 600 ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://local.test/')) { const f = path.join(ROOT, url.replace('http://local.test/', '').split('#')[0].split('?')[0]); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.abort();
  });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://local.test/online.html?net=local', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1200);
  return p;
}
for (const [name, viewport] of [['computer', { width: 1366, height: 768 }], ['phone', { width: 375, height: 667 }]]) {
  console.log(`${name} (${viewport.width}×${viewport.height})`);
  const p = await open(viewport);
  const b = await p.locator('#playBig').boundingBox();
  check(b && b.y >= 0 && b.y + b.height <= viewport.height, `Play now is on the first screen without scrolling (bottom at ${b && Math.round(b.y + b.height)} of ${viewport.height})`);
  check(b && b.height >= 44 && b.width >= 140, `big enough to tap (${b && Math.round(b.width)}×${b && Math.round(b.height)})`);
  await p.screenshot({ path: `out/playbtn-${name}.png` });
  await p.click('#playBig');
  await p.waitForFunction(() => window.__sq.room, null, { timeout: 30000 }).catch(() => {});
  const s = await p.evaluate(() => ({ room: window.__sq.room, lobby: !document.querySelector('#home').hidden }));
  check(!!s.room && !s.lobby, `one tap: in a public Auto match room, lobby closed (${JSON.stringify(s)})`);
  await p.context().close();
}
check(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
if (fails.length) { console.log('FAIL:', fails.length); process.exit(1); }
console.log('OK: the big Play now button is on the first screen on a computer and a phone, and one tap lands in a free Auto match');
