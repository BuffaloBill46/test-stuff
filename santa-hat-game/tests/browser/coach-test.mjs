// FIRST-MATCH TIPS (Cody, 2026-10-03; mockups/coach.js). A new browser's first match shows 3 tips, each moved on by DOING it:
// Move (a real key press), Throw (a real throw), Get the hat (wearing it). Then never again in that browser. "Skip tips" ends
// them for good. A phone gets the touch wording. Never shown outside the play phase. Screenshots in out/. Run: node coach-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync('out', { recursive: true });
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function context(viewport) {
  const ctx = await browser.newContext({ viewport, ...(viewport.width < 600 ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('https://api.santahatgames.com')) return route.fulfill({ contentType: 'application/json', body: '{"gamesRaw":0,"lotteryRaw":0,"storeRaw":0,"totalRaw":0}' });
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://local.test/')) { const f = path.join(ROOT, url.replace('http://local.test/', '').split('#')[0].split('?')[0]); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.abort();
  });
  return ctx;
}
async function practice(p) {
  await p.goto('http://local.test/online.html?net=local#play', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => window.__sq.startPractice()); await p.waitForTimeout(1200);
  const warm = await p.evaluate(() => !document.querySelector('#coach').hidden);
  await p.evaluate(() => document.querySelector('#start')?.click());
  await p.waitForFunction(() => { const s = window.__sq; if (/^(intro|count)$/.test(s.sim?.S.phase)) s.sim.S.time = 0; return s.view?.phase === 'play'; }, null, { timeout: 60000 });
  await p.waitForTimeout(500); return warm;
}
const tip = (p) => p.evaluate(() => { const c = document.querySelector('#coach'); return c.hidden ? null : { title: c.querySelector('b')?.textContent, text: c.querySelector('span')?.textContent, n: c.querySelector('i')?.textContent }; });

console.log('1. A computer, first match: each tip moves on by doing it');
let ctx = await context({ width: 1100, height: 760 }); let p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
const warm = await practice(p);
check(!warm, 'no tips in the warm-up (only once the match is on)');
let t = await tip(p);
check(t?.title === 'Move' && /WASD or the arrow keys/.test(t.text) && t.n === 'Tip 1 of 3', `tip 1: ${JSON.stringify(t)}`);
await p.screenshot({ path: 'out/coach-move.png' });
await p.keyboard.down('KeyD'); await p.waitForTimeout(1500); await p.keyboard.up('KeyD'); await p.waitForTimeout(300);
t = await tip(p); check(t?.title === 'Throw' && /Click where you want to throw/.test(t.text), `after running: tip 2 ${JSON.stringify(t)}`);
await p.evaluate(() => window.__sq.throwAt(0, 0)); await p.waitForTimeout(300);
t = await tip(p); check(t?.title === 'Get the hat', `after a throw: tip 3 ${JSON.stringify(t)}`);
await p.evaluate(() => { const s = window.__sq.sim.S, mine = s.ents.find((e) => e.peer === window.__sq.me.id); s.hat.st = 'head'; s.hat.holder = mine.id; });
await p.waitForTimeout(500);
check((await tip(p)) === null && await p.evaluate(() => localStorage.getItem('santa.coached')) === '1', 'wearing the hat: tips done and remembered');
console.log('2. The same browser, next match: no tips');
await practice(p); await p.waitForTimeout(800);
check((await tip(p)) === null, 'never again in this browser');
await ctx.close();

console.log('3. A phone: touch words; Skip ends them for good');
ctx = await context({ width: 375, height: 667 }); p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
await practice(p); t = await tip(p);
check(t?.title === 'Move' && /joystick/.test(t.text), `phone tip 1: ${t?.text}`);
await p.screenshot({ path: 'out/coach-phone.png' });
const box = await p.locator('#coach').boundingBox(); check(box && box.x >= 0 && box.x + box.width <= 375, 'fits the phone');
// a tap ON the tip (not on Skip) still throws: a phone throws by tapping anywhere, the tip must not eat it
const ball0 = await p.evaluate(() => Math.max(-1, ...window.__sq.view.balls.map((b) => b.id)));
const tb = await p.locator('#coach span').boundingBox(); await p.touchscreen.tap(tb.x + 20, tb.y + tb.height / 2);
const threw = await p.waitForFunction((id) => { const v = window.__sq.view, e = v.ents.find((x) => x.peer === window.__sq.me.id); return v.balls.some((b) => b.owner === e.id && b.id > id); }, ball0, { timeout: 2000 }).then(() => true, () => false);
check(threw && (await tip(p)) !== null, 'a tap on the tip box throws a snowball (taps pass through); the tip stays');
await p.tap('#coach [data-coach="skip"]'); await p.waitForTimeout(300);
check((await tip(p)) === null && await p.evaluate(() => localStorage.getItem('santa.coached')) === '1', 'Skip tips: gone and remembered');
await ctx.close();
check(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
if (fails.length) { console.log('FAIL:', fails.length); process.exit(1); }
console.log('OK: first-match tips: move, throw, get the hat, each done by doing it; once per browser; Skip; touch words on a phone');
