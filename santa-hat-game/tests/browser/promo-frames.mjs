// Contact sheet of a video (marketing clips): N frames side by side, to check a clip without watching it.
// Run: node promo-frames.mjs <video> <out.png> [frames=6]
import { createRequire } from 'module'; import { readFileSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const [, , VID, OUT, N = '6'] = process.argv, n = +N;
const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 200 * n, height: 400 } });
await page.route('http://localhost/v', (r) => r.fulfill({ body: readFileSync(path.resolve(VID)), contentType: VID.endsWith('.mp4') ? 'video/mp4' : 'video/webm' }));
await page.route('http://localhost/', (r) => r.fulfill({ body: '<body style="margin:0;background:#000"></body>', contentType: 'text/html' }));
await page.goto('http://localhost/');
const info = await page.evaluate(async (n) => {
  const v = document.createElement('video'); v.src = '/v'; v.muted = true; await new Promise((r) => (v.onloadedmetadata = r));
  // a recording made live may report Infinity until read to the end
  if (!isFinite(v.duration)) { v.currentTime = 1e9; await new Promise((r) => (v.ontimeupdate = r)); }
  const d = v.duration, c = document.createElement('canvas'); c.width = 200 * n; c.height = 400; document.body.appendChild(c); const g = c.getContext('2d');
  // play it through and grab on the way (a live recording has no seek index: jumping lands on its first frame)
  v.currentTime = 0; await new Promise((r) => (v.onseeked = r)); await v.play();
  for (let i = 0; i < n; i++) { const at = (d * (i + 0.5)) / n; while (v.currentTime < at && !v.ended) await new Promise((r) => requestAnimationFrame(r));
    const s = Math.min(200 / v.videoWidth, 400 / v.videoHeight), w = v.videoWidth * s, h = v.videoHeight * s; g.drawImage(v, i * 200 + (200 - w) / 2, (400 - h) / 2, w, h);
    g.fillStyle = '#ff0'; g.font = '14px sans-serif'; g.fillText(((d * (i + 0.5)) / n).toFixed(1) + 's', i * 200 + 4, 16); }
  return { d, w: v.videoWidth, h: v.videoHeight };
}, n);
await page.screenshot({ path: OUT }); console.log(JSON.stringify(info)); await browser.close();
