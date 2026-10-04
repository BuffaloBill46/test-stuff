// The player guide (mockups/guide.html, Cody 2026-10-03): every table is filled from the game's own rules files, fits a phone
// (390 px) and a computer, the page loads with no errors, the only odds shown are the jackpots', and the Play and Games pages link to it.
// Run (Windows): PW=… node --import ./win-chrome.mjs guide-test.mjs
import { createRequire } from 'module'; import http from 'http'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups/', import.meta.url).pathname, fails = [], check = (ok, m) => { console.log((ok ? '  ✓ ' : '  ✗ ') + m); if (!ok) fails.push(m); };
const web = http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'guide.html');
  if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); res.end(readFileSync(f)); }).listen(8793);
const b = await chromium.launch();
import { COSTUMES } from '../../mockups/catalog.js';
const WANT = { pts: 4, sbTable: 6, gearTable: 8, levelTable: 10, lookTable: 9 + Object.values(COSTUMES).filter((c) => c.season).length, /* levels 2–10, then one row per season-pass costume */ rankedEx: 3, bigTable: 9, dropTable: 5, stockTable: 8 };
for (const [label, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
  const p = await b.newPage({ viewport: vp }), errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(`${r.status()} ${r.url()}`); });
  await p.goto('http://localhost:8793/guide.html'); await p.waitForFunction(() => document.querySelector('#stockTable tbody'), null, { timeout: 30000 });
  const r = await p.evaluate(() => ({ rows: Object.fromEntries([...document.querySelectorAll('table')].map((t) => [t.id, t.querySelectorAll('tbody tr').length])),
    overflow: [...document.querySelectorAll('.table')].filter((d) => d.scrollWidth > d.clientWidth + 1).map((d) => d.querySelector('table').id),
    wide: document.documentElement.scrollWidth > innerWidth, text: document.querySelector('main').innerText }));
  check(Object.entries(WANT).every(([k, n]) => r.rows[k] === n), `${label}: every table filled from the rules ${JSON.stringify(r.rows)}`);
  check(!r.overflow.length && !r.wide, `${label}: everything fits the screen${r.overflow.length ? ' (too wide: ' + r.overflow.join(', ') + ')' : ''}`);
  const odds = r.text.match(/1 in [\d,]+/g) || [];
  check(odds.length === 4 && !/payback|chance of/i.test(r.text), `${label}: only the jackpots' odds (${odds.join(' · ')})`);
  check(/9 PM Eastern/.test(r.text) && /December 23 at 9 PM/.test(r.text), `${label}: resets and draws at 9 PM Indiana time`);
  // the season and weekly modes (seasons.js, weekly.js), read from the rules files
  const has = (...xs) => xs.every((x) => r.text.includes(x));
  check(has('Halloween (October 1 to October 31)', 'Thanksgiving (November 1 to November 30)', 'Christmas (December 1 to January 1)'), `${label}: the three seasons and their dates`);
  check(has('Play 2 Auto matches', 'Log in', 'Win an Auto match', 'Halloween, door 2: Candy Corn', 'costs $5', 'Pumpkin King', '30 doors, one every 300 points', 'up to 700 a day', 'Elf Hat', 'ranked ticket') && !/one door a day/.test(r.text),
    `${label}: season points (30 doors, 300 each, up to 700 a day), tasks, free looks by door, the $5 pass and what it gives`);
  check(has('Hot Hat:', 'King of the Gazebo:', 'Blizzard:', 'Hat Hunt:', 'Auto match together'), `${label}: weekly modes and playing with friends`);
  check(!errs.length, `${label}: no page errors ${errs.join(' | ')}`);
  await p.close();
}
const html = readFileSync(path.join(ROOT, 'online.html'), 'utf8');
check(/href="\.\/guide\.html"/.test(html) && /href="\.\/guide\.html#games"/.test(html), 'the Play page and the Games tab link to the guide');
check(/cp "\$SRC\/guide\.html"/.test(readFileSync(new URL('../../deploy-pages.sh', import.meta.url), 'utf8')), 'deploy-pages.sh publishes it');
await b.close(); web.close();
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
process.exit(0);
