// ADD AN EMAIL ON A PHONE (Cody 2026-10-05: "Very difficult to do on phone. I don't see where to enter the code"), in a real browser
// at phone size: signed in with a wallet, Link an email → type the email → "Email me a code" (the email is SENT, as on the real
// site, not signed in at once) → a code box appears → typing the code adds the email to THIS account (same player, both logins),
// without leaving the page. The other-device link is tucked away, not in the way.
// Run: node --import ./win-chrome.mjs linkemail-phone-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW ? path.join(process.env.PW, 'node_modules/playwright') : path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const cache = new Map(), curl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), errors = [];
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.startsWith('https://api.santahatgames.com')) return route.fulfill({ contentType: 'application/json', body: '{"error":"stand-in"}' });
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: curl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('https://local.test/')) { const f = path.join(ROOT, url.replace('https://local.test/', '').split('#')[0].split('?')[0] || 'online.html'); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.abort(); });
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
// a wallet that signs in (the local stand-in's wallet)
await p.addInitScript(() => { window.__testWallet = 'Wa11etPhoneLink3333333333333333333333333'; });
await p.goto(`https://local.test/online.html?net=local&t=${Date.now()}#home`, { timeout: 90000 }); await p.waitForFunction(() => window.__sq && window.__acct, null, { timeout: 90000 }); await p.waitForTimeout(1000);
await p.tap('#signin'); await p.waitForTimeout(400); await p.tap('#walletBtn'); await p.waitForTimeout(1200);
const who = await p.evaluate(async () => (await window.__acct.profile())?.id || null);
check(!!who, 'signed in with a wallet');
// the real site SENDS the email (it doesn't sign in at once): make the stand-in do the same, and remember what was asked
await p.evaluate(() => { window.__sent = []; window.__acct.signInEmail = async (e) => { window.__sent.push(e); return null; }; });
await p.tap('#signin'); await p.waitForTimeout(400); await p.tap('#mkEmail'); await p.waitForTimeout(600);
const box = await p.evaluate(() => ({ codeRowHidden: document.querySelector('#linkCodeRow')?.hidden, otherDevOpen: document.querySelector('.otherdev')?.open, btn: document.querySelector('#linkEmailBtn')?.textContent }));
check(box.btn === 'Email me a code' && box.codeRowHidden === true && box.otherDevOpen === false, `the add-email box: "Email me a code", the other-device link folded away ${JSON.stringify(box)}`);
await p.fill('#linkEmail', 'cody@example.com'); await p.tap('#linkEmailBtn'); await p.waitForTimeout(500);
const after = await p.evaluate(() => ({ sent: window.__sent, rowShown: !document.querySelector('#linkCodeRow').hidden, msg: document.querySelector('#acctMsg').textContent, focus: document.activeElement?.id }));
check(after.sent[0] === 'cody@example.com' && after.rowShown && /Type the 8-digit code/.test(after.msg), `the email is sent and a code box appears: "${after.msg}"`);
check(after.focus === 'linkEmailCode', 'the code box has the cursor (the phone keyboard opens on it)');
await p.screenshot({ path: '../../out/linkemail-phone.png' });
await p.fill('#linkEmailCode', '6396 3782'); await p.tap('#linkCodeBtn'); await p.waitForTimeout(1500);
const done = await p.evaluate(async () => ({ id: (await window.__acct.profile())?.id, logins: await window.__acct.logins().catch(() => []), msg: document.querySelector('#acctMsg').textContent }));
check(done.id === who, 'the same player afterwards (the email joined THIS account, no new one)');
check(done.logins.includes('email') && done.logins.includes('wallet'), `both logins on it: ${JSON.stringify(done.logins)} · "${done.msg}"`);
check(!errors.length, 'no page errors ' + errors.slice(0, 2).join(' | '));
await browser.close();
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
