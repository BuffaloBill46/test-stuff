// END OF MATCH: SNOWBALLS THROWN, HIT AND HIT % (Cody, 2026-10-04 to-do #5). In a real browser, a practice match: I throw real
// snowballs at the bots (the page's own throw, through the referee), the match is fast-forwarded to its end, and the results card
// shows "N thrown · M hit · P%" under my name, the numbers the referee counted; bots show none. Run: node --import ./win-chrome.mjs aim-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW ? path.join(process.env.PW, 'node_modules/playwright') : path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const cache = new Map(), curl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }), errors = [];
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.startsWith('https://api.santahatgames.com')) return route.fulfill({ contentType: 'application/json', body: '{"error":"stand-in"}' });
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: curl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('https://local.test/')) { const f = path.join(ROOT, url.replace('https://local.test/', '').split('#')[0].split('?')[0]); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.abort(); });
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
await p.goto('https://local.test/online.html?net=local&t=' + Date.now(), { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1500);
await p.evaluate(() => window.__sq.startPractice()); await p.waitForTimeout(2500); await p.evaluate(() => document.querySelector('#start')?.click());
await p.waitForFunction(() => window.__sq.sim?.S.phase === 'play', null, { timeout: 60000 });
// throw at the nearest bot, over and over, with the page's own throw (the referee checks each one: ammo, cooldown)
for (let i = 0; i < 40; i++) {
  await p.evaluate(() => { const s = window.__sq.sim, me = s.S.ents.find((e) => e.peer === window.__sq.me.id), bot = s.S.ents.filter((e) => e.bot).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
    if (bot) window.__sq.throwAt?.(bot.x, bot.z) ?? s.throwBall?.(me, bot.x, bot.z); });
  await p.waitForTimeout(300);
}
const st = await p.evaluate(() => { const s = window.__sq.sim, me = s.S.ents.find((e) => e.peer === window.__sq.me.id); return { ...me.st }; });
check(st.thrown > 0, `the referee counted my throws: ${st.thrown} thrown, ${st.hits} hit`);
await p.evaluate(() => { const s = window.__sq.sim; s.S.round = 3; s.S.time = 0.2; });
await p.waitForFunction(() => window.__sq.view?.phase === 'end', null, { timeout: 60000 }); await p.waitForTimeout(2500);
const fin = await p.evaluate(() => { const s = window.__sq.sim, me = s.S.ents.find((e) => e.peer === window.__sq.me.id); return { ...me.st }; }); // the referee's FINAL count (a ball still in the air when we looked earlier can land after)
const card = await p.evaluate(() => [...document.querySelectorAll('.final li')].map((li) => ({ you: !!li.querySelector('em'), aim: li.querySelector('.aim')?.textContent || '' })));
const mine = card.find((c) => c.you), pct = fin.thrown ? Math.min(100, Math.round((100 * fin.hits) / fin.thrown)) : 0;
check(mine && mine.aim === `${fin.thrown} thrown · ${fin.hits} hit · ${pct}%`, `the results card under my name: "${mine?.aim}"`);
check(card.filter((c) => !c.you).every((c) => !c.aim), 'bots show no thrown / hit line');
await p.screenshot({ path: 'out/aim-results.png' });
check(!errors.length, 'no page errors ' + errors.slice(0, 2).join(' | '));
await browser.close();
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
