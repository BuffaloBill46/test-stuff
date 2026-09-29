// usage: node shot.mjs <game> <outPrefix> [steps.js]
// steps.js exports async (page) => { ... } run after load; screenshots desktop + phone.
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));

const [, , game, out, stepsFile, only] = process.argv;
const ROOT = new URL('../../mockups', import.meta.url).pathname;
const THREE_DIR = path.resolve('node_modules/three/build');
const steps = stepsFile ? (await import(path.resolve(stepsFile))).default : null;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const sizes = only === 'phone' ? [['phone', 390, 844]] : only === 'desk' ? [['desk', 1280, 800]] : [['desk', 1280, 800], ['phone', 390, 844]];
for (const [label, w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: label === 'phone' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) {
      const f = path.join(THREE_DIR, url.split('/build/')[1]);
      return route.fulfill({ body: readFileSync(f), contentType: 'text/javascript' });
    }
    if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
      try { const body = execSync(`curl -sS -A "Mozilla/5.0 Chrome/120" "${url}"`, { maxBuffer: 1e8 }); return route.fulfill({ body, contentType: url.includes('googleapis') ? 'text/css' : 'font/woff2' }); }
      catch { return route.abort(); }
    }
    if (url.startsWith('http://local.test/')) {
      let p = url.replace('http://local.test/', '').split('#')[0].split('?')[0] || 'index.html';
      const f = path.join(ROOT, p);
      if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      let body = readFileSync(f, 'utf8');
      if (p === 'index.html') body = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + body + '</body></html>';
      return route.fulfill({ body, contentType: p.endsWith('.js') ? 'text/javascript' : 'text/html' });
    }
    return route.abort();
  });
  await page.goto('http://local.test/index.html#' + game);
  await page.waitForFunction(() => window.__arcade?.game, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}-${label}-rest.png` });
  if (steps) await steps(page, label, out);
  const perf = await page.evaluate(() => { const i = window.__arcade.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries }; });
  console.log(label, 'renderer', JSON.stringify(perf));
  console.log(label, 'errors:', errors.length ? errors.slice(0, 12).join('\n  ') : 'none');
  await ctx.close();
}
await browser.close();
