// The phone joystick in REAL Chrome (Windows, real GPU; Cody 2026-10-02): locked in place (pulled past its edge it stays put), a
// long press is just steering, triple-tap and hold picks it up (lit) and it goes where it's dragged, remembered after a reload;
// rounds are 60 s. SLOW=<n> slows the CPU n times (e.g. 20, 150) to check slower phones.
// Run: PW=<folder with node_modules/playwright> SITE=http://localhost:<port>/online.html node joystick-test.mjs
import path from 'node:path';
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.PW, 'node_modules/playwright'));
const b = await chromium.launch({ channel: 'chrome' }); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage(), errs = []; p.on('pageerror', (e) => errs.push(e.message)); const cdp = await ctx.newCDPSession(p);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
const tap = async (x, y) => { await touch('touchStart', [[x, y]]); await p.waitForTimeout(50); await touch('touchEnd', []); };
const box = () => p.evaluate(() => { const r = document.querySelector('#joy').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, lit: document.querySelector('#joy').classList.contains('moving') }; });
await p.goto((process.env.SITE || 'http://localhost:8099/online.html') + '?net=local', { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__sq, null, { timeout: 60000 });
await p.evaluate(() => { localStorage.removeItem('sh_joy'); window.__sq.startPractice(); }); await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelector('#start').click()); await p.waitForFunction(() => window.__sq.view?.phase === 'play', null, { timeout: 30000 }); await p.waitForTimeout(1500);
if (process.env.SLOW) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.SLOW) }); const fps = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : r(); }; requestAnimationFrame(f); }); return n / 2; }); console.log('fps', fps);
const roundTime = await p.evaluate(() => Math.round(window.__sq.view.time));
const j = await box(), res = { roundTimeAtStart: roundTime };
// 1. steer hard past the edge: the base must not move
await touch('touchStart', [[j.x, j.y]]); for (let i = 1; i <= 12; i++) { await touch('touchMove', [[j.x + i * 15, j.y - i * 15]]); await p.waitForTimeout(30); } await touch('touchEnd', []); await p.waitForTimeout(200);
const a = await box(); res.pastEdgeStayed = Math.hypot(a.x - j.x, a.y - j.y) < 3;
// 2. a single long press is steering, never picks it up
await touch('touchStart', [[j.x, j.y]]); await p.waitForTimeout(800); res.longPressLit = (await box()).lit; await touch('touchEnd', []); await p.waitForTimeout(800);
// 3. triple-tap and hold, then drag
await tap(j.x, j.y); await p.waitForTimeout(100); await tap(j.x, j.y); await p.waitForTimeout(100);
await touch('touchStart', [[j.x, j.y]]); await p.waitForTimeout(600); res.tripleLit = (await box()).lit;
for (let i = 1; i <= 10; i++) { await touch('touchMove', [[j.x + i * 15, j.y - i * 20]]); await p.waitForTimeout(30); } await touch('touchEnd', []); await p.waitForTimeout(200);
const m = await box(); res.movedBy = Math.round(Math.hypot(m.x - j.x, m.y - j.y)); res.unlitAfter = !m.lit;

// 4. reload: remembered
await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__sq, null, { timeout: 60000 });
await p.evaluate(() => window.__sq.startPractice()); await p.waitForTimeout(1500); await p.evaluate(() => document.querySelector('#start').click()); await p.waitForFunction(() => window.__sq.view?.phase === 'play', null, { timeout: 30000 }); await p.waitForTimeout(800);
const r = await box(); res.rememberedAfterReload = Math.hypot(r.x - m.x, r.y - m.y) < 3;
console.log(JSON.stringify({ ...res, errs })); await b.close();
if (!(res.pastEdgeStayed && !res.longPressLit && res.tripleLit && res.movedBy > 100 && res.unlitAfter && res.rememberedAfterReload && res.roundTimeAtStart <= 60 && !errs.length)) { console.error('FAIL'); process.exit(1); }
console.log('OK: joystick locked, triple-tap and hold moves it, remembered; 60-second rounds');
