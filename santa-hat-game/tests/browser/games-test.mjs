// Games tab: the Big Hat slot machine (demo). Checks readouts, forced outcomes (no win, 5-Star line, pool jackpot,
// a 3-hat teaser), tap-to-stop, that the reels show exactly what the rules decided, the money math, full screen and
// the winners list. Screenshots in out/games/.
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, OUT = 'out/games'; mkdirSync(OUT, { recursive: true });
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [], fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const IN = 0.8759090; // pool income per $1 after the 10% burn and the 3% tax

for (const [label, vp] of [['desk', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://local.test/')) { const p = url.replace('http://local.test/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' }); return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.abort(); });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(label + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(label + ': ' + m.text()); });
  await p.goto('http://local.test/online.html?net=local'); await p.waitForFunction(() => window.__sq, null, { timeout: 60000 }); await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector('#t-games').click());
  await p.waitForFunction(() => window.__slots, null, { timeout: 90000 }).catch((e) => { console.log('errors so far:', errors); throw e; });
  await p.waitForTimeout(2500);
  const read = () => p.evaluate(() => ({ pool: document.querySelector('#slotPool').textContent, bal: document.querySelector('#demoBal').textContent,
    pct: document.querySelector('.machine .pct').textContent, jp: document.querySelector('#jpAmt').textContent, top: document.querySelector('#topAmt').textContent,
    res: document.querySelector('.machine .res').textContent, stamp: document.querySelector('.machine .flash').textContent,
    winners: [...document.querySelectorAll('#winList li:not(.empty)')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()), wide: document.documentElement.scrollWidth > innerWidth }));
  const state = () => p.evaluate(() => ({ pool: window.__slots.state.pool, bal: window.__slots.state.bal }));
  const waitDone = () => p.waitForFunction(() => !window.__slots.busy, null, { timeout: 90000 });
  // run one forced pull; `force` is a function evaluated in the page returning stops (or 'JACKPOT') plus the expected pay
  async function forcedPull(force, arg) {
    const exp = await p.evaluate(async ([src, a]) => { const m = await import('./slots.js'); const f = new Function('m', 'a', src); const stops = f(m, a);
      const M = m.MACHINES.big; let pay = 0, grid;
      if (stops === 'JACKPOT') { pay = (window.__slots.state.pool + M.bet * m.IN_PER_DOLLAR) * M.jackpotPct; grid = Array.from({ length: 5 }, () => Array(5).fill(m.SYM.hat)); }
      else { grid = m.gridFor(M, stops); pay = m.evaluate(M, grid).reduce((s, w) => s + w.pay, 0) + grid.flat().filter((x) => x === m.SYM.hat).length * M.hatBonus * M.bet; }
      window.__slots.test.next = stops; return { stops, pay, grid };
    }, [force.toString().replace(/^[^{]*{|}$/g, ''), arg]);
    const before = await state();
    await p.evaluate(() => document.querySelector('.machine .pull').click());
    return { exp, before };
  }
  let r = await read(); console.log(label, 'at rest:', JSON.stringify(r));
  check(r.pool === '$500.00' && r.bal === '$20.00', label + ': starting pool/balance');
  check(r.pct === '25%' && r.jp === '$125.00' && r.top === '$100.00', label + ': jackpot readouts');
  check(!r.wide, label + ': page wider than screen');
  check(await p.locator('#payRows tbody tr').count() === 12, label + ': paytable rows (9 symbols + hat bonus + pool jackpot + coal)');
  check(await p.locator('#payLines figure').count() === 15, label + ': 15 payline diagrams');
  await p.evaluate(() => document.querySelector('.machine').scrollIntoView({ block: 'start' })); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${label}-1-machine.png` });

  // 1) no win: stops with no hats and no line win
  let { exp, before } = await forcedPull(function () { const M = m.MACHINES.big; for (;;) { const st = Array.from({ length: 5 }, () => Math.floor(Math.random() * M.stripLen)); const g = m.gridFor(M, st); if (!g.flat().includes(m.SYM.hat) && !m.evaluate(M, g).length) return st; } });
  await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/${label}-2-spinning.png` });
  await waitDone(); let after = await state();
  check(Math.abs(after.bal - (before.bal - 1)) < 1e-9, `${label}: no-win pull should cost $1 (bal ${before.bal} -> ${after.bal})`);
  check(Math.abs(after.pool - (before.pool + IN)) < 1e-6, `${label}: pool after a no-win pull`);
  const shown1 = await p.evaluate(() => window.__slots.view.shown());
  check(JSON.stringify(shown1) === JSON.stringify(exp.grid), `${label}: reels must show exactly the decided grid`);

  // 2) 5 Stars on line 1 (plus whatever else those stops happen to pay)
  ({ exp, before } = await forcedPull(function () { return m.stopsShowing('big', 0, 'star', 5); }));
  await waitDone(); await p.waitForTimeout(250); after = await state(); r = await read();
  check(Math.abs(after.bal - (before.bal - 1 + exp.pay * 0.97)) < 1e-6, `${label}: star win balance (expected pay ${exp.pay})`);
  check(/WIN|100×/.test(r.stamp), `${label}: a win over $1 should stamp, got "${r.stamp}"`);
  check(r.winners.length === 1 && /\+\d/.test(r.winners[0]), `${label}: winners list should have the win with a +%: ${JSON.stringify(r.winners)}`);
  check(JSON.stringify(await p.evaluate(() => window.__slots.view.shown())) === JSON.stringify(exp.grid), `${label}: star grid shown`);
  await p.screenshot({ path: `${OUT}/${label}-3-win.png` });
  console.log(label, 'after 5-star win:', r.bal, r.pool, '|', r.res, '|', r.winners[0]);

  // 3) teaser: 3 Santa Hats on line 1, then not (slow-down should kick in, result unchanged)
  ({ exp, before } = await forcedPull(function () { return m.stopsShowing('big', 0, 'hat', 3); }));
  const ov = await p.evaluate(() => { const v = window.__slots.view.debug, d = v.overlay.getContext('2d').getImageData(0, 0, v.overlay.width, v.overlay.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return { visible: v.overlayMesh.visible, inked: n }; });
  check(!ov.visible && ov.inked === 0, `${label}: the last win's lines must be gone when the next spin starts (${JSON.stringify(ov)})`);
  await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/${label}-4-teaser.png` });
  await waitDone(); after = await state();
  check(Math.abs(after.bal - (before.bal - 1 + exp.pay * 0.97)) < 1e-6, `${label}: teaser pull balance`);
  check(JSON.stringify(await p.evaluate(() => window.__slots.view.shown())) === JSON.stringify(exp.grid), `${label}: teaser grid shown`);

  // 4) tap to stop early: must finish fast and still show the decided grid
  ({ exp, before } = await forcedPull(function () { return Array.from({ length: 5 }, () => Math.floor(Math.random() * m.MACHINES.big.stripLen)); }));
  await p.waitForTimeout(300); const t0 = Date.now(); await p.evaluate(() => document.querySelector('.machine .pull').click()); await waitDone();
  const slamMs = Date.now() - t0;
  check(JSON.stringify(await p.evaluate(() => window.__slots.view.shown())) === JSON.stringify(exp.grid), `${label}: slammed grid shown`);
  console.log(label, 'tap-to-stop landed in', slamMs, 'ms (slow headless browser)');

  // 5) pool jackpot: all 25 squares Santa Hats, 25% of the pool
  ({ exp, before } = await forcedPull(function () { return 'JACKPOT'; }));
  await waitDone(); await p.waitForTimeout(300); after = await state(); r = await read();
  check(Math.abs(after.pool - (before.pool + IN - exp.pay)) < 1e-6, `${label}: jackpot pool math`);
  check(Math.abs(after.bal - (before.bal - 1 + exp.pay * 0.97)) < 1e-6, `${label}: jackpot balance`);
  check((await p.evaluate(() => window.__slots.view.shown())).flat().every((s) => s === 0), `${label}: jackpot grid should be all Santa Hats`);
  check(r.stamp === 'JACKPOT!', `${label}: jackpot stamp`);
  check(Math.abs(+r.jp.slice(1) - Math.floor(after.pool * 0.25 * 100) / 100) < 0.011, `${label}: jackpot readout = 25% of pool`);
  await p.screenshot({ path: `${OUT}/${label}-5-jackpot.png` });
  console.log(label, 'after jackpot:', r.bal, r.pool, '|', r.res);

  // 6) full screen on, screenshot, off
  await p.evaluate(() => document.querySelector('#fsBtn').click()); await p.waitForTimeout(900);
  const fs = await p.evaluate(() => ({ on: document.fullscreenElement === document.querySelector('.machine') || document.querySelector('.machine').classList.contains('max'), btn: document.querySelector('#fsBtn').textContent.trim() }));
  check(fs.on && /Exit/.test(fs.btn), `${label}: full screen should turn on (${JSON.stringify(fs)})`);
  await p.screenshot({ path: `${OUT}/${label}-6-fullscreen.png` });
  await p.evaluate(() => document.querySelector('#fsBtn').click()); await p.waitForTimeout(700);
  check(!(await p.evaluate(() => document.fullscreenElement || document.querySelector('.machine').classList.contains('max'))), `${label}: full screen should turn off`);

  // 7) "How to win" panel: rules, 7 examples with prizes from the real rules, and the win table
  await p.evaluate(() => document.querySelector('#howBtn').click()); await p.waitForTimeout(500);
  const how = await p.evaluate(() => ({ open: document.querySelector('#howDlg').open, examples: [...document.querySelectorAll('#howExamples .example h4')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()), tableRows: document.querySelectorAll('#howTable tbody tr').length }));
  const want = ['3 in a row · $1.05', 'Santa Hat is wild · $3.55', 'Paylines can bend · $3.00', 'Two lines at once · $2.45', 'Hat nickels · $0.15', 'Top line prize: 100× · $100.25'];
  check(how.open, `${label}: How to win panel should open`);
  want.forEach((w, i) => check(how.examples[i] === w, `${label}: example ${i + 1} should read "${w}", got "${how.examples[i]}"`));
  check(/^Pool jackpot · 25% of the pool/.test(how.examples[6] || ''), `${label}: jackpot example`);
  check(how.tableRows === 12, `${label}: win table rows`);
  await p.screenshot({ path: `${OUT}/${label}-7-howtowin.png` });
  await p.evaluate(() => document.querySelector('#howClose').click()); await p.waitForTimeout(300);
  check(!(await p.evaluate(() => document.querySelector('#howDlg').open)), `${label}: How to win should close`);

  // 8) winners list + paytable screenshots
  await p.evaluate(() => { document.querySelector('.paytable').open = true; document.querySelector('.winners').scrollIntoView({ block: 'end' }); }); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${label}-8-winners.png` });
  await p.evaluate(() => document.querySelector('.paytable').scrollIntoView({ block: 'start' })); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/${label}-9-paytable.png` });
  await ctx.close();
}
console.log('errors:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close();
