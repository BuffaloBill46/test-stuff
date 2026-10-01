// Levels: when an Auto match ends, the host reports every finishing place to the game server, ONCE (Cody, 2026-10-01).
// A real Auto match room (?room=PF1, one computer) in server mode against a stand-in server that records what it is sent;
// the match is fast-forwarded to its end. Practice sends nothing. (The server side, server/levels.js, is tested on real
// Postgres in tests/db/levels-db.test.mjs.) Run: node finish-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path'; import http from 'http';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const got = []; const PID = '11111111-2222-3333-4444-555555555555';
const web = http.createServer(async (req, res) => {
  if (req.method === 'GET') { const pth = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'online.html');
    if (!pth.startsWith(ROOT) || !existsSync(pth)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': pth.endsWith('.js') ? 'text/javascript' : pth.endsWith('.png') ? 'image/png' : 'text/html' }); return res.end(readFileSync(pth)); }
  const chunks = []; for await (const c of req) chunks.push(c); const body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); got.push(body);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body.action === 'finish' ? { counted: [{ place: 1, level: 1, xp: 1, up: false, you: true }] } : body.action === 'settings' ? {} : { error: 'stand-in' }));
}).listen(8794);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } }); const errors = [];
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.startsWith('http://localhost:8794/')) return route.continue();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  return route.fulfill({ status: 503, body: '' }); });
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
const endMatch = () => p.evaluate(() => { const s = window.__sq.sim; s.S.round = 3; s.S.time = 0.2; });
async function play(qs, signedIn) {
  await p.goto('http://localhost:8794/online.html?net=local&token=test-token&server=' + encodeURIComponent('http://localhost:8794/api') + qs, { timeout: 90000 });
  await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1500);
  if (signedIn) await p.evaluate((pid) => { window.__sq.me.pid = pid; }, PID);
}

console.log('1. An Auto match (public room PF1): the host reports the places once, in score order, bots as empty places');
await play('&room=PF1', true);
await p.evaluate(() => document.querySelector('#joinBtn')?.click());
await p.waitForFunction(() => window.__sq.isHost && window.__sq.sim, null, { timeout: 60000 });
await p.evaluate(() => window.__sq.sim.startMatch('ffa'));
await p.evaluate(() => { const s = window.__sq.sim, me = s.S.ents.find((e) => e.peer === window.__sq.me.id); me.score = 5; s.S.ents.filter((e) => e.bot)[0].score = 30; }); // a bot wins
await endMatch(); await p.waitForFunction(() => window.__sq.view?.phase === 'end', null, { timeout: 60000 }); await p.waitForTimeout(3000);
const fin = got.filter((b) => b.action === 'finish');
check(fin.length === 1, `one report (${fin.length})`);
const m = fin[0]?.match;
check(m && /^[0-9a-f]{32}$/.test(m.id) && m.auto === true, 'with the referee\'s match id, marked as an Auto match');
check(m && m.places[0] === null && m.places[1] === PID, `places in score order: the winning bot first (empty place), then the host's account (${JSON.stringify(m?.places?.slice(0, 3))})`);
check(m && m.places.filter(Boolean).length === 1, 'bots never carry an account');

console.log('2. Practice: nothing is reported');
got.length = 0; await play('', true);
await p.evaluate(() => window.__sq.startPractice()); await p.waitForTimeout(2500); await p.evaluate(() => document.querySelector('#start')?.click());
await p.waitForFunction(() => window.__sq.view?.phase === 'play', null, { timeout: 60000 }); await endMatch();
await p.waitForFunction(() => window.__sq.view?.phase === 'end', null, { timeout: 60000 }); await p.waitForTimeout(3000);
check(got.filter((b) => b.action === 'finish').length === 0, 'practice sends no report');
check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); web.close(); process.exit(0);
