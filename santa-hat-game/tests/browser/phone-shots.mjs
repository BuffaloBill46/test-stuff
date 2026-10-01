// Galaxy S22+ sized screenshots (Cody's phone, 2026-09-30): a practice match and the Avatar tab, upright and sideways.
// Chrome's in-app browser leaves about 384×740 upright and 800×300 sideways. Writes out/phone-<name>.png; prints layout checks.
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname;
const SIZES = [['tablet', 768, 1024], ['up', 384, 740], ['side', 800, 300], ['up-small', 320, 620], ['side-small', 660, 320], ['desk', 1280, 800]];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
for (const [label, w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes("googleapis") ? "text/css" : url.includes("gstatic") ? "font/woff2" : "text/javascript" }); } catch { return route.abort(); } }
    if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' }); return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.fulfill({ status: 503, body: '' }); });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => { errors.push(e.message); console.log('pageerror', e.message); }); page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
  await page.goto('http://localhost/online.html?net=local', { timeout: 90000 }); await page.waitForFunction(() => window.__sq, null, { timeout: 60000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('#playUnranked')?.click()); await page.waitForTimeout(800);
  await page.evaluate(() => window.__sq.startPractice()); await page.waitForTimeout(2500); await page.evaluate(() => document.querySelector('#start')?.click());
  await page.waitForFunction(() => window.__sq.view?.phase === 'play', null, { timeout: 60000 }); await page.waitForTimeout(6000);
  await page.screenshot({ path: `out/phone-${label}-match.png` });
  // How much of the screen the floating UI covers during play, and whether any of it overlaps.
  const m = await page.evaluate(() => {
    const box = (s) => { const e = document.querySelector(s); if (!e || e.hidden || getComputedStyle(e).display === 'none' || !e.offsetParent && getComputedStyle(e).position !== 'fixed') return null; const r = e.getBoundingClientRect(); return r.width && r.height ? r : null; };
    const parts = ['#gamebar .brand', '#roomchip', '#gamebar .sndbtn', '#leave', '#hud', '#board', '#emotes', '#joy', '#zoom'].map((s) => [s, box(s)]).filter(([, r]) => r);
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const over = []; for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (hit(parts[i][1], parts[j][1])) over.push(parts[i][0] + ' × ' + parts[j][0]);
    const top = Math.max(...parts.filter(([s]) => s === '#hud' || s.startsWith('#gamebar') || s === '#leave' || s === '#roomchip').map(([, r]) => r.bottom));
    return { topUsed: Math.round(top / innerHeight * 100), over };
  });
  console.log(label, 'match: top UI covers', m.topUsed + '% of the height; overlaps:', m.over.join(', ') || 'none');
  if (m.topUsed > 30) problems.push(`${label}: top UI covers ${m.topUsed}% of the screen during play`);
  if (m.over.length) problems.push(`${label}: overlapping game UI: ${m.over.join(', ')}`);
  // Leave, then the Avatar tab (as Cody did: the old scoreboard used to stay on screen).
  await page.evaluate(() => document.querySelector('#leave').click()); await page.waitForTimeout(800);
  await page.evaluate(() => { document.querySelector('#homeClose')?.click(); document.querySelector('#lobbyClose')?.click(); document.querySelector('#t-avatar').click(); }); await page.waitForTimeout(2500);
  const nav = await page.evaluate(() => { const n = document.querySelector('#nav'), out = [...n.querySelectorAll('button, .chip')].filter((e) => e.offsetParent && getComputedStyle(e).display !== 'none').filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).map((e) => e.id || e.textContent.trim()); return { off: out, h: Math.round(n.getBoundingClientRect().height) }; });
  if (nav.off.length) problems.push(`${label}: top bar runs off the screen: ${nav.off.join(', ')}`);
  console.log(label, 'site top bar height', nav.h + 'px');
  await page.screenshot({ path: `out/phone-${label}-avatar.png` });
  const a = await page.evaluate(() => ({ board: !!document.querySelector('#board') && !document.querySelector('#board').hidden && getComputedStyle(document.querySelector('#board')).display !== 'none',
    hud: !!document.querySelector('#hud').children.length && getComputedStyle(document.querySelector('#hud')).display !== 'none' }));
  if (a.board || a.hud) problems.push(`${label}: the match scoreboard/HUD shows through on the Avatar tab`);
  if (errors.length) problems.push(`${label}: page errors: ${errors.join('; ')}`);
  await ctx.close();
}
await browser.close();
console.log(problems.length ? 'PROBLEMS:\n - ' + problems.join('\n - ') : 'ALL CHECKS PASSED');
process.exit(problems.length ? 1 : 0);
