import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname;
const OUT = 'out/mp';
const THREE_DIR = path.resolve('node_modules/three/build');
const cache = new Map();
const fetchCurl = (url) => { if (!cache.has(url)) cache.set(url, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${url}"`, { maxBuffer: 1e8 })); return cache.get(url); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 560 }, deviceScaleFactor: 1 });
const errors = [];
await ctx.addInitScript(() => { const o = BroadcastChannel.prototype.postMessage; window.__sent = { snap: 0, rep: 0, emote: 0 }; BroadcastChannel.prototype.postMessage = function (m) { if (m && m.k in window.__sent) window.__sent[m.k]++; return o.call(this, m); }; });
await ctx.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.join(THREE_DIR, url.split('/build/')[1])), contentType: 'text/javascript' });
  if (url.includes('cdn.jsdelivr.net/npm/') || url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); }
  }
  if (url.startsWith('http://local.test/')) {
    const p = url.replace('http://local.test/', '').split('#')[0].split('?')[0];
    const f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : 'text/html' });
  }
  return route.abort();
});

async function open(name, qs = '') {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(name + ' pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()); });
  await page.goto('http://local.test/online.html?net=local' + qs);
  await page.waitForFunction(() => window.__sq, null, { timeout: 60000 });
  await page.fill('#name', name);
  return page;
}
const state = (p) => p.evaluate(() => { const s = window.__sq, v = s.view; return { host: s.isHost, room: s.room ? true : false, phase: v?.phase, mode: v?.mode, round: v?.round, humans: v?.ents.filter((e) => !e.bot).length, bots: v?.ents.filter((e) => e.bot).length, scores: v?.ents.filter((e) => !e.bot).map((e) => e.score), ts: v?.ts, me: s.view?.ents.find((e) => e.peer === s.me.id)?.id ?? null }; });
const log = async (label, pages) => { for (const [n, p] of pages) console.log(label.padEnd(18), n.padEnd(4), JSON.stringify(await state(p))); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const A = await open('Ava');
await A.click('#create');
await A.waitForFunction(() => window.__sq.room, null, { timeout: 20000 });
const code = await A.evaluate(() => new URLSearchParams(location.search).get('room'));
const B = await open('Ben', '&room=' + code); await B.click('#joinBtn');
await B.waitForFunction(() => window.__sq.room, null, { timeout: 20000 });
await wait(3000);
// 1) idle: countdown shows, then the player is sent home with the code ready
await B.evaluate(() => window.__sq.idleFor(170000)); await wait(1500);
console.log('countdown chip:', JSON.stringify(await B.textContent('#roomchip')));
await B.evaluate(() => window.__sq.idleFor(181000)); await wait(1500);
console.log('after idle:', JSON.stringify({ inRoom: await B.evaluate(() => !!window.__sq.room), homeShown: await B.isVisible('#home'), code: await B.inputValue('#code'), status: await B.textContent('#status') }));
console.log('Ava sees players:', await A.evaluate(() => window.__sq.room.peers().length));
await B.screenshot({ path: `${OUT}-idle-home.png` });
// 2) any input cancels the countdown
await A.evaluate(() => window.__sq.idleFor(170000)); await wait(800); await A.mouse.move(100, 100); await A.mouse.move(120, 130); await wait(800);
console.log('Ava after moving the mouse:', JSON.stringify(await A.textContent('#roomchip')), 'inRoom', await A.evaluate(() => !!window.__sq.room));
// 3) game in the background for a minute
await A.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
await wait(120000); console.log("after 2 min hidden, still in room:", await A.evaluate(() => !!window.__sq.room)); await wait(62000);
console.log('after 3 min 2 s hidden:', JSON.stringify({ inRoom: await A.evaluate(() => !!window.__sq.room), status: await A.textContent('#status') }));
console.log('errors:', errors.length ? errors.slice(0, 15).join('\n  ') : 'none');
await browser.close();
