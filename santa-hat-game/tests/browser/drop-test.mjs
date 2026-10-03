// Snowball Drop on the Games tab (demo): runs of 1/5/10 drops (Cody) with forced paths (10×, 0×, 1×); the confirm dialog;
// demo money to the cent (winnings arrive at the end of the run); the shared Spin pool readouts; Skip; re-check; winners.
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
  const waitDone = () => p.waitForFunction(() => !window.__drop.opening && window.__drop.flying === 0, null, { timeout: 120000 });
  const run = async (n, bet, paths) => {
    await p.evaluate(([b]) => document.querySelector(`#drop [data-dbet="${b}"]`).click(), [bet]);
    await p.evaluate(([n, paths]) => { window.__drop.test.run = paths; document.querySelector(`#drop [data-run="${n}"]`).click(); }, [n, paths]);
    await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 });
    const dlg = { title: await p.textContent('#buyTitle'), what: await p.textContent('#buyWhat'), go: await p.textContent('#buyGo') };
    await p.evaluate(() => document.querySelector('#buyGo').click());
    await p.waitForFunction(() => window.__drop.opening, null, { timeout: 5000 }).catch(() => {});
    await waitDone(); await p.waitForTimeout(200);
    return dlg;
  };
  check(await p.textContent('#dropOdds') === '1 in 5,000 to hit the 100× · 1 in 4.4 to win 2× or more', `${label}: the one odds line (Cody): ${await p.textContent('#dropOdds')}`);
  check(await p.textContent('#drop [data-run="10"] small') === '$1', `${label}: Drop 10 at 10¢ costs $1`);
  await p.screenshot({ path: `${OUT}/${label}-1-board.png` });

  // 1. Drop 5 at 10¢: the confirm dialog, then five snowballs; the run's winnings arrive together at the end.
  // board 2 (16 rows, 17 presents): all left = present 1 (25×); one right = present 2 (0×); six rights = present 7 (2×)
  const L = Array(16).fill(0), MID = [1, ...Array(15).fill(0)], ONE = [1, 1, 1, 1, 1, 1, ...Array(10).fill(0)]; // 25×, 0×, 2×
  let b0 = await bal(), pool0 = await pool();
  // the run counter's "won" may only count balls that have LANDED (Cody 2026-10-02: it ran ~1 s ahead of the balls, the first
  // ones counted half way down): watched every 20 ms through the whole run, it must never show more than the landed balls won
  await p.evaluate(() => { window.__ahead = []; window.__watch = setInterval(() => { const t = document.querySelector('[data-runcount="drop"] span')?.textContent || '';
    const shown = +(t.match(/[\d.]+/)?.[0] || 0); if (shown > window.__drop.landedWon + 0.005) window.__ahead.push(`${t} with ${window.__drop.landedWon} landed`); }, 20); });
  const d = await run(5, 0.1, [L, MID, ONE, MID, MID]);
  const ahead = await p.evaluate(() => { clearInterval(window.__watch); return window.__ahead; });
  check(ahead.length === 0 && /won \$2\.70/.test(await p.textContent('[data-runcount="drop"] span')), `${label}: the run counter only counts balls that have landed (never ahead: ${ahead.slice(0, 2).join(' | ') || 'none'}), ending at won $2.70`);
  check(d.title === 'Play 5 drops' && d.what === '5 × 10¢ = $0.50' && d.go === 'Pay $0.50 & play', `${label}: confirm dialog ${JSON.stringify(d)}`);
  const won = 2.5 + 0.2; // 25× + 2× on 10¢
  check(Math.abs((await bal()) - (b0 - 0.5 + won * 0.97)) < 1e-9, `${label}: demo money: −$0.50, then +$2.70 less 3% at the end (${await bal()})`);
  check(Math.abs((await pool()) - (pool0 + 0.5 * IN - won)) < 1e-9, `${label}: the Spin pool got the $0.50 (after burn and tax) and paid $2.70`);
  check(await p.textContent('#dropPool') === await p.textContent('#spinPool'), `${label}: both cards show the same shared pool`);
  check(/5 drops: \$2\.70 back/.test(await p.textContent('#drop .res')), `${label}: run summary: ${await p.textContent('#drop .res')}`);
  check((await p.locator('#dropHistory li:not(.empty)').count()) === 5, `${label}: last drops strip has the 5`);
  // the 25× in Recent winners, checked now (board 2 wins about 1 drop in 4, so later runs push it off the short list)
  const winners1 = await p.evaluate(() => [...document.querySelectorAll('#winList li')].map((li) => li.textContent.replace(/\s+/g, ' ')));
  check(winners1.some((w) => /Snowball Drop 10¢/.test(w) && /\+2,?400%/.test(w)), `${label}: the 25× is in Recent winners: ${JSON.stringify(winners1.slice(0, 2))}`);
  await p.screenshot({ path: `${OUT}/${label}-2-run.png` });

  // 2. Drop 1 at $1, no win: nothing to send.
  b0 = await bal();
  await run(1, 1, [MID]);
  check(Math.abs((await bal()) - (b0 - 1)) < 1e-9 && /no win this time/.test(await p.textContent('#drop .res')), `${label}: $1 drop, 0×: ${await p.textContent('#drop .res')}`);
  // 3. Cancelling the dialog charges nothing and plays nothing.
  b0 = await bal();
  await p.evaluate(() => document.querySelector('#drop [data-run="10"]').click());
  await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 });
  await p.evaluate(() => document.querySelector('#buyCancel').click()); await p.waitForTimeout(300);
  check(Math.abs((await bal()) - b0) < 1e-9 && !(await p.evaluate(() => window.__drop.opening)), `${label}: cancel = nothing charged, nothing played`);
  // 4. Drop 10 at 10¢ with Skip ahead; then the last drop re-checks.
  await p.evaluate(() => document.querySelector('#drop [data-dbet="0.1"]').click());
  await p.evaluate(() => document.querySelector('#drop [data-run="10"]').click());
  await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 });
  await p.evaluate(() => document.querySelector('#buyGo').click()); await p.waitForTimeout(600);
  check(!(await p.evaluate(() => document.querySelector('#drop .skip').hidden)), `${label}: Skip ahead shows during a run`);
  await p.evaluate(() => document.querySelector('#drop .skip').click());
  await waitDone(); await p.waitForTimeout(200);
  check(/10 drops/.test(await p.textContent('#drop .res')), `${label}: 10-drop run finished: ${await p.textContent('#drop .res')}`);
  await p.evaluate(() => document.querySelector('[data-proof="drop"]').click()); await p.evaluate(() => document.querySelector('#proofCheck').click());
  await p.waitForFunction(() => /atch/.test(document.querySelector('#proofOut').textContent), null, { timeout: 15000 });
  check(/^Matches\..*present \d+ of 17 .*bounces [LR ]+/.test(await p.textContent('#proofOut')), `${label}: a real drop re-checks: ${(await p.textContent('#proofOut')).slice(0, 160)}`);
  await p.evaluate(() => document.querySelector('#proofClose').click());
  const winners = await p.evaluate(() => [...document.querySelectorAll('#winList li')].map((li) => li.textContent.replace(/\s+/g, ' ')));
  check(winners.some((w) => /Snowball Drop 10¢/.test(w)), `${label}: drop wins keep reaching Recent winners: ${JSON.stringify(winners.slice(0, 2))}`);
  check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${label}: nothing wider than the screen`);
  await p.evaluate(() => document.querySelector('#drop .dropcard').scrollIntoView({ block: 'center' })); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/${label}-3-after.png` });
  await ctx.close();
}
console.log('errors:', errors.filter((e) => !/ERR_FAILED|Failed to load/.test(e)).length ? errors : 'none');
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close();
process.exit(fails.length ? 1 : 0);
