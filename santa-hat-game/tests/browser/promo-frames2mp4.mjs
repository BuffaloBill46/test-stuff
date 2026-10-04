// Turns a recorded picture sequence (marketing/raw/<name>/ from promo-arcade.mjs) into marketing/raw/<name>.mp4, cropped as
// its index.json says, through marketing/compose.html's framesToMp4. Run: node promo-frames2mp4.mjs arcade-slots [more…]
import { createRequire } from 'module'; import { readFileSync, existsSync, writeFileSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const MK = path.resolve('../../marketing'), TYPES = { '.html': 'text/html', '.json': 'application/json', '.jpg': 'image/jpeg' };
const browser = await chromium.launch(); const page = await browser.newPage();
await page.route('**/*', async (route) => { const url = route.request().url();
  if (url.includes('cdn.jsdelivr.net') || /fonts\.g/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('jsdelivr') ? 'text/javascript' : 'font/woff2' }); } catch { return route.fulfill({ status: 503, body: '' }); } }
  if (url.startsWith('http://localhost/')) { const f = path.join(MK, decodeURIComponent(url.replace('http://localhost/', '').split(/[?#]/)[0])); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: TYPES[path.extname(f)] || 'application/octet-stream' }); }
  return route.fulfill({ status: 503, body: '' }); });
await page.goto('http://localhost/compose.html'); await page.waitForFunction(() => window.readyToCompose);
for (const name of process.argv.slice(2)) {
  const r = await page.evaluate((d) => window.framesToMp4('raw/' + d), name);
  writeFileSync(path.join(MK, 'raw', name + '.mp4'), Buffer.from(r.b64, 'base64')); console.log(`saved raw/${name}.mp4 ${r.w}x${r.h}, ${r.seconds.toFixed(1)} s`);
}
await browser.close();
