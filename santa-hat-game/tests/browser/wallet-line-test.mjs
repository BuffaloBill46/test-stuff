// MY WALLET UNDER THE GAMES (Cody, 2026-10-03; mockups/walletline.js). Every game's play buttons have a line with the player's
// own wallet: a guest is asked to sign in; a signed-in player sees SANTA and dollars from the game server; no wallet linked or
// a failed read says so; Refresh asks again; automatic refreshes are spaced (8 s) so a fast run can't trip the speed limit.
// Run: node wallet-line-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync('out', { recursive: true });
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let answer = { wallet: 'Wa11etAva'.padEnd(44, '1'), santaRaw: 54_321 * 1e6, usd: 46.21, cluster: 'devnet' }, asks = 0; const errors = [];
async function open(qs) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('https://api.santahatgames.com') || url.startsWith('http://localhost:8797/')) { const b = JSON.parse(route.request().postData() || '{}'); // the live game server, or the local stand-in a test sign-in needs (gameserver.js token)
      if (b.action === 'wallet') { asks++; return route.fulfill({ contentType: 'application/json', body: JSON.stringify(answer) }); }
      return route.fulfill({ contentType: 'application/json', body: b.action === 'burned' ? '{"gamesRaw":0,"lotteryRaw":0,"storeRaw":0,"totalRaw":0}' : '{"error":"stand-in"}' }); }
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://local.test/')) { const f = path.join(ROOT, url.replace('http://local.test/', '').split('#')[0].split('?')[0]); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.abort();
  });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://local.test/online.html?net=local' + qs + '#games', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(2500);
  return p;
}
const shown = (p) => p.evaluate(() => [...document.querySelectorAll('[data-wallet]')].filter((e) => e.offsetParent).map((e) => e.textContent.replace(/\s+/g, ' ').trim()));

console.log('1. A guest');
let p = await open('');
let s = await shown(p);
check(s.length === 3 && s.every((t) => t === 'Your wallet: sign in to see it here'), `under each of the 3 games: "${s[0]}"`);
check(asks === 0, 'a guest costs no server call');
await p.context().close();

console.log('2. Signed in');
p = await open('&token=test-token&server=' + encodeURIComponent('http://localhost:8797/api'));
s = await shown(p);
check(s.length === 3 && s.every((t) => t === 'Your wallet 54,321 SANTA ≈ $46.21 (devnet test SANTA) Refresh'), `"${s[0]}"`);
await p.locator('#slots .pullrow').screenshot({ path: 'out/wallet-line.png' });
let before = asks; await p.click('#slots [data-wallet-refresh]'); await p.waitForTimeout(500);
check(asks === before + 1, 'Refresh asks again');
before = asks; await p.evaluate(async () => { const m = await import('./walletline.js'); for (let i = 0; i < 6; i++) await m.refreshWallet(); });
check(asks - before <= 1, `six automatic refreshes in a row: ${asks - before} server call (spaced 8 s)`);
answer = { wallet: null }; await p.click('#slots [data-wallet-refresh]').catch(() => {}); await p.waitForTimeout(500);
check((await shown(p))[0].startsWith('Your wallet: none linked to this account'), `no wallet linked: "${(await shown(p))[0]}"`);
answer = { error: 'something went wrong on our side; please try again' }; await p.evaluate(async () => (await import('./walletline.js')).refreshWallet(true)); await p.waitForTimeout(300);
check(/couldn't read it just now/.test((await shown(p))[0]), 'a failed read says so (never a made-up number)');
await p.context().close();
check(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
if (fails.length) { console.log('FAIL:', fails.length); process.exit(1); }
console.log('OK: wallet line under every game: guest, signed in (SANTA + dollars), Refresh, spaced auto refresh, no wallet, failed read');
