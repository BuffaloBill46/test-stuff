// Special snowballs (Cody, 2026-10-03):
//  1. "Try it" in the Store on a special snowball opens a free solo practice match with that ball in SB1, locked on: the player
//     throws it for real. Practice only; the borrowed ball is gone the moment practice ends, so it can never reach a real match.
//  2. In a match, a DOUBLE tap on a special's button locks it on (every throw uses it); a double tap again goes back to normal
//     snowballs; a single tap still arms one throw. Not enough snowballs for the locked one: a plain throw, the lock stays.
// Local page (?net=local, demo). Run: node sb-lock-test.mjs   (Windows: PW=… node --import ./win-chrome.mjs sb-lock-test.mjs)
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 860 } });
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.fulfill({ status: 503, body: '' }); });
const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://localhost/online.html?net=local', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1500);
const look0 = await p.evaluate(() => window.__sq.myLook);
const sq = () => p.evaluate(() => ({ armed: window.__sq.armed, locked: window.__sq.locked, trial: window.__sq.trial, phase: window.__sq.view?.phase }));
const btn = '#hud .sbrow [data-sb="0"]';
const throwOnce = async () => { await p.evaluate(() => { const e = window.__sq.view.ents.find((x) => x.peer === window.__sq.me.id); window.__sq.throwAt(e.x + 3, e.z + 1); }); await p.waitForTimeout(900); };

console.log('1. Store → Try it on the Split Ball → a practice match with it in SB1, locked on');
await p.click('#t-store'); await p.waitForTimeout(1200);
await p.locator('[data-try="sb_split"]').first().click(); await p.waitForTimeout(1500);
check((await sq()).trial === 'split' && /Trying\s*Split Ball/.test(await p.textContent('#roomchip')), `practice started with the Split Ball (chip: "${(await p.textContent('#roomchip')).trim()}")`);
await p.evaluate(() => document.querySelector('#start')?.click());
await p.waitForFunction(() => { const s = window.__sq; if (/^(intro|count)$/.test(s.sim?.S.phase)) s.sim.S.time = 0; return s.view?.phase === 'play'; }, null, { timeout: 60000 });
await p.waitForFunction((b) => document.querySelector(b), btn, { timeout: 20000 }).catch(() => {});
check(/Split Ball/.test(await p.textContent(btn)) && await p.evaluate((b) => document.querySelector(b)?.dataset.locked === 'true', btn) && /Locked/.test(await p.textContent(btn)), `SB1 is the Split Ball, shown LOCKED: "${(await p.textContent(btn)).replace(/\s+/g, ' ').trim()}"`);
await throwOnce(); check((await sq()).armed === 'split', 'after a throw it is still armed (locked)');
await throwOnce(); check((await sq()).armed === 'split', 'and after another');

console.log('2. Double tap → normal snowballs; single tap → one throw; double tap → locked again');
await p.dblclick(btn); await p.waitForTimeout(200);
check((await sq()).locked === '' && (await sq()).armed === '', 'double tap: back to normal snowballs');
await throwOnce(); check((await sq()).armed === '', 'a throw stays normal');
await p.click(btn); await p.waitForTimeout(400);
check((await sq()).armed === 'split' && (await sq()).locked === '', 'single tap: armed for one throw (not locked)');
await throwOnce(); check((await sq()).armed === '', 'after that one throw: normal again');
await p.dblclick(btn); await p.waitForTimeout(200);
check((await sq()).locked === 'split' && (await sq()).armed === 'split', 'double tap: locked on again');
await throwOnce(); check((await sq()).armed === 'split', 'stays on after a throw');
// keyboard: a quick double press of Q
await p.keyboard.press('KeyQ'); await p.waitForTimeout(60); await p.keyboard.press('KeyQ'); await p.waitForTimeout(200);
check((await sq()).locked === '' && (await sq()).armed === '', 'Q Q (quick double press): unlocked, normal snowballs');
await p.screenshot({ path: 'out/sb-lock.png' });

console.log('3. Leaving practice puts the real look back: the tried ball is gone');
await p.evaluate(() => window.__sq.leaveRoom()); await p.waitForTimeout(800);
const look1 = await p.evaluate(() => window.__sq.myLook);
check((await sq()).trial === null && JSON.stringify(look1) === JSON.stringify(look0) && !Object.values(look1).includes('sb_split'), `look restored, no Split Ball: ${JSON.stringify({ sb1: look1.sb1 })}`);
check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); process.exit(0);
