// The Season card on the Play page (mockups/seasonui.js). SEASON POINTS (Cody, 2026-10-04): a guest sees today's real 5 tasks
// (+100 each), the calendar of perfect days, and the TRACK of 30 doors with every door's free prize and pass prize (pass prizes
// locked); a signed-in player's card shows the server's answer (task progress, today's points, total points and the bar to the
// next door, opened doors, prizes got, the streak, the pass); "Get the pass" asks the shop for kind 'pass'. A failed read says so
// instead of showing zero progress. Desktop and phone screenshots in out/. Run: node season-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path'; import http from 'http';
import { seasonAt, dayKey, seasonDays, tasksFor, freeReward, goldReward, DOORS, DOOR_POINTS } from '../../mockups/seasons.js';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync('out', { recursive: true });
const S = seasonAt(); if (!S) { console.log('no season running today: nothing to show'); process.exit(0); }
const DAY = dayKey(), ALL = seasonDays(S), IDX = ALL.indexOf(DAY), TASKS = tasksFor(DAY), DOORLIST = Array.from({ length: DOORS }, (_, i) => i + 1);
// a signed-in player with the pass, 2,180 points (7 doors), a perfect day every day so far but today; today: Log in done, 230 points
const POINTS_NOW = 2180, OPEN = Math.floor(POINTS_NOW / DOOR_POINTS), perfect = ALL.slice(0, IDX);
const grantsFor = (track, n) => DOORLIST.slice(0, n).map((d) => { const r = track === 'free' ? freeReward(S, d) : goldReward(S, d); if (!r) return null;
  return { door: d, track, item: r.kind === 'item' ? r.item : null, xp: r.kind === 'xp' ? 1 : null, tickets: r.kind === 'tickets' ? r.n : null }; }).filter(Boolean);
const me = { season: { id: S.id, name: S.name, costume: S.costume, passPrice: 2, endsAt: S.end, startsAt: S.start }, day: DAY, dayEndsAt: Date.now() + 5 * 3600e3,
  tasks: TASKS.map((t, i) => ({ id: t.id, text: t.text, need: t.need, have: i === 0 ? t.need : Math.floor(t.need / 2), done: i === 0 })),
  points: POINTS_NOW, doors: OPEN, nextAt: (OPEN + 1) * DOOR_POINTS, today: { points: 230, matches: 3, top3: 1, max: 700 },
  days: ALL.map((d) => ({ day: d, perfect: perfect.includes(d), points: perfect.includes(d) ? 600 : d === DAY ? 230 : 0 })), streak: perfect.length, pass: true,
  granted: [...grantsFor('free', OPEN), ...grantsFor('gold', OPEN)],
  plan: { free: DOORLIST.map((d) => freeReward(S, d)), gold: DOORLIST.map((d) => goldReward(S, d)) } };
let answer = me; const got = [];
const web = http.createServer(async (req, res) => {
  if (req.method === 'GET') { const pth = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'online.html');
    if (!pth.startsWith(ROOT) || !existsSync(pth)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': pth.endsWith('.js') ? 'text/javascript' : pth.endsWith('.png') ? 'image/png' : 'text/html' }); return res.end(readFileSync(pth)); }
  const chunks = []; for await (const c of req) chunks.push(c); const body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); got.push(body);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body.action === 'season' ? answer : body.action === 'settings' ? {} : { error: 'stand-in' }));
}).listen(8786);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const errors = [];
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.startsWith('http://localhost:8786/')) return route.continue();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  return route.fulfill({ status: 503, body: '' }); });
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://localhost:8786/online.html?net=local&token=test-token&server=' + encodeURIComponent('http://localhost:8786/api'), { timeout: 90000 });
p.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
await p.waitForFunction(() => window.__sq && !document.querySelector('#season').hidden, null, { timeout: 90000 }).catch(async (e) => { console.log('page errors:', errors, await p.evaluate(() => [!!window.__sq, document.querySelector('#season')?.hidden])); throw e; }); await p.waitForTimeout(800);
const read = () => p.evaluate(() => ({
  eyebrow: document.querySelector('#ssEyebrow').textContent, title: document.querySelector('#ssTitle').textContent,
  tasks: [...document.querySelectorAll('#ssTasks li')].map((l) => [l.querySelector('span').textContent, l.querySelector('b').textContent, l.classList.contains('done'), l.querySelector('.pts')?.textContent]),
  today: document.querySelector('#ssToday').textContent, note: document.querySelector('#ssNote').textContent,
  cal: [...document.querySelectorAll('#ssCal li:not(.pad)')].map((l) => l.className), pads: document.querySelectorAll('#ssCal li.pad').length,
  doors: [...document.querySelectorAll('#ssDoors li')].map((l) => ({ cls: l.className, n: l.querySelector('.dn').textContent, label: l.getAttribute('aria-label'),
    free: { img: !!l.querySelector('.pz.f img'), tag: l.querySelector('.pz.f .ptag')?.textContent || '', got: l.querySelector('.pz.f').classList.contains('got') },
    gold: l.querySelector('.pz.g') ? { img: !!l.querySelector('.pz.g img'), got: l.querySelector('.pz.g').classList.contains('got'), locked: l.querySelector('.pz.g').classList.contains('locked') } : null })),
  trackHead: document.querySelector('#ssTrackHead').textContent, points: document.querySelector('#ssPoints').textContent, bar: document.querySelector('#ssBar').style.width,
  freeNote: document.querySelector('#ssFreeNote').textContent,
  gold: [...document.querySelectorAll('#ssGold li')].map((l) => [l.className, !!l.querySelector('img'), l.querySelector('small').textContent]),
  goldHead: document.querySelector('#ssGoldHead').textContent, goldLead: document.querySelector('#ssGoldLead').textContent, buyHidden: document.querySelector('#ssBuy').hidden, buyText: document.querySelector('#ssBuy').textContent,
  streak: document.querySelector('#ssStreak').textContent, reset: document.querySelector('#ssReset').textContent, side: document.querySelector('#pgSeason').textContent,
  accent: document.querySelector('#season').dataset.season,
  how: [...document.querySelectorAll('.sshow li')].map((l) => l.textContent.trim()), outName: document.querySelector('#ssOutName').textContent, outfitImg: !!document.querySelector('#ssOutfit img'),
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
const kindOf = (d) => (d.img ? 'item' : /ticket/i.test(d.tag) ? 'tickets' : /level/i.test(d.tag) ? 'xp' : '?');

console.log('1. A guest: the real tasks and calendar, the 30-door track with every prize, nothing earned, the pass for sale');
let v = await read();
check(v.title === `The ${S.name} Pass` && v.accent === S.id && /days? left/.test(v.eyebrow), `heading "${v.title}", "${v.eyebrow}", ${S.id} colours`);
check(JSON.stringify(v.tasks.map((t) => t[0])) === JSON.stringify(TASKS.map((t) => t.text)) && v.tasks.length === 5 && v.tasks.every((t) => /^0\/\d+$/.test(t[1]) && !t[2] && t[3] === '+100'), `today's 5 tasks from seasons.js, +100 each, none done: ${v.tasks.map((t) => t[0] + ' ' + t[1]).join(' | ')}`);
check(TASKS[0].text === 'Log in' && TASKS[1].text === 'Play 2 Auto matches', '"Log in" and "Play 2 Auto matches" every day');
check(/up to 700 pts a day/.test(v.today) && /Sign in to earn points/.test(v.note), `a guest: "${v.today}", told to sign in`);
check(v.cal.length === ALL.length && v.cal[IDX] === 'today' && v.cal.slice(0, IDX).every((c) => c === 'missed') && v.cal.slice(IDX + 1).every((c) => c === 'shut'), `the calendar: ${ALL.length} days, today (${DAY}) ringed`);
const [y, m, d] = ALL[0].split('-').map(Number); check(v.pads === new Date(Date.UTC(y, m - 1, d)).getUTCDay(), `the 1st sits under its weekday (${v.pads} blanks)`);
check(v.how.length === 3 && /points/.test(v.how[0]) && /300 points/.test(v.how[1]) && /a prize/.test(v.how[2]) && /costume/.test(v.how[2]), 'how it works, in 3 steps: ' + v.how.join(' / '));
check(v.doors.length === DOORS && v.doors.every((x, i) => x.n === String(i + 1)), `${DOORS} doors, numbered`);
check(v.doors.every((x, i) => kindOf(x.free) === freeReward(S, i + 1).kind && !!x.gold === !!goldReward(S, i + 1)), 'EVERY door shows its prize for everyone; only the 6 costume doors show a pass piece');
check(v.doors.filter((x) => x.gold).length === 6 && v.doors.filter((x) => x.free.tag === '+1 leveltick').length === 8, `6 pass pieces, 8 "+1 level tick" doors (${v.doors.filter((x) => x.free.tag === '+1 leveltick').length})`);
{ const names = await p.evaluate(() => [...document.querySelectorAll('#ssDoors li')].map((l) => [...l.querySelectorAll('.pz')].map((z) => [!!z.querySelector('img'), z.querySelector('.pname')?.textContent || ''])));
  const items = names.flat().filter(([img]) => img);
  check(items.length === 13 && items.every(([, nm]) => nm && nm !== 'a costume piece') && names[1][0][1] === 'Candy Corn' && names[14][0][1] === 'Elf Hat' && names[1][1][1] === 'Pumpkin King',
    `every item on a door is labelled with its name (${items.length}: ${items.slice(0, 4).map(([, nm]) => nm).join(', ')}, …)`); }
check(v.doors.filter((x) => x.gold).every((x) => x.gold.locked) && v.doors[0].cls === 'next' && v.doors.slice(1).every((x) => x.cls.startsWith('future')), 'no pass: the costume pieces show a lock; door 1 is next');
check(/Door 15 \(4,500 points\): Elf Hat/.test(v.doors[14].label) && /Door 30 \(9,000 points\): I\.C\.E\. Kevlar Vest/.test(v.doors[29].label) && /with the pass: /.test(v.doors[1].label), `each door says what it gives: "${v.doors[14].label}" / "${v.doors[1].label}"`);
check(/^0 points · next door at 300$/.test(v.points) && v.bar === '0%', `points: "${v.points}"`);
check(v.outName === `The ${S.costume}` && v.outfitImg && v.gold.length === S.gold.length && v.gold.every((g) => g[1]), `the pass preview: "${v.outName}", ${v.gold.length} pieces with pictures`);
check(/doors 2, 6, 10, 14, 18, 22/.test(v.goldLead) && !/ticket|level/.test(v.goldLead), `the pass is just the costume: "${v.goldLead.slice(0, 120)}…"`);
check(!v.buyHidden && v.buyText === 'Get the pass · $2.00' && /\$2\.00/.test(v.goldHead), `"${v.buyText}" (${v.goldHead})`);
check(/^\d+h \d{2}m$/.test(v.reset), `new tasks countdown ${v.reset}`);
await p.click('#ssBuy'); await p.waitForTimeout(300);
check(/Sign in first/.test(await p.textContent('#ssBuyNote')), 'a guest\'s pass button asks them to sign in, nothing sent');
check(!got.some((b) => b.action === 'shop-quote'), 'no price asked for a guest');
await p.screenshot({ path: 'out/season-guest.png', clip: await p.locator('#season').boundingBox() });

console.log('2. Signed in with the pass: the server\'s answer');
await p.evaluate(async () => (await import('./seasonui.js')).refreshSeason({ id: 'p1' })); await p.waitForTimeout(800);
v = await read();
check(got.some((b) => b.action === 'season'), 'asked the game server for my season (which ticks "Log in")');
check(v.tasks[0][2] && v.tasks[0][1] === '1/1' && !v.tasks[1][2], `progress per task: ${v.tasks.map((t) => t[1] + (t[2] ? '✓' : '')).join(' ')}`);
check(/today 230 \/ 700 pts/.test(v.today) && /3 of 10 scored/.test(v.note), `today: "${v.today}", "${v.note.slice(0, 60)}"`);
check(v.cal.slice(0, IDX).every((c) => c === 'open') && v.cal[IDX] === 'today', `perfect days lit (${IDX})`);
check(v.trackHead === `Your doors · ${OPEN} of ${DOORS} open` && v.points === '2,180 points · next door at 2,400' && Math.abs(parseFloat(v.bar) - ((POINTS_NOW - OPEN * DOOR_POINTS) / DOOR_POINTS) * 100) < 0.01, `"${v.trackHead}", "${v.points}", bar ${v.bar}`);
check(v.doors.slice(0, OPEN).every((x) => x.cls.startsWith('open') && x.free.got && (!x.gold || (x.gold.got && !x.gold.locked))) && v.doors[OPEN].cls.startsWith('next') && v.doors.slice(OPEN + 1).every((x) => x.cls.startsWith('future')), `doors 1–${OPEN} open, prizes and pieces ticked; door ${OPEN + 1} next`);
const piecesGot = [2, 6].filter((dd) => dd <= OPEN).length;
check(v.gold.filter((g) => g[0] === 'own').length === piecesGot && v.goldHead.includes(`yours · ${piecesGot} of ${S.gold.length} pieces`) && v.buyHidden, `pass owned: "${v.goldHead}", no buy button`);
check(v.streak.includes(`${perfect.length} perfect day`), `"${v.streak.slice(0, 50)}"`);
check(v.side.startsWith(S.name) && v.side.includes(`door ${OPEN} of ${DOORS}`) && v.side.includes('pass'), `Player Progress line: "${v.side}"`);
await p.screenshot({ path: 'out/season-signed-in.png', clip: await p.locator('#season').boundingBox() });

console.log('3. All 5 done, no pass: a perfect day; the buy button asks the shop for kind "pass"');
answer = { ...me, pass: false, granted: me.granted.filter((g) => g.track !== 'gold'), tasks: me.tasks.map((t) => ({ ...t, have: t.need, done: true })), days: me.days.map((x) => (x.day === DAY ? { ...x, perfect: true } : x)), streak: IDX + 1 };
await p.evaluate(async () => (await import('./seasonui.js')).refreshSeason({ id: 'p1' })); await p.waitForTimeout(600);
v = await read();
check(/perfect day/.test(v.note) && v.cal[IDX] === 'open', 'all 5 done: today shows as a perfect day');
check(!v.buyHidden && v.gold.every((g) => g[0] !== 'own') && v.doors.filter((x) => x.gold).every((x) => x.gold.locked), 'no pass: costume pieces locked, buy button shown');
await p.click('#ssBuy'); await p.waitForTimeout(1200);
const q = got.filter((b) => b.action === 'shop-quote').at(-1);
check(q?.kind === 'pass', `asked the shop for a pass price (${JSON.stringify(q)})`);
check((await p.textContent('#ssBuyNote')).length > 0, `the refusal is shown: "${await p.textContent('#ssBuyNote')}"`);

console.log('4. The server read fails: it says so, never a fake zero');
answer = { error: 'something went wrong on our side; please try again' };
await p.evaluate(async () => (await import('./seasonui.js')).refreshSeason({ id: 'p1' })); await p.waitForTimeout(500);
check(/Couldn't load your progress/.test((await read()).note), 'failed read: "Couldn\'t load your progress"');

console.log('5. Phone width: no sideways scroll, 5 doors a row');
answer = me; await p.setViewportSize({ width: 375, height: 800 });
await p.evaluate(async () => (await import('./seasonui.js')).refreshSeason({ id: 'p1' })); await p.waitForTimeout(800);
v = await read();
check(!v.overflow, 'no sideways scroll at 375 px');
const box = await p.locator('#season').boundingBox(); check(box.width <= 375, `card fits (${Math.round(box.width)} px)`);
const rowTops = await p.evaluate(() => [...document.querySelectorAll('#ssDoors li')].slice(0, 6).map((l) => Math.round(l.getBoundingClientRect().top)));
check(rowTops.slice(0, 5).every((t) => t === rowTops[0]) && rowTops[5] > rowTops[0], 'doors sit 5 to a row on a phone');
await p.screenshot({ path: 'out/season-phone.png', clip: box });
check(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close(); web.close();
if (fails.length) { console.log('FAIL:', fails.length); process.exit(1); }
console.log('OK: Season card (points): guest view (5 tasks +100 each, calendar, 30 doors each showing its free and pass prize, pass locked, for sale, sign-in asked), signed-in (today\'s points, total and the bar to the next door, opened doors with prizes ticked, perfect days, streak, pass), the buy path asks for kind "pass", a failed read says so, 5 doors a row on a phone');
