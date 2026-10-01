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
    return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' });
  }
  return route.abort();
});

async function open(name, qs = '') {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(name + ' pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()); });
  // slow machines: the 3rd and 4th 3D window can take over 30 s to load (LESSONS), so allow 90 s
  await page.goto('http://local.test/online.html?net=local' + qs, { timeout: 90000 });
  await page.waitForFunction(() => window.__sq, null, { timeout: 90000 });
  if (!(await page.isVisible('#name'))) await page.click('#playUnranked');
  await page.fill('#name', name);
  return page;
}
const state = (p) => p.evaluate(() => { const s = window.__sq, v = s.view; return { host: s.isHost, room: s.room ? true : false, phase: v?.phase, mode: v?.mode, round: v?.round, humans: v?.ents.filter((e) => !e.bot).length, bots: v?.ents.filter((e) => e.bot).length, scores: v?.ents.filter((e) => !e.bot).map((e) => e.score), ts: v?.ts, me: s.view?.ents.find((e) => e.peer === s.me.id)?.id ?? null }; });
const log = async (label, pages) => { for (const [n, p] of pages) console.log(label.padEnd(18), n.padEnd(4), JSON.stringify(await state(p))); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const A = await open('Ava');
await A.screenshot({ path: `${OUT}-0-home.png` });
await A.click('#create');
await A.waitForFunction(() => window.__sq.room, null, { timeout: 20000 });
const code = await A.evaluate(() => new URLSearchParams(location.search).get('room'));
console.log('room code', code);
await wait(4000);
const B = await open('Ben', '&room=' + code); await B.click('#joinBtn');
const Cc = await open('Cy', '&room=' + code); await Cc.click('#joinBtn');
await wait(6000);
let pages = [['Ava', A], ['Ben', B], ['Cy', Cc]];
await log('lobby', pages);
await A.screenshot({ path: `${OUT}-1-lobby-host.png` });
await B.screenshot({ path: `${OUT}-1-lobby-guest.png` });

// referee picks teams and starts
await A.click('[data-mode="team"]'); await wait(500); await A.click('#start'); // (the load screen + countdown are skipped here: match-intro-test covers them)
await A.waitForFunction(() => { const s = window.__sq; if (/^(intro|count)$/.test(s.sim.S.phase)) s.sim.S.time = 0; return s.sim.S.phase === 'play'; }, null, { timeout: 60000 });
await wait(3000);
await log('started', pages);

// Ben moves right for a while: the referee must see him move
const bx0 = await A.evaluate(() => { const s = window.__sq; return s.sim.S.ents.find((e) => e.peer !== s.me.id && !e.bot && e.peer)?.x; });
await B.bringToFront(); await B.keyboard.down('KeyD'); await wait(2500); await B.keyboard.up('KeyD');
const benOnHost = await A.evaluate(() => window.__sq.sim.S.ents.filter((e) => !e.bot).map((e) => [e.peer.slice(0, 4), +e.x.toFixed(1), +e.z.toFixed(1)]));
const benLocal = await B.evaluate(() => [window.__sq.ctl.x.toFixed(1), window.__sq.ctl.z.toFixed(1)]);
console.log('Ben local pos', benLocal, '| referee sees', JSON.stringify(benOnHost));

// measure message rates for 8 s with everyone running around
for (const [, p] of pages) await p.evaluate(() => { window.__sent.snap = 0; window.__sent.rep = 0; });
for (const [, p] of pages) await p.keyboard.down('KeyA');
await wait(4000); for (const [, p] of pages) { await p.keyboard.up('KeyA'); await p.keyboard.down('KeyW'); }
await wait(4000); for (const [, p] of pages) await p.keyboard.up('KeyW');
const counts = []; for (const [n, p] of pages) counts.push([n, await p.evaluate(() => ({ ...window.__sent }))]);
const secs = 8, snapsPerSec = counts.reduce((a, [, c]) => a + c.snap, 0) / secs, repsPerSec = counts.filter(([, c]) => c.rep).map(([, c]) => c.rep / secs);
console.log('measured: referee snapshots/s', snapsPerSec.toFixed(1), '| each player reports/s', repsPerSec.map((r) => r.toFixed(1)).join(', '));
const maxRep = Math.max(...repsPerSec), budget = (n, snapHz) => snapHz * n + (n - 1) * maxRep * 2;
console.log('Supabase messages/s projected (limit 100): 3 players', budget(3, 8).toFixed(0), '| 4 players', budget(4, 8).toFixed(0), '| 6 players', budget(6, 1000 / 170).toFixed(0), '| 8 players', budget(8, 1000 / 220).toFixed(0));
// everyone throws at the nearest foe a few times (Space = auto-aim)
for (let i = 0; i < 6; i++) for (const [, p] of pages) { await p.bringToFront(); await p.keyboard.press('Space'); await wait(250); }
await Cc.bringToFront(); await Cc.keyboard.press('Digit1');
await wait(1500);
const bubbleOnA = await A.evaluate(() => [...document.querySelectorAll('.tag.say')].map((t) => t.textContent));
console.log('emote bubbles seen by Ava:', JSON.stringify(bubbleOnA));
await log('mid-round', pages);
await A.screenshot({ path: `${OUT}-2-play-host.png` });
await B.screenshot({ path: `${OUT}-2-play-guest.png` });

// referee leaves mid-match: someone else must take over and the match must continue
const before = await state(B);
await A.close();
pages = [['Ben', B], ['Cy', Cc]];
await wait(9000);
await log('after host left', pages);
const after = await state(B);
console.log('handover kept phase', before.phase, '->', after.phase, '| round', before.round, '->', after.round);

// fast-forward: the new referee ends the match; everyone sees results
const newHost = (await B.evaluate(() => window.__sq.isHost)) ? B : Cc;
await newHost.evaluate(() => { const S = window.__sq.sim.S; S.round = 3; S.time = 0.2; });
await wait(4000);
await log('match end', pages);
await B.screenshot({ path: `${OUT}-3-end-guest.png` });
console.log('errors:', errors.length ? errors.slice(0, 15).join('\n  ') : 'none');
await browser.close();
