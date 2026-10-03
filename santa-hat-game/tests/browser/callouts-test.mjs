// MATCH CALL-OUTS AND HIGHLIGHTS (Cody's list, 2026-10-03; mockups/callouts.js).
// 1. The logic, exactly: fake match events into the real module in the page: feed lines (knock with who did it, catch, grab,
//    "takes the lead" only on a change), 3 lines at most, "10 seconds left!" once, highlights (best per category, ties left out,
//    nothing when the match start wasn't seen).
// 2. A real practice match with bots: the feed fills, the 10-second banner shows, the end card lists highlights; taps go through.
// Run: node callouts-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync('out', { recursive: true });
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } }); const errors = [];
await ctx.addInitScript(() => { try { localStorage.setItem('santa.coached', '1'); } catch {} }); // no first-match tips in the way
await ctx.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.startsWith('https://api.santahatgames.com')) return route.fulfill({ contentType: 'application/json', body: '{"gamesRaw":0,"lotteryRaw":0,"storeRaw":0,"totalRaw":0}' });
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('http://local.test/')) { const f = path.join(ROOT, url.replace('http://local.test/', '').split('#')[0].split('?')[0]); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.abort();
});
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://local.test/online.html?net=local#play', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1000);

console.log('1. The logic, with made-up events');
const r = await p.evaluate(async () => {
  const { createCallouts } = await import('./callouts.js');
  const el = document.createElement('div'), banners = [];
  const names = { 1: 'Ava', 2: 'Ben', 3: 'You', 4: 'Cid' };
  const c = createCallouts({ el, banner: (t) => banners.push(t), nameOf: (id) => names[id] || 'Someone' });
  const v = (scores, time = 40) => ({ phase: 'play', time, ents: Object.entries(scores).map(([id, score]) => ({ id: +id, score })) });
  const lines = () => [...el.children].map((d) => d.textContent);
  const out = {};
  c.onEvent('intro', 0, 0, null);
  c.onEvent('grab', 1, 0, null); out.grab = lines()[0];
  c.tick(v({ 1: 10, 2: 0 })); out.firstLead = lines().length; // the first leader isn't announced (it's just the start)
  c.onEvent('knock', 1, 2, null); out.knock = lines()[0];
  c.onEvent('knock', 2, 0, null); out.noBy = lines().length; // knocked off by nobody (a fall): no line, no credit
  c.onEvent('catch', 3, 0, null); out.catch = lines()[0];
  c.tick(v({ 1: 10, 2: 25, 3: 50 })); out.lead = lines()[0];
  c.tick(v({ 1: 10, 2: 25, 3: 50 })); out.leadOnce = lines().filter((l) => /lead/.test(l)).length;
  out.max3 = lines().length;
  c.tick(v({ 3: 50 }, 9.5)); c.tick(v({ 3: 50 }, 8)); out.banners = banners.slice();
  for (let i = 0; i < 12; i++) c.onEvent('pts', 3, 10, null);
  for (let i = 0; i < 5; i++) c.onEvent('pts', 1, 10, null);
  c.onEvent('knock', 3, 4, null); // Cid also knocked one off: Ben 1, Cid 1 → a tie, no Hat thief
  c.onEvent('end', 0, 0, null); out.high = c.last;
  // a screen that joined after the start: no highlights
  const late = createCallouts({ el: document.createElement('div'), banner: () => {}, nameOf: (id) => names[id] });
  late.onEvent('catch', 1, 0, null); late.onEvent('end', 0, 0, null); out.late = late.last;
  return out;
});
check(r.grab === 'Ava grabbed the hat', `grab: "${r.grab}"`);
check(r.firstLead === 1, 'the first leader at the start is not announced');
check(r.knock === 'Ben knocked the hat off Ava', `knock: "${r.knock}"`);
check(r.noBy === 2, 'a knock with nobody responsible adds no line');
check(r.catch === 'You caught the hat!', `catch: "${r.catch}"`);
check(r.lead === 'You take the lead', `lead change: "${r.lead}"`);
check(r.leadOnce === 1 && r.max3 === 3, `announced once; at most 3 lines (${r.max3})`);
check(JSON.stringify(r.banners) === '["10 seconds left!"]', `the 10-second banner once: ${JSON.stringify(r.banners)}`);
check(JSON.stringify(r.high) === JSON.stringify([{ label: 'Best catcher', who: 'You', text: '1 catch' }, { label: 'Hat keeper', who: 'You', text: '12s wearing it' }]), `highlights: ${JSON.stringify(r.high)} (tied Hat thief left out)`);
check(Array.isArray(r.late) && r.late.length === 0, 'joined late: no highlights (the counts would be partial)');

console.log('2. A real practice match with bots');
await p.evaluate(() => window.__sq.startPractice()); await p.waitForTimeout(1200); await p.evaluate(() => document.querySelector('#start')?.click());
await p.waitForFunction(() => { const s = window.__sq; if (/^(intro|count)$/.test(s.sim?.S.phase)) s.sim.S.time = 0; return s.view?.phase === 'play'; }, null, { timeout: 60000 });
// let the bots play a while (real time), then run the clock down to the last 10 seconds
let lines = 0; for (let i = 0; i < 20 && !lines; i++) { await p.waitForTimeout(1000); lines = await p.evaluate(() => document.querySelectorAll('#feed .co').length); }
check(lines > 0, `the feed shows what happens (${await p.evaluate(() => [...document.querySelectorAll('#feed .co')].map((d) => d.textContent).join(' | '))})`);
await p.screenshot({ path: 'out/callouts-feed.png' });
check(await p.evaluate(() => getComputedStyle(document.querySelector('#feed')).pointerEvents) === 'none', 'taps pass through the feed');
await p.evaluate(() => { window.__sq.sim.S.time = 10.5; }); await p.waitForTimeout(1500);
check(/10 seconds left/.test(await p.evaluate(() => document.querySelector('#banner').textContent)), '"10 seconds left!" banner');
await p.evaluate(() => { window.__sq.sim.S.time = 0.2; }); await p.waitForFunction(() => window.__sq.view?.phase === 'end', null, { timeout: 30000 }); await p.waitForTimeout(800);
const hs = await p.evaluate(() => [...document.querySelectorAll('#panel .highs li')].map((l) => l.textContent));
check(hs.length >= 1 && hs.every((h) => /Hat thief|Best catcher|Hat keeper/.test(h)), `end card highlights: ${hs.join(' | ')}`);
await p.screenshot({ path: 'out/callouts-end.png' });
check(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
if (fails.length) { console.log('FAIL:', fails.length); process.exit(1); }
console.log('OK: call-outs (grab, knock with who, catch, lead changes, 10 seconds left) and end highlights (ties and late joins left out); real match shows them; taps pass through');
