// Renders a marketing timeline (marketing/timelines/*.json) through marketing/compose.html in Chrome and saves the video.
// Run: node promo-compose.mjs <timeline.json> <out name, no extension>   -> marketing/out/<name>.mp4 (or .webm)
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const MK = path.resolve('../../marketing'), OUT = path.join(MK, 'out'); mkdirSync(OUT, { recursive: true });
const [, , TLF, NAME] = process.argv, TL = JSON.parse(readFileSync(path.resolve(TLF), 'utf8'));
const TYPES = { '.html': 'text/html', '.mp4': 'video/mp4', '.webm': 'video/webm', '.png': 'image/png', '.js': 'text/javascript' };
// headed, with sound allowed to start by itself: a headless Chrome hands the recorder stale frames
const browser = await chromium.launch({ headless: false, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 420, height: 740 } });
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr\.net/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('jsdelivr') ? 'text/javascript' : 'font/woff2' }); } catch { return route.fulfill({ status: 503, body: '' }); } }
  if (url.startsWith('http://localhost/')) { const p = decodeURIComponent(url.replace('http://localhost/', '').split(/[?#]/)[0]), f = path.join(MK, p);
    if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: TYPES[path.extname(f)] || 'application/octet-stream', headers: { 'Accept-Ranges': 'bytes' } }); }
  return route.fulfill({ status: 503, body: '' }); });
const page = await ctx.newPage(); page.on('pageerror', (e) => console.log('ERR', e.message)); page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
await page.goto('http://localhost/compose.html'); await page.waitForFunction(() => window.readyToCompose);
const t = Date.now(); const r = await page.evaluate((tl) => window.compose(tl), TL);
const ext = r.mime.includes('mp4') ? 'mp4' : 'webm', file = path.join(OUT, `${NAME}.${ext}`);
writeFileSync(file, Buffer.from(r.b64, 'base64'));
console.log(`saved ${file} (${r.mime}, ${r.seconds.toFixed(1)} s of video in ${((Date.now() - t) / 1000).toFixed(1)} s, ${(Buffer.byteLength(r.b64, 'base64') / 1e6).toFixed(1)} MB)`);
await browser.close();
