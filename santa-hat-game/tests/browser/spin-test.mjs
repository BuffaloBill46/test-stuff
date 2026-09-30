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
  const waitDone = () => p.waitForFunction(() => !window.__spin.busy, null, { timeout: 90000 });
  async function forced(mult, bet) {
    // 0×–2× are on the main wheel; 3×–5× need a gold star, then that bonus segment. `slice` is where the wheel must end up.
    const slice = await p.evaluate(async ([m, b]) => { const s = await import('./spin.js'), any = (list, v) => { const idx = list.map((x, i) => [x, i]).filter(([x]) => x === v).map(([, i]) => i); return idx[Math.floor(Math.random() * idx.length)]; };
      const main = s.MAIN.includes(m) ? any(s.MAIN, m) : any(s.MAIN, s.STAR), bonus = s.MAIN.includes(m) ? undefined : any(s.BONUS, m);
      document.querySelector(`#spin .bets button[data-bet="${b}"]`).click(); window.__spin.test.next = bonus === undefined ? main : [main, bonus]; return bonus ?? main; }, [mult, bet]);
    const before = await money(); await p.evaluate(() => document.querySelector('#spin .spinbtn').click());
    return { slice, before };
  }
  let r = await read(); console.log(label, 'at rest:', JSON.stringify(r));
  check(r.pool === '$50.00' && r.bal === '$20.00', `${label}: starting spin pool / balance`);
  check(await p.locator('#oddsList li').count() === 7, `${label}: odds legend (6 results + the gold star)`);
  check(!r.wide, `${label}: page wider than screen`);
  await p.screenshot({ path: `${OUT}/${label}-1-wheel.png` });

  // 5× on a $1 spin
  let { slice, before } = await forced(5, 1);
  // no $1 spins yet: the buy counter opens. Buy 10 in one go.
  await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 });
  await p.evaluate(() => document.querySelector('#buyQuick [data-n="10"]').click());
  check(await p.textContent('#buyGo') === 'Buy 10 · $10.00' && await p.textContent('#buyTitle') === 'Buy spins', `${label}: buy counter for $1 spins`);
  await p.evaluate(() => document.querySelector('#buyGo').click());
  await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/${label}-2-spinning.png` });
  await p.waitForFunction(() => window.__spin.view.mode === 'bonus', null, { timeout: 90000 });
  check(/BONUS/.test(await p.textContent('#spin .flash')) && /bonus wheel/.test(await p.textContent('#spin .res')), `${label}: a gold star says so and turns to the bonus wheel`);
  await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}/${label}-2b-bonus.png` });
  await waitDone(); await p.waitForTimeout(300); let after = await money(); r = await read();
  check(await p.evaluate(() => window.__spin.view.mode) === 'bonus' && await p.evaluate(() => window.__spin.view.shownSlice()) === slice, `${label}: the bonus wheel must stop on the picked segment`);
  check(await p.evaluate(() => window.__spin.view.shownMult()) === 5, `${label}: the bonus wheel shows 5×`);
  check(Math.abs(after.bal - (before.bal - 10 + 5 * 0.97)) < 1e-9, `${label}: 10 spins bought ($10), then a 5× win`);
  check(Math.abs(after.pool - (before.pool + 10 * IN - 5)) < 1e-9, `${label}: 5× pool (all 10 entries arrived at purchase)`);
  check(await p.textContent('#crSpin') === '9', `${label}: 9 $1 spins left`);
  check(/5×/.test(r.stamp), `${label}: 5× stamp, got "${r.stamp}"`);
  check(r.winners.length === 1 && /\+400%/.test(r.winners[0]) && /Spin \$1/.test(r.winners[0]), `${label}: winners list entry: ${JSON.stringify(r.winners)}`);
  await p.screenshot({ path: `${OUT}/${label}-3-five.png` });
  console.log(label, 'after 5×:', r.bal, r.pool, '|', r.res, '|', r.winners[0]);

  // 1× = money back: quiet, no winner entry
  ({ slice, before } = await forced(1, 1)); await waitDone(); after = await money(); r = await read();
  check(await p.evaluate(() => window.__spin.view.mode) === 'main' && await p.evaluate(() => window.__spin.view.shownSlice()) === slice, `${label}: the next spin turns back to the main wheel and stops on its segment`);
  check(Math.abs(after.bal - (before.bal + 0.97)) < 1e-9, `${label}: 1× balance`);
  check(/Money back/.test(r.res) && r.winners.length === 1, `${label}: 1× should be quiet money back`);

  // 0×, with tap-to-land
  ({ slice, before } = await forced(0, 1)); await p.waitForTimeout(400); await p.evaluate(() => document.querySelector('#spin .spinbtn').click()); await waitDone();
  after = await money(); r = await read();
  check(await p.evaluate(() => window.__spin.view.shownSlice()) === slice, `${label}: tapped-to-land wheel must still stop on the picked slice`);
  check(Math.abs(after.bal - before.bal) < 1e-9 && /No win/.test(r.res), `${label}: 0×`);

  // 10¢ spin, 2× win
  ({ slice, before } = await forced(2, 0.1));
  // 10¢ spins are their own credits: none yet, so the counter opens again
  await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 });
  await p.evaluate(() => document.querySelector('#buyQuick [data-n="1"]').click());
  check(await p.textContent('#buyGo') === 'Buy 1 · $0.10', `${label}: 10¢ buy button says "${await p.textContent('#buyGo')}"`);
  await p.evaluate(() => document.querySelector('#buyGo').click()); await waitDone(); await p.waitForTimeout(200); after = await money(); r = await read();
  check(Math.abs(after.bal - (before.bal - 0.1 + 0.2 * 0.97)) < 1e-9, `${label}: 10¢ 2× balance`);
  check(await p.textContent('#crSpin') === '0', `${label}: 10¢ spins left 0`);
  await p.evaluate(() => document.querySelector('#spin .bets button[data-bet="1"]').click());
  check(await p.textContent('#crSpin') === '7' && /\$1 spins/.test(await p.textContent('#crSpinWhat')), `${label}: switching to $1 shows its own 7 spins`);
  check(r.winners.length === 2 && /Spin 10¢/.test(r.winners[0]) && /\+100%/.test(r.winners[0]), `${label}: 10¢ win in winners list: ${JSON.stringify(r.winners[0])}`);
  check(JSON.stringify(r.hist.slice(0, 4)) === JSON.stringify(['2×', '0×', '1×', '5×']), `${label}: last spins strip ${JSON.stringify(r.hist)}`);

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
