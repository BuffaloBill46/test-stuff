// PRIVATE ROOMS WITH YOUR OWN CODE (Cody 2026-10-05: "the password you use to create it is the same password they join with.
// That way if families or friends are playing many games in a row they just remember 1 pw"). Mom types SMITH and presses Create:
// she's in room SMITH; the kid types smith and Join: same room; next visit the box already says SMITH; too short or a public
// game's code is refused; an empty box still makes a random room. Local stand-in rooms (?net=local). Run: node private-code-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname;
const fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 780 } });
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.abort(); });
const errors = [];
async function open() { const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message)); await p.goto('http://localhost/online.html?net=local'); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(600);
  await p.evaluate(() => document.querySelector('#playUnranked').click()); await p.waitForTimeout(300); return p; }
const roomOf = (p) => p.evaluate(() => new URLSearchParams(location.search).get('room') || '');
const until = (p, fn, arg, ms = 20000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

console.log('1. Mom picks SMITH and presses Create');
const mom = await open();
check(await mom.evaluate(() => /Pick your own room code/.test(document.querySelector('.codehint')?.textContent || '') && !document.querySelector('.codehint').hidden), 'the hint says to pick your own code');
await mom.fill('#code', 'smith'); await mom.click('#create');
check(await until(mom, () => new URLSearchParams(location.search).get('room') === 'SMITH'), 'she is in room SMITH (not a random code)');
check(await until(mom, () => /join with code SMITH/.test(document.querySelector('#panel')?.textContent || '')), 'the warm-up card says: friends join with code SMITH');
console.log('2. The kid types the same code and presses Join');
const kid = await open();
check(await kid.inputValue('#code') === 'SMITH', 'on this device the box already says SMITH (remembered)');
await kid.fill('#code', 'smith'); await kid.click('#joinBtn');
check(await until(kid, () => new URLSearchParams(location.search).get('room') === 'SMITH'), 'the kid is in room SMITH');
check(await until(mom, () => window.__sq.view?.ents.filter((e) => !e.bot).length === 2), 'mom sees 2 players: the same room');
console.log('3. Codes that are refused; an empty box still works');
const dad = await open();
await dad.fill('#code', 'ab'); await dad.click('#create');
check(await until(dad, () => /3 to 6 letters/.test(document.querySelector('#status')?.textContent || '')) && !(await roomOf(dad)), 'too short: refused, says why');
await dad.fill('#code', 'PFG1'); await dad.click('#create');
check(await until(dad, () => /public games/.test(document.querySelector('#status')?.textContent || '')) && !(await roomOf(dad)), "a public game's code: refused, says why");
await dad.fill('#code', 'SMITH'); await dad.locator('#home').screenshot({ path: 'out/private-code.png' });
await dad.fill('#code', ''); await dad.click('#create');
check(await until(dad, () => /^[A-Z0-9X]{4}$/.test(new URLSearchParams(location.search).get('room') || '')), 'empty box: a random room code, as before (' + await roomOf(dad) + ')');
check(errors.length === 0, 'no page errors ' + errors.join(' | '));
await browser.close();
if (fails.length) { console.log(`\nFAILED: ${fails.length}`); process.exit(1); }
console.log('\nOK: private rooms with your own code: Create uses it, Join with the same code gets in, remembered on the device, too short / public codes refused, empty = random');
