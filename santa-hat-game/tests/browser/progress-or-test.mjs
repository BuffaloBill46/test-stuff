// The Player Progress box (Cody, 2026-10-01): under "Buy level N", "or win 10 matches top 3 or better" with a counter (2 / 10; 10 ticks a level since 2026-10-04).
// Shown only where a level can be bought (levels 1–4); from level 5 up the levels are earned only and the line above says so.
// Run: node progress-or-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [w, h] of [[1200, 800], [384, 740], [320, 620]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900, isMobile: w < 900 });
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.fulfill({ status: 503, body: '' }); });
  const p = await ctx.newPage(), errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost/online.html?net=local', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(800);
  const show = (prof) => p.evaluate(async (prof) => { (await import('./tabs.js')).renderProgress(prof); const o = document.querySelector('#pgOr'), r = o.getBoundingClientRect(), b = document.querySelector('#pgBuy').getBoundingClientRect();
    return { hidden: o.hidden || r.height === 0, text: o.textContent.replace(/\s+/g, ' ').trim(), below: r.top >= b.bottom - 1, inside: r.right <= innerWidth && r.left >= 0, scroll: document.documentElement.scrollWidth > innerWidth }; }, prof);
  const guest = await show(null);
  check(!guest.hidden && guest.text === 'or win 10 matches top 3 or better 0 / 10', `${w}×${h} guest: "${guest.text}"`);
  const l3 = await show({ level: 3, xp: 2, rank_points: 40 });
  check(!l3.hidden && l3.text === 'or win 10 matches top 3 or better 2 / 10' && l3.below && l3.inside && !l3.scroll, `${w}×${h} level 3, 2 done: "${l3.text}", under the button, on screen`);
  await p.locator('#progress').screenshot({ path: `out/progress-or-${w}x${h}.png` });
  const l5 = await show({ level: 5, xp: 1, rank_points: 40 });
  check(l5.hidden && await p.evaluate(() => document.querySelector('#pgBuy').hidden), `${w}×${h} level 5: no Buy button, no "or" line (earned only)`);
  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : '')); await ctx.close();
}
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); process.exit(0);
