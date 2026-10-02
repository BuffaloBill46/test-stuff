// Plaza themes must not change Christmas (Cody: "Christmas stays the default"). Renders the plaza from an OLD copy of the
// mockups (before themes) and from the current mockups with the same cameras, the same clock and no antialiasing, then
// compares the raw pixels. Writes out/theme/christmas-before-N.png and christmas-after-N.png.
// Run: node theme-christmas-same.mjs <folder holding the old mockups' .js files>
//   (e.g. extract them first: for f in kit plaza; do git show 37f6ea1:santa-hat-game/mockups/$f.js > /tmp/old/$f.js; done)
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, OLD = process.argv[2];
if (!OLD || !existsSync(path.join(OLD, 'plaza.js'))) { console.log('Usage: node theme-christmas-same.mjs <old mockups folder>'); process.exit(2); }
mkdirSync('out/theme', { recursive: true });
const W = 640, H = 400;
// [camera position, look at]: the home screen's orbit, a player's match camera, a far zoom, and the big tree + cottages close up
const CAMS = [[[6.9, 13, 21.9], [0, 1, 0]], [[0, 14, 21.5], [0, 0.6, 7.8]], [[0, 42, 37.5], [0, 0.6, -1]], [[4, 5, 3], [-10, 3, -15]], [[-20, 9, 10], [16, 2, -5]]];
const HARNESS = `<!doctype html><body style="margin:0"><script type="module">
import { THREE, Snow } from './kit.js'; import { buildPlaza } from './plaza.js';
const cv = document.createElement('canvas'); document.body.appendChild(cv);
const r = new THREE.WebGLRenderer({ canvas: cv, antialias: false, preserveDrawingBuffer: true }); r.setPixelRatio(1); r.setSize(${W}, ${H}, false);
const scene = new THREE.Scene(), plaza = buildPlaza(scene);
const snow = new Snow(1400, [60, 24, 60]); scene.add(snow.points);
plaza.update(3.7); snow.update(0.05, 3.7, new THREE.Vector3());
const cam = new THREE.PerspectiveCamera(50, ${W / H}, 0.1, 400), gl = r.getContext(), px = new Uint8Array(${W * H * 4});
window.shots = ${JSON.stringify(CAMS)}.map(([p, l]) => { cam.position.set(...p); cam.lookAt(...l); r.render(scene, cam);
  gl.readPixels(0, 0, ${W}, ${H}, gl.RGBA, gl.UNSIGNED_BYTE, px); let s = ''; for (let i = 0; i < px.length; i += 8192) s += String.fromCharCode(...px.subarray(i, i + 8192));
  return { png: cv.toDataURL('image/png'), raw: btoa(s) }; });
</script>`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function render(dir) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0];
      if (p === 'harness.html') return route.fulfill({ body: HARNESS, contentType: 'text/html' });
      const f = path.join(dir, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: 'text/javascript' }); }
    return route.fulfill({ status: 503, body: '' }); });
  const p = await ctx.newPage(), errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost/harness.html'); await p.waitForFunction(() => window.shots, null, { timeout: 180000 });
  const shots = await p.evaluate(() => window.shots); await ctx.close();
  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  return shots;
}
const before = await render(OLD), after = await render(ROOT);
let fails = 0;
before.forEach((b, i) => {
  const a = after[i], rb = Buffer.from(b.raw, 'base64'), ra = Buffer.from(a.raw, 'base64');
  writeFileSync(`out/theme/christmas-before-${i}.png`, Buffer.from(b.png.split(',')[1], 'base64'));
  writeFileSync(`out/theme/christmas-after-${i}.png`, Buffer.from(a.png.split(',')[1], 'base64'));
  let diff = 0, lit = 0; for (let k = 0; k < rb.length; k += 4) { if (rb[k] !== ra[k] || rb[k + 1] !== ra[k + 1] || rb[k + 2] !== ra[k + 2]) diff++; if (rb[k] + rb[k + 1] + rb[k + 2] > 30) lit++; }
  const ok = diff === 0 && lit > W * H * 0.5; if (!ok) fails++;
  console.log(`${ok ? '  ✓' : '  ✗'} camera ${i}: ${diff} of ${W * H} pixels differ (${Math.round(lit / (W * H) * 100)}% of the picture drawn)`);
});
console.log(fails ? 'FAILED: Christmas changed' : 'ALL CHECKS PASSED: Christmas is pixel-identical');
await browser.close(); process.exit(fails ? 1 : 0);
