// RANKED through the real page and a real referee (server/referee.js behind a real WebSocket door, started here with
// stand-in sign-ins and a stand-in ticket store; tests/referee-ranked.test.mjs and tests/db/ranked-db.test.mjs cover those
// halves): the ranked lobby's Auto match is open, Ann searches and waits for a 2nd real player, Ben searches and lands in the
// same room, the match runs on the server, both see their rank points at the end, and the server sends them back to the
// ranked lobby. Run: node referee-ranked-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path'; import http from 'http';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const { WebSocketServer } = require('../../worker/node_modules/ws');
const { createReferee } = await import('../../server/referee.js');
const { K } = await import('../../mockups/sim.js');
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const REFPORT = 8094, WEB = 8098;
// shorter rounds so a whole ranked match fits the test (the rules are the real ones; only the clock is shorter)
K.ROUND_TIME = 12; K.BREAK_TIME = 3; K.END_TIME = 6;
const people = { 'tok-ann': { pid: '10000000-2222-4333-8444-555555555555', l: 3, n: 'Ann', a: {}, rp: 10 }, 'tok-ben': { pid: '20000000-2222-4333-8444-555555555555', l: 2, n: 'Ben', a: {}, rp: 30 } };
const store = { tickets: 0, results: [] };
const ref = createReferee({ identify: async (t) => people[t] || null, finish: async () => ({ counted: [] }),
  ranked: { hold: async () => { store.tickets++; return 'free'; }, start: async () => 2, release: async () => true, result: async (mid, pid, change) => { store.results.push({ pid, change }); return 100 + change; }, cleanup: async () => 0 } });
const door = http.createServer(), wss = new WebSocketServer({ server: door });
wss.on('connection', (ws) => { const h = ref.connect({ send: (s) => ws.readyState === 1 && ws.send(s), close: () => ws.close() }); ws.on('message', (d) => h.message(String(d))); ws.on('close', () => h.gone()); });
door.listen(REFPORT); let last = performance.now();
const ticker = setInterval(() => { const now = performance.now(); ref.tick(Math.min((now - last) / 1000, 0.05)); last = now; }, 1000 / 30);
// the game's files from a plain web server (no request interception: LESSONS, Playwright breaks WebSockets); /api answers 404
const TYPES = { js: 'text/javascript', html: 'text/html', png: 'image/png', css: 'text/css' };
const web = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (!p.startsWith(ROOT) || !existsSync(p) || req.url.startsWith('/api')) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":"none"}'); }
  res.writeHead(200, { 'content-type': TYPES[p.split('.').pop()] || 'application/octet-stream' }); res.end(readFileSync(p)); }).listen(WEB);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(tok) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } }), p = await ctx.newPage(), errors = []; p.on('pageerror', (e) => errors.push(e.message));
  // ?server= on localhost only so the page hands the test sign-in (?token=) to the referee (mockups/gameserver.js token())
  await p.goto(`http://localhost:${WEB}/online.html?ref=${encodeURIComponent('ws://localhost:' + REFPORT)}&server=${encodeURIComponent(`http://localhost:${WEB}/api`)}&token=${tok}`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__sq, null, { timeout: 90000 });
  return { p, errors };
}
const until = (p, fn, arg, ms = 30000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const panel = (p) => p.evaluate(() => document.querySelector('#panel')?.textContent.replace(/\s+/g, ' ').trim() || '');
try {
  console.log('1. The ranked lobby is open with the referee server');
  const A = await open('tok-ann');
  await A.p.evaluate(() => document.querySelector('#playRanked').click());
  check(await until(A.p, () => { const q = document.querySelector('#quick'); return q && !q.disabled && /1 ticket/.test(q.textContent); }), 'Auto match is open: "Auto match · 1 ticket"');
  // Normal / Special gear ticks show in ranked too (Cody 2026-10-02); FFA / TEAM don't (ranked is FFA)
  check(await A.p.evaluate(() => !document.querySelector('#autoStyles').hidden && document.querySelector('#autoModes').hidden), 'ranked lobby: Normal / Special gear ticks shown, FFA / TEAM hidden');
  await A.p.evaluate(() => document.querySelector('[data-astyle="gear"]').click()); // Ann: Normal play only
  console.log('2. Ann searches alone (Normal play only): waits for a 2nd real player');
  await A.p.evaluate(() => document.querySelector('#quick').click());
  check(await until(A.p, () => window.__sq.room?.kind === 'server' && /^PRN\d/.test(window.__sq.room.code())), 'the server put her in a NORMAL ranked room');
  check(await until(A.p, () => /Ranked · FFA · Normal play/.test(document.querySelector('#panel')?.textContent || '')), 'the panel says "Ranked · FFA · Normal play"');
  check(await until(A.p, () => /Looking for another real player/.test(document.querySelector('#panel')?.textContent || '')), 'the panel says it is waiting for another real player');
  check(store.tickets === 1, 'one ticket held');
  console.log('3. Ben searches: same room; it starts; the server runs it');
  const B = await open('tok-ben');
  await B.p.evaluate(() => window.__sq.enterRoom('', false, { ranked: true }));
  check(await until(B.p, () => window.__sq.room?.peers().length === 2), 'Ben is in the same ranked room');
  check(await until(A.p, () => /Starting in/.test(document.querySelector('#panel')?.textContent || '')), 'the countdown starts with 2 real players');
  check(await until(A.p, () => window.__sq.view?.phase === 'play', null, 60000), 'the match starts');
  console.log('4. The end: rank points shown, then back to the ranked lobby');
  check(await until(A.p, () => window.__sq.view?.phase === 'end', null, 120000), 'the match ends');
  check(await until(A.p, () => /Rank points [+−]\d+ · now \d+/.test(document.querySelector('#panel')?.textContent || '')), 'Ann sees her rank points: ' + (await panel(A.p)).slice(0, 120));
  // (scores run straight into names in the text, e.g. "Ben17Ann you0", so match the name with its "you" tag)
  check(/Ann you/.test(await panel(A.p)), 'her name on the results is the one the server checked (Ann)');
  check(await until(B.p, () => /Rank points/.test(document.querySelector('#panel')?.textContent || '')), 'so does Ben');
  check(store.results.length === 2, 'two results recorded: ' + JSON.stringify(store.results));
  check(await until(A.p, () => !window.__sq.room && /Match over/.test(document.body.textContent), null, 40000), 'the server closed the room; Ann is back with "Match over"');
  check(await A.p.evaluate(() => !document.querySelector('#home').hidden && /FFA RANKED/.test(document.querySelector('#lobbyTitle')?.textContent || '')), 'in the ranked lobby');
  for (const x of [A, B]) check(!x.errors.length, 'no page errors: ' + x.errors.join(' | '));
} finally { await browser.close(); clearInterval(ticker); wss.close(); door.close(); web.close(); }
if (fails.length) { console.error('FAIL', fails); process.exit(1); }
console.log('OK: ranked through the real page: lobby open, search + wait for a 2nd real player, same room, server-run match, rank points shown, back to the ranked lobby');
