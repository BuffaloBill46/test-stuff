// FRIENDS TOGETHER + GAMES WAITING FOR PLAYERS (Cody, 2026-10-03), on a REAL local match server (worker/referee.mjs) with four
// real browsers: a stranger waits in a public Auto match; someone on the Play page sees it under "Games waiting for players";
// two friends in a private room: only the host gets "Auto match together", and pressing it moves BOTH into a public match
// (where it counts) together, into the room the stranger is waiting in; the waiting list updates; Join from the Play page
// takes the viewer into the same game. Needs: npm install in worker/. Run: node friends-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync, spawn } from 'child_process'; import path from 'path'; import { fileURLToPath } from 'url';
import http from 'http';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const PORT = 8093, REF = `ws://localhost:${PORT}`, HEALTH = `http://localhost:${PORT}/health`;
const door = spawn(process.execPath, [fileURLToPath(new URL('../../worker/referee.mjs', import.meta.url))], { env: { ...process.env, PORT: String(PORT) }, stdio: 'inherit' });
for (let i = 0; i < 40; i++) { try { await fetch(HEALTH); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
const WEB = 8097, TYPES = { js: 'text/javascript', html: 'text/html', png: 'image/png', css: 'text/css', json: 'application/json' };
const web = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[p.split('.').pop()] || 'application/octet-stream' }); res.end(readFileSync(p)); }).listen(WEB);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function open(name, hash = '#play') {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('santa.coached', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(name + ': ' + e.message));
  await p.goto(`http://localhost:${WEB}/online.html?ref=${encodeURIComponent(REF)}${hash}`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__sq, null, { timeout: 90000 });
  await p.evaluate((n) => { window.__sq.me.n = n; }, name);
  return p;
}
const until = (p, fn, arg, ms = 20000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const code = (p) => p.evaluate(() => window.__sq.room?.code?.());
const waitRows = (p) => p.evaluate(() => [...document.querySelectorAll('#waitList .wg')].map((d) => d.textContent.replace(/\s+/g, ' ').trim()));

try {
  console.log('1. A stranger waits in a public Auto match; the Play page lists it');
  const S = await open('Stranger');
  await S.evaluate(() => window.__sq.enterRoom('', true));
  check(await until(S, () => /^P[FT]/.test(window.__sq.room?.code?.() || '') && window.__sq.view?.phase === 'lobby'), `the stranger waits in ${await code(S)}`);
  const sCode = await code(S);
  const V = await open('Viewer');
  check(await until(V, (c) => [...document.querySelectorAll('#waitList [data-join]')].some((b) => b.dataset.join === c), sCode), `the Play page lists it: ${(await waitRows(V)).join(' | ')}`);
  check((await waitRows(V)).some((r) => r.includes('1/8')), 'with its player count');
  await V.screenshot({ path: 'out/waiting-games.png', clip: await V.locator('#waiting').boundingBox() });

  console.log('2. Two friends in a private room go to a public match together');
  const A = await open('Alice'); await A.evaluate(() => window.__sq.enterRoom('FRND77', false));
  await until(A, () => window.__sq.room?.kind === 'server' && window.__sq.view);
  const B = await open('Bob'); await B.evaluate(() => window.__sq.enterRoom('FRND77', false));
  check(await until(A, () => window.__sq.room?.peers().length === 2), 'both in the friends\' room');
  check(await until(A, () => !!document.querySelector('#panel [data-act="together"]')), 'the host sees "Auto match together"');
  check(!(await B.evaluate(() => !!document.querySelector('#panel [data-act="together"]'))), 'the other friend does not');
  await A.screenshot({ path: 'out/together-button.png' });
  await A.click('#panel [data-act="together"]');
  check(await until(A, (c) => window.__sq.room?.code?.() === c, sCode) && await until(B, (c) => window.__sq.room?.code?.() === c, sCode), `both friends land in the stranger's public game ${sCode}`);
  check(await until(S, () => window.__sq.room?.peers().filter((x) => !x.w).length === 3), 'the stranger sees 3 players');
  check(await until(V, (c) => [...document.querySelectorAll('#waitList .wg')].some((d) => d.textContent.includes('3/8')), sCode), `the waiting list updates: ${(await waitRows(V)).join(' | ')}`);

  console.log('3. Join from the Play page');
  await V.click(`#waitList [data-join="${sCode}"]`);
  check(await until(V, (c) => window.__sq.room?.code?.() === c, sCode), 'Join takes the viewer into the same game');
  check(await until(S, () => window.__sq.room?.peers().filter((x) => !x.w).length === 4), '4 players waiting together');
} finally {
  check(!errors.length, 'no page errors ' + errors.join(' | '));
  await browser.close(); web.close(); door.kill();
}
if (fails.length) { console.log('FAIL:', fails.length); process.exit(1); }
console.log('OK: friends move from a private room into a public Auto match together (host only, same room as the stranger); the Play page lists waiting games live and Join works');
