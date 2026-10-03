// A picture for Cody (2026-10-03: "keep them off for now but screenshot a pic with them on so I can see where they are"): the
// admin screen's Weekly modes section, from a stand-in game server that says Hot Hat, King of the Gazebo and Blizzard are ON
// (Hot Hat this week) and Hat Hunt off. Nothing real is switched. Also checks the section's buttons. Run: node admin-weekly-shot.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync('out', { recursive: true });
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const WEEKLY = { now: 'hothat', modes: [{ id: 'blizzard', on: true, built: true }, { id: 'gazebo', on: true, built: true }, { id: 'hathunt', on: false, built: true }, { id: 'hothat', on: true, built: true }] };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 1400 } }); const errors = [];
await ctx.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.startsWith('http://localhost:8799/')) { const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'weekly') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(WEEKLY) });
    if (b.action === 'pools') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ pools: [{ game: 'spin', santaRaw: 588235294117, rules: {}, wallet: 'Pool' }], pending: [], log: [], held: [] }) });
    return route.fulfill({ contentType: 'application/json', body: '{}' }); }
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('http://local.test/')) { const f = path.join(ROOT, url.replace('http://local.test/', '').split('#')[0].split('?')[0]); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.abort();
});
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://local.test/admin.html?server=' + encodeURIComponent('http://localhost:8799/api'), { timeout: 60000 });
await p.waitForFunction(() => document.querySelectorAll('#weekly .wk').length === 4, null, { timeout: 30000 }).catch(() => {});
const rows = await p.evaluate(() => [...document.querySelectorAll('#weekly .wk')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
check(rows.length === 4, `four modes listed: ${rows.map((r) => r.slice(0, 30)).join(' | ')}`);
check(rows.some((r) => /Hot Hat\s*this week/.test(r) && /Switch off/.test(r)), 'Hot Hat: on, this week, a Switch off button');
check(rows.some((r) => /Hat Hunt/.test(r) && /Off/.test(r) && /Switch on/.test(r)), 'Hat Hunt: off, with a Switch on button');
await p.locator('#weeklyBox').screenshot({ path: 'out/admin-weekly-on.png' });
check(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
if (fails.length) { console.log('FAIL:', fails.length); process.exit(1); }
console.log('OK: admin Weekly modes section: a switch per mode, this week marked, Hat Hunt off; picture in out/admin-weekly-on.png');
