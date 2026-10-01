// Phone controls (Cody, 2026-10-01): the floating joystick is the ONLY way to move; a tap anywhere else, the left side too,
// throws there; pulling past the joystick's edge carries it along and it stays (remembered); ＋/− zoom (remembered).
// A real touch screen (Playwright touch events) on a practice match. Run: node controls-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 384, height: 740 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const serve = async (route) => { const url = route.request().url();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.fulfill({ status: 503, body: '' }); };
await ctx.route('**/*', serve);
const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message));
const cdp = await ctx.newCDPSession(p);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
const tap = async (x, y) => { await touch('touchStart', [[x, y]]); await p.waitForTimeout(60); await touch('touchEnd', []); };
async function practice() {
  await p.goto('http://localhost/online.html?net=local', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 60000 }); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__sq.startPractice()); await p.waitForTimeout(2500); await p.evaluate(() => document.querySelector('#start')?.click());
  await p.waitForFunction(() => window.__sq.view?.phase === 'play', null, { timeout: 60000 }); await p.waitForTimeout(4000); // the round-start throw cooldown
}
const me = () => p.evaluate(() => { const v = window.__sq.view, e = v.ents.find((x) => x.peer === window.__sq.me.id); return { x: e.x, z: e.z, ammo: e.ammo }; });
const joyBox = () => p.evaluate(() => { const j = document.querySelector('#joy'); const r = j.getBoundingClientRect(); return { hidden: j.hidden, x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
// Did a tap throw? A NEW snowball of mine appears in flight. (Not the ammo count: a full bar refills the first throw at once.)
const lastBall = () => p.evaluate(() => Math.max(-1, ...window.__sq.view.balls.map((b) => b.id)));
const threwSince = (id) => p.waitForFunction((id) => { const v = window.__sq.view, e = v.ents.find((x) => x.peer === window.__sq.me.id); return v.balls.some((b) => b.owner === e.id && b.id > id); }, id, { timeout: 1500 }).then(() => true, () => false);
const camDist = () => p.evaluate(() => window.__sq.camDist?.());

console.log('1. The joystick sits on screen during a match (touch screens)');
await p.evaluate(() => { try { localStorage.removeItem('sh_joy'); localStorage.removeItem('sh_zoom'); } catch {} });
await practice();
let j = await joyBox();
check(!j.hidden && j.x < 384 / 2 && j.y > 740 / 2, `shown bottom left by default (${Math.round(j.x)}, ${Math.round(j.y)})`);

console.log('2. A tap on the LEFT side of the screen throws (it used to be joystick-only)');
let b0 = await lastBall(); await tap(40, 260);
check(await threwSince(b0), 'a tap at the left edge threw a snowball');
const before = await me();
await p.waitForTimeout(600); b0 = await lastBall(); await tap(330, 300);
check(await threwSince(b0), 'a tap on the right throws too');
check(Math.hypot((await me()).x - before.x, (await me()).z - before.z) < 0.3, 'taps never move the player');

console.log('3. A drag that starts ON the joystick moves the player, and throws nothing');
const s0 = await me(); const b1 = await lastBall();
await touch('touchStart', [[j.x, j.y]]); for (let i = 1; i <= 8; i++) { await touch('touchMove', [[j.x + i * 5, j.y]]); await p.waitForTimeout(80); }
await p.waitForTimeout(1500); const s1 = await me();
check(Math.hypot(s1.x - s0.x, s1.z - s0.z) > 1, `the player moved (${s0.x.toFixed(1)},${s0.z.toFixed(1)} → ${s1.x.toFixed(1)},${s1.z.toFixed(1)})`);
check(!(await threwSince(b1)), 'steering threw nothing');

console.log('4. Pulled past its edge it follows the thumb, and stays where it was let go (remembered)');
for (let i = 1; i <= 10; i++) { await touch('touchMove', [[j.x + 40 + i * 10, j.y - i * 12]]); await p.waitForTimeout(40); }
await touch('touchEnd', []); await p.waitForTimeout(300);
const moved = await joyBox();
check(Math.hypot(moved.x - j.x, moved.y - j.y) > 60, `the joystick moved with the thumb (${Math.round(j.x)},${Math.round(j.y)} → ${Math.round(moved.x)},${Math.round(moved.y)})`);
const k = await p.evaluate(() => getComputedStyle(document.querySelector('#joy')).getPropertyValue('--jx').trim());
check(k === '0px', 'the knob springs back to the centre on release');

console.log('5. Zoom: ＋ comes closer, − goes further, remembered');
const d0 = await camDist(); await p.evaluate(() => document.querySelector('#zoomIn').click()); await p.waitForTimeout(2500); const d1 = await camDist();
await p.evaluate(() => { document.querySelector('#zoomOut').click(); document.querySelector('#zoomOut').click(); }); await p.waitForTimeout(2500); const d2 = await camDist();
check(d1 < d0 * 0.95 && d2 > d1 * 1.2, `camera distance ${d0?.toFixed(1)} → + ${d1?.toFixed(1)} → −− ${d2?.toFixed(1)}`);
await p.screenshot({ path: 'out/controls-phone.png' });

console.log('6. After a reload: the joystick and zoom are where the player left them');
await practice();
const again = await joyBox(), d3 = await camDist();
check(Math.hypot(again.x - moved.x, again.y - moved.y) < 3, `joystick remembered (${Math.round(again.x)}, ${Math.round(again.y)})`);
check(Math.abs(d3 - d2) / d2 < 0.08, `zoom remembered (${d3?.toFixed(1)})`);

console.log('7. A computer (no touch): no joystick; the mouse wheel zooms');
const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); await dctx.route('**/*', serve);
const desk = await dctx.newPage(); desk.on('pageerror', (e) => errors.push(e.message));
await desk.goto('http://localhost/online.html?net=local', { timeout: 90000 }); await desk.waitForFunction(() => window.__sq, null, { timeout: 60000 }); await desk.waitForTimeout(1500);
await desk.evaluate(() => window.__sq.startPractice()); await desk.waitForTimeout(2500); await desk.evaluate(() => document.querySelector('#start')?.click());
await desk.waitForFunction(() => window.__sq.view?.phase === 'play', null, { timeout: 60000 }); await desk.waitForTimeout(2500);
check(await desk.evaluate(() => document.querySelector('#joy').hidden), 'no joystick on a computer (keys + mouse)');
check(!(await desk.evaluate(() => document.querySelector('#zoom').hidden)), 'zoom buttons on a computer too');
const w0 = await desk.evaluate(() => window.__sq.camDist()); await desk.mouse.move(640, 400); for (let i = 0; i < 3; i++) await desk.mouse.wheel(0, 120); await desk.waitForTimeout(2500);
const w1 = await desk.evaluate(() => window.__sq.camDist());
check(w1 > w0 * 1.15, `the mouse wheel zooms out (${w0.toFixed(1)} → ${w1.toFixed(1)})`);
console.log('8. Pressing − step by step reaches a view of the WHOLE ring, upright and sideways, standing at the edge');
// Let the browser really draw: wait 20 frames, sample the camera, repeat until it has stopped (test browsers draw ~3 frames a second).
const settle = async (q) => { let last = -1; for (let i = 0; i < 60; i++) { await q.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n >= 20 ? r() : requestAnimationFrame(f)); f(); }));
  const d = await q.evaluate(() => window.__sq.camDist()); if (Math.abs(d - last) < 0.01) return; last = d; } };
for (const [w, h] of [[384, 740], [320, 620], [768, 1024], [800, 300], [660, 320], [1280, 800]]) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900, isMobile: w < 900 }); await c.route('**/*', serve);
  const q = await c.newPage(); q.on('pageerror', (e) => errors.push(e.message));
  await q.goto('http://localhost/online.html?net=local', { timeout: 90000 }); await q.waitForFunction(() => window.__sq, null, { timeout: 60000 }); await q.waitForTimeout(1200);
  await q.evaluate(() => window.__sq.startPractice()); await q.waitForTimeout(2500); await q.evaluate(() => document.querySelector('#start')?.click());
  await q.waitForFunction(() => window.__sq.view?.phase === 'play', null, { timeout: 60000 });
  await q.evaluate(() => { window.__sq.ctl.x = 12.8; window.__sq.ctl.z = 3; }); // the worst place to stand: at the ring edge
  let presses = 0, r;
  for (;;) { await settle(q); r = await q.evaluate(() => window.__sq.ringFit());
    if (r.x0 >= -1 && r.x1 <= 1 && r.y0 >= -1 && r.y1 <= 1) break;
    if (await q.evaluate(() => window.__sq.zoom >= 3.99)) break;
    // three presses between looks (each look waits for the camera to settle, which is slow in a test browser)
    for (let k = 0; k < 3; k++) { await q.evaluate(() => document.querySelector('#zoomOut').click()); presses++; } }
  check(r.x0 >= -1 && r.x1 <= 1 && r.y0 >= -1 && r.y1 <= 1, `${w}×${h}: whole ring on screen after ${presses} presses of − (x ${r.x0.toFixed(2)}..${r.x1.toFixed(2)}, y ${r.y0.toFixed(2)}..${r.y1.toFixed(2)})`);
  await q.screenshot({ path: `out/zoomed-out-${w}x${h}.png` }); await c.close();
}
check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); process.exit(0);
