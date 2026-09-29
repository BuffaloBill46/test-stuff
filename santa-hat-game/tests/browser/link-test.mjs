import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, OUT = 'out/link';
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
const errors = [];
await ctx.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('http://local.test/')) { const p = url.replace('http://local.test/', '').split('#')[0].split('?')[0]; const f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' }); return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.abort();
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(qs = '', wallet) {
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (wallet) await p.addInitScript((w) => { window.__testWallet = w; }, wallet);
  await p.goto('http://local.test/online.html?net=local' + qs); await p.waitForFunction(() => window.__sq, null, { timeout: 60000 }); await wait(1200); return p;
}
const who = (p) => p.evaluate(() => ({ nav: document.querySelector('#signin').textContent, name: window.__sq.me.n, shirt: window.__sq.me.a.shirt }));
const panel = async (p) => (await p.textContent('#acct')).replace(/\s+/g, ' ').trim();

// A: email player links a wallet from another "browser"
const A = await open();
await A.click('#signin'); await A.fill('#email', 'cody@example.com'); await A.click('#emailBtn'); await wait(800);
await A.click('#t-avatar'); await wait(800); await A.click('[data-slot="shirt"]'); await A.click('[data-pick="shirt_blue"]'); await A.fill('#avname', 'Cody'); await A.click('#avsave'); await wait(600);
await A.click('#signin'); await wait(400); await A.click('#mkWallet'); await wait(600);
const linkUrl = await A.textContent('.linkbox .link'); const code = new URL(linkUrl).searchParams.get('link');
console.log('A: link made, code', await A.textContent('.linkbox .code'));
await A.screenshot({ path: `${OUT}-1-linkbox.png` });
const B = await open('&link=' + code, 'Wa11etFromPhant0mBrowser1111111111111');
console.log('B (other browser) opened link, panel says:', (await B.textContent('#acctMsg')));
await B.click('#walletBtn'); await wait(1000);
console.log('B after connecting wallet:', JSON.stringify(await who(B)), '|', await B.textContent('#acctMsg'));
console.log('B logins panel:', (await panel(B)).slice(0, 200));
await B.screenshot({ path: `${OUT}-2-linked.png` });
// rename from the wallet browser; the email browser sees it after reload
await B.click('#acctClose'); await B.click('#t-avatar'); await wait(600); await B.fill('#avname', 'Cody W'); await B.click('#avsave'); await wait(600);
await A.reload(); await A.waitForFunction(() => window.__sq, null, { timeout: 60000 }); await wait(1500);
console.log('A after reload (email login):', JSON.stringify(await who(A)));

// B2: wallet player links an email in the same browser
const C = await open('', 'Wa11etSecondPlayer222222222222222222222');
await C.click('#signin'); await C.click('#walletBtn'); await wait(800); await C.click('#signin'); await wait(400);
await C.click('#mkEmail'); await wait(500); await C.fill('#linkEmail', 'second@example.com'); await C.click('#linkEmailBtn'); await wait(1000);
console.log('C (wallet) linked email:', await C.textContent('#acctMsg'), '|', (await panel(C)).match(/Email\s*\w+\s*\w*/)?.[0]);

await A.close(); await B.close(); await C.close();
// C2: a wallet with its own progress is refused and keeps its own account
const D = await open();
await D.click('#signin'); await D.fill('#email', 'third@example.com'); await D.click('#emailBtn'); await wait(700);
await D.click('#signin'); await wait(300); await D.click('#mkWallet'); await wait(500);
const code2 = new URL(await D.textContent('.linkbox .link')).searchParams.get('link');
await D.close();
const E = await open('', 'Wa11etWithItsOwnProgress333333333333333');
await E.click('#signin'); await E.click('#walletBtn'); await wait(700);
await E.evaluate(() => { const db = JSON.parse(localStorage.getItem('sq-local-db')); const pid = db.logins['wallet:Wa11etWithItsOwnProgress333333333333333'].pid; db.profiles[pid].rank_points = 25; localStorage.setItem('sq-local-db', JSON.stringify(db)); });
await E.goto('http://local.test/online.html?net=local&link=' + code2); await E.waitForFunction(() => window.__sq, null, { timeout: 60000 }); await wait(1500);
console.log('E (has 25 pts) opening link:', await E.textContent('#acctMsg'), '| still own account:', (await who(E)).nav);
console.log('errors:', errors.length ? errors.slice(0, 8).join('\n  ') : 'none');
await browser.close();
