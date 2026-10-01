// Sound: nothing starts before the first tap (browser rule), sounds fire at the right moments, mute works and is remembered,
// and the phone top bar still fits with the sound button. Headless can't listen, so this counts what would have played.
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }); const errors = [];
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' }); return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.fulfill({ status: 503, body: 'offline in tests' }); }); // live price lookups: offline here on purpose
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/503/.test(m.text())) errors.push(m.text()); });
await p.goto('http://localhost/online.html?net=local', { timeout: 90000 }); await p.waitForFunction(() => window.__sq && window.__sfx, null, { timeout: 60000 });
const s0 = await p.evaluate(() => window.__sfx.state); check(s0 === 'not started', `audio must wait for a tap, was ${s0}`);
await p.tap('#t-games'); await p.waitForFunction(() => window.__slots, null, { timeout: 90000 }); await p.waitForTimeout(1500);
const s1 = await p.evaluate(() => window.__sfx.state); check(s1 === 'running', `audio should run after a tap, was ${s1}`);
// Three single pulls (each: Pull 1 → confirm the demo payment), then one $1 spin.
const buy1 = async (sel) => { await p.evaluate((s) => document.querySelector(s).click(), sel); await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 15000 }); await p.evaluate(() => document.querySelector('#buyGo').click()); };
for (let i = 0; i < 3; i++) { await buy1('#slots [data-run="1"]'); await p.waitForTimeout(300); await p.waitForFunction(() => !window.__slots.busy, null, { timeout: 90000 }); }
await p.evaluate(() => document.querySelector('#spin .bets button[data-bet="1"]').click()); await buy1('#spin [data-run="1"]');
await p.waitForTimeout(300); await p.waitForFunction(() => !window.__spin.busy, null, { timeout: 90000 });
const played = await p.evaluate(() => window.__sfx.stats.byName);
check(played.reelStop === 15, `5 reel stops per pull × 3 pulls, got ${played.reelStop}`);
check(played.spinTick > 5, `the wheel should tick as pegs pass, got ${played.spinTick}`);
await p.tap('#nav .sndbtn');
check(await p.evaluate(() => window.__sfx.muted) && await p.evaluate(() => localStorage.getItem('sh_sound')) === 'off', 'mute should turn on and be saved');
await p.reload(); await p.waitForFunction(() => window.__sfx, null, { timeout: 60000 });
check(await p.evaluate(() => window.__sfx.muted) && await p.evaluate(() => document.querySelector('#nav .sndbtn').title) === 'Sound off', 'still muted after a reload');
check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('#nav > *')].some((el) => el.getBoundingClientRect().right > innerWidth + 0.5))), 'phone top bar overflows');
await p.screenshot({ path: 'out/sfx-nav.png' });
console.log('played:', JSON.stringify(played), '| audio before/after tap:', s0, '/', s1, '| errors:', errors.length ? errors : 'none');
console.log(fails.length || errors.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close();
