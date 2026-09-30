// Focus group, part 2: 10 player types walk through the REAL page in a browser, each on their own device and path.
// Records what they saw and did (texts, tap counts, screenshots in out/). The live SANTA price is fetched for real.
import { createRequire } from 'module'; import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, OUT = new URL('out', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const THREE = new URL('../browser/node_modules/three/build/', import.meta.url).pathname;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const notes = {};
async function session(name, vp, touch, fn) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch }); const errors = [], log = [];
  await ctx.route('**/*', async (route) => { const req = route.request(), url = req.url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(THREE + url.split('/build/')[1]), contentType: 'text/javascript' });
    if (/api\.dexscreener\.com|publicnode\.com/.test(url)) { // real price and tax, fetched live
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
      try { let cmd = `curl -sS -m 15 "${url}"`; if (req.method() === 'POST') { writeFileSync('/tmp/fg-body.json', req.postData()); cmd += ` -H 'content-type: application/json' --data @/tmp/fg-body.json`; }
        return route.fulfill({ body: execSync(cmd), contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } }); } catch { return route.abort(); } }
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.g/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: '' }); return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.fulfill({ status: 503, body: '' }); });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost/online.html?net=local', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 60000 }); await p.waitForTimeout(1500);
  const t = (sel) => p.evaluate((s) => document.querySelector(s)?.textContent.replace(/\s+/g, ' ').trim() || '', sel);
  const click = (sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
  const shot = (tag) => p.screenshot({ path: `${OUT}/${name.replace(/\W+/g, '-')}-${tag}.png` });
  const done = () => p.waitForFunction(() => !(window.__slots?.busy || window.__spin?.busy), null, { timeout: 120000 });
  try { await fn({ p, t, click, shot, done, log }); } catch (e) { log.push('STOPPED: ' + e.message.split('\n')[0]); }
  notes[name] = { log, errors }; await ctx.close(); console.log('done:', name);
}
const phone = { width: 390, height: 844 }, desk = { width: 1366, height: 860 };

await session('Phone newcomer', phone, true, async ({ p, t, click, shot, done, log }) => {
  log.push('lands on: ' + (await t('#tab-play .hero')).slice(0, 160)); await shot('1-land');
  await click('#t-games'); await p.waitForFunction(() => window.__slots); await p.waitForTimeout(3000);
  log.push('Games intro: ' + (await t('#tab-games .hero')).slice(0, 260)); await shot('2-games');
  await p.evaluate(() => document.querySelector('#spin').scrollIntoView()); await click('#spin .spinbtn'); await p.waitForTimeout(600);
  log.push('taps Spin with no credits → dialog open: ' + (await p.evaluate(() => document.querySelector('#buyDlg').open)) + ' | says: ' + (await t('#buyDlg')).slice(0, 300)); await shot('3-buy');
  await click('#buyQuick [data-n="5"]'); await click('#buyGo'); await p.waitForTimeout(500); await done();
  log.push('after first spin: ' + (await t('#spin .res')) + ' | credits line: ' + (await t('#spin .credrow'))); await shot('4-first-spin');
});
await session('Careful budgeter', { width: 360, height: 760 }, true, async ({ p, t, click, shot, done, log }) => {
  await click('#t-games'); await p.waitForFunction(() => window.__spin); await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelector('#spin').scrollIntoView());
  log.push('odds legend: ' + (await t('#oddsList'))); log.push('spin sizes: ' + (await t('#spin .bets')));
  await click('#spin .spinbtn'); await p.waitForTimeout(500);
  log.push('buy dialog default count & total: ' + (await t('#buyCount')) + ' / ' + (await t('#buyGo')) + ' | SANTA line: ' + (await t('#buySanta')));
  await click('#buyQuick [data-n="1"]'); log.push('after picking 1: ' + (await t('#buyGo'))); await click('#buyGo'); await p.waitForTimeout(500); await done();
  log.push('result: ' + (await t('#spin .res'))); log.push('demo balance now: ' + (await t('#demoBal'))); await shot('1-after');
});
await session('Skeptic', desk, false, async ({ p, t, click, shot, done, log }) => {
  await click('#t-games'); await p.waitForFunction(() => window.__slots); await p.waitForTimeout(2500);
  log.push('facts shown: ' + (await t('#slots .facts')));
  await click('#howBtn'); await p.waitForTimeout(400); log.push('how-to-win rules: ' + (await t('.howrules')).slice(0, 400)); await shot('1-how'); await p.keyboard.press('Escape');
  await p.evaluate(() => window.__credits.give('big', 1)); await click('.machine .pull'); await p.waitForTimeout(500); await done();
  log.push('check button visible: ' + (await p.isVisible('[data-proof="big"]')));
  await click('[data-proof="big"]'); await click('#proofCheck'); await p.waitForFunction(() => /atch/.test(document.querySelector('#proofOut').textContent));
  log.push('check says: ' + (await t('#proofOut'))); log.push('how a skeptic would check it themselves (text): ' + (await t('#proofDlg .dim'))); await shot('2-check');
});
await session('High roller', desk, false, async ({ p, t, click, shot, done, log }) => {
  await click('#t-games'); await p.waitForFunction(() => window.__slots); await p.waitForTimeout(2500);
  await p.evaluate(() => { window.__slots.state.bal = 200; }); await click('[data-buy="big"]'); await click('#buyQuick [data-n="10"]');
  log.push('max buy: ' + (await t('#buyGo')) + ' | can buy more than 10 at once: ' + (await p.evaluate(() => !document.querySelector('#buyPlus').disabled)));
  await click('#buyGo'); const t0 = Date.now();
  for (let i = 0; i < 10; i++) { await click('.machine .pull'); await p.waitForTimeout(250); await click('.machine .pull'); await done(); }
  log.push(`10 pulls with tap-to-stop took ${Math.round((Date.now() - t0) / 1000)} s in this slow test browser`); log.push('pool/jackpot readouts: ' + (await t('#slots .jp')));
  log.push('after 10: ' + (await t('#slots .machine .res')) + ' | ' + (await t('#slots .credrow'))); await shot('1-after-10');
});
await session('Competitive gamer', desk, false, async ({ p, t, click, shot, log }) => {
  await click('#playRanked'); await p.waitForTimeout(600); log.push('ranked lobby: ' + (await t('#lobby, .lobby, #home')).slice(0, 300)); await shot('1-ranked');
  await p.evaluate(() => document.querySelector('#homeClose')?.click()); await click('#t-ranks'); await p.waitForTimeout(800); log.push('ranks tab: ' + (await t('#tab-ranks')).slice(0, 300)); await shot('2-ranks');
});
await session('Collector', phone, true, async ({ p, t, click, shot, log }) => {
  await click('#t-store'); await p.waitForTimeout(1500); log.push('store: ' + (await t('#tab-store .hero')).slice(0, 200));
  const tryOn = await p.$('#tab-store button:not([disabled])'); log.push('first enabled store button: ' + (tryOn ? await tryOn.textContent() : 'none'));
  await click('#t-avatar'); await p.waitForTimeout(1500); log.push('avatar tab: ' + (await t('#tab-avatar')).slice(0, 250)); await shot('1-avatar');
});
await session('Crypto regular', desk, false, async ({ p, t, click, shot, log }) => {
  await click('#signin'); await p.waitForTimeout(500); log.push('sign-in sheet: ' + (await t('#signinSheet, .sheet, dialog[open]')).slice(0, 300)); await shot('1-signin');
  await p.keyboard.press('Escape'); await click('#t-games'); await p.waitForFunction(() => window.__slots); await p.waitForTimeout(2500);
  log.push('live price line: ' + (await t('#liveMarket'))); log.push('demo notice: ' + (await t('#slots .demo')));
});
await session('Keyboard-only player', desk, false, async ({ p, t, log }) => {
  await p.evaluate(() => document.querySelector('#t-games').click()); await p.waitForFunction(() => window.__slots); await p.waitForTimeout(2500);
  await p.evaluate(() => document.activeElement?.blur()); let n = 0, found = false;
  for (; n < 80; n++) { await p.keyboard.press('Tab'); if (await p.evaluate(() => document.activeElement?.classList.contains('pull'))) { found = true; break; } }
  log.push(found ? `reached the Pull button after ${n + 1} Tab presses` : 'could not reach Pull with Tab in 80 presses');
  if (found) { await p.keyboard.press('Enter'); await p.waitForTimeout(500); log.push('Enter on Pull opens the buy counter: ' + (await p.evaluate(() => document.querySelector('#buyDlg').open)) + ' | focus is on: ' + (await p.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 30) || document.activeElement?.tagName))); }
});
await session('Returning daily player', phone, true, async ({ p, t, click, log }) => {
  await click('#t-games'); await p.waitForFunction(() => window.__slots); await p.waitForTimeout(2000);
  await p.evaluate(() => window.__credits.give('spin10', 3)); await p.reload(); await p.waitForFunction(() => window.__sq); await click('#t-games'); await p.waitForFunction(() => window.__slots); await p.waitForTimeout(2000);
  log.push('after coming back: spin credits line: ' + (await t('#spin .credrow')) + ' | demo balance ' + (await t('#demoBal')) + ' | winners: ' + (await t('#winList')).slice(0, 120));
});
await session('Small-phone player', { width: 320, height: 640 }, true, async ({ p, t, click, shot, log }) => {
  for (const tab of ['play', 'games', 'store']) { await click('#t-' + tab); await p.waitForTimeout(tab === 'games' ? 3000 : 1000); await shot(tab); }
  log.push('screenshots taken on a 320-px phone: play, games, store');
});
await browser.close();
writeFileSync(`${OUT}/walkthrough.json`, JSON.stringify(notes, null, 1));
for (const [k, v] of Object.entries(notes)) { console.log('\n## ' + k); v.log.forEach((l) => console.log(' - ' + l)); if (v.errors.length) console.log(' errors: ' + v.errors.join(' | ')); }
