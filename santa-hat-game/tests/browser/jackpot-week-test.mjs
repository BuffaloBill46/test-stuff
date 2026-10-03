// POOL JACKPOT BANNER + BIGGEST THIS WEEK (Cody's list, 2026-10-03; jackpotbar.js, games.js). With a stand-in game server:
// a jackpot won 5 minutes ago shows a banner to everyone (who, how much, which game); its button opens that game; once closed
// or followed it never shows again in that browser; an old jackpot (2 h) never shows; hidden during a match. The winners
// list's "Biggest this week" tab ranks the server's weekly list. Run: node jackpot-week-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync('out', { recursive: true });
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const now = Date.now();
const recent = [{ game: 'drop100', name: 'Ava', amount: 125, gainPct: 12400, at: now - 5 * 60e3, note: 'pool jackpot', big: true },
  { game: 'slots', name: 'Ben', amount: 3.5, gainPct: 250, at: now - 6 * 60e3, note: '3.5×', big: false },
  { game: 'stock10', name: 'Old', amount: 40, gainPct: 39900, at: now - 2 * 3600e3, note: 'pool jackpot', big: true }];
const week = [recent[0], recent[2], recent[1]];
let winnerAsks = 0;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }); const errors = [];
await ctx.addInitScript(() => { try { localStorage.setItem('santa.coached', '1'); } catch {} });
await ctx.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.startsWith('https://api.santahatgames.com') || url.startsWith('http://localhost:8798/')) {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'winners') { winnerAsks++; return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ winners: recent, week }) }); }
    return route.fulfill({ contentType: 'application/json', body: b.action === 'burned' ? '{"gamesRaw":0,"lotteryRaw":0,"storeRaw":0,"totalRaw":0}' : '{"error":"stand-in"}' });
  }
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('http://local.test/')) { const f = path.join(ROOT, url.replace('http://local.test/', '').split('#')[0].split('?')[0]); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.abort();
});
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
const load = async (hash = '#home', qs = '') => { await p.goto('http://local.test/online.html?net=local' + qs + hash, { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(2000); };
const bar = () => p.evaluate(() => { const b = document.querySelector('#jpbar'); return b.hidden ? null : b.textContent.replace(/\s+/g, ' ').trim(); });

console.log('1. The jackpot banner');
await load();
const t1 = await bar();
check(!!t1 && /Pool jackpot!/.test(t1) && /Ava won \$125\.00 on Snowball Drop/.test(t1) && /Play Snowball Drop/.test(t1), `a fresh jackpot shows: "${t1}"`);
check(!/Old/.test(t1 || ''), 'the 2-hour-old jackpot is not shown');
await p.screenshot({ path: 'out/jackpot-bar.png', clip: { x: 0, y: 0, width: 1280, height: 160 } });
await p.click('#jpbar [data-jp-go]'); await p.waitForTimeout(1500);
check(await p.evaluate(() => !document.querySelector('#tab-games').hidden), 'its button opens the Games page');
check(await p.evaluate(() => { const r = document.querySelector('#drop').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }), 'at Snowball Drop');
await load('#home');
check((await bar()) === null, 'followed once: never shown again in this browser');

console.log('2. Biggest this week (server mode)');
await load('#games', '&server=' + encodeURIComponent('http://localhost:8798/api'));
await p.click('[data-wins="week"]'); await p.waitForTimeout(500);
const rows = await p.evaluate(() => [...document.querySelectorAll('#winList li')].map((l) => l.textContent.replace(/\s+/g, ' ').trim()));
check(rows.length === 3 && /^1/.test(rows[0]) && rows[0].includes('Ava') && rows[1].includes('Old') && rows[2].includes('Ben'), `ranked biggest first: ${rows.map((r) => r.slice(0, 40)).join(' | ')}`);
await p.click('[data-wins="recent"]'); await p.waitForTimeout(300);
const rec = await p.evaluate(() => [...document.querySelectorAll('#winList li')].map((l) => l.textContent.trim().slice(0, 12)));
check(rec.length === 3 && !/^1/.test(rec[0]), 'Latest goes back to the newest-first list without ranks');
await p.locator('#winners').screenshot({ path: 'out/winners-week.png' }).catch(() => {});

console.log('3. Hidden during a match');
await p.evaluate(() => { try { localStorage.removeItem('santa.jpSeen'); } catch {} });
await load('#play');
check((await bar()) !== null, 'shown again for a browser that never saw it');
await p.evaluate(() => window.__sq.startPractice()); await p.waitForTimeout(1800);
check(await p.evaluate(() => document.querySelector('#jpbar').hidden), 'hidden while in a match');
check(winnerAsks <= 8, `the winners list asked sparingly (${winnerAsks} times over 4 page loads)`);
check(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
if (fails.length) { console.log('FAIL:', fails.length); process.exit(1); }
console.log('OK: pool jackpot banner (fresh only, once per browser, opens the game, hidden in matches) and Biggest this week (ranked, server list)');
