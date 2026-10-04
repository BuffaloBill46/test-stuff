// Marketing clips of the three quick games (video 4, 2026-10-04), played on the private copy's demo credits (net=local: no
// money, no server). Headed Chrome (a headless one hands the recorder stale frames).
// JACKPOT (Cody 2026-10-04: "show a pool jackpot on all 3"): $1 plays (Drop, Stocking; Big Hat is $1 a pull), and the 3rd play of
// each run is lined up to hit that game's pool jackpot through the tests' own hook (window.__<game>.test.run; plays 1-2 random).
// The game screen is recorded from its own canvas (sharp). The page's text over it (the WIN / POOL JACKPOT stamp, the pool
// jackpot amount, the run's "won $…") is LOGGED with its time instead, and compose.html redraws exactly that text at those
// times: the DevTools page screencast only gives page-sized (430 px) pictures, and screen capture (getDisplayMedia) recorded
// the whole monitor, other windows included (2026-10-04, deleted at once). NEVER use screen capture here.
// Writes marketing/raw/arcade-<game>.webm + arcade-<game>.json { jackpot, events: [[seconds, kind, text, isJackpot]] }.
// Run: node promo-arcade.mjs [slots,drop,stocking] [seconds=15]
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = path.resolve('../../mockups'), OUT = path.resolve('../../marketing/raw'); mkdirSync(OUT, { recursive: true });
const GAMES = (process.argv[2] || 'slots,drop,stocking').split(','), SECS = +(process.argv[3] || 15);
const JACKPOT = { slots: 'JACKPOT', drop: [1, 1, 1, 1, 1, 1, 1, 1, ...Array(8).fill(0)], stocking: 8 }; // as the slots/drop/stocking tests force them
const AMOUNT = { slots: '#jpAmt', drop: '#dropOdds .jpline b', stocking: '#stocking .jpline b' }, BET = { drop: '#drop [data-dbet="1"]', stocking: '#stocking [data-sbet="1"]' };
const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 3, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem('santa.coached', '1'));
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.fulfill({ status: 503, body: '' }); } }
  if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : p.endsWith('.css') ? 'text/css' : 'text/html' }); }
  return route.fulfill({ status: 503, body: '' }); });
const page = await ctx.newPage(); page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost/online.html?net=local', { timeout: 90000 }); await page.waitForFunction(() => window.__sq, null, { timeout: 90000 });
await page.evaluate(() => document.querySelector('#t-games').click()); await page.waitForFunction(() => window.__drop && window.__slots, null, { timeout: 90000 }); await page.waitForTimeout(1500);
for (const game of GAMES) {
  const sel = `#${game}`;
  if (BET[game]) { await page.evaluate((b) => document.querySelector(b).click(), BET[game]); await page.waitForTimeout(300); }
  await page.evaluate((s) => document.querySelector(s + ' canvas').scrollIntoView({ block: 'center' }), sel); await page.waitForTimeout(800);
  const jackpot = await page.evaluate((a) => document.querySelector(a)?.textContent.trim(), AMOUNT[game]);
  // record the canvas, and log the stamp and the run bar with their times (same clock: the recorder's start)
  await page.evaluate((s) => { const c = document.querySelector(s + ' canvas'), card = document.querySelector(s + ' .machine') || document.querySelector(s + ' article');
    const flash = document.querySelector(s + ' .flash'), run = document.querySelector(s + ' [data-runcount] span'), events = [], t0 = performance.now();
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 14e6 }), parts = []; rec.ondataavailable = (e) => parts.push(e.data);
    const log = () => { const t = +((performance.now() - t0) / 1000).toFixed(3), shown = flash.classList.contains('show') ? flash.textContent.trim() : '', jp = !!card?.classList.contains('jackpot'), last = events.findLast((e) => e[1] === 'stamp');
      if (!last || last[2] !== shown || last[3] !== jp) events.push([t, 'stamp', shown, jp]);
      const won = run?.textContent.trim() || '', lw = events.findLast((e) => e[1] === 'won'); if (!lw || lw[2] !== won) events.push([t, 'won', won, false]); };
    const mo = new MutationObserver(log); mo.observe(flash, { attributes: true, childList: true, characterData: true, subtree: true }); if (card) mo.observe(card, { attributes: true }); if (run) mo.observe(run, { childList: true, characterData: true, subtree: true });
    window.__rec = { rec, parts, events, mo }; rec.start(500); log(); }, sel);
  await page.waitForTimeout(600);
  // a run of 5 with the 3rd play lined up as the pool jackpot, confirmed in the same dialog players see
  await page.evaluate(([g, jp]) => { const f = []; f[2] = jp; window['__' + g].test.run = f; }, [game, JACKPOT[game]]);
  await page.evaluate((s) => document.querySelector(`${s} [data-run="5"]`).click(), sel);
  await page.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 }); await page.evaluate(() => document.querySelector('#buyGo').click());
  const tStart = Date.now();
  while (Date.now() - tStart < SECS * 1000) {
    // Stocking Stuffer: open stockings by tapping them, as a player does (Enter opens the next one too)
    if (game === 'stocking') { const b = await page.evaluate((s) => { const r = document.querySelector(s + ' canvas').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }, sel);
      await page.mouse.click(b[0] + b[2] * (0.15 + Math.random() * 0.7), b[1] + b[3] * (0.1 + Math.random() * 0.26)); await page.keyboard.press('Enter'); }
    await page.waitForTimeout(game === 'stocking' ? 450 : 300);
  }
  const out = await page.evaluate(() => new Promise((done) => { const { rec, parts, events, mo } = window.__rec; mo.disconnect();
    rec.onstop = async () => { const buf = new Uint8Array(await new Blob(parts).arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode(...buf.subarray(i, i + 32768)); done({ b64: btoa(s), events }); }; rec.stop(); }));
  writeFileSync(path.join(OUT, `arcade-${game}.webm`), Buffer.from(out.b64, 'base64'));
  writeFileSync(path.join(OUT, `arcade-${game}.json`), JSON.stringify({ jackpot, events: out.events }));
  const jpAt = out.events.find((e) => e[1] === 'stamp' && e[3] && e[2]);
  console.log(`saved arcade-${game}: pool jackpot shown ${jackpot}; ${jpAt ? `JACKPOT stamp "${jpAt[2]}" at ${jpAt[0]} s` : 'NO jackpot stamp in the clip'}`);
  // let the rest of the run finish before the next game
  await page.waitForFunction((s) => !document.querySelector(s + ' [data-run="5"]').disabled, sel, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(800);
}
await browser.close();
