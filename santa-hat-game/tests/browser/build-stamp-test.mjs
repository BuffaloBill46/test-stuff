// The published build's version stamps (deploy-pages.sh, 2026-10-03): a stamped dry-run build loads, every game file loads ONCE
// and always with the build id (never a mix), and an old cached page meeting new code reloads exactly once, then plays.
// Run: DRY_RUN=1 KEEP_DIR=<dir> bash ../../deploy-pages.sh, then BUILD_DIR=<dir> node build-stamp-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path'; import http from 'http';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = process.env.BUILD_DIR, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
if (!ROOT || !existsSync(path.join(ROOT, 'index.html'))) { console.log('set BUILD_DIR to a DRY_RUN KEEP_DIR build'); process.exit(2); }
const BUILD = readFileSync(path.join(ROOT, 'buildcheck.js'), 'utf8').match(/BUILD = '([^']+)'/)[1];
let pageBuild = BUILD; const hits = [];
const web = http.createServer((req, res) => { const u = req.url.split('#')[0], file = u.split('?')[0] === '/' ? '/index.html' : u.split('?')[0]; hits.push(u);
  const f = path.join(ROOT, file); if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  let body = readFileSync(f); if (file === '/index.html') body = Buffer.from(body.toString().replace(`data-build="${BUILD}"`, `data-build="${pageBuild}"`));
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); res.end(body); }).listen(8796);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const errors = [];
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.startsWith('http://localhost:8796/')) return route.continue();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  return route.fulfill({ status: 503, body: '' }); });
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
console.log(`1. the stamped build (${BUILD}) loads and plays`);
await p.goto('http://localhost:8796/?net=local', { timeout: 90000 }); await p.waitForFunction(() => window.__sq && !document.querySelector('#season').hidden, null, { timeout: 90000 }); await p.waitForTimeout(1500);
const js = hits.filter((h) => /\.js/.test(h));
check(js.length > 20 && js.every((h) => h.endsWith('?v=' + BUILD)), `every game file asked for with the build id (${js.length} files; unstamped: ${js.filter((h) => !h.endsWith('?v=' + BUILD)).join(', ') || 'none'})`);
const names = js.map((h) => h.split('?')[0]); check(new Set(names).size === names.length, 'each file loaded once (one copy of every module)');
const v = await p.evaluate(() => ({ title: document.querySelector('#ssTitle').textContent, pieces: [...document.querySelectorAll('#ssGold li > span:not(.ssq)')].map((x) => x.textContent), outfit: !!document.querySelector('#ssOutfit img') }));
check(v.title.includes('Calendar') && v.outfit && v.pieces.length === 6 && !v.pieces.includes('a costume piece'), `season card with the outfit and named pieces (${v.pieces.join(', ')})`);
console.log('2. an old cached page meeting this code: one reload, no loop');
pageBuild = 'oldbuild01'; const before = hits.length;
await p.goto('http://localhost:8796/?net=local&x=1', { timeout: 90000 }); await p.waitForTimeout(8000);
const loads = hits.slice(before).filter((h) => h.startsWith('/?net=local&x=1')).length;
check(loads === 2, `the page was asked for twice: the visit and one reload, then stopped (${loads})`);
check(await p.evaluate(() => !!window.__sq), 'and the game runs after it');
check(await p.evaluate(() => sessionStorage.getItem('santa.buildReload')) === BUILD, 'remembered, so it never loops');
check(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close(); web.close();
if (fails.length) { console.log('FAIL:', fails.length); process.exit(1); }
console.log('OK: stamped build: every file with the build id, each once; the season card works; an old page reloads once, no loop');
