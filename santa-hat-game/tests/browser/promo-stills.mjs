// Renders the 5 intro-video characters (mockups/promo-stills.html) to marketing/stills/char-N.png, 720x1280.
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = path.resolve('../../mockups'), OUT = path.resolve('../../marketing/stills'); mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (url.includes('cdn.jsdelivr.net/npm/')) return route.fulfill({ body: execSync('curl -sS -L "' + url + '"', { maxBuffer: 1e8 }), contentType: 'text/javascript' });
  if (url.startsWith('http://localhost/')) { const f = path.join(ROOT, url.replace('http://localhost/', '').split(/[?#]/)[0]); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.fulfill({ status: 503, body: '' }); });
const page = await ctx.newPage(); page.on('pageerror', (e) => console.log('ERR', e.message)); page.on('console', (m) => console.log('LOG', m.text())); page.on('requestfailed', (r) => console.log('FAIL', r.url()));
for (const who of (process.argv[2] || '0,1,2,3,4').split(',')) {
  await page.goto(`http://localhost/promo-stills.html?who=${who}&n=${Date.now()}`); await page.waitForFunction(() => window.ready, null, { timeout: 20000 });
  await page.screenshot({ path: path.join(OUT, `char-${who}.png`) }); console.log('saved char-' + who);
}
await browser.close();
