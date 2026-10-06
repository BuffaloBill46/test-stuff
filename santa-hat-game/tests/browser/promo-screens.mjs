// MARKETING STILLS of the new features (Cody 2026-10-06: "make some X content videos"), sharp phone screenshots (390x844 at
// 2.77x = 1080 wide) for marketing/compose.html's still segments. Everything runs on THIS computer: a real match server
// (server/referee.js) with stand-in sign-ins and a dozen stand-in entrants, and the real page. Nothing touches the live game.
//   tour-bar.png       the 60 s countdown bar on the home screen (tap to join)
//   tour-waiting.png   the tournament page: everyone in, the countdown
//   tour-bracket.png   after round 1: who went through, who's out
//   tour-standings.png the final standings
//   code-lobby.png     Unranked lobby: your own room code typed in, the hint under it
//   code-room.png      the warm-up card: "friends join with code SMITH"
// Run: node promo-screens.mjs   → marketing/stills/
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path'; import http from 'http';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const { WebSocketServer } = require('../../worker/node_modules/ws');
const { createReferee } = await import('../../server/referee.js');
const { TIMES } = await import('../../server/tourney.js');
const { K } = await import('../../mockups/sim.js');
const ROOT = new URL('../../mockups', import.meta.url).pathname, OUT = new URL('../../marketing/stills/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const REFPORT = 8141, WEB = 8142;
Object.assign(TIMES, { countdownMs: 45_000, joinMs: 6_000, breakMs: 25_000, roundSeconds: 14 }); K.END_TIME = 4;
const NAMES = ['frostbite99', 'MistleToe', 'jinglejess', 'Kringle_K', 'snowplow', 'Tinsel_T', 'yetiyolo', 'candycane_c', 'ElfOnShelf', 'blizzard.b', 'cocoa_cam'];
const people = { 'tok-host': { pid: '90000000-2222-4333-8444-555555555555', l: 5, n: 'Santa Hat', a: {}, rp: 0, admin: true }, 'tok-rudy': { pid: '91000000-2222-4333-8444-555555555555', l: 4, n: 'Rudy', a: {}, rp: 0 } };
NAMES.forEach((n, i) => { people['tok-' + n] = { pid: `${String(i + 10).padStart(2, '0')}000000-2222-4333-8444-555555555555`, l: 2 + (i % 5), n, a: {}, rp: 0 }; });
// bots fill seats as house bots do live (player-like names), not the practice bots' names players know (Cody 2026-10-05). Made-up
// names, NOT the live house bots' (an ad must not point them out).
const HB = ['pinecone_pat', 'sledhammer', 'auroraB', 'hollyjolly', 'icey.mike', 'gumdrop22', 'tobogganTom', 'sparkle_sam'].map((name, i) => ({ id: `${i}a000000-2222-4333-8444-555555555555`, name, avatar: {}, level: 3 + (i % 4) }));
const ref = createReferee({ identify: async (t) => people[t] || null, finish: async () => ({ counted: [] }), log: { log() {}, error() {} }, houseBots: async () => HB,
  ranked: { hold: async () => 'free', start: async () => 1, release: async () => true, result: async (m, p, ch) => ch, cleanup: async () => 0 } });
const door = http.createServer(), wss = new WebSocketServer({ server: door });
wss.on('connection', (ws) => { const h = ref.connect({ send: (s) => ws.readyState === 1 && ws.send(s), close: () => ws.close() }); ws.on('message', (d) => h.message(String(d))); ws.on('close', () => h.gone()); });
door.listen(REFPORT); let last = performance.now();
const ticker = setInterval(() => { const now = performance.now(); ref.tick(Math.min((now - last) / 1000, 0.05)); last = now; }, 1000 / 30);
const TYPES = { js: 'text/javascript', html: 'text/html', png: 'image/png', css: 'text/css' };
const web = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (!p.startsWith(ROOT) || !existsSync(p) || req.url.startsWith('/api')) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":"none"}'); }
  res.writeHead(200, { 'content-type': TYPES[p.split('.').pop()] || 'application/octet-stream' }); res.end(readFileSync(p)); }).listen(WEB);
// stand-in entrants: a lobby line each, and a game connection whenever the bracket gives them a game (they stand still: bots win)
const fake = (token) => { const c = { got: [], send: (s) => c.got.push(JSON.parse(s)), close() {} }; c.h = ref.connect(c); c.say = (m) => c.h.message(JSON.stringify(m)); c.tour = () => [...c.got].reverse().find((m) => m.t === 'tour'); c.say({ t: 'board' }); c.say({ t: 'tsub', token }); return c; };
const host = fake('tok-host'), ents = NAMES.map((n) => ({ n, line: fake('tok-' + n), room: null }));
const drive = setInterval(() => { for (const e of ents) { const y = e.line.tour()?.you;
  if (e.room && e.room.got.some((m) => m.t === 'closed')) e.room = null;
  if (!e.room && y?.next) { const c = { got: [], send: (s) => c.got.push(JSON.parse(s)), close() {} }; c.h = ref.connect(c); c.h.message(JSON.stringify({ t: 'join', code: y.next, token: 'tok-' + e.n, me: { id: 'id' + e.n.replace(/[^a-z0-9]/gi, ''), n: e.n } })); e.room = c; } } }, 300);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1080 / 390, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const shot = async (name) => { await sleep(500); await page.screenshot({ path: OUT + name }); console.log('  saved', name); };
const until = (fn, arg, ms = 60000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
try {
  await page.goto(`http://localhost:${WEB}/online.html?ref=${encodeURIComponent('ws://localhost:' + REFPORT)}&server=${encodeURIComponent(`http://localhost:${WEB}/api`)}&token=tok-rudy`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await sleep(2500);
  // as the LIVE site shows it: its 'Test version' notes hide once the real server says mainnet (online.js); this copy has no real server
  await page.addStyleTag({ content: '.testnote { display: none !important; }' });
  console.log('1. the tournament');
  host.say({ t: 'tcreate', rules: { mode: 'ffa', style: 'gear' } }); await sleep(300);
  const code = host.tour().you.code; for (const e of ents.slice(0, 8)) e.line.say({ t: 'tjoin', code });
  host.say({ t: 'tstart' }); for (const e of ents.slice(8)) e.line.say({ t: 'tjoin', id: host.tour().d.id });
  await until(() => !document.querySelector('#tourBar')?.hidden); await sleep(1500); await shot('tour-bar.png');
  await page.click('#tourBar [data-t=joinnow]'); await until(() => /You're in/.test(document.querySelector('#tourPage')?.textContent || '')); await sleep(1200); await shot('tour-waiting.png');
  console.log('   waiting for round 1 to finish…');
  await until(() => window.__sq.room, null, 70000);
  await until(() => !document.querySelector('#tourPage').hidden && /Next round in/.test(document.querySelector('#tourPage h2')?.textContent || ''), null, 120000);
  await page.evaluate(() => document.querySelector('.tbracket')?.scrollIntoView({ block: 'center' })); await shot('tour-bracket.png');
  console.log('   waiting for the final…');
  await until(() => !document.querySelector('#tourPage').hidden && !!document.querySelector('.tstand li'), null, 200000);
  await page.evaluate(() => document.querySelector('#tourPage').scrollTo(0, 0)); await shot('tour-standings.png');
  await page.click('#tourPage [data-t=close]').catch(() => {});
  console.log('2. a private room with your own code');
  await page.evaluate(() => { try { localStorage.removeItem('sq_mycode'); } catch {} document.querySelector('#playUnranked').click(); }); await sleep(600);
  await page.fill('#code', 'SMITH'); await page.evaluate(() => document.querySelector('#code').scrollIntoView({ block: 'center' })); await shot('code-lobby.png');
  await page.click('#create'); await until(() => /join with code SMITH/.test(document.querySelector('#panel')?.textContent || ''));
  for (const n of ['Mom', 'Jake', 'Lily']) { const p = await ctx.newPage(); await p.goto(`http://localhost:${WEB}/online.html?ref=${encodeURIComponent('ws://localhost:' + REFPORT)}&server=${encodeURIComponent(`http://localhost:${WEB}/api`)}`, { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 });
    await p.evaluate((nm) => { document.querySelector('#name').value = nm; document.querySelector('#playUnranked').click(); }, n); await p.fill('#code', 'smith'); await p.click('#joinBtn'); await sleep(800); }
  await page.bringToFront(); await until(() => window.__sq.view?.ents.filter((e) => !e.bot).length >= 4, null, 30000); await sleep(2500);
  await page.evaluate(() => { const l = document.querySelector('#panel .share .link'); if (l) l.textContent = 'https://santahatgames.com/?room=SMITH'; }); // the live address, not this copy's localhost
  await shot('code-room.png');
} finally { clearInterval(ticker); clearInterval(drive); await browser.close(); door.close(); web.close(); }
console.log('done: marketing/stills/tour-*.png, code-*.png');
