// Games tab (demo): the custom run box under each game's 1 / 5 / 10 buttons (Cody, 2026-10-01: arrows, any number, max 100)
// and the run counter between each game and its buy buttons (Cody: "a small counter next to each game that keeps track and
// auto resets after each run", "between the game and buy buttons"), checked against the demo money to the cent (winnings arrive 3% lighter). Phone layout too.
// Run: node runpick-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, OUT = 'out/runpick'; mkdirSync(OUT, { recursive: true });
const fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(vp) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 900, isMobile: vp.width < 900 });
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.abort(); });
  const p = await ctx.newPage(), errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost/online.html?net=local'); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('#t-games').click()); await p.waitForFunction(() => window.__drop && window.__slots && window.__credits, null, { timeout: 90000 }); await p.waitForTimeout(500);
  return { p, ctx, errors };
}
const btn = (p, s) => p.evaluate((s) => { const b = document.querySelector(s); return b.querySelector('b').textContent + ' ' + b.querySelector('small').textContent; }, s);
const txt = (p, s) => p.evaluate((s) => document.querySelector(s)?.textContent.replace(/\s+/g, ' ').trim(), s);
const counter = (k) => p.evaluate((k) => [...document.querySelector(`[data-runcount="${k}"]`).children].map((x) => x.textContent).join(' '), k);
// drop paths on board 2 (16 rows, 17 presents): one right = present 2 (0×); six rights = present 7 (2×)
const MID = [1, ...Array(15).fill(0)], ONE = [1, 1, 1, 1, 1, 1, ...Array(10).fill(0)]; // 0×, 2×

console.log('1. The box: starts at 20; arrows step; typing settles into 1–100; the price follows the size');
const { p, ctx, errors } = await open({ width: 1280, height: 900 });
check(await p.inputValue('#drop .runpick input') === '20' && await btn(p, '#drop .runpick [data-run]') === 'Drop 20 $2', 'Drop box: 20, "Drop 20 $2"');
for (let i = 0; i < 3; i++) await p.click('#drop .runpick [data-step="1"]');
check(await btn(p, '#drop .runpick [data-run]') === 'Drop 23 $2.30', '▲ ×3: ' + await btn(p, '#drop .runpick [data-run]'));
await p.fill('#drop .runpick input', '150'); await p.press('#drop .runpick input', 'Enter');
check(await p.inputValue('#drop .runpick input') === '100' && await btn(p, '#drop .runpick [data-run]') === 'Drop 100 $10', 'typed 150 → 100 (the most): ' + await btn(p, '#drop .runpick [data-run]'));
await p.waitForTimeout(500);
check(!(await p.evaluate(() => document.querySelector('#buyDlg').open || window.__drop.opening)), 'Enter in the box only sets the number (it does not start buying)');
await p.click('#drop .runpick [data-step="1"]'); check(await p.inputValue('#drop .runpick input') === '100', '▲ at 100 stays 100');
await p.fill('#drop .runpick input', '0'); await p.press('#drop .runpick input', 'Enter');
check(await p.inputValue('#drop .runpick input') === '1' && await btn(p, '#drop .runpick [data-run]') === 'Drop 1 10¢', 'typed 0 → 1');
await p.click('#drop .runpick [data-step="-1"]'); check(await p.inputValue('#drop .runpick input') === '1', '▼ at 1 stays 1');
await p.fill('#drop .runpick input', '23'); await p.press('#drop .runpick input', 'Enter');
await p.evaluate(() => document.querySelector('#drop [data-dbet="1"]').click());
check(await btn(p, '#drop .runpick [data-run]') === 'Drop 23 $23', 'at $1 a drop: "Drop 23 $23"');
await p.evaluate(() => document.querySelector('#drop [data-dbet="0.1"]').click());
check(await btn(p, '#slots .runpick [data-run]') === 'Pull 20 $20', 'Big Hat box: "Pull 20 $20"');
// hold ▲: keeps going
await p.hover('#slots .runpick [data-step="1"]'); await p.mouse.down(); await p.waitForTimeout(1400); await p.mouse.up();
const held = +(await p.inputValue('#slots .runpick input')); check(held > 22, `holding ▲ keeps counting (20 → ${held})`);
check(await counter('drop') === 'This run – won $0.00' && await counter('big') === 'This run – won $0.00', 'no run yet: "This run – won $0.00"');
// Cody's wording (2026-10-01): Top Line JackPot; one combined jackpot-odds row instead of payback + two odds rows; Drop's one odds line
const facts = await p.evaluate(() => [...document.querySelectorAll('#slots .facts li')].map((li) => [...li.children].map((c) => c.textContent).join(': ')));
check(JSON.stringify(facts) === JSON.stringify(['Jackpot odds (Top Line or Pool): about 1 in 7,665', 'Every Santa Hat on the grid: +6¢']), 'Big Hat facts: ' + facts.join(' | '));
check(/^Top Line JackPot/.test(await txt(p, '#slots .jp.topline span')), 'the box says Top Line JackPot');
check(await txt(p, '#dropOdds') === '1 in 5,000 to hit the 100× · 1 in 4.4 to win 2× or more', 'Drop: ' + await txt(p, '#dropOdds'));
await p.evaluate(() => document.querySelector('#drop').scrollIntoView({ block: 'start' })); await p.screenshot({ path: `${OUT}/desk-box.png` });

console.log('2. A run of 23 drops from the box: the counter above the buttons counts it, to the cent');
const bal = () => p.evaluate(() => window.__slots.state.bal);
// between the game and its buy buttons (Cody): right above the buttons; on a phone (one column) also below the game screen
const between = (k) => p.evaluate((k) => { const el = document.querySelector(`[data-runcount="${k}"]`), c = el.getBoundingClientRect(), b = el.parentElement.querySelector('.runbtns').getBoundingClientRect(), s = el.closest('.machine').querySelector('canvas').getBoundingClientRect();
  const oneColumn = s.right > b.left; return c.bottom <= b.top + 1 && b.top - c.bottom < 24 && (!oneColumn || c.top >= s.bottom - 1); }, k);
let b0 = await bal();
await p.evaluate((paths) => { window.__drop.test.run = paths; document.querySelector('#drop .runpick [data-run]').click(); }, [ONE, MID, ...Array(21).fill(MID)]); // one 2× win: $0.20 back
await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 });
check(await txt(p, '#buyTitle') === 'Play 23 drops' && await txt(p, '#buyWhat') === '23 × 10¢ = $2.30', `dialog: ${await txt(p, '#buyTitle')} · ${await txt(p, '#buyWhat')}`);
await p.evaluate(() => document.querySelector('#buyGo').click());
await p.waitForFunction(() => window.__drop.opening, null, { timeout: 5000 }).catch(() => {});
check(await p.evaluate(() => document.querySelector('#drop .runpick input').disabled && document.querySelector('#drop .runpick [data-step="1"]').disabled), 'the box is locked while the run plays');
check(await p.waitForFunction(() => /^[1-9]\d* \/ 23$/.test(document.querySelector('[data-runcount="drop"] b')?.textContent || ''), null, { timeout: 30000 }).then(() => true, () => false), 'the counter counts while it plays: ' + await counter('drop'));
check(await between('drop'), 'the counter sits between the game and the buy buttons');
await p.click('#drop .skip').catch(() => {});
await p.waitForFunction(() => !window.__drop.opening && window.__drop.flying === 0, null, { timeout: 600000 }); // 17 hops a snowball at ~3 frames a second here await p.waitForTimeout(300);
check(await counter('drop') === 'This run 23 / 23 won $0.20', 'after the run it stays: ' + await counter('drop'));
check(Math.abs((b0 - await bal()) - (2.3 - 0.2 * 0.97)) < 1e-9, `the demo money agrees: lost ${(b0 - await bal()).toFixed(4)} = $2.30 − $0.20 × 0.97`);
await p.evaluate(() => document.querySelector('#drop').scrollIntoView({ block: 'start' })); await p.screenshot({ path: `${OUT}/desk-drop-counter.png` });

console.log('3. 12 Big Hat pulls typed into its box (random results): its own counter matches the money');
await p.fill('#slots .runpick input', '12'); await p.press('#slots .runpick input', 'Enter');
b0 = await bal();
await p.evaluate(() => { document.querySelector('#slots').scrollIntoView({ block: 'start' }); document.querySelector('#slots .runpick [data-run]').click(); });
await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 });
check(await txt(p, '#buyTitle') === 'Play 12 pulls' && await txt(p, '#buyWhat') === '12 × $1 = $12.00', `dialog: ${await txt(p, '#buyTitle')} · ${await txt(p, '#buyWhat')}`);
await p.evaluate(() => document.querySelector('#buyGo').click());
await p.waitForFunction(() => document.querySelector('#slots .runpick [data-run]').disabled, null, { timeout: 10000 }).catch(() => {});
await p.click('#slots .skip').catch(() => {});
await p.waitForFunction(() => !document.querySelector('#slots .runpick [data-run]').disabled, null, { timeout: 300000 }); await p.waitForTimeout(300);
const big = await counter('big'), wonBig = Number((big.match(/won \$([\d.,]+)/) || [])[1]?.replace(/,/g, ''));
check(/^This run 12 \/ 12 won \$/.test(big) && Math.abs((b0 - await bal()) - (12 - wonBig * 0.97)) < 0.006, `Big Hat counter: ${big} (money lost ${(b0 - await bal()).toFixed(4)})`);
check(await between('big'), 'on Big Hat too');
check(await counter('drop') === 'This run 23 / 23 won $0.20', 'each game keeps its own counter');
await p.screenshot({ path: `${OUT}/desk-big-counter.png` });

console.log('4. The next run starts the counter again');
await p.evaluate((paths) => { window.__drop.test.run = paths; document.querySelector('#drop [data-run="1"]').click(); }, [ONE]);
await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 }); await p.evaluate(() => document.querySelector('#buyGo').click());
await p.waitForFunction(() => window.__drop.opening, null, { timeout: 5000 }).catch(() => {});
await p.waitForFunction(() => !window.__drop.opening && window.__drop.flying === 0, null, { timeout: 120000 }); await p.waitForTimeout(300);
check(await counter('drop') === 'This run 1 / 1 won $0.20', 'a new run of 1 starts it again: ' + await counter('drop'));
check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : '')); await ctx.close();

console.log('5. Phones: the box fits; the counter sits between the game and the buttons, and its biggest numbers fit');
for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 640 }]) {
  const o = await open(vp);
  const r = await o.p.evaluate(() => { const a = (s) => document.querySelector(s).getBoundingClientRect(); const box = [a('#drop .runpick'), a('#slots .runpick')];
    return { inside: box.every((b) => b.left >= 0 && b.right <= innerWidth + 0.5), scroll: document.documentElement.scrollWidth > innerWidth, tap: Math.min(...[...document.querySelectorAll('.runpick button, .runpick input')].map((e) => e.getBoundingClientRect().height)) }; });
  check(r.inside && !r.scroll && r.tap >= 40, `${vp.width}×${vp.height}: on screen, no sideways scroll, controls ${Math.round(r.tap)} px tall`);
  await o.p.evaluate(() => { const el = document.querySelector('[data-runcount="big"]'); el.querySelector('b').textContent = '100 / 100'; el.querySelector('span').textContent = 'won $1,234.56'; });
  const fit = await o.p.evaluate(() => { const el = document.querySelector('[data-runcount="big"]'), c = el.getBoundingClientRect(), b = el.parentElement.querySelector('.runbtns').getBoundingClientRect(), s = document.querySelector('#slots canvas').getBoundingClientRect();
    return c.top >= s.bottom - 1 && c.bottom <= b.top + 1 && c.right <= innerWidth && el.scrollWidth <= el.clientWidth + 1 && c.height < 50; });
  check(fit, `${vp.width}: between the game and the buttons, one line even with "100 / 100 … won $1,234.56"`);
  await o.p.evaluate(() => document.querySelector('#slots .screen').scrollIntoView({ block: 'start' })); await o.p.screenshot({ path: `${OUT}/phone-${vp.width}-counter.png` });
  await o.p.evaluate(() => document.querySelector('#drop .runpick').scrollIntoView({ block: 'center' })); await o.p.screenshot({ path: `${OUT}/phone-${vp.width}-box.png` });
  check(!o.errors.length, 'no page errors' + (o.errors.length ? ': ' + o.errors.join(' | ') : '')); await o.ctx.close();
}
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); process.exit(0);
