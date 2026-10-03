// The page on the REFEREE SERVER (server/referee.js through worker/referee.mjs, started here for real), two real browsers:
// both join a private room through the server, see each other, only the room's owner gets the mode buttons and Start, the
// match runs on the server (neither page ever becomes the referee), a player's moves show up in the server's snapshots, emotes
// travel, the lobby's games list comes from the server, and a full public room sends Auto match on to the next one.
// Needs: npm install in worker/. Run: node referee-server-test.mjs
// Against the LIVE referee (the Droplet) instead of a local one: REF_URL=wss://147-182-219-161.sslip.io node referee-server-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync, spawn } from 'child_process'; import path from 'path'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const PORT = 8092, REMOTE = process.env.REF_URL || '', REF = REMOTE || `ws://localhost:${PORT}`, HEALTH = REMOTE ? REMOTE.replace(/^ws/, 'http') + '/health' : `http://localhost:${PORT}/health`;
const door = REMOTE ? { kill() {} } : spawn(process.execPath, [fileURLToPath(new URL('../../worker/referee.mjs', import.meta.url))], { env: { ...process.env, PORT: String(PORT) }, stdio: 'inherit' });
for (let i = 0; i < 40; i++) { try { await fetch(HEALTH); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
// The game's files from a plain local web server: no request interception (in this Playwright it breaks WebSockets, even
// ones it was told to leave alone), so the page loads like the live site does (three.js etc. from the internet).
import http from 'http';
const WEB = 8096, TYPES = { js: 'text/javascript', html: 'text/html', png: 'image/png', css: 'text/css', json: 'application/json' };
const web = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[p.split('.').pop()] || 'application/octet-stream' }); res.end(readFileSync(p)); }).listen(WEB);
const health = async () => (await fetch(HEALTH)).json();

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(name, room = '') {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const p = await ctx.newPage(), errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://localhost:${WEB}/online.html?ref=` +encodeURIComponent(REF), { timeout: 90000, waitUntil: 'domcontentloaded' }); // fonts from the internet can hold 'load' for long
  await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }).catch((e) => { console.error('page errors:', errors); throw e; });
  await p.evaluate((n) => { window.__sq.me.n = n; }, name);
  if (room) await p.evaluate((c) => window.__sq.enterRoom(c, false), room);
  return { p, ctx, errors };
}
const until = (p, fn, arg, ms = 20000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const phase = (p) => p.evaluate(() => window.__sq.view?.phase);

try {
  console.log('1. Two players join a private room on the server');
  const A = await open('Alice', 'SRV1');
  await until(A.p, () => window.__sq.room?.kind === 'server' && window.__sq.view);
  const B = await open('Bob', 'SRV1');
  check(await until(B.p, () => window.__sq.room?.peers().length === 2), 'Bob sees both players');
  check(await until(A.p, () => window.__sq.room?.peers().length === 2), 'Alice sees both players');
  check((await health()).players === 2, 'the server counts 2 players in 1 room');
  check(!(await A.p.evaluate(() => window.__sq.isHost)) && !(await B.p.evaluate(() => window.__sq.isHost)), 'neither page is the referee');
  check(await until(A.p, () => !!document.querySelector('#start')), 'the owner (first in) gets Start');
  check(!(await B.p.evaluate(() => !!document.querySelector('#start'))), 'the other player does not');
  console.log('2. Mode and Start from the owner, run by the server');
  // team play paused (Cody 2026-10-03): no Nice vs Naughty button, and the room stays "Everyone vs the hat" on both screens
  check(!(await A.p.evaluate(() => !!document.querySelector('[data-mode="team"]'))) && !!(await A.p.evaluate(() => document.querySelector('[data-mode="ffa"]'))), 'team play paused: only "Everyone vs the hat" is offered');
  check(await until(B.p, () => window.__sq.view?.mode === 'ffa'), 'the room is FFA on both screens');
  await A.p.evaluate(() => document.querySelector('#start')?.click());
  check(await until(B.p, () => window.__sq.view?.phase === 'intro'), 'Start → the load screen on both screens');
  check(await until(A.p, () => window.__sq.view?.phase === 'play', null, 40000), 'round 1 starts after the countdown');
  check(!(await A.p.evaluate(() => window.__sq.isHost)) && !(await A.p.evaluate(() => window.__sq.sim)), 'still no referee in any page during play');
  console.log("3. Bob's moves reach the server and come back to Alice");
  const bobAt = () => A.p.evaluate(() => { const s = window.__sq, me = s.view.ents.find((e) => !e.bot && e.peer !== s.me.id); return me && { x: me.x, z: me.z }; });
  const start = await bobAt();
  // hold D until Alice's screen shows Bob 1+ away (test browsers draw ~3 frames a second: wait for the state, not a fixed time)
  await B.p.bringToFront(); await B.p.keyboard.down('KeyD');
  await until(A.p, (st) => { const s = window.__sq, b = s.view?.ents.find((e) => !e.bot && e.peer !== s.me.id); return b && Math.hypot(b.x - st.x, b.z - st.z) > 1; }, start, 15000);
  await B.p.keyboard.up('KeyD');
  const moved = await bobAt();
  check(start && moved && Math.hypot(moved.x - start.x, moved.z - start.z) > 1, `Bob walked on Alice's screen (${JSON.stringify(start)} → ${JSON.stringify(moved)})`);
  console.log('4. Emotes travel through the server');
  await A.p.evaluate(() => { window.__emo = []; window.__sq.room.on('emote', (e) => window.__emo.push(e)); });
  await B.p.evaluate(() => document.querySelector('#emotes [data-e="2"]')?.click());
  check(await until(A.p, () => window.__emo.some((e) => e.e === 2 && e.p !== window.__sq.me.id)), "Bob's emote reaches Alice");
  console.log('5. Lobby list comes from the server; leaving cleans up');
  const C = await open('Carol', 'PF2');
  check(await until(A.p, () => true), 'Carol opened an Auto match room');
  await C.p.evaluate(() => window.__sq.leaveRoom());
  await B.p.evaluate(() => window.__sq.leaveRoom());
  check(await until(A.p, () => window.__sq.room?.peers().length === 1), 'Bob leaving shows on Alice');
  await A.p.evaluate(() => window.__sq.leaveRoom()); await A.p.waitForTimeout(500);
  check((await health()).rooms === 0, 'every room is gone once everyone left: ' + JSON.stringify(await health()));
  for (const x of [A, B, C]) check(!x.errors.length, 'no page errors: ' + x.errors.join(' | '));
} finally { await browser.close(); door.kill(); web.close(); }
if (fails.length) { console.error('FAIL', fails); process.exit(1); }
console.log('OK: the page plays on the referee server: shared room, owner-only controls, the server runs the match, moves and emotes travel, clean exit');
