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
const st = (p) => p.evaluate(() => { const s = window.__sq, v = s.view; return { inRoom: !!s.room, host: s.isHost, watcher: !!s.me.w, phase: v?.phase, mode: v?.mode, humans: v?.ents.filter((e) => !e.bot).length, bots: v?.ents.filter((e) => e.bot).length }; });
const A = await open(); await A.fill('#avname', '').catch(() => {});
await A.click('#playRanked'); await wait(600);
console.log('ranked lobby:', JSON.stringify({ title: await A.textContent('#lobbyTitle'), tourneyVisible: await A.isVisible('#tourney'), tourneyDisabled: await A.isDisabled('#tourney'), auto: await A.textContent('#quick'), autoDisabled: await A.isDisabled('#quick'), list: (await A.textContent('#gamesList')).trim() }));
await A.screenshot({ path: 'out/lobby-1-ranked.png' });
await A.click('#homeClose'); await A.click('#playUnranked'); await wait(400);
await A.fill('#name', 'Ava'); await A.click('[data-lmode="ffa"]'); await A.click('#quick');
await A.waitForFunction(() => window.__sq.room, null, { timeout: 30000 }); await wait(3500);
console.log('Ava after auto match:', JSON.stringify(await st(A)), '| chip', (await A.textContent('#roomchip')).trim());
const B = await open(); await B.click('#playUnranked'); await wait(4500);
console.log('Ben sees in lobby list:', (await B.textContent('#gamesList')).replace(/\s+/g, ' ').trim());
await B.screenshot({ path: 'out/lobby-2-list.png' });
await B.fill('#name', 'Ben'); await B.click('#quick'); await B.waitForFunction(() => window.__sq.room, null, { timeout: 30000 }); await wait(2500);
const C = await open(); await C.click('#playUnranked'); await wait(4500);
await C.click('[data-watch]'); await C.waitForFunction(() => window.__sq.room, null, { timeout: 30000 }); await wait(3000);
console.log('Cy (watcher):', JSON.stringify(await st(C)), '| chip', (await C.textContent('#roomchip')).trim());
console.log('Ava sees:', (await A.textContent('#roomchip')).trim(), '|', JSON.stringify(await st(A)));
console.log('lobby card on Ava:', (await A.textContent('#panel')).replace(/\s+/g, ' ').trim().slice(0, 120));
await A.screenshot({ path: 'out/lobby-3-countdown.png' });
await wait(16000);
for (const [n, p] of [['Ava', A], ['Ben', B], ['Cy', C]]) console.log('after countdown', n, JSON.stringify(await st(p)));
await C.screenshot({ path: 'out/lobby-4-watching.png' });
console.log('errors:', errors.length ? errors.slice(0, 8).join('\n  ') : 'none');
await browser.close();
