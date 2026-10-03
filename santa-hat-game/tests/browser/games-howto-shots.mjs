// Screenshots of the three game cards (desktop + phone), with each game's "How to play & win" opened, and a text check that the
// only odds shown are the jackpots' (Cody, 2026-10-03). Local page, demo mode. Run: PW=… node games-howto-shots.mjs
import { createRequire } from 'module'; import http from 'http'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.PW, 'node_modules/playwright'));
const ROOT = fileURLToPath(new URL('../../mockups/', import.meta.url)), OUT = './out/howto/'; mkdirSync(OUT, { recursive: true });
const types = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.css': 'text/css', '.json': 'application/json' };
const web = http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'online.html');
  if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); res.end(readFileSync(f)); }).listen(8796);
const fails = [], check = (ok, m) => { console.log((ok ? '  ✓ ' : '  ✗ ') + m); if (!ok) fails.push(m); };
const b = await chromium.launch({ channel: 'chrome' });
for (const [label, vp] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const { width, height, ...rest } = vp; const ctx = await b.newContext({ viewport: { width, height }, ...rest }); const p = await ctx.newPage(), errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8796/online.html?net=local'); await p.waitForFunction(() => window.__sq, null, { timeout: 60000 });
  await p.click('#t-games'); await p.waitForFunction(() => window.__slots && window.__drop && window.__stocking, null, { timeout: 60000 }); await p.waitForTimeout(1500);
  const text = (sel) => p.locator(sel).first().innerText().catch(() => '');
  // the Big Hat card: its jackpot odds and its How to play & win button; the old paytable box is gone
  const facts = await text('#slots .facts');
  check(/Top Line JackPot odds/.test(facts) && /Pool jackpot odds/.test(facts) && !/Every Santa Hat/.test(facts), `${label} Big Hat jackpot odds: ${facts.replace(/\s+/g, ' ')}`);
  // the Payout table (Cody, 2026-10-03): closed until clicked, then every symbol's 3/4/5-in-a-row pay and the 11 paylines, no odds
  check(!(await p.evaluate(() => document.querySelector('#bhPays').open)), `${label} Big Hat: Payout table closed until clicked`);
  await p.locator('#bhPays summary').click(); await p.waitForTimeout(300);
  const pays = await text('#bhPays');
  check(await p.locator('#payRows tbody tr').count() === 12 && await p.locator('#payLines figure').count() === 11 && /3 in a row/i.test(pays) && !/odds|chance|payback|\b1 in \d/i.test(pays),
    `${label} Big Hat Payout table: 12 rows (9 symbols + hat bonus + pool jackpot + coal), 11 paylines, no odds [rows ${await p.locator('#payRows tbody tr').count()}, lines ${await p.locator('#payLines figure').count()}, odds word: ${(pays.match(/odds|chance|payback|b1 in d/i) || ['none'])[0]}]`);
  const fit = await p.evaluate(() => { const t = document.querySelector('#bhPays .pays'), r = t.getBoundingClientRect(), box = document.querySelector('#bhPays').getBoundingClientRect();
    return { table: Math.round(r.right), box: Math.round(box.right), screen: innerWidth, page: document.documentElement.scrollWidth }; });
  check(fit.table <= fit.box + 1 && fit.table <= fit.screen && fit.page <= fit.screen, `${label} Big Hat Payout table fits the screen (${JSON.stringify(fit)})`);
  await p.locator('#bhPays').screenshot({ path: `${OUT}${label}-bighat-paytable.png` });
  check(/How to play & win/.test(await text('#howBtn')), `${label} Big Hat: How to play & win button`);
  await p.locator('#slots').screenshot({ path: `${OUT}${label}-bighat.png` });
  await p.click('#howBtn'); await p.waitForTimeout(500);
  const how = await text('#howDlg');
  check(/Win table/.test(how) && !/odds|chance|payback/i.test(how.replace(/1 in 25,000/, '')), `${label} Big Hat How to: rules, examples, win table, no other odds`);
  await p.locator('#howDlg').screenshot({ path: `${OUT}${label}-bighat-howto.png` }); await p.click('#howClose');
  for (const [game, line, how2] of [['drop', '#dropOdds', '#dropHow'], ['stocking', '#stockOdds', '#stockHow']]) {
    const l = (await text(line)).replace(/\s+/g, ' ');
    check(/^Pool jackpot \$[\d.,]+ on a 10¢ .* 1 in [\d,]+ to hit it$/.test(l), `${label} ${game} jackpot line: ${l}`);
    await p.locator(`${how2} summary`).click(); await p.waitForTimeout(400);
    const h = await text(`${how2} .body`);
    // ("doesn't change your chances" is a fairness promise, not odds; a Chance column, "1 in N" or payback would be odds)
    check(h.length > 200 && !/payback|\b1 in \d|\bChance\b/.test(h), `${label} ${game} How to play & win: rules + prizes, no odds`);
    await p.locator(`#${game}`).screenshot({ path: `${OUT}${label}-${game}.png` });
  }
  check(!errs.length, `${label} no page errors ${errs.join(' | ')}`);
  await ctx.close();
}
await b.close(); web.close();
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
process.exit(0);
