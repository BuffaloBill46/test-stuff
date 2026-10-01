// Santa Hat Spin (demo): forced results (5×, 1× money back, 0×, a 10¢ 2× win), tap-to-land, that the wheel stops on
// exactly the slice the rules picked, money math, the last-spins strip, the winners list and full screen.
// Screenshots in out/spin/.
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, OUT = 'out/spin'; mkdirSync(OUT, { recursive: true });
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
  await p.waitForTimeout(2000);
  await p.evaluate(() => document.querySelector('#spin').scrollIntoView({ block: 'start' })); await p.waitForTimeout(500);
  const read = () => p.evaluate(() => ({ pool: document.querySelector('#spinPool').textContent, bal: document.querySelector('#demoBal').textContent, res: document.querySelector('#spin .res').textContent,
    stamp: document.querySelector('#spin .flash').textContent, hist: [...document.querySelectorAll('#spinHistory li:not(.empty)')].map((l) => l.textContent),
    winners: [...document.querySelectorAll('#winList li:not(.empty)')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()), wide: document.documentElement.scrollWidth > innerWidth }));
  const money = () => p.evaluate(() => ({ pool: window.__spin.st.pool, bal: window.__slots.state.bal }));
  const waitDone = async () => { await p.waitForFunction(() => window.__spin.busy, null, { timeout: 5000 }).catch(() => {}); await p.waitForFunction(() => !window.__spin.busy, null, { timeout: 400000 }); };
  // A forced result for one spin: 0×–2× are on the main wheel; 3×–5× need a gold star, then that bonus segment.
  const pick = (mult) => p.evaluate(async (m) => { const s = await import('./spin.js'), any = (list, v) => { const idx = list.map((x, i) => [x, i]).filter(([x]) => x === v).map(([, i]) => i); return idx[Math.floor(Math.random() * idx.length)]; };
    return s.MAIN.includes(m) ? any(s.MAIN, m) : [any(s.MAIN, s.STAR), any(s.BONUS, m)]; }, mult);
  // A run: set the forced results, pick the size, press Spin n, confirm. Returns where the wheel must stop last.
  async function run(n, bet, mults, { confirm = true } = {}) {
    const forcedList = []; for (const m of mults) forcedList.push(await pick(m));
    await p.evaluate(([b]) => document.querySelector(`#spin .bets button[data-bet="${b}"]`).click(), [bet]);
    await p.evaluate(([n, f]) => { window.__spin.test.run = f; document.querySelector(`#spin [data-run="${n}"]`).click(); }, [n, forcedList]);
    await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 });
    if (confirm) await p.evaluate(() => document.querySelector('#buyGo').click());
    const lastF = forcedList.at(-1); return Array.isArray(lastF) ? lastF[1] : lastF;
  }
  let r = await read(); console.log(label, 'at rest:', JSON.stringify(r));
  check(r.pool === '$50.00' && r.bal === '$20.00', `${label}: starting spin pool / balance`);
  check(await p.locator('#oddsList li').count() === 7, `${label}: odds legend (6 results + the gold star)`);
  check(!r.wide, `${label}: page wider than screen`);
  await p.screenshot({ path: `${OUT}/${label}-1-wheel.png` });

  // A run of 5 $1 spins: 5× (through the bonus wheel), 1×, 0×, 2×, 0×. Winnings arrive together at the end.
  let before = await money();
  let slice = await run(5, 1, [5, 1, 0, 2, 0], { confirm: false });
  check(await p.textContent('#buyTitle') === 'Play 5 spins' && await p.textContent('#buyGo') === 'Pay $5.00 & play', `${label}: confirm dialog: ${await p.textContent('#buyGo')}`);
  await p.evaluate(() => document.querySelector('#buyGo').click());
  await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/${label}-2-spinning.png` });
  await p.waitForFunction(() => window.__spin.view.mode === 'bonus', null, { timeout: 90000 });
  check(/BONUS/.test(await p.textContent('#spin .flash')) && /bonus wheel/.test(await p.textContent('#spin .res')), `${label}: a gold star says so and turns to the bonus wheel`);
  check(/Spin 1 of 5/.test(await p.textContent('#runSpin')), `${label}: run progress shows: ${await p.textContent('#runSpin')}`);
  await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}/${label}-2b-bonus.png` });
  // this test browser draws ~3 frames a second (no graphics card), so the rest of the run is skipped ahead, as a player can
  check(!(await p.evaluate(() => document.querySelector('#spin .skip').hidden)), `${label}: Skip ahead shows during a run`);
  await p.evaluate(() => document.querySelector('#spin .skip').click());
  await waitDone(); await p.waitForTimeout(300); let after = await money(); r = await read();
  check(await p.evaluate(() => window.__spin.view.mode) === 'main' && await p.evaluate(() => window.__spin.view.shownSlice()) === slice, `${label}: the last spin turned back to the main wheel and stopped on its segment`);
  const won = 5 + 1 + 0 + 2 + 0;
  check(Math.abs(after.bal - (before.bal - 5 + won * 0.97)) < 1e-9, `${label}: −$5, then +$8 less 3% at the end (${after.bal})`);
  check(Math.abs(after.pool - (before.pool + 5 * IN - won)) < 1e-9, `${label}: pool: all 5 entries at purchase, $8 paid`);
  check(/5 spins: \$8\.00 back/.test(r.res), `${label}: run summary: ${r.res}`);
  check(JSON.stringify(r.hist.slice(0, 5)) === JSON.stringify(['0×', '2×', '0×', '1×', '5×']), `${label}: last spins strip ${JSON.stringify(r.hist)}`);
  check(r.winners.length === 2 && /Spin \$1/.test(r.winners[1]) && /\+400%/.test(r.winners[1]), `${label}: winners list: ${JSON.stringify(r.winners)}`);
  await p.screenshot({ path: `${OUT}/${label}-3-five.png` });

  // A single 10¢ spin, no win: nothing to send.
  before = await money();
  slice = await run(1, 0.1, [0]); await waitDone(); after = await money(); r = await read();
  check(await p.evaluate(() => window.__spin.view.shownSlice()) === slice, `${label}: the wheel stops on the picked segment`);
  check(Math.abs(after.bal - (before.bal - 0.1)) < 1e-9 && /no win this time/.test(r.res), `${label}: 10¢, 0×: ${r.res}`);
  check(await p.textContent('#spin [data-run="10"] small') === '$1', `${label}: Spin 10 at 10¢ costs $1`);

  // full screen
  await p.evaluate(() => document.querySelector('#spinFs').click()); await p.waitForTimeout(900);
  check(await p.evaluate(() => document.fullscreenElement === document.querySelector('#spin .wheelcard') || document.querySelector('#spin .wheelcard').classList.contains('max')), `${label}: full screen on`);
  await p.screenshot({ path: `${OUT}/${label}-4-fullscreen.png` });
  await p.evaluate(() => document.querySelector('#spinFs').click()); await p.waitForTimeout(600);
  await p.evaluate(() => document.querySelector('.winners').scrollIntoView({ block: 'end' })); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/${label}-5-winners.png` });
  await ctx.close();
}
console.log('errors:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close();
