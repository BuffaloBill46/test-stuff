// Avatar screen TRY-ONS come off when you change tab (Cody 2026-10-05: "I had Santa suit selected in special gear but I don't own
// it, it don't go back to nothing when I flipped pages"; "should be same for all tabs"). Tried-on things you can't wear (not
// owned, or above your level) go back to what you saved; things you own stay on. Local stand-in account (?net=local).
// Run: node avatar-tryon-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname;
const fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.abort(); });
const p = await ctx.newPage(), errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://localhost/online.html?net=local'); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(800);
const tab = async (s) => { await p.click(`#avslots [data-slot="${s}"]`); await p.waitForTimeout(250); };
const gear = () => p.evaluate(() => window.__sq.previewGear());
const pressed = () => p.evaluate(() => document.querySelector('#avgrid [aria-pressed="true"]')?.dataset.pick || null);

await p.click('#t-avatar'); await p.waitForTimeout(500);
const saved = await p.evaluate(() => ({ ...window.__sq.myLook }));
console.log('1. Try on the Santa Costume (not owned), then flip to Shirts: it comes off');
await tab('gear'); await p.click('#avgrid [data-pick="gear_santa"]'); await p.waitForTimeout(250);
check((await gear()).includes('santa'), 'tried on: the model wears the Santa Costume');
await tab('shirt');
check(!(await gear()).includes('santa'), 'on Shirts the Santa Costume is off: ' + JSON.stringify(await gear()));
await tab('gear');
check(await pressed() === (saved.g1 === 'gear_santa' ? 'gear_santa' : saved.g1 || 'gear_none'), 'back on Special Gear: the slot is what was saved (' + (await pressed()) + ')');

console.log('2. Same for every tab: a locked shirt comes off when you flip to Pants');
await tab('shirt');
const locked = await p.evaluate(() => document.querySelector('#avgrid .pick.locked[data-pick]')?.dataset.pick);
check(!!locked, 'there is a shirt this account can not wear yet: ' + locked);
await p.click(`#avgrid [data-pick="${locked}"]`); await p.waitForTimeout(250);
check(await pressed() === locked, 'tried on: ' + locked);
await tab('pants'); await tab('shirt');
check(await pressed() === saved.shirt, `after flipping tabs the shirt is the saved one again (${await pressed()}, saved ${saved.shirt})`);

console.log('3. Things I CAN wear stay on across tabs (mixing an outfit still works)');
const free = await p.evaluate((s) => [...document.querySelectorAll('#avgrid .pick:not(.locked)[data-pick]')].map((b) => b.dataset.pick).find((id) => id !== s), saved.shirt);
await p.click(`#avgrid [data-pick="${free}"]`); await p.waitForTimeout(250);
await tab('pants'); await tab('shirt');
check(await pressed() === free, `a shirt I can wear stays on (${free})`);
check(errors.length === 0, 'no page errors ' + errors.join(' | '));
await browser.close();
if (fails.length) { console.log(`\nFAILED: ${fails.length}`); process.exit(1); }
console.log('\nOK: tried-on things come off when you change tab (Santa Costume, a locked shirt); things you can wear stay on');
