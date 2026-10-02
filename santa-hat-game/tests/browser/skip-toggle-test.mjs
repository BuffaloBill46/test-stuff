// Skip ahead is a toggle (Cody, 2026-10-01): pressed during a run it goes fast and the button says "Normal speed"; pressed again
// it slows back to normal and says "Skip ahead"; each run starts at normal speed. Snowball Drop and Big Hat (demo).
// Run: node skip-toggle-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.abort(); });
const p = await ctx.newPage(), errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://localhost/online.html?net=local'); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(800);
await p.evaluate(() => document.querySelector('#t-games').click()); await p.waitForFunction(() => window.__drop && window.__slots, null, { timeout: 90000 }); await p.waitForTimeout(800);
const MID = [1, 0, 1, 0, 1, 0, 1, 0];
const skip = (g) => p.evaluate((g) => { const b = document.querySelector(`#${g} .skip`); return { text: b.textContent, pressed: b.getAttribute('aria-pressed'), hidden: b.hidden }; }, g);

console.log('1. Snowball Drop: 10 drops; Skip ahead → fast + "Normal speed"; again → normal + "Skip ahead"');
await p.evaluate((paths) => { window.__drop.test.run = paths; document.querySelector('#drop [data-run="10"]').click(); }, Array(10).fill(MID));
await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 }); await p.evaluate(() => document.querySelector('#buyGo').click());
await p.waitForFunction(() => window.__drop.opening && !document.querySelector('#drop .skip').hidden, null, { timeout: 15000 });
let s = await skip('drop'); check(s.text === 'Skip ahead' && !s.hidden, 'the run starts at normal speed: "Skip ahead"');
await p.click('#drop .skip'); s = await skip('drop');
check(s.text === 'Normal speed' && s.pressed === 'true' && await p.evaluate(() => window.__drop.fast), 'pressed: fast, the button says "Normal speed"');
await p.click('#drop .skip'); s = await skip('drop');
check(s.text === 'Skip ahead' && s.pressed === 'false' && !(await p.evaluate(() => window.__drop.fast)), 'pressed again: normal speed, "Skip ahead"');
await p.click('#drop .skip');
await p.waitForFunction(() => !window.__drop.opening && window.__drop.flying === 0, null, { timeout: 300000 });
s = await skip('drop'); check(s.hidden && s.text === 'Skip ahead', 'the run finishes; the button hides and is reset for next time');

console.log('2. Big Hat: 5 pulls, the same toggle');
await p.evaluate(() => { document.querySelector('#slots').scrollIntoView(); document.querySelector('#slots [data-run="5"]').click(); });
await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 }); await p.evaluate(() => document.querySelector('#buyGo').click());
await p.waitForFunction(() => window.__slots.busy && !document.querySelector('#slots .skip').hidden, null, { timeout: 15000 });
await p.click('#slots .skip'); s = await skip('slots');
check(s.text === 'Normal speed' && await p.evaluate(() => window.__slots.fast), 'pressed: fast, "Normal speed"');
await p.click('#slots .skip'); s = await skip('slots');
check(s.text === 'Skip ahead' && !(await p.evaluate(() => window.__slots.fast)), 'pressed again: normal, "Skip ahead"');
await p.waitForFunction(() => !window.__slots.busy, null, { timeout: 300000 });
check((await skip('slots')).hidden, 'the run finishes');
check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); process.exit(0);
