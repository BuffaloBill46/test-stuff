// WINNINGS THAT HAVEN'T GONE OUT (Cody 2026-10-05: "tell them to send a ticket ... only have that pop up if it happens";
// mockups/payoutwatch.js), in a real browser: nothing shows when nothing is waiting; a waiting winning opens the pop-up with its
// amount and game; it shows ONCE per payout (not on every check or reload); a new one shows again; "Send a ticket" opens Support
// with the payouts already written in. (The server's list is tested on real SQL: tests/db/pool-floor-db.)
// Run: node --import ./win-chrome.mjs payoutwatch-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW ? path.join(process.env.PW, 'node_modules/playwright') : path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const cache = new Map(), curl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }), errors = [];
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.startsWith('https://api.santahatgames.com')) return route.fulfill({ contentType: 'application/json', body: '{"error":"stand-in"}' });
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: curl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('https://local.test/')) { const f = path.join(ROOT, url.replace('https://local.test/', '').split('#')[0].split('?')[0] || 'online.html'); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.abort(); });
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
const open = async () => { await p.goto(`https://local.test/online.html?net=local&t=${Date.now()}#games`, { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(800); };
const show = (list) => p.evaluate(async (l) => (await import('./payoutwatch.js')).showWaiting(l), list);
const dlg = () => p.evaluate(() => { const d = document.querySelector('#payoutDlg'); return { open: !!d?.open, text: d?.textContent.replace(/\s+/g, ' ') || '' }; });

await open();
check(!(await dlg()).open, 'nothing waiting: no pop-up');
check(await show([]) === false && !(await dlg()).open, 'an empty answer shows nothing');
const ONE = [{ id: 41, usd: 12.5, kind: 'drop', at: Date.now() }];
check(await show(ONE) === true, 'a waiting winning opens the pop-up');
let d = await dlg();
check(d.open && /You won \$12\.50 on Snowball Drop/.test(d.text) && /Send a ticket/.test(d.text), `with the amount and game: "${d.text.slice(0, 110)}"`);
await p.screenshot({ path: '../../out/payout-popup-phone.png' });
await p.click('#payoutDlg [data-pw-ticket]'); await p.waitForTimeout(500);
const form = await p.evaluate(() => ({ open: !document.querySelector('#acct').hidden && !document.querySelector('#supportForm').hidden, msg: document.querySelector('#supportMsg')?.value || '' }));
check(form.open && /payout #41 \(\$12\.50, Snowball Drop\)/.test(form.msg), `"Send a ticket" opens Support, filled in: "${form.msg.slice(0, 90)}"`);
await p.evaluate(() => { document.querySelector('#acct').hidden = true; });
check(await show(ONE) === false && !(await dlg()).open, 'the same payout again (the next check): no second pop-up');
await open();
check(await show(ONE) === false, '... nor after a reload');
check(await show([...ONE, { id: 42, usd: 3, kind: 'big', at: Date.now() }]) === true && /You won \$3\.00 on Big Hat/.test((await dlg()).text), 'a NEW stuck winning shows (only the new one)');
check(!errors.length, 'no page errors ' + errors.slice(0, 2).join(' | '));
await browser.close();
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
