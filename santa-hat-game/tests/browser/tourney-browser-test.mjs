// TOURNAMENTS through the real page and a real match server (server/referee.js behind a real WebSocket door, started here with
// stand-in sign-ins; tests/tourney.test.mjs covers the server's rules on their own). Cody (admin) makes one from the ranked
// lobby (his row under the Tournament button: rules, Create, the code, Start); Ann enters the code on the tournament page; a
// wrong code is refused; it's pinned on top of the games waiting list; Start puts a countdown bar on every screen; Ben taps the
// bar and is in; Cal enters and leaves; when the countdown ends Ann and Ben are moved into their game by themselves (no Start
// button, "Tournament · the final"); the match ends and both land back on the tournament page with the standings.
// The rules are the real ones; only the clock is shorter. Run: node tourney-browser-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path'; import http from 'http';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const { WebSocketServer } = require('../../worker/node_modules/ws');
const { createReferee } = await import('../../server/referee.js');
const { TIMES } = await import('../../server/tourney.js');
const { K } = await import('../../mockups/sim.js');
const ROOT = new URL('../../mockups', import.meta.url).pathname, OUT = 'out/tourney'; mkdirSync(OUT, { recursive: true });
const fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const REFPORT = 8131, WEB = 8132;
Object.assign(TIMES, { countdownMs: 10_000, joinMs: 8_000, breakMs: 4_000, roundSeconds: 14 }); K.END_TIME = 6;
const P = (n, i, admin = false) => ({ pid: `${i}0000000-2222-4333-8444-555555555555`, l: 2, n, a: {}, rp: 0, admin });
const people = { 'tok-cody': P('Deputy', 1, true), 'tok-ann': P('Ann', 2), 'tok-ben': P('Ben', 3), 'tok-cal': P('Cal', 4) };
const results = [];
const ref = createReferee({ identify: async (t) => people[t] || null, finish: async () => ({ counted: [] }), log: { log() {}, error: (...a) => console.error(...a) },
  ranked: { hold: async () => 'free', start: async () => 1, release: async () => true, result: async (mid, pid, ch) => { results.push({ mid, pid, ch }); return ch; }, cleanup: async () => 0 } });
const door = http.createServer(), wss = new WebSocketServer({ server: door });
wss.on('connection', (ws) => { const h = ref.connect({ send: (s) => ws.readyState === 1 && ws.send(s), close: () => ws.close() }); ws.on('message', (d) => h.message(String(d))); ws.on('close', () => h.gone()); });
door.listen(REFPORT); let last = performance.now();
const ticker = setInterval(() => { const now = performance.now(); ref.tick(Math.min((now - last) / 1000, 0.05)); last = now; }, 1000 / 30);
const TYPES = { js: 'text/javascript', html: 'text/html', png: 'image/png', css: 'text/css' };
const web = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (!p.startsWith(ROOT) || !existsSync(p) || req.url.startsWith('/api')) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":"none"}'); }
  res.writeHead(200, { 'content-type': TYPES[p.split('.').pop()] || 'application/octet-stream' }); res.end(readFileSync(p)); }).listen(WEB);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(tok, vp = { width: 1100, height: 780 }) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 600, isMobile: vp.width < 600 }), p = await ctx.newPage(), errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://localhost:${WEB}/online.html?ref=${encodeURIComponent('ws://localhost:' + REFPORT)}&server=${encodeURIComponent(`http://localhost:${WEB}/api`)}&token=${tok}`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__sq, null, { timeout: 90000 });
  return { p, errors };
}
const until = (p, fn, arg, ms = 30000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const text = (p, sel) => p.evaluate((s) => document.querySelector(s)?.textContent.replace(/\s+/g, ' ').trim() || '', sel);
try {
  console.log('1. Cody (admin) makes one from the ranked lobby');
  const C = await open('tok-cody');
  await C.p.evaluate(() => document.querySelector('#playRanked').click());
  check(await until(C.p, () => !document.querySelector('#tourBox').hidden && /Make a tournament/.test(document.querySelector('#tourAdmin')?.textContent || '')), 'his row under the Tournament button: "Make a tournament"');
  await C.p.evaluate(() => { document.querySelector('#tourAdmin [name=tstyle][value=normal]').click(); document.querySelector('#tourAdmin [data-t=create]').click(); });
  check(await until(C.p, () => /^[A-Z2-9]{5}$/.test(document.querySelector('#tourAdmin .tcode')?.textContent || '') && !!document.querySelector('#tourAdmin [data-t=start]')), 'he gets the code and a Start tournament button');
  const code = await text(C.p, '#tourAdmin .tcode'); console.log('     code', code);
  await C.p.screenshot({ path: `${OUT}/admin-lobby.png` });

  console.log('2. Ann enters the code; Ben types a wrong one; it is pinned on the waiting list');
  const A = await open('tok-ann'), B = await open('tok-ben');
  await A.p.evaluate(() => document.querySelector('#playRanked').click());
  check(await until(A.p, () => !document.querySelector('#tourBox').hidden && document.querySelector('#tourAdmin').hidden), 'Ann sees the Tournament button, no admin row');
  await A.p.evaluate(() => document.querySelector('#tourney').click());
  check(await until(A.p, () => !document.querySelector('#tourPage').hidden && !!document.querySelector('#tourCode')), 'the tournament page opens with a code box');
  await A.p.fill('#tourCode', code.toLowerCase()); await A.p.click('#tourPage [data-t=enter]');
  check(await until(A.p, () => /You're in/.test(document.querySelector('#tourPage').textContent) && [...document.querySelectorAll('.tnames li')].some((l) => l.textContent === 'Ann')), 'Ann is in, her name on the page');
  check(/Normal play/.test(await text(A.p, '#tourPage .trules')), 'the rules Cody picked show (Normal play)');
  await B.p.evaluate(() => window.__sq.idleFor(0));
  check(await until(B.p, () => /Tournament · Free-for-all · Normal play/.test(document.querySelector('#waitList')?.textContent || '') && !!document.querySelector('#waitList .tourpin')), 'pinned on top of the games waiting list (Play page)');
  await B.p.evaluate(() => document.querySelector('#waitList [data-tour-open]').click());
  check(await until(B.p, () => !!document.querySelector('#tourCode')), 'the pin opens the tournament page');
  await B.p.fill('#tourCode', 'ZZZZZ'); await B.p.click('#tourPage [data-t=enter]');
  check(await until(B.p, () => /doesn't match/.test(document.querySelector('#tourPage .tnote')?.textContent || '')), 'a wrong code is refused');
  await B.p.click('#tourPage [data-t=close]');
  const L = await open('tok-cal');
  await L.p.evaluate(() => document.querySelector('#playRanked').click()); await L.p.evaluate(() => document.querySelector('#tourney').click());
  await until(L.p, () => !!document.querySelector('#tourCode')); await L.p.fill('#tourCode', code); await L.p.click('#tourPage [data-t=enter]');
  check(await until(L.p, () => !!document.querySelector('#tourPage [data-t=leave]')), 'Cal is in, with a Leave button');
  await L.p.click('#tourPage [data-t=leave]');
  check(await until(A.p, () => ![...document.querySelectorAll('.tnames li')].some((l) => l.textContent === 'Cal')), 'Cal left: off the list everyone sees');

  console.log('3. Start: a countdown bar on every screen; Ben taps it and is in');
  await C.p.evaluate(() => document.querySelector('#tourAdmin [data-t=start]').click());
  check(await until(B.p, () => !document.querySelector('#tourBar').hidden && /starts in/.test(document.querySelector('#tourBar').textContent)), 'Ben (not in it) sees the countdown bar');
  await B.p.screenshot({ path: `${OUT}/bar.png` });
  await B.p.click('#tourBar [data-t=joinnow]');
  check(await until(B.p, () => /You're in/.test(document.querySelector('#tourPage').textContent) && /Starts in/.test(document.querySelector('#tourPage h2').textContent)), 'tapping it entered him: the page with the countdown');
  check(await until(A.p, () => [...document.querySelectorAll('.tnames li')].map((l) => l.textContent).sort().join() === 'Ann,Ben'), 'Ann sees Ben join');
  await A.p.screenshot({ path: `${OUT}/waiting.png` });

  console.log('4. The countdown ends: Ann and Ben are moved into their game by themselves');
  check(await until(A.p, () => /^X/.test(window.__sq.room?.code?.() || ''), null, 25000), 'Ann is in the tournament game');
  check(await until(B.p, () => /^X/.test(window.__sq.room?.code?.() || ''), null, 25000), 'Ben too');
  check(await A.p.evaluate(() => window.__sq.room.code()) === await B.p.evaluate(() => window.__sq.room.code()), 'the same game (2 players: straight to the final)');
  check(await until(A.p, () => /Tournament · the final/.test(document.querySelector('#panel')?.textContent || '') || /Tournament final/.test(document.querySelector('#panel')?.textContent || '')), 'the card says "Tournament · the final"');
  check(!(await A.p.evaluate(() => !!document.querySelector('#panel #start'))), 'no Start button in a tournament game');
  check(await until(A.p, () => window.__sq.view?.phase === 'play', null, 30000), 'the match starts');
  check(await A.p.evaluate(() => window.__sq.view.time > 10 && window.__sq.view.time <= 14), 'it runs on the tournament clock (14 s here; 90 s live)');

  console.log('5. The end: back on the tournament page with the standings');
  check(await until(A.p, () => !document.querySelector('#tourPage').hidden && !!document.querySelector('.tstand li'), null, 60000), 'Ann is back on the tournament page with the standings');
  check(await until(A.p, () => /You placed/.test(document.querySelector('#tourPage').textContent)), 'she is told her place');
  check(await until(C.p, () => /wins!/.test(document.querySelector('#tourAdmin')?.textContent || '') || /Make a tournament/.test(document.querySelector('#tourAdmin')?.textContent || '')), 'Cody can make the next one');
  check(results.length >= 2 && results.every((r) => r.mid.startsWith('tour-') && r.ch > 0), 'ranked points recorded for the placed players: ' + JSON.stringify(results.map((r) => r.ch)));
  await A.p.screenshot({ path: `${OUT}/standings.png` });
  console.log('6. On a phone: the tournament page fits');
  const M = await open('tok-ann', { width: 390, height: 844 }); await M.p.evaluate(() => document.querySelector('#playRanked').click()); await M.p.evaluate(() => document.querySelector('#tourney').click());
  check(await until(M.p, () => !document.querySelector('#tourPage').hidden), 'opens on a phone');
  check(await M.p.evaluate(() => document.querySelector('#tourPage').getBoundingClientRect().right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');
  await M.p.screenshot({ path: `${OUT}/phone.png` });
  for (const [n, x] of [['Cody', C], ['Ann', A], ['Ben', B], ['Cal', L], ['phone', M]]) check(x.errors.length === 0, `${n}: no page errors ${x.errors.join(' | ')}`);
} finally { clearInterval(ticker); await browser.close(); door.close(); web.close(); }
if (fails.length) { console.log(`\nFAILED: ${fails.length}`); process.exit(1); }
console.log('\nOK: tournaments in the real page: admin makes (rules, code, Start), code entry, wrong code refused, pinned on the waiting list, leave, countdown bar on every screen (tap = in), moved into the game by itself, tournament clock, back to the standings with places and points, phone fits');
