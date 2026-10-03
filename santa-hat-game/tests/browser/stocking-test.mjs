// Stocking Stuffer on the Games tab (demo), on a 390 px phone, a 320 px phone and a desktop: the card and its labels (from
// the rules: 250×, the computed payback, the 3% tax); a Play 5 run with forced turns (coal first, 1, 2, 3 and all 8 gifts):
// each turn decided before its first stocking opens, only real wins celebrated (1 gift never), demo money and the shared
// Drop pool to the cent; a $1 turn; cancel charges nothing; Play 10 with Skip ahead; "Check this result" replays the same
// stockings with the coal map; the result line above the tab bar; nothing wider than the screen; no page errors.
// Serves the game from a plain local web server (no request interception: LESSONS). Screenshots in out/stocking/, including
// all 20 stockings opened at once (the worst case for the fire's glow).
// Run (WSL here): node stocking-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path'; import http from 'http';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, OUT = 'out/stocking'; mkdirSync(OUT, { recursive: true });
const WEB = 8097, TYPES = { js: 'text/javascript', html: 'text/html', png: 'image/png', css: 'text/css', json: 'application/json' };
const web = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[p.split('.').pop()] || 'application/octet-stream' }); res.end(readFileSync(p)); }).listen(WEB);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [], fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const IN = (1 - 0.10 * 0.97) * 0.97; // pool income per $1 after the 10% burn and the 3% tax, exactly

for (const [label, vp] of [['phone390', { width: 390, height: 844 }], ['phone320', { width: 320, height: 640 }], ['desk', { width: 1280, height: 900 }]]) {
  console.log(label);
  const ctx = await browser.newContext({ viewport: vp, ...(label.startsWith('phone') ? { isMobile: true, hasTouch: true } : {}) });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(label + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(label + ': ' + m.text()); });
  await p.goto(`http://localhost:${WEB}/online.html?net=local`, { timeout: 120000, waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__sq, null, { timeout: 120000 }); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelector('#t-games').click());
  await p.waitForFunction(() => window.__stocking && window.__slots, null, { timeout: 120000 }).catch((e) => { console.log('errors so far:', errors); throw e; });
  await p.evaluate(() => document.querySelector('#stocking').scrollIntoView({ block: 'start' })); await p.waitForTimeout(800);
  const bal = () => p.evaluate(() => window.__slots.state.bal), pool = () => p.evaluate(() => window.__spin.st.pool), txt = (s) => p.textContent(s);
  const waitDone = () => p.waitForFunction(() => !window.__stocking.opening, null, { timeout: 240000 });
  const openDialog = async (n, bet, turns) => {
    await p.evaluate(([b]) => document.querySelector(`#stocking [data-sbet="${b}"]`).click(), [bet]);
    await p.evaluate(([n, turns]) => { window.__stocking.test.run = turns; document.querySelector(`#stocking [data-run="${n}"]`).click(); }, [n, turns]);
    await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 });
    return { title: await txt('#buyTitle'), what: await txt('#buyWhat'), go: await txt('#buyGo'), eyebrow: await txt('#buyEyebrow') };
  };
  const go = async () => { await p.evaluate(() => document.querySelector('#buyGo').click()); await p.waitForFunction(() => window.__stocking.opening, null, { timeout: 5000 }).catch(() => {}); };
  // TAP TO OPEN (Cody, 2026-10-02): a player taps the stockings. This taps like one, all along: whenever the mantel waits, a
  // random unopened stocking gets a real touch (phones) or click (desktop) at its spot on screen, and that stocking must open.
  const tapper = { on: true, taps: 0, wrong: 0 };
  const tapLoop = (async () => {
    while (tapper.on) {
      const w = await p.evaluate(() => { const b = window.__stocking?.board; if (!b?.waiting) return null;
        const cv = document.querySelector('#stocking canvas'); cv.scrollIntoView({ block: 'nearest' });
        const free = b.opened.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0), s = free[Math.floor(Math.random() * free.length)], c = b.centerOf(s), r = cv.getBoundingClientRect();
        return { s, x: r.left + c.x, y: r.top + c.y }; }).catch(() => null);
      if (!w) { await p.waitForTimeout(60).catch(() => {}); continue; }
      if (label.startsWith('phone')) await p.touchscreen.tap(w.x, w.y).catch(() => {}); else await p.mouse.click(w.x, w.y).catch(() => {});
      tapper.taps++;
      if (!(await p.waitForFunction((s) => window.__stocking.board.opened[s] !== null, w.s, { timeout: 30000 }).then(() => true, () => false))) tapper.wrong++;
    }
  })();

  // 0. The card at rest, labelled from the rules.
  check(await txt('#stocking header em') === '10¢ or $1 a turn · up to 250×', `${label}: header: ${await txt('#stocking header em')}`);
  check(await txt('#stocking [data-sbet="1"] small') === 'win up to $250' && await txt('#stocking [data-sbet="0.1"] small') === 'win up to $25', `${label}: size chips say the top prize`);
  const steps = await p.evaluate(() => [...document.querySelectorAll('#stockLadder li b')].map((b) => b.textContent));
  check(steps.join(' ') === '0.5× 2.5× 6× 10× 20× 40× 90× 250×', `${label}: 8 gift slots carry the pay table: ${steps.join(' ')}`);
  const how = await p.evaluate(() => document.querySelector('#stockHow .body').textContent.replace(/\s+/g, ' '));
  check(/Pays back 78\.1% /.test(how) && /3% SANTA tax/.test(how) && /Check it yourself/.test(how) && /1 in 125,970/.test(how) && /25¢/.test(how), `${label}: How to win: payback 78.1% (computed), tax note, odds, check-it-yourself`);
  check(/3% lighter/.test(await txt('#stocking .stockdesc')), `${label}: the description says winners absorb the 3% tax`);
  check(await txt('#stocking [data-run="10"] small') === '$1' && await txt('#stocking [data-run="1"] b') === 'Play 1', `${label}: Play 1 / 5 / 10 at 10¢ ($1 for 10)`);
  await p.evaluate(() => document.querySelector('#stocking canvas').scrollIntoView({ block: 'start' })); await p.waitForTimeout(1500);
  // at rest the mantel is drawn, not a blank box (a first version was blank until a stocking opened): sample the canvas
  const painted = await p.evaluate(() => { const cv = document.querySelector('#stocking canvas'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0, red = 0;
    for (let i = 0; i < d.length; i += 16) { if (d[i + 3] > 0) n++; if (d[i] > 180 && d[i + 1] < 80 && d[i + 2] < 70) red++; } return { n, red, total: d.length / 16 }; });
  check(painted.n === painted.total && painted.red > painted.total * 0.02, `${label}: the mantel is drawn at rest (${painted.red} hat-red samples of ${painted.total})`);
  // narrow phones: every gift slot's label fits inside its slot
  check(await p.evaluate(() => [...document.querySelectorAll('#stockLadder li')].every((li) => li.querySelector('b').scrollWidth <= li.clientWidth + 0.5)), `${label}: every gift slot's prize label fits its slot`);
  await p.screenshot({ path: `${OUT}/${label}-1-rest.png` });

  // 1. Play 5 at 10¢: coal first, 1 gift, 2 gifts, 3 gifts, all 8. Each turn decided before its first stocking opens.
  let b0 = await bal(), pool0 = await pool();
  const d = await openDialog(5, 0.1, [0, 1, 2, 3, 8]);
  check(d.title === 'Play 5 turns' && d.what === '5 × 10¢ = $0.50' && d.go === 'Pay $0.50 & play' && /Stocking Stuffer · 10¢ a turn/.test(d.eyebrow), `${label}: confirm dialog ${JSON.stringify(d)}`);
  await go();
  // the 5th turn (all 8 gifts): at its FIRST stocking the whole result is already known
  await p.waitForFunction(() => window.__stocking.live.started === 5 && window.__stocking.live.shown >= 1, null, { timeout: 240000 });
  const early = await p.evaluate(() => ({ found: window.__stocking.live.current.found, shown: window.__stocking.live.shown, opened: window.__stocking.board.opened.filter(Boolean).length }));
  check(early.found === 8 && early.opened < 8, `${label}: the turn was decided before it was shown (${early.found} gifts known with ${early.opened} stocking(s) open)`);
  await p.evaluate(() => document.querySelector('#stocking .skip').click()); // Skip ahead (the same button players have)
  check(await p.evaluate(() => window.__stocking.fast && document.querySelector('#stocking .skip').textContent === 'Normal speed'), `${label}: Skip ahead toggles to "Normal speed"`);
  await waitDone(); await p.waitForTimeout(400);
  const log = await p.evaluate(() => window.__stocking.live.log.slice(-5));
  check(log.map((x) => x.found).join() === '0,1,2,3,8', `${label}: the five forced turns: ${log.map((x) => x.found)}`);
  check(/Coal first/.test(log[0].text) && !log[0].celebrated, `${label}: coal first: "${log[0].text}"`);
  check(/1 gift, then coal: 0\.5× back .*Less than the 10¢ turn/.test(log[1].text) && !log[1].celebrated, `${label}: 1 gift is a loss and said plainly, never celebrated: "${log[1].text}"`);
  check(/2 gifts: 2\.5× back/.test(log[2].text) && !log[2].celebrated && /3% tax/.test(log[2].text), `${label}: 2 gifts: a light touch (no stamp): "${log[2].text}"`);
  check(/3 gifts! 6× win/.test(log[3].text) && log[3].celebrated && /6× WIN/.test(log[3].stamp) && /after SANTA's 3% tax/.test(log[3].text), `${label}: 3 gifts celebrated, with the tax: "${log[3].text}" / ${log[3].stamp}`);
  check(/8 gifts! 250× win: \$25\.00/.test(log[4].text) && log[4].celebrated && /ALL 8! 250×/.test(log[4].stamp), `${label}: all 8 gifts: "${log[4].text}" / ${log[4].stamp}`);
  const won = 0 + 0.05 + 0.25 + 0.6 + 25; // 0, 1, 2, 3 and 8 gifts on 10¢ at Cody's table (raised to ~78%)
  check(Math.abs((await bal()) - (b0 - 0.5 + won * 0.97)) < 1e-9, `${label}: demo money: −$0.50, then +$25.90 less 3% at the end (${await bal()})`);
  check(Math.abs((await pool()) - (pool0 + 0.5 * IN - won)) < 1e-9, `${label}: the Drop pool got the $0.50 (after burn and tax) and paid $25.90`);
  check(await txt('#stockPool') === await txt('#dropPool'), `${label}: Stocking Stuffer and Snowball Drop show the same shared pool`);
  check(/5 turns: \$25\.90 back/.test(await txt('#stocking .res')), `${label}: run summary: ${await txt('#stocking .res')}`);
  check(await p.locator('#stockLadder li.got').count() === 8 && await p.locator('#stockLadder li.now').count() === 1, `${label}: all 8 gift slots filled, the 250× step lit`);
  check((await p.locator('#stockHistory li:not(.empty)').count()) === 5, `${label}: last turns strip has the 5`);
  const winners = await p.evaluate(() => [...document.querySelectorAll('#winList li')].map((li) => li.textContent.replace(/\s+/g, ' ')));
  check(winners.some((w) => /Stocking Stuffer 10¢/.test(w) && /8 gifts · 250×/.test(w)), `${label}: the all-8 win in Recent winners: ${JSON.stringify(winners.slice(0, 1))}`);
  check(!winners.some((w) => /1 gifts|1 gift ·/.test(w)), `${label}: 1 gift (a loss) never reaches Recent winners`);
  const sounds = await p.evaluate(() => window.__sfx?.stats.byName || {});
  check(sounds.jiggle >= 14 && sounds.gift >= 14 && sounds.coal >= 4 && sounds.jackpot >= 1, `${label}: sounds: jiggle ${sounds.jiggle}, gift ${sounds.gift}, coal ${sounds.coal}, jackpot ${sounds.jackpot}`);
  // the result line sits above the bottom tab bar (LESSONS: "on screen" means not under the bar)
  await p.waitForTimeout(700);
  const vis = await p.evaluate(() => { const r = document.querySelector('#stocking .res').getBoundingClientRect(), t = document.querySelector('#nav .tabs')?.getBoundingClientRect(), bar = t && t.top > innerHeight / 2 ? t.top : innerHeight; return { top: r.top, bottom: r.bottom, bar }; });
  check(vis.top >= 0 && vis.bottom <= vis.bar + 1, `${label}: the result line is visible above the tab bar (${Math.round(vis.top)}–${Math.round(vis.bottom)}, bar at ${Math.round(vis.bar)})`);
  await p.screenshot({ path: `${OUT}/${label}-2-run.png` });

  // 2. Play 1 at $1, coal first: nothing to send.
  b0 = await bal(); await openDialog(1, 1, [0]); await go(); await waitDone(); await p.waitForTimeout(200);
  check(Math.abs((await bal()) - (b0 - 1)) < 1e-9 && /no win this time/.test(await txt('#stocking .res')), `${label}: $1 turn, coal first: ${await txt('#stocking .res')}`);
  // 3. Cancelling the dialog charges nothing and plays nothing.
  b0 = await bal(); await openDialog(10, 0.1, undefined);
  await p.evaluate(() => document.querySelector('#buyCancel').click()); await p.waitForTimeout(300);
  check(Math.abs((await bal()) - b0) < 1e-9 && !(await p.evaluate(() => window.__stocking.opening)), `${label}: cancel = nothing charged, nothing played`);
  // 4. Play 10 at 10¢ for real (fair numbers), Skip ahead; then the last turn re-checks to the same stockings.
  const turns0 = await p.evaluate(() => window.__stocking.live.turns);
  await openDialog(10, 0.1, undefined); await go(); await p.waitForTimeout(500);
  check(!(await p.evaluate(() => document.querySelector('#stocking .skip').hidden)), `${label}: Skip ahead shows during a run`);
  await p.evaluate(() => document.querySelector('#stocking .skip').click());
  await waitDone(); await p.waitForTimeout(300);
  check(/10 turns/.test(await txt('#stocking .res')) && (await p.evaluate(() => window.__stocking.live.turns)) === turns0 + 10, `${label}: 10-turn run finished: ${await txt('#stocking .res')}`);
  const lastTurn = await p.evaluate(() => window.__stocking.live.current);
  await p.evaluate(() => document.querySelector('[data-proof="stocking"]').click()); await p.evaluate(() => document.querySelector('#proofCheck').click());
  await p.waitForFunction(() => /atch/.test(document.querySelector('#proofOut').textContent), null, { timeout: 15000 });
  const proof = await p.evaluate(() => ({ text: document.querySelector('#proofOut').textContent, cells: document.querySelectorAll('#proofOut .stockmap > span').length, coal: document.querySelectorAll('#proofOut .stockmap .c').length,
    opened: [...document.querySelectorAll('#proofOut .stockmap .o')].map((s) => [+s.querySelector('small').textContent, +s.lastChild.textContent]).sort((a, b) => a[0] - b[0]).map((x) => x[1] - 1) }));
  check(/^Matches\..*the sequence (gift|coal)(, (gift|coal))*: \d gifts? before .*×.*You opened stockings [\d, ]+, in that order/.test(proof.text), `${label}: a real turn re-checks: ${proof.text.slice(0, 200)}`);
  // tap to open: the map shows the turn on the stockings the player TAPPED, in tap order (not the shuffle's own order)
  check(proof.cells === 20 && proof.coal === 12 && JSON.stringify(proof.opened) === JSON.stringify(lastTurn.taps), `${label}: the map: 20 stockings, 12 coal, the stockings you tapped in the order you tapped them (${proof.opened} vs ${lastTurn.taps})`);
  await p.screenshot({ path: `${OUT}/${label}-3-check.png` });
  await p.evaluate(() => document.querySelector('#proofClose').click());
  // 5. Layout: nothing wider than the screen; thumb-sized buttons; the run buttons and gift slots inside the card.
  const lay = await p.evaluate(() => { const card = document.querySelector('#stocking .stockcard').getBoundingClientRect(), r = (s) => [...document.querySelectorAll(s)].map((e) => e.getBoundingClientRect());
    return { wide: document.documentElement.scrollWidth > innerWidth, tap: Math.min(...r('#stocking .runbtns .go, #stocking .bets button').map((x) => x.height)), inside: [...r('#stocking .runbtns .go'), ...r('#stockLadder li')].every((x) => x.left >= card.left - 0.5 && x.right <= card.right + 0.5) }; });
  check(!lay.wide && lay.tap >= 44 && lay.inside, `${label}: fits the screen (no sideways scroll), buttons ${Math.round(lay.tap)} px tall, everything inside the card`);
  // 6. The worst case for the fire's glow: every stocking opened at once (more than a real turn ever opens), on screen.
  await p.evaluate(async () => { const s = window.__stocking.board; s.hurry(); s.reset(); await Promise.all(Array.from({ length: 20 }, (_, i) => s.open(i, i % 3 !== 0))); s.normal(); });
  await p.evaluate(() => document.querySelector('#stocking canvas').scrollIntoView({ block: 'start' })); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/${label}-4-all20.png` });
  tapper.on = false; await tapLoop;
  check(tapper.taps > 0 && tapper.wrong === 0, `${label}: tap to open: ${tapper.taps} real ${label.startsWith('phone') ? 'touches' : 'clicks'}, each opened the stocking tapped`);
  await ctx.close();
}
const real = errors.filter((e) => !/ERR_FAILED|Failed to load|net::/.test(e));
check(real.length === 0, 'no page errors' + (real.length ? ': ' + real.join(' | ') : ''));
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); web.close();
process.exit(fails.length ? 1 : 0);
