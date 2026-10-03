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
const IN = (1 - 0.10 * 0.97) * 0.97; // pool income per $1 after the 10% burn and the 3% tax, exactly

for (const [label, vp] of [['desk', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' }); return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    // the demo page reads the live SANTA price (market.js): a fixed stand-in answer, not a blocked request (it was the test's only "error")
    if (url.startsWith('https://api.dexscreener.com/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ pairs: [{ baseToken: { address: '3c7mmVSyEH8jfZXgxvpLsETtko1Y16DyRJ5XYB4snhGt' }, priceUsd: '0.00034', liquidity: { usd: 30000 }, dexId: 'raydium' }] }) });
    if (url.startsWith('https://api.santahatgames.com')) return route.fulfill({ contentType: 'application/json', body: '{"gamesRaw":0,"lotteryRaw":0,"storeRaw":0,"totalRaw":0}' }); // the money strip's burned-so-far (the live game server)
    return route.abort(); });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(label + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(label + ': ' + m.text()); }); p.on('requestfailed', (r) => console.log('  (blocked by the test network: ' + r.url().slice(0, 120) + ')'));
  await p.goto('http://localhost/online.html?net=local'); await p.waitForFunction(() => window.__sq, null, { timeout: 60000 }); await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector('#t-games').click());
  await p.waitForFunction(() => window.__slots, null, { timeout: 90000 }).catch((e) => { console.log('errors so far:', errors); throw e; });
  await p.waitForTimeout(2500);
  const read = () => p.evaluate(() => ({ pool: document.querySelector('#slotPool').textContent, bal: document.querySelector('#demoBal').textContent,
    pct: document.querySelector('.machine .pct').textContent, jp: document.querySelector('#jpAmt').textContent, top: document.querySelector('#topAmt').textContent,
    res: document.querySelector('.machine .res').textContent, stamp: document.querySelector('.machine .flash').textContent,
    winners: [...document.querySelectorAll('#winList li:not(.empty)')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()), wide: document.documentElement.scrollWidth > innerWidth }));
  const state = () => p.evaluate(() => ({ pool: window.__spin.st.pool, bal: window.__slots.state.bal })); // Big Hat plays from the shared Game pool (Cody, 2026-10-02)
  const waitDone = () => p.waitForFunction(() => window.__slots.busy, null, { timeout: 3000 }).catch(() => {}).then(() => p.waitForFunction(() => !window.__slots.busy, null, { timeout: 300000 })).catch((e) => { console.log('errors so far:', errors); throw e; });
  // run one forced pull; `force` is a function evaluated in the page returning stops (or 'JACKPOT') plus the expected pay
  async function forcedPull(force, arg, opts = {}) {
    const exp = await p.evaluate(async ([src, a]) => { const m = await import('./slots.js'); const f = new Function('m', 'a', src); const stops = f(m, a);
      const M = m.MACHINES.big; let pay = 0, grid;
      if (stops === 'JACKPOT') { pay = (window.__spin.st.pool + m.IN_PER_DOLLAR) * M.jackpotPct; /* the $1 entry reaches the pool when the run is bought, before the pull */ grid = Array.from({ length: 5 }, () => Array(5).fill(m.SYM.hat)); }
      else { grid = m.gridFor(M, stops); pay = m.evaluate(M, grid).reduce((s, w) => s + w.pay, 0) + grid.flat().filter((x) => x === m.SYM.hat).length * M.hatBonus * M.bet; }
      window.__slots.test.run = [stops]; return { stops, pay, grid };
    }, [force.toString().replace(/^[^{]*{|}$/g, ''), arg]);
    const before = await state();
    await p.evaluate(() => document.querySelector('#slots [data-run="1"]').click()); // a run of 1 pull: confirm, then it plays
    await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 });
    if (!opts.hold) await p.evaluate(() => document.querySelector('#buyGo').click());
    return { exp, before };
  }
  let r = await read(); console.log(label, 'at rest:', JSON.stringify(r));
  check(r.pool === '$500.00' && r.bal === '$100.00', label + ': starting pool/balance');
  check(r.pct === '25%' && r.jp === '$125.00' && r.top === '$100.00', label + ': jackpot readouts');
  check(!r.wide, label + ': page wider than screen');
  check(await p.locator('#payRows tbody tr').count() === 12, label + ': payout table rows (9 symbols + hat bonus + pool jackpot + coal)');
  check(await p.locator('#payLines figure').count() === 11, label + ': 11 payline diagrams');
  await p.evaluate(() => document.querySelector('.machine').scrollIntoView({ block: 'start' })); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${label}-1-machine.png` });

  // 1) no win: stops with no hats and no line win
  let { exp, before } = await forcedPull(function () { const M = m.MACHINES.big; for (;;) { const st = Array.from({ length: 5 }, () => Math.floor(Math.random() * M.stripLen)); const g = m.gridFor(M, st); if (!g.flat().includes(m.SYM.hat) && !m.evaluate(M, g).length) return st; } }, null, { hold: true });
  // Pull 1: the confirm dialog says what it costs (runs: Cody), then the pull plays.
  check(await p.textContent('#buyTitle') === 'Play 1 pull' && await p.textContent('#buyGo') === 'Pay $1.00 & play', `${label}: confirm dialog: ${await p.textContent('#buyTitle')} / ${await p.textContent('#buyGo')}`);
  await p.screenshot({ path: `${OUT}/${label}-1b-buy.png` });
  await p.evaluate(() => document.querySelector('#buyGo').click());
  await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/${label}-2-spinning.png` });
  await waitDone(); let after = await state();
  check(Math.abs(after.bal - (before.bal - 1)) < 1e-9, `${label}: a pull costs $1 (bal ${before.bal} -> ${after.bal})`);
  check(Math.abs(after.pool - (before.pool + IN)) < 1e-6, `${label}: the entry reaches the pool at purchase; a no-win pull adds nothing more`);
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
  // the lines clear when the reels start (slots3d.js spin → drawOverlay(null)); buying takes a few steps first, so wait for the
  // spin to begin (busy) and give it a moment, then the lines must be gone. (Read straight after the click, at 60 fps in real
  // Chrome, it caught the page before the spin had begun.)
  await p.waitForFunction(() => window.__slots.busy, null, { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(400);
  const ov = await p.evaluate(() => { const v = window.__slots.view.debug, d = v.overlay.getContext('2d').getImageData(0, 0, v.overlay.width, v.overlay.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return { visible: v.overlayMesh.visible, inked: n }; });
  check(!ov.visible && ov.inked === 0, `${label}: the last win's lines must be gone when the next spin starts (${JSON.stringify(ov)})`);
  await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/${label}-4-teaser.png` });
  await waitDone(); after = await state();
  check(Math.abs(after.bal - (before.bal - 1 + exp.pay * 0.97)) < 1e-6, `${label}: teaser pull balance`);
  check(JSON.stringify(await p.evaluate(() => window.__slots.view.shown())) === JSON.stringify(exp.grid), `${label}: teaser grid shown`);

  // 4) tap to stop early: must finish fast and still show the decided grid
  ({ exp, before } = await forcedPull(function () { return Array.from({ length: 5 }, () => Math.floor(Math.random() * m.MACHINES.big.stripLen)); }));
  await p.waitForTimeout(300); const t0 = Date.now(); await p.evaluate(() => document.querySelector('#slots .machine canvas').click()); await waitDone();
  const slamMs = Date.now() - t0;
  check(JSON.stringify(await p.evaluate(() => window.__slots.view.shown())) === JSON.stringify(exp.grid), `${label}: slammed grid shown`);
  console.log(label, 'tap-to-stop landed in', slamMs, 'ms (slow headless browser)');

  // 5) pool jackpot: all 25 squares Santa Hats, 25% of the pool
  ({ exp, before } = await forcedPull(function () { return 'JACKPOT'; }));
  await waitDone(); await p.waitForTimeout(300); after = await state(); r = await read();
  check(Math.abs(after.pool - (before.pool + IN - exp.pay)) < 1e-6, `${label}: jackpot pool math`);
  check(Math.abs(after.bal - (before.bal - 1 + exp.pay * 0.97)) < 1e-6, `${label}: jackpot balance`);
  check((await p.evaluate(() => window.__slots.view.shown())).flat().every((s) => s === 0), `${label}: jackpot grid should be all Santa Hats`);
  // Share this win (sharecard.js): a run that won more than it cost carries a share button with the run's own numbers
  { const sw = await p.evaluate(() => document.querySelector('#slots .machine .res [data-share-win]')?.dataset.shareWin || null), d = sw && JSON.parse(sw);
    check(d && d.kind === 'big' && d.cost === 1 && Math.abs(d.sent - exp.pay) < 0.01 && d.jackpot > 0, `${label}: Share this win carries the run's numbers (${sw})`); }
  check(r.stamp === 'JACKPOT!', `${label}: jackpot stamp`);
  check(Math.abs(+r.jp.slice(1) - Math.floor(after.pool * 0.25 * 100) / 100) < 0.011, `${label}: jackpot readout = 25% of pool`);
  await p.screenshot({ path: `${OUT}/${label}-5-jackpot.png` });
  console.log(label, 'after jackpot:', r.bal, r.pool, '|', r.res);
  const books = await p.evaluate(async () => (await import('./credits.js')).audit(window.__credits.ledger));
  check(books.length === 0, `${label}: run books balance: ${books}`);

  // 5b) Pull 5: a real (not forced) run, skipped ahead; the summary, then "Check this result" re-checks the last pull
  before = await state();
  await p.evaluate(() => document.querySelector('#slots [data-run="5"]').click());
  await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 });
  await p.evaluate(() => document.querySelector('#buyGo').click()); await p.waitForTimeout(800);
  check(/Pull \d of 5/.test(await p.textContent('#runBig')), `${label}: run progress: ${await p.textContent('#runBig')}`);
  await p.evaluate(() => document.querySelector('#slots .skip').click()); await waitDone(); after = await state();
  const sum = await p.textContent('#slots .machine .res');
  check(/^5 pulls: (no win|\$[\d.]+ back)/.test(sum), `${label}: run summary: ${sum}`);
  check(Math.abs(after.bal - before.bal + 5) < 6 * 205, `${label}: 5 pulls paid`);
  check(await p.isVisible('[data-proof="big"]'), `${label}: Check last result button shows after a pull`);
  await p.evaluate(() => document.querySelector('[data-proof="big"]').click()); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('#proofCheck').click());
  await p.waitForFunction(() => /Matches|match/.test(document.querySelector('#proofOut').textContent), null, { timeout: 10000 });
  const proofTxt = await p.textContent('#proofOut');
  check(/^Matches\./.test(proofTxt), `${label}: fair check should match: ${proofTxt}`);
  await p.screenshot({ path: `${OUT}/${label}-5b-check.png` });
  console.log(label, 'check result:', proofTxt.slice(0, 150));
  await p.evaluate(() => document.querySelector('#proofClose').click()); await p.waitForTimeout(200);

  // 5c) not enough demo money: the Buy button is off and says why
  await p.evaluate(() => { window.__slots.state.bal = 0.5; document.querySelector('#slots [data-run="10"]').click(); }); await p.waitForTimeout(300);
  const broke = await p.evaluate(() => ({ off: document.querySelector('#buyGo').disabled, note: document.querySelector('#buyNote').textContent }));
  check(broke.off && /Not enough/.test(broke.note), `${label}: buying with too little money is refused: ${JSON.stringify(broke)}`);
  await p.evaluate(() => document.querySelector('#buyCancel').click()); await p.waitForTimeout(200);
  check(!(await p.evaluate(() => document.querySelector('#buyDlg').open)) && !(await p.evaluate(() => window.__slots.busy)), `${label}: Cancel closes the dialog; nothing plays`);

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
  const want = ['3 in a row · $1.05', 'Santa Hat is wild · $3.56', 'Diagonals count too · $3.00', 'Two lines at once · $2.45', 'Hat bonus · $0.18', 'Top Line JackPot: 100× · $100.30'];
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
