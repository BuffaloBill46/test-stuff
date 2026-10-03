// WEEKLY MODES ON THE PAGE (Cody, 2026-10-03; weekly.js, sim.js, online.js). The lobby offers "This week: <mode>" (ticked by
// default); the Play page names it; a weekly room (PW…) plays this week's mode, says so on its waiting card, load screen and
// room chip; King of the Gazebo draws its ring (and only then); Blizzard pulls the fog in; a plain room has neither.
// The page hosts the room itself here (?net=local); the match server's side is in tests/referee.test.mjs. Run: node weekly-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
import { VARIANTS } from '../../mockups/weekly.js';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync('out', { recursive: true });
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
let NOW = 'hothat'; // what the stand-in game server says is switched on this week (null: all off)
const WEEK = VARIANTS[NOW];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }); const errors = [];
await ctx.addInitScript(() => { try { localStorage.setItem('santa.coached', '1'); } catch {} });
await ctx.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.startsWith('https://api.santahatgames.com')) { const b = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({ contentType: 'application/json', body: b.action === 'weekly' ? JSON.stringify({ now: NOW, modes: [] }) : '{"error":"stand-in"}' }); }
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('http://local.test/')) { const f = path.join(ROOT, url.replace('http://local.test/', '').split('#')[0].split('?')[0]); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.abort();
});
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
let loads = 0; const open = async (qs = '') => { await p.goto('http://local.test/online.html?net=local&n=' + (++loads) + qs + '#play', // a new address each time: the same one only changes the #part, no reload
   { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1200); };
const view = () => p.evaluate(() => ({ variant: window.__sq.view?.variant, phase: window.__sq.view?.phase, chip: document.querySelector('#roomchip')?.textContent.replace(/\s+/g, ' ').trim(),
  card: document.querySelector('#panel')?.textContent.replace(/\s+/g, ' ').trim(), ring: window.__sq.zoneRingShown?.(), fog: window.__sq.fogNow?.() }));

console.log('0. All weekly modes switched off (the admin screen; the default)');
NOW = null; await open(); await p.waitForTimeout(6000); // the answer has arrived by now
check(await p.evaluate(() => [...document.querySelectorAll('[data-weekly-only]')].every((e) => e.hidden)), 'nothing weekly shows: no tick, no "This week" line');
NOW = 'hothat';
console.log(`1. The page offers this week's mode (${WEEK.name})`);
await open();
// (the page asks once it knows who's signed in; with the sign-in service blocked here that takes a few seconds)
await p.waitForFunction(() => [...document.querySelectorAll('[data-weekly-only]')].every((e) => !e.hidden), null, { timeout: 15000 }).catch(() => {});
check((await p.evaluate(() => [...document.querySelectorAll('[data-weekly-name]')].map((e) => e.textContent))).every((t) => t === WEEK.name) && await p.evaluate(() => [...document.querySelectorAll('[data-weekly-only]')].every((e) => !e.hidden)), 'switched on: the Play page and the lobby name it');
await p.click('#playUnranked'); await p.waitForTimeout(400);
check(await p.evaluate(() => document.querySelector('[data-amode="weekly"]').checked), 'its Auto match tick is on by default');
await p.evaluate(() => document.querySelector('#homeClose')?.click());

console.log('2. A weekly room plays it and says so');
await open('&room=PWG1'); await p.evaluate(() => document.querySelector('#joinBtn')?.click());
await p.waitForFunction(() => window.__sq.isHost && window.__sq.view, null, { timeout: 60000 }); await p.waitForTimeout(800);
let v = await view();
check(v.variant === NOW, `the room plays this week's mode (${v.variant})`);
check(v.chip.includes(WEEK.name) && v.card.includes(WEEK.short), `room chip "${v.chip}"; waiting card has the rule`);
await p.screenshot({ path: 'out/weekly-waiting.png' });
await p.evaluate(() => window.__sq.sim.introMatch('ffa')); await p.waitForTimeout(800);
v = await view(); check(v.card.includes('This week: ' + WEEK.name) && v.card.includes(WEEK.short), 'the load screen names it with its rule');
console.log('3. King of the Gazebo draws its ring; Blizzard pulls the fog in');
await p.evaluate(() => { const s = window.__sq.sim.S; s.phase = 'play'; s.time = 50; s.variant = 'gazebo'; }); await p.waitForTimeout(900);
v = await view(); check(v.variant === 'gazebo' && v.ring === true, 'gazebo: the ring is drawn');
await p.screenshot({ path: 'out/weekly-gazebo.png' });
await p.evaluate(() => { window.__sq.sim.S.variant = null; }); await p.waitForTimeout(700);
const plainFog = (await view()).fog; check((await view()).ring === false, 'a plain match: no ring');
await p.evaluate(() => { window.__sq.sim.S.variant = 'blizzard'; }); await p.waitForTimeout(900);
const bFog = (await view()).fog;
check(plainFog && bFog && bFog[1] < plainFog[1] * 0.6 && bFog[0] < plainFog[0] * 0.5, `blizzard: fog much closer (near ${bFog?.[0]?.toFixed(1)} far ${bFog?.[1]?.toFixed(1)} vs ${plainFog?.[0]?.toFixed(1)}/${plainFog?.[1]?.toFixed(1)})`);
await p.screenshot({ path: 'out/weekly-blizzard.png' });
check(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
if (fails.length) { console.log('FAIL:', fails.length); process.exit(1); }
console.log('OK: weekly modes on the page: offered and named, a weekly room plays and labels it, gazebo ring, blizzard fog');
