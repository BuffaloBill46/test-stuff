// Snowball Drop on the Games tab (demo): ONE balance for both sizes (Cody), bought $10 at once; forced paths (10×, 0×,
// 1×); balance and demo-money math to the cent; the shared Spin pool readouts; the re-check; the winners list.
// Screenshots in out/drop/.
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, OUT = 'out/drop'; mkdirSync(OUT, { recursive: true });
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [], fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const IN = (1 - 0.10 * 0.97) * 0.97; // pool income per $1 after the 10% burn and the 3% tax, exactly

for (const [label, vp] of [['desk', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' }); return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.abort(); });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(label + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(label + ': ' + m.text()); });
  await p.goto('http://localhost/online.html?net=local'); await p.waitForFunction(() => window.__sq, null, { timeout: 60000 }); await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector('#t-games').click());
  await p.waitForFunction(() => window.__spin, null, { timeout: 90000 }).catch((e) => { console.log('errors so far:', errors); throw e; });
  await p.waitForFunction(() => window.__drop, null, { timeout: 30000 });
  await p.evaluate(() => document.querySelector('#drop').scrollIntoView({ block: 'start' })); await p.waitForTimeout(600);
  const bal = () => p.evaluate(() => window.__slots.state.bal), pool = () => p.evaluate(() => window.__spin.st.pool);
  const readout = () => p.textContent('#crDrop');
  const waitLanded = () => p.waitForFunction(() => !window.__drop.opening && window.__drop.flying === 0, null, { timeout: 60000 });
  check(await readout() === '$0.00', `${label}: starts with no balance (${await readout()})`);
  check(await p.locator('#dropOdds li').count() === 6, `${label}: odds list (5 prizes + payback line)`);
  await p.screenshot({ path: `${OUT}/${label}-1-board.png` });

  // 1. The first drop opens the buy counter. Buy $10 in one go.
  let b0 = await bal(), pool0 = await pool();
  await p.evaluate(() => { window.__drop.test.next = [0, 0, 0, 0, 0, 0, 0, 0]; document.querySelector('#drop .dropbtn').click(); }); // all left: the 10× present
  await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 });
  check(await p.textContent('#buyTitle') === 'Add to your balance', `${label}: buy dialog title "${await p.textContent('#buyTitle')}"`);
  await p.evaluate(() => document.querySelector('#buyQuick [data-n="10"]').click());
  check(await p.textContent('#buyGo') === 'Add $10.00 to your balance', `${label}: buy button "${await p.textContent('#buyGo')}"`);
  check(await p.textContent('#buyCount') === '$10', `${label}: counter shows $10`);
  await p.evaluate(() => document.querySelector('#buyGo').click());
  await waitLanded(); await p.waitForTimeout(300);
  // $10 paid; a 10¢ drop landed on 10× = $1.00 (97¢ after the tax)
  check(await readout() === '$9.90', `${label}: $10 balance − one 10¢ drop = $9.90 (got ${await readout()})`);
  check(Math.abs((await bal()) - (b0 - 10 + 1 * 0.97)) < 1e-9, `${label}: demo money: −$10, +97¢`);
  check(Math.abs((await pool()) - (pool0 + 10 * IN - 1)) < 1e-9, `${label}: the Spin pool got the $10 (after burn and tax) and paid the $1`);
  check(await p.textContent('#dropPool') === await p.textContent('#spinPool'), `${label}: both cards show the same shared pool`);
  check(/10× win/.test(await p.textContent('#drop .res')), `${label}: 10× message: ${await p.textContent('#drop .res')}`);
  await p.screenshot({ path: `${OUT}/${label}-2-ten.png` });

  // 2. Switch to $1 drops: the SAME balance pays. A middle path = 0×.
  await p.evaluate(() => document.querySelector('#drop [data-dbet="1"]').click());
  b0 = await bal();
  await p.evaluate(() => { window.__drop.test.next = [1, 0, 1, 0, 1, 0, 1, 0]; document.querySelector('#drop .dropbtn').click(); });
  await waitLanded(); await p.waitForTimeout(200);
  check(await readout() === '$8.90', `${label}: a $1 drop takes $1 from the same balance (got ${await readout()})`);
  check(Math.abs((await bal()) - b0) < 1e-9 && /No win/.test(await p.textContent('#drop .res')), `${label}: 0× pays nothing`);
  // 3. 1× money back on $1
  b0 = await bal();
  await p.evaluate(() => { window.__drop.test.next = [1, 1, 0, 0, 0, 0, 0, 0]; document.querySelector('#drop .dropbtn').click(); });
  await waitLanded(); await p.waitForTimeout(200);
  check(await readout() === '$7.90' && Math.abs((await bal()) - (b0 + 0.97)) < 1e-9, `${label}: 1× gives the $1 back less tax`);
  // 4. The re-check replays the bounces.
  await p.evaluate(() => document.querySelector('[data-proof="drop"]').click()); await p.evaluate(() => document.querySelector('#proofCheck').click());
  await p.waitForFunction(() => /atch/.test(document.querySelector('#proofOut').textContent), null, { timeout: 15000 });
  const proof = await p.textContent('#proofOut');
  check(/test play/.test(proof) || /bounces/.test(proof), `${label}: re-check describes the bounces: ${proof.slice(0, 120)}`);
  await p.evaluate(() => document.querySelector('#proofClose').click());
  // 5. An unforced drop: re-check MATCHES and says the same present.
  await p.evaluate(() => document.querySelector('#drop .dropbtn').click()); await waitLanded();
  await p.evaluate(() => document.querySelector('[data-proof="drop"]').click()); await p.evaluate(() => document.querySelector('#proofCheck').click());
  await p.waitForFunction(() => /atch/.test(document.querySelector('#proofOut').textContent), null, { timeout: 15000 });
  check(/^Matches\..*bounces [LR ]+.*present \d of 9/.test(await p.textContent('#proofOut')), `${label}: a real drop re-checks: ${(await p.textContent('#proofOut')).slice(0, 160)}`);
  await p.evaluate(() => document.querySelector('#proofClose').click());
  check(await readout() === '$6.90', `${label}: balance $6.90 after $3.10 of drops`);
  // 6. Winners list and history
  const winners = await p.evaluate(() => [...document.querySelectorAll('#winList li')].map((li) => li.textContent.replace(/\s+/g, ' ')));
  check(winners.some((w) => /Snowball Drop 10¢/.test(w) && /\+900%/.test(w)), `${label}: the 10× is in Recent winners: ${JSON.stringify(winners.slice(0, 2))}`);
  check((await p.locator('#dropHistory li:not(.empty)').count()) === 4, `${label}: last drops strip`);
  check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${label}: nothing wider than the screen`);
  await p.evaluate(() => document.querySelector('#drop .dropcard').scrollIntoView({ block: 'center' })); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/${label}-3-after.png` });
  await ctx.close();
}
console.log('errors:', errors.filter((e) => !/ERR_FAILED|Failed to load/.test(e)).length ? errors : 'none');
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close();
process.exit(fails.length ? 1 : 0);
