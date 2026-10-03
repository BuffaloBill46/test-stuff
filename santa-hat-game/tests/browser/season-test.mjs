// The Season card on the Play page (Cody, 2026-10-03; mockups/seasonui.js). A guest sees today's real 3 tasks, the season's
// calendar (today ringed, nothing opened) and both reward tracks; a signed-in player's card shows the server's answer (tasks
// with progress, opened doors, the streak, earned looks, the pass and its pieces); "Get the pass" asks the shop for kind 'pass'.
// A failed read says so instead of showing zero progress. Desktop and phone screenshots in out/. Run: node season-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path'; import http from 'http';
import { seasonAt, dayKey, seasonDays, tasksFor, freeReward, goldReward } from '../../mockups/seasons.js';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync('out', { recursive: true });
const S = seasonAt(); if (!S) { console.log('no season running today: nothing to show'); process.exit(0); }
const DAY = dayKey(), ALL = seasonDays(S), IDX = ALL.indexOf(DAY), TASKS = tasksFor(DAY);
// a signed-in player who opened every day so far but today, with the pass: today's first task done, the others part way
const opened = ALL.slice(0, IDX);
const me = { season: { id: S.id, name: S.name, costume: S.costume, passPrice: 5, endsAt: S.end, startsAt: S.start }, day: DAY, dayEndsAt: Date.now() + 5 * 3600e3,
  tasks: TASKS.map((t, i) => ({ id: t.id, text: t.text, need: t.need, have: i === 0 ? t.need : Math.floor(t.need / 2), done: i === 0 })),
  doors: opened.length, days: ALL.map((d) => ({ day: d, door: opened.includes(d) })), streak: opened.length, pass: true,
  granted: [...opened.map((_, i) => ({ door: i + 1, track: 'free', item: freeReward(S, i + 1).item || null, xp: freeReward(S, i + 1).item ? null : 1 })),
    ...opened.map((_, i) => goldReward(S, i + 1) && { door: i + 1, track: 'gold', item: goldReward(S, i + 1).item }).filter(Boolean)],
  plan: { free: ALL.map((_, i) => freeReward(S, i + 1)), gold: ALL.map((_, i) => goldReward(S, i + 1)) } };
let answer = me; const got = [];
const web = http.createServer(async (req, res) => {
  if (req.method === 'GET') { const pth = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'online.html');
    if (!pth.startsWith(ROOT) || !existsSync(pth)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': pth.endsWith('.js') ? 'text/javascript' : pth.endsWith('.png') ? 'image/png' : 'text/html' }); return res.end(readFileSync(pth)); }
  const chunks = []; for await (const c of req) chunks.push(c); const body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); got.push(body);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body.action === 'season' ? answer : body.action === 'settings' ? {} : { error: 'stand-in' }));
}).listen(8795);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const errors = [];
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.startsWith('http://localhost:8795/')) return route.continue();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  return route.fulfill({ status: 503, body: '' }); });
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://localhost:8795/online.html?net=local&token=test-token&server=' + encodeURIComponent('http://localhost:8795/api'), { timeout: 90000 });
p.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
await p.waitForFunction(() => window.__sq && !document.querySelector('#season').hidden, null, { timeout: 90000 }).catch(async (e) => { console.log('page errors:', errors, await p.evaluate(() => [!!window.__sq, document.querySelector('#season')?.hidden])); throw e; }); await p.waitForTimeout(800);
const read = () => p.evaluate(() => ({
  eyebrow: document.querySelector('#ssEyebrow').textContent, title: document.querySelector('#ssTitle').textContent,
  tasks: [...document.querySelectorAll('#ssTasks li')].map((l) => [l.querySelector('span').textContent, l.querySelector('b').textContent, l.classList.contains('done')]),
  note: document.querySelector('#ssNote').textContent,
  cal: [...document.querySelectorAll('#ssCal li:not(.pad)')].map((l) => l.className), pads: document.querySelectorAll('#ssCal li.pad').length,
  free: [...document.querySelectorAll('#ssFree li')].map((l) => [l.className, !!l.querySelector('img'), l.querySelector('small').textContent]),
  gold: [...document.querySelectorAll('#ssGold li')].map((l) => [l.className, !!l.querySelector('img'), l.querySelector('small').textContent]),
  goldHead: document.querySelector('#ssGoldHead').textContent, buyHidden: document.querySelector('#ssBuy').hidden, buyText: document.querySelector('#ssBuy').textContent,
  streak: document.querySelector('#ssStreak').textContent, reset: document.querySelector('#ssReset').textContent, side: document.querySelector('#pgSeason').textContent,
  accent: document.querySelector('#season').dataset.season,
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));

console.log('1. A guest: the real tasks and calendar, nothing opened, both reward tracks, the pass for sale');
let v = await read();
check(v.title === `The ${S.name} Calendar` && v.accent === S.id && /days? left/.test(v.eyebrow), `heading "${v.title}", "${v.eyebrow}", ${S.id} colours`);
check(JSON.stringify(v.tasks.map((t) => t[0])) === JSON.stringify(TASKS.map((t) => t.text)) && v.tasks.every((t) => /^0\/\d+$/.test(t[1]) && !t[2]), `today's 3 tasks from seasons.js, none done: ${v.tasks.map((t) => t[0] + ' ' + t[1]).join(' | ')}`);
check(/Sign in to open doors/.test(v.note), 'tells a guest to sign in');
check(v.cal.length === ALL.length && v.cal[IDX] === 'today' && v.cal.slice(0, IDX).every((c) => c === 'missed') && v.cal.slice(IDX + 1).every((c) => c === 'shut'), `${ALL.length} days, today (${DAY}) ringed, earlier days missed, later ones shut`);
const [y, m, d] = ALL[0].split('-').map(Number); check(v.pads === new Date(Date.UTC(y, m - 1, d)).getUTCDay(), `the 1st sits under its weekday (${v.pads} blanks)`);
check(v.free.length === Object.keys(S.free).length && v.free.every((f) => f[1] && /^Door \d+$/.test(f[2])), `free looks with thumbnails and door numbers (${v.free.map((f) => f[2]).join(', ')})`);
check(v.gold.length === S.gold.length && v.gold.map((g) => g[2]).join() === S.gold.map((_, i) => 'Door ' + (i + 1) * 3).join(), `the pass: ${S.gold.length} pieces at doors 3, 6, … (${v.gold.filter((g) => g[1]).length} with pictures)`);
check(!v.buyHidden && v.buyText === 'Get the pass · $5.00' && /\$5\.00/.test(v.goldHead), `"${v.buyText}" (${v.goldHead})`);
check(/^\d+h \d{2}m$/.test(v.reset), `new tasks countdown ${v.reset}`);
await p.click('#ssBuy'); await p.waitForTimeout(300);
check(/Sign in first/.test(await p.textContent('#ssBuyNote')), 'a guest\'s pass button asks them to sign in, nothing sent');
check(!got.some((b) => b.action === 'shop-quote'), 'no price asked for a guest');
await p.screenshot({ path: 'out/season-guest.png', clip: await p.locator('#season').boundingBox() });

console.log('2. Signed in: the server\'s answer');
await p.evaluate(async () => (await import('./seasonui.js')).refreshSeason({ id: 'p1' })); await p.waitForTimeout(800);
v = await read();
check(got.some((b) => b.action === 'season'), 'asked the game server for my season');
check(v.tasks[0][2] && v.tasks[0][1] === `${TASKS[0].need}/${TASKS[0].need}` && !v.tasks[1][2], `progress per task: ${v.tasks.map((t) => t[1] + (t[2] ? '✓' : '')).join(' ')}`);
check(/Finish all 3/.test(v.note), 'today not done yet: says what opens the door');
check(v.cal.slice(0, IDX).every((c) => c === 'open') && v.cal[IDX] === 'today', `opened days lit (${IDX})`);
const looksEarned = Object.keys(S.free).filter((k) => +k <= opened.length).length, piecesEarned = Math.floor(opened.length / 3);
check(v.free.filter((f) => f[0] === 'own' && f[2] === 'Yours').length === looksEarned, `earned looks marked Yours (${looksEarned})`);
check(v.gold.filter((g) => g[0] === 'own').length === piecesEarned && v.goldHead.includes(`${piecesEarned} of ${S.gold.length} pieces`) && v.buyHidden, `pass owned: "${v.goldHead}", no buy button`);
check(v.streak.includes(`${opened.length} door`) && v.streak.includes(`streak ${opened.length} day`), `"${v.streak.slice(0, 50)}"`);
check(v.side.startsWith(S.name) && v.side.includes(`${opened.length} door`) && v.side.includes('pass'), `Player Progress line: "${v.side}"`);
await p.screenshot({ path: 'out/season-signed-in.png', clip: await p.locator('#season').boundingBox() });

console.log('3. Today done, no pass: the buy button asks the shop for kind "pass"');
answer = { ...me, pass: false, granted: me.granted.filter((g) => g.track !== 'gold'), tasks: me.tasks.map((t) => ({ ...t, have: t.need, done: true })), days: me.days.map((x) => (x.day === DAY ? { ...x, door: true } : x)), doors: IDX + 1, streak: IDX + 1 };
await p.evaluate(async () => (await import('./seasonui.js')).refreshSeason({ id: 'p1' })); await p.waitForTimeout(600);
v = await read();
check(/door is open/.test(v.note) && v.cal[IDX] === 'open', 'all 3 done: today\'s door shows open');
check(!v.buyHidden && v.gold.every((g) => g[0] !== 'own'), 'no pass: no pieces yet, buy button shown');
await p.click('#ssBuy'); await p.waitForTimeout(1200);
const q = got.filter((b) => b.action === 'shop-quote').at(-1);
check(q?.kind === 'pass', `asked the shop for a pass price (${JSON.stringify(q)})`);
check((await p.textContent('#ssBuyNote')).length > 0, `the refusal is shown: "${await p.textContent('#ssBuyNote')}"`);

console.log('4. The server read fails: it says so, never a fake zero');
answer = { error: 'something went wrong on our side; please try again' };
await p.evaluate(async () => (await import('./seasonui.js')).refreshSeason({ id: 'p1' })); await p.waitForTimeout(500);
check(/Couldn't load your progress/.test((await read()).note), 'failed read: "Couldn\'t load your progress"');

console.log('5. Phone width: no sideways scroll, everything stacked');
answer = me; await p.setViewportSize({ width: 375, height: 800 });
await p.evaluate(async () => (await import('./seasonui.js')).refreshSeason({ id: 'p1' })); await p.waitForTimeout(800);
v = await read();
check(!v.overflow, 'no sideways scroll at 375 px');
const box = await p.locator('#season').boundingBox(); check(box.width <= 375, `card fits (${Math.round(box.width)} px)`);
await p.screenshot({ path: 'out/season-phone.png', clip: box });
check(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close(); web.close();
if (fails.length) { console.log('FAIL:', fails.length); process.exit(1); }
console.log('OK: Season card: guest view (real tasks, calendar, both tracks, pass for sale, sign-in asked), signed-in progress (tasks, doors, earned looks and pieces, streak, pass), the buy path asks for kind "pass", a failed read says so, fits a phone');
