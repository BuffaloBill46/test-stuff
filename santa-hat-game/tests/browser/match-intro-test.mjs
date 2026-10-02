// The match load screen and countdown on the page (Cody, 2026-10-01): Start → the load screen (every player: level, games played,
// top-3 %, rank points, special snowballs, special gear) for 5 s → a big 5…1 countdown → round 1. Nobody can move or throw
// until round 1. With a game server, the numbers come from its public 'stats' action (asked once per match, signed in or not);
// without one they show as dashes, with a note. Fits on phones. Local stand-in accounts (?net=local).
// Run: node match-intro-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const PID = '11111111-2222-4333-8444-555555555555';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(viewport, touch, server) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch }), asked = [];
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url === 'http://localhost/fn') { const b = JSON.parse(route.request().postData() || '{}'); asked.push({ ...b, auth: !!route.request().headers().authorization });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(b.action === 'stats' ? { players: b.profiles.includes(PID) ? [{ id: PID, games: 42, top3: 16, top3Pct: 38, level: 8, rankPoints: 1250 }] : [] } : {}) }); }
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.fulfill({ status: 503, body: '' }); });
  const p = await ctx.newPage(), errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost/online.html?net=local' + (server ? '&server=http://localhost/fn' : ''), { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1200);
  // a level-8 player with Ice Ball and Sky Ball in SB1/SB2 (and, with the server, an account)
  await p.evaluate((pid) => { const s = window.__sq; s.me.l = 8; s.me.pid = pid; Object.assign(s.me.a, { sb1: 'sb_ice', sb2: 'sb_sky', sb3: 'sb_none' }); s.startPractice(); }, server ? PID : null);
  await p.waitForTimeout(2500); await p.evaluate(() => document.querySelector('#start')?.click());
  await p.waitForFunction(() => window.__sq.sim.S.phase === 'intro' && document.querySelector('#panel.intro .lineup'), null, { timeout: 30000 });
  return { p, ctx, errors, asked };
}
const myRow = (p) => p.evaluate(() => document.querySelector('#panel .lineup li.me')?.textContent.replace(/\s+/g, ' ').trim() || '');
const rows = (p) => p.evaluate(() => [...document.querySelectorAll('#panel .lineup li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()));
const mine = (p) => p.evaluate(() => { const s = window.__sq, e = s.sim.S.ents.find((x) => x.peer === s.me.id); return { x: +e.x.toFixed(3), z: +e.z.toFixed(3), ammo: e.ammo }; });
const fits = (p, sel) => p.evaluate((sel) => { const el = document.querySelector(sel), r = el.getBoundingClientRect();
  return { inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, scroll: document.documentElement.scrollWidth > innerWidth, w: Math.round(r.width), h: Math.round(r.height) }; }, sel);
const until = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 15000 }).then(() => true, () => false);

console.log('1. No game server: Start opens the load screen; nobody moves or throws; then 5…1; then round 1');
{ const { p, ctx, errors } = await open({ width: 1200, height: 800 }, false, false);
  const r = await rows(p), me = await myRow(p);
  check(r.length === await p.evaluate(() => window.__sq.sim.S.ents.length), `one row per player in the match (${r.length})`);
  check(/LV 8/.test(me) && /Snowballs\s*Ice Ball · Sky Ball/.test(me) && /Gear\s*none/.test(me), 'my row: level, special snowballs, gear: ' + me);
  check(/Games\s*–/.test(me) && /Top 3\s*–/.test(me) && /Rank pts\s*–/.test(me), 'no server: the numbers are dashes');
  check(/once the game server is live/.test(await p.textContent('#panel')), 'and the screen says why');
  check(r.filter((x) => /elf bot/.test(x)).length === r.length - 1, 'the bots are listed as elf bots');
  check(r[0] === me, 'my row comes first (a full room scrolls on a phone)');
  check(/Starting in (10|9)/.test(await p.textContent('#panel h2')), 'header counts down to the start: ' + await p.textContent('#panel h2'));
  check(!(await p.evaluate(() => document.querySelector('#hud').textContent.trim())), 'no HUD yet');
  await p.screenshot({ path: 'out/intro-desktop.png' });
  const at = await mine(p); await p.keyboard.down('KeyD'); await p.waitForTimeout(2500); await p.keyboard.up('KeyD');
  await p.evaluate(() => window.__sq.throwAt(3, 3)); await p.waitForTimeout(1200);
  const now = await mine(p);
  check(now.x === at.x && now.z === at.z && now.ammo === at.ammo && !(await p.evaluate(() => window.__sq.sim.S.balls.length)), `can't move or throw on the load screen (${JSON.stringify(at)} → ${JSON.stringify(now)})`);
  await p.evaluate(() => { window.__sq.sim.S.time = 0; }); // to the countdown
  check(await until(p, () => !document.querySelector('#count').hidden && document.querySelector('#count').textContent === '5'), 'the countdown shows 5');
  check(await p.evaluate(() => document.querySelector('#panel').hidden), 'the load screen is gone during the countdown');
  const f = await fits(p, '#count'); check(f.inside, `the number is on screen (${f.w}×${f.h})`);
  await p.evaluate(() => { window.__sq.sim.S.time = 1.5; });
  check(await until(p, () => document.querySelector('#count').textContent === '2'), 'and counts down (2)');
  await p.screenshot({ path: 'out/intro-count.png' });
  const at2 = await mine(p); await p.keyboard.down('KeyD'); await p.waitForTimeout(1500); await p.keyboard.up('KeyD');
  check(JSON.stringify(await mine(p)) === JSON.stringify(at2), 'no moving during the countdown');
  await p.evaluate(() => { window.__sq.sim.S.time = 0; }); // to round 1
  await p.waitForFunction(() => window.__sq.view?.phase === 'play', null, { timeout: 15000 });
  check(await until(p, () => document.querySelector('#count').hidden && /Round 1 of 3/.test(document.querySelector('#banner').textContent)), 'round 1: the number goes, "Round 1 of 3" shows');
  check(await until(p, () => !!document.querySelector('#hud .stat')), 'the HUD is back');
  const at3 = await mine(p); await p.keyboard.down('KeyD');
  check(await p.waitForFunction((x) => { const s = window.__sq, e = s.sim.S.ents.find((q) => q.peer === s.me.id); return Math.abs(e.x - x) > 0.5; }, at3.x, { timeout: 20000 }).then(() => true, () => false), 'and now I can move');
  await p.keyboard.up('KeyD');
  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : '')); await ctx.close(); }

console.log('2. With a game server: the numbers come from its public stats action, once per match (no sign-in needed)');
{ const { p, ctx, errors, asked } = await open({ width: 1200, height: 800 }, false, true);
  check(await until(p, () => /Games\s*42/.test(document.querySelector('#panel .lineup li.me')?.textContent.replace(/\s+/g, ' ') || '')), 'my numbers arrive');
  const me = await myRow(p);
  check(/Games\s*42/.test(me) && /Top 3\s*38%/.test(me) && /Rank pts\s*1250/.test(me) && /LV 8/.test(me), 'my row: ' + me);
  await p.waitForTimeout(1500);
  const st = asked.filter((b) => b.action === 'stats');
  check(st.length === 1 && JSON.stringify(st[0].profiles) === JSON.stringify([PID]) && !st[0].auth, `asked once, only for accounts, without a sign-in (${JSON.stringify(st)})`);
  check(!/once the game server is live/.test(await p.textContent('#panel')), 'no "server not live" note');
  await p.screenshot({ path: 'out/intro-stats.png' });
  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : '')); await ctx.close(); }

console.log('3. Phones: the load screen and the number fit');
for (const [w, h] of [[384, 740], [320, 620], [800, 300]]) {
  const { p, ctx, errors } = await open({ width: w, height: h }, true, false);
  const f = await fits(p, '#panel');
  check(f.inside && !f.scroll, `${w}×${h}: load screen on screen, no sideways scroll (${f.w}×${f.h})`);
  await p.screenshot({ path: `out/intro-${w}x${h}.png` });
  await p.evaluate(() => { window.__sq.sim.S.time = 0; });
  await until(p, () => !document.querySelector('#count').hidden);
  const c = await fits(p, '#count'); check(c.inside, `${w}×${h}: the countdown number fits (${c.w}×${c.h})`);
  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : '')); await ctx.close();
}
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); process.exit(0);
