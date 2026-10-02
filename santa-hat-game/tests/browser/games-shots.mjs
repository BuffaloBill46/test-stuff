// Screenshots of the Games tab's Big Hat and Snowball Drop cards at a few sizes (for looking, no checks), plus the slot
// machine's size on screen. Run: node games-shots.mjs  → out/games/
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, OUT = 'out/games'; mkdirSync(OUT, { recursive: true });
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const vp of [{ width: 1280, height: 800 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 900, isMobile: vp.width < 900 });
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.abort(); });
  const p = await ctx.newPage();
  await p.goto('http://localhost/online.html?net=local'); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('#t-games').click()); await p.waitForFunction(() => window.__drop && window.__slots, null, { timeout: 90000 }); await p.waitForTimeout(1500);
  for (const sel of ['#slots .machine', '#drop']) {
    await p.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'start' }), sel); await p.waitForTimeout(800);
    const r = await p.evaluate((s) => { const c = document.querySelector(s + ' canvas').getBoundingClientRect(), b = document.querySelector(s + ' [data-run="1"]').getBoundingClientRect(); return { canvas: Math.round(c.width) + '×' + Math.round(c.height), buttonsBottom: Math.round(b.bottom), screenH: innerHeight }; }, sel);
    console.log(vp.width + '×' + vp.height, sel, JSON.stringify(r));
    await p.screenshot({ path: `${OUT}/${vp.width}-${sel.replace(/\W+/g, '')}.png` });
  }
  await ctx.close();
}
await browser.close(); process.exit(0);
