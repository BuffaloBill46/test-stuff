// HOME, PLAY and the MONEY STRIPS (Cody, 2026-10-03). The site opens on Home (the game's intro, Player Progress, the season);
// Home's big Play now (on the first screen, phone and computer) opens the Play page (the match types), and Player Progress sits at
// the top of whichever of the two is open (one box, moved). Store and Games start with a strip saying where the SANTA goes: the
// shares from the rules files, the Game pool and its jackpots, and SANTA burned so far from the game server. All six tabs fit a
// phone. Screenshots in out/. Run: node home-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync('out', { recursive: true });
const BURNED_RAW = 12_345_678 * 1e6; // the stand-in game server's burned-so-far: 12.35M SANTA
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = []; let burnedAsks = 0;
async function open(viewport, hash = '') {
  const ctx = await browser.newContext({ viewport, ...(viewport.width < 600 ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('https://api.santahatgames.com')) { const b = JSON.parse(route.request().postData() || '{}');
      if (b.action === 'burned') { burnedAsks++; return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ gamesRaw: BURNED_RAW, lotteryRaw: 0, storeRaw: 0, totalRaw: BURNED_RAW }) }); }
      return route.fulfill({ contentType: 'application/json', body: '{"error":"stand-in"}' }); }
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://local.test/')) { const f = path.join(ROOT, url.replace('http://local.test/', '').split('#')[0].split('?')[0]); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.abort();
  });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://local.test/online.html?net=local' + hash, { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1200);
  return p;
}
const where = (p) => p.evaluate(() => ({ home: !document.querySelector('#tab-home').hidden, play: !document.querySelector('#tab-play').hidden,
  progressIn: document.querySelector('#progress').closest('.page')?.id, progressFirstOnPlay: document.querySelector('#tab-play').firstElementChild?.id === 'progress',
  progressAfterHero: document.querySelector('#tab-home .hero')?.nextElementSibling?.id === 'progress', hash: location.hash }));

for (const [name, viewport] of [['computer', { width: 1366, height: 768 }], ['phone', { width: 375, height: 667 }]]) {
  console.log(`${name} (${viewport.width}×${viewport.height})`);
  const p = await open(viewport);
  let w = await where(p);
  check(w.home && !w.play && w.progressIn === 'tab-home' && w.progressAfterHero, `opens on Home, Player Progress under the intro (${JSON.stringify(w)})`);
  check(await p.isVisible('#season') && await p.isVisible('.hero h1'), 'Home has the intro and the season calendar');
  const b = await p.locator('#playBig').boundingBox();
  check(b && b.y >= 0 && b.y + b.height <= viewport.height && b.height >= 44, `Play now on the first screen (bottom ${b && Math.round(b.y + b.height)} of ${viewport.height})`);
  const nav = await p.evaluate(() => { const t = [...document.querySelectorAll('#nav .tabs button')]; return { names: t.map((x) => x.textContent), fits: t.every((x) => { const r = x.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 0.5; }), wide: document.documentElement.scrollWidth > innerWidth }; });
  check(nav.names.join() === 'Home,Play,Games,Store,Avatar,Ranks' && nav.fits && !nav.wide, `six tabs, all on screen, no sideways scroll (${nav.names.join(' ')})`);
  await p.screenshot({ path: `out/home-${name}.png` });
  await p.click('#playBig'); await p.waitForTimeout(400);
  w = await where(p);
  check(!w.home && w.play && w.progressIn === 'tab-play' && w.progressFirstOnPlay && w.hash === '#play', `Play now → the Play page, Player Progress at its top (${JSON.stringify(w)})`);
  check(await p.isVisible('#playUnranked') && await p.isVisible('#playRanked'), 'the match types are there');
  await p.screenshot({ path: `out/play-${name}.png` });
  await p.click('#t-home'); await p.waitForTimeout(300); w = await where(p);
  check(w.home && w.progressIn === 'tab-home' && w.progressAfterHero, 'back on Home: Player Progress moved back under the intro');
  check((await p.locator('#progress').count()) === 1, 'one Player Progress box, never two');

  await p.click('#t-games'); await p.waitForFunction(() => !/—/.test(document.querySelector('#msPool')?.textContent || '—'), null, { timeout: 30000 }).catch(() => {});
  const g = await p.evaluate(() => { const s = document.querySelector('#tab-games .moneystrip'); return { first: document.querySelector('#tab-games').firstElementChild === s,
    shares: [...s.querySelectorAll('[data-share]')].map((x) => x.textContent), pool: document.querySelector('#msPool').textContent, jp: document.querySelector('#msJp').textContent,
    poolBelow: document.querySelector('#slotPool').textContent, burned: s.querySelector('[data-burned]').textContent, wide: document.documentElement.scrollWidth > innerWidth }; });
  check(g.first && g.shares.join() === '10%,90%', `Games: the strip first: ${g.shares.join(' burned, ')} to the pool`);
  check(/^\$[\d,.]+ now$/.test(g.pool) && g.pool.startsWith(g.poolBelow), `the pool in the strip = the pool the games show (${g.pool} / ${g.poolBelow})`);
  check(/^Big Hat \$[\d,.]+ · Drop \$[\d,.]+ · Stocking \$[\d,.]+ \(\$1 plays\)$/.test(g.jp), `pool jackpots: ${g.jp}`);
  check(g.burned === '12.35M SANTA', `burned so far from the game server: ${g.burned}`);
  check(!g.wide, 'no sideways scroll');
  await p.screenshot({ path: `out/games-strip-${name}.png`, clip: await p.locator('#tab-games .moneystrip').boundingBox() });
  await p.click('#t-store'); await p.waitForTimeout(500);
  const s = await p.evaluate(() => { const s = document.querySelector('#tab-store .moneystrip'); return { first: document.querySelector('#tab-store').firstElementChild === s,
    shares: [...s.querySelectorAll('[data-share]')].map((x) => x.textContent), text: s.textContent.replace(/\s+/g, ' ').trim(), burned: s.querySelector('[data-burned]').textContent }; });
  check(s.first && s.shares.join() === '50%,50%,10%,90%' && /treasury/.test(s.text) && /to the pot/.test(s.text), `Store: ${s.text}`);
  check(s.burned === '12.35M SANTA', 'Store shows the same burned-so-far');
  await p.screenshot({ path: `out/store-strip-${name}.png`, clip: await p.locator('#tab-store .moneystrip').boundingBox() });
  await p.context().close();
}
console.log('links');
const q = await open({ width: 1100, height: 760 }, '#play');
const w = await where(q); check(w.play && w.progressFirstOnPlay, 'an old #play link still opens the Play page, Player Progress on top');
await q.context().close();
check(burnedAsks >= 1 && burnedAsks <= 6, `burned-so-far asked for sparingly (${burnedAsks} times over 3 visits)`);
check(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
if (fails.length) { console.log('FAIL:', fails.length); process.exit(1); }
console.log('OK: Home first (intro, progress, season, Play now on the first screen), Play now → Play page with progress on top, one progress box, the money strips on Games and Store with live numbers, six tabs fit a phone');
