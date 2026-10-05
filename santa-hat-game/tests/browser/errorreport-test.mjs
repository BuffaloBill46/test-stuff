// ERRORS PLAYERS HIT, in a real browser (Cody, 2026-10-04 to-do #3; mockups/errorreport.js): an unexpected error in the game's
// own code, and a promise nobody caught, are reported to the game server ('client-error') with the tab, the build and a short
// browser name; the same error twice is sent once; another site's script (an extension, an ad) is not reported; at most 5 a
// visit; reporting never shows anything on the page. Run: node --import ./win-chrome.mjs errorreport-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW ? path.join(process.env.PW, 'node_modules/playwright') : path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const cache = new Map(), curl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }), reports = [];
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.startsWith('https://api.santahatgames.com')) { const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'client-error') { reports.push(b); return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); }
    return route.fulfill({ contentType: 'application/json', body: b.action === 'burned' ? '{"gamesRaw":0,"lotteryRaw":0,"storeRaw":0,"totalRaw":0}' : '{"error":"stand-in"}' }); }
  if (url === 'https://other.example/widget.js') return route.fulfill({ contentType: 'text/javascript', body: "throw new Error('an extension or ad broke');" });
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: curl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('https://local.test/')) { const f = path.join(ROOT, url.replace('https://local.test/', '').split('#')[0].split('?')[0]); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.abort(); });
const p = await ctx.newPage();
await p.goto('https://local.test/online.html?net=local&t=' + Date.now() + '#games', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1500);
const base = reports.length;
check(base === 0, `a normal visit reports nothing (${base})`);
// the game's own code throws (a module on our own site), twice; a promise fails with nobody catching it
await p.addScriptTag({ type: 'module', content: "setTimeout(() => { throw new Error('Test: the Drop board broke'); }, 10); setTimeout(() => { throw new Error('Test: the Drop board broke'); }, 40);" });
await p.evaluate(() => { Promise.reject(new Error('Test: a payment step failed')); });
// another site's script throws (an extension, an ad): not ours
await p.addScriptTag({ url: 'https://other.example/widget.js' }).catch(() => {});
await p.waitForTimeout(1500);
const board = reports.filter((r) => /the Drop board broke/.test(r.message)), promise = reports.filter((r) => /a payment step failed/.test(r.message));
check(board.length === 1, `an error in the game's own code is reported, once though it happened twice (${board.length})`);
check(promise.length === 1, `a failed promise nobody caught is reported (${promise.length})`);
check(!reports.some((r) => /extension or ad/.test(r.message)), "another site's script is not reported");
check(board[0]?.page === 'games' && /^\w+ on \w+/.test(board[0]?.ua || '') && 'build' in (board[0] || {}), `with the tab (${board[0]?.page}), the browser (${board[0]?.ua}) and the build`);
// at most 5 a visit
await p.addScriptTag({ type: 'module', content: "for (let i = 0; i < 9; i++) setTimeout(() => { throw new Error('Test: burst ' + i); }, 10 * i);" });
await p.waitForTimeout(1200);
check(reports.length <= 5, `at most 5 reports a visit (${reports.length})`);
check(await p.evaluate(() => !document.querySelector('.toast.bad, #crash')), 'reporting shows nothing on the page');
await browser.close();
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
