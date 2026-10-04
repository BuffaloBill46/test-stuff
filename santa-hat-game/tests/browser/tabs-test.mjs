import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, OUT = 'out/tabs';
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [label, vw, vh] of [['desk', 1280, 800], ['phone', 390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, hasTouch: label === 'phone' });
  const errors = [];
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://local.test/')) { const p = url.replace('http://local.test/', '').split('#')[0].split('?')[0]; const f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' }); return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    if (url.startsWith('https://api.santahatgames.com')) return route.fulfill({ contentType: 'application/json', body: '{"gamesRaw":0,"lotteryRaw":0,"storeRaw":0,"totalRaw":0}' }); // the money strip's burned-so-far (the live game server)
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const tap = (sel) => (label === 'phone' ? page.tap(sel) : page.click(sel));
  await page.goto('http://local.test/online.html?net=local');
  await page.waitForFunction(() => window.__sq, null, { timeout: 60000 }); await wait(2500);
  await page.screenshot({ path: `${OUT}-${label}-1-play.png` });
  await page.evaluate(() => document.querySelector('#how-ranking').scrollIntoView()); await wait(500);
  await page.screenshot({ path: `${OUT}-${label}-1b-ranking.png` });
  await tap('#t-store'); await page.waitForSelector('.shopitem img', { timeout: 60000 }); await wait(800);
  console.log(label, 'store items shown:', await page.locator('.shopitem').count());
  await page.screenshot({ path: `${OUT}-${label}-2-store.png` });
  await tap('#signin'); await wait(400);
  await page.screenshot({ path: `${OUT}-${label}-2b-signin.png` });
  await page.fill('#email', 'not-an-email'); await tap('#emailBtn'); await wait(200);
  console.log(label, 'bad email:', await page.textContent('#acctMsg'));
  await page.fill('#email', 'cody@example.com'); await tap('#emailBtn'); await wait(800);
  await tap('#signin'); await wait(300);
  console.log(label, 'signed-in panel:', (await page.textContent('#acctIn')).replace(/\s+/g, ' ').trim());
  await tap('#acctClose'); await wait(200);
  console.log(label, 'after sign-in:', await page.textContent('#signin'), '| rank chip', await page.textContent('#rankchip b'));
  // try on the Gorilla from the store: must preview but refuse to save
  await tap('#t-store'); await wait(300);
  await page.locator('[data-try="sb_ice"]').click(); await wait(1500);
  console.log(label, 'gorilla save disabled:', await page.isDisabled('#avsave'), '|', await page.textContent('#avmsg'));
  await page.screenshot({ path: `${OUT}-${label}-3-tryon-gorilla.png` });
  // the tried-on ball isn't owned, so Save stays off while it's in the look: start again from the saved look (a reload), then
  // pick free level-1 things (since 028 most looks unlock by level, so the test uses ones every level-1 player has)
  await page.reload(); await page.waitForFunction(() => window.__sq, null, { timeout: 60000 }); await wait(1500); await tap('#t-avatar'); await wait(500);
  await page.click('[data-slot="face"]'); await wait(300); await page.click('[data-pick="face_smile"]');
  await page.click('[data-slot="shirt"]'); await wait(300); await page.click('[data-pick="shirt_blue"]');
  await page.fill('#avname', 'Cody'); await page.click('#avsave'); await wait(800);
  console.log(label, 'save result:', await page.textContent('#avmsg'), '| nav name', await page.textContent('#signin'));
  await page.screenshot({ path: `${OUT}-${label}-4-avatar.png` });
  await tap('#t-ranks'); await wait(1000);
  console.log(label, 'leaderboard rows:', await page.locator('.lb tbody tr').count(), '| first:', (await page.textContent('.lb tbody tr td:nth-child(2)'))?.trim());
  await page.screenshot({ path: `${OUT}-${label}-5-ranks.png` });
  await tap('#t-play'); await tap('#playUnranked'); await wait(300);
  console.log(label, 'name field (signed in, read-only):', await page.inputValue('#name'), await page.evaluate(() => document.querySelector('#name').readOnly));
  await tap('#practice'); await wait(3000);
  const me = await page.evaluate(() => ({ inRoom: !!window.__sq.view, navHidden: document.querySelector('#nav').hidden, avatar: window.__sq.me.a }));
  console.log(label, 'practice:', JSON.stringify(me));
  await tap('#start').catch(() => {}); await wait(2500);
  const names = await page.evaluate(() => [...document.querySelectorAll('.tag')].filter((t) => !t.hidden).map((t) => t.textContent));
  console.log(label, 'name tags in match:', JSON.stringify(names));
  await page.screenshot({ path: `${OUT}-${label}-6-practice.png` });
  console.log(label, 'errors:', errors.length ? errors.slice(0, 10).join('\n  ') : 'none');
  await ctx.close();
}
await browser.close();
