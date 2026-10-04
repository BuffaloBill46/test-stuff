// Renders the Twitter brand art (mockups/promo-brand.html) to marketing/brand/: logo.png (1000x1000 shown, 2000x2000 saved) and
// banner.png (1500x500 shown, 3000x1000 saved). Run: node --import ./win-chrome.mjs promo-brand.mjs [logo,banner]
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = path.resolve('../../mockups'), OUT = path.resolve('../../marketing/brand'); mkdirSync(OUT, { recursive: true });
const cache = new Map(), curl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const SIZES = { logo: [1000, 1000], banner: [1500, 500] }, extra = process.argv[3] || '';
for (const kind of (process.argv[2] || 'logo,banner').split(',')) {
  const [w, h] = SIZES[kind];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) return route.fulfill({ body: curl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' });
    if (url.startsWith('http://localhost/')) { const f = path.join(ROOT, url.replace('http://localhost/', '').split(/[?#]/)[0]); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.fulfill({ status: 503, body: '' }); });
  const page = await ctx.newPage(); page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.goto(`http://localhost/promo-brand.html?kind=${kind}&w=${w}&h=${h}&s=2${extra}`); await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
  await page.screenshot({ path: path.join(OUT, `${kind}.png`) }); console.log('saved ' + kind); await ctx.close();
}
await browser.close();
