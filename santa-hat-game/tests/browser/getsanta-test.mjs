// THE BOTTOM OF EVERY PAGE + "HOW TO GET SANTA" (Cody, 2026-10-04 to-do #10 / #10b; mockups/sitefoot.js), in a real browser:
//   1. the game page: the footer sits under the open tab with the version, ©, X, Support and "How to get SANTA"; that opens the
//      pop-up (4 steps, SANTA's real address, Copy); the sign-in sheet has the same link; Support opens the Support form
//   2. the guide has the same footer; its Support goes to the game's Support form (#support)
//   3. a shared link to #get-santa opens the pop-up straight away; on a phone it fits with no sideways scroll
// Run: node --import ./win-chrome.mjs getsanta-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW ? path.join(process.env.PW, 'node_modules/playwright') : path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const cache = new Map(), curl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const MINT = readFileSync(path.join(ROOT, 'market.js'), 'utf8').match(/export const MINT = '(\w+)'/)[1];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const run = async (viewport) => {
  const ctx = await browser.newContext({ viewport }), errors = [];
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://local.test' });
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.startsWith('https://api.santahatgames.com')) return route.fulfill({ contentType: 'application/json', body: '{"error":"stand-in"}' });
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: curl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('https://local.test/')) { const f = path.join(ROOT, url.replace('https://local.test/', '').split('#')[0].split('?')[0] || 'online.html'); // the site's front page IS the game page if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.abort(); });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
  return { ctx, p, errors };
};
const dlgState = (p) => p.evaluate(() => { const d = document.querySelector('#getSantaDlg'); return { open: !!d?.open, text: d?.textContent.replace(/\s+/g, ' ') || '', steps: d?.querySelectorAll('ol > li').length || 0 }; });
const game = (p, hash) => p.goto(`https://local.test/online.html?net=local&t=${Date.now()}#${hash}`, { timeout: 90000 }).then(() => p.waitForFunction(() => window.__sq, null, { timeout: 90000 })).then(() => p.waitForTimeout(1200));

console.log('1. the game page');
let { ctx, p, errors } = await run({ width: 1280, height: 900 });
await game(p, 'store');
const foot = await p.evaluate(() => { const f = document.querySelector('#pages > footer.sitefoot'); const r = f?.getBoundingClientRect();
  return { there: !!f, text: f?.textContent.replace(/\s+/g, ' ').trim() || '', visible: !!r && r.height > 0, x: !!f?.querySelector('a[href="https://x.com/Santahatgame"]') }; });
check(foot.there && foot.visible, 'the footer sits at the bottom of the open tab');
check(/v\d+\.\d+/.test(foot.text) && /© 20\d\d Santa Hat Legends/.test(foot.text), `version and copyright: "${foot.text.slice(-45)}"`);
check(foot.x && /Support/.test(foot.text) && /How to get SANTA/.test(foot.text), 'with the X link, Support and How to get SANTA');
await p.click('footer.sitefoot [data-get-santa]'); await p.waitForTimeout(300);
const d = await dlgState(p);
check(d.open && d.steps === 4, '"How to get SANTA" opens the pop-up with 4 steps');
check(d.text.includes(MINT) && /Phantom/.test(d.text) && /SOL/.test(d.text) && /Swap/.test(d.text), "it names the wallets, SOL, the swap and SANTA's real address");
const jup = await p.getAttribute('#getSantaDlg [data-gs-jup]', 'href');
check(/^https:\/\/jup\.ag\/swap\/SOL-/.test(jup) && jup.endsWith(MINT), 'the Jupiter link swaps SOL for that exact address');
check(await p.evaluate(() => document.querySelector('[data-gs-solpay]').hidden), "pay-with-SOL isn't offered while the game doesn't take SOL (test network)");
await p.click('#getSantaDlg [data-gs-copy]'); await p.waitForTimeout(300);
check((await p.evaluate(() => navigator.clipboard.readText().catch(() => ''))) === MINT, 'Copy puts the address on the clipboard');
await p.click('#getSantaDlg [data-gs-close]'); await p.waitForTimeout(200);
check(!(await dlgState(p)).open, 'Close closes it');
await p.click('#signin'); await p.waitForTimeout(400);
check(await p.evaluate(() => !document.querySelector('#acct').hidden && !!document.querySelector('#acct [data-get-santa]')), 'the sign-in sheet has the same link');
await p.click('#acct [data-get-santa]'); await p.waitForTimeout(300);
check((await dlgState(p)).open, '... and it opens the pop-up too');
await p.keyboard.press('Escape'); await p.evaluate(() => { document.querySelector('#acct').hidden = true; }); await p.waitForTimeout(200);
await p.click('footer.sitefoot [data-site-support]'); await p.waitForTimeout(500);
check(await p.evaluate(() => !document.querySelector('#acct').hidden && !document.querySelector('#supportForm').hidden), "the footer's Support opens the Support form");
check(!errors.length, 'no page errors ' + errors.slice(0, 2).join(' | '));
await ctx.close();

console.log('2. the guide');
({ ctx, p, errors } = await run({ width: 1280, height: 900 }));
await p.goto(`https://local.test/guide.html?t=${Date.now()}`, { timeout: 90000 }); await p.waitForTimeout(2500);
const gf = await p.evaluate(() => document.querySelector('footer.sitefoot')?.textContent.replace(/\s+/g, ' ') || '');
check(/© 20\d\d Santa Hat Legends/.test(gf) && /How to get SANTA/.test(gf) && /Support/.test(gf), 'the guide has the same footer');
await p.click('footer.sitefoot [data-get-santa]'); await p.waitForTimeout(300);
check((await dlgState(p)).open, 'its "How to get SANTA" opens the pop-up');
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
await p.click('footer.sitefoot [data-site-support]'); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }).catch(() => {}); await p.waitForTimeout(1500);
check(await p.evaluate(() => !!window.__sq && !document.querySelector('#acct')?.hidden && !document.querySelector('#supportForm')?.hidden), "its Support opens the game page's Support form");
check(!errors.length, 'no page errors ' + errors.slice(0, 2).join(' | '));
await ctx.close();

console.log('3. a shared link, on a phone');
({ ctx, p, errors } = await run({ width: 375, height: 812 }));
await game(p, 'get-santa');
check((await dlgState(p)).open, '#get-santa opens the pop-up straight away');
const fit = await p.evaluate(() => { const r = document.querySelector('#getSantaDlg').getBoundingClientRect(); return { dlg: r.right <= innerWidth + 1, page: document.documentElement.scrollWidth <= innerWidth + 1 }; });
check(fit.dlg && fit.page, `fits a phone, no sideways scroll ${JSON.stringify(fit)}`);
await p.screenshot({ path: '../../out/getsanta-phone.png' });
await p.keyboard.press('Escape'); await p.evaluate(() => document.querySelector('footer.sitefoot').scrollIntoView()); await p.waitForTimeout(300);
await p.screenshot({ path: '../../out/sitefoot-phone.png' });
await game(p, 'support'); await p.waitForTimeout(600);
check(await p.evaluate(() => !document.querySelector('#acct').hidden && !document.querySelector('#supportForm').hidden), 'a #support link opens the Support form');
check(!errors.length, 'no page errors ' + errors.slice(0, 2).join(' | '));
await browser.close();
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
