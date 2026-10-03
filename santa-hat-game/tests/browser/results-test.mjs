// THE RESULTS CARD'S NEXT STEP (Cody, 2026-10-03; online.js endActions). Practice: "Play again" starts the next match at once
// (no 12 s wait, no Start button). A public Auto match: says the next match starts by itself and offers Leave (no fake button);
// a guest who placed top 3 there is told what signing in keeps, and its Sign in opens the account sheet. Leave leaves.
// (Ranked's "Play again · 1 ticket" needs the match server: covered by reading the card's code path, not here.)
// Screenshots in out/. Run: node results-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync('out', { recursive: true });
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } }); const errors = [];
await ctx.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.startsWith('https://api.santahatgames.com')) return route.fulfill({ contentType: 'application/json', body: '{"gamesRaw":0,"lotteryRaw":0,"storeRaw":0,"totalRaw":0}' });
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('http://local.test/')) { const f = path.join(ROOT, url.replace('http://local.test/', '').split('#')[0].split('?')[0]); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.abort();
});
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
const card = () => p.evaluate(() => { const c = document.querySelector('#panel'); return { shown: !c.hidden, text: c.textContent.replace(/\s+/g, ' ').trim(), acts: [...c.querySelectorAll('[data-act]')].map((b) => b.dataset.act + ':' + b.textContent) }; });
// the match to its end, with my player on top (a score the bots can't reach in the last 0.2 s)
const toEnd = async () => { await p.evaluate(() => { const s = window.__sq.sim, mine = s.S.ents.find((e) => e.peer === window.__sq.me.id); if (mine) mine.score = 999; s.S.round = 1; s.S.time = 0.2; });
  await p.waitForFunction(() => window.__sq.view?.phase === 'end', null, { timeout: 60000 }); await p.waitForTimeout(800); };
const skipIntro = () => p.waitForFunction(() => { const s = window.__sq; if (/^(intro|count)$/.test(s.sim?.S.phase)) s.sim.S.time = 0; return s.view?.phase === 'play'; }, null, { timeout: 60000 });

console.log('1. Practice: Play again starts the next match at once');
await p.goto('http://local.test/online.html?net=local#play', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1200);
await p.evaluate(() => window.__sq.startPractice()); await p.waitForTimeout(1500); await p.evaluate(() => document.querySelector('#start')?.click());
await skipIntro(); await toEnd();
let c = await card();
check(c.shown && c.acts.join() === 'again:Play again,leave:Leave', `practice results: ${c.acts.join(' / ')}`);
check(!/Sign in/.test(c.text), 'no sign-in nudge in practice (nothing there counts)');
await p.screenshot({ path: 'out/results-practice.png' });
const t0 = Date.now(); await p.click('#panel [data-act="again"]');
await p.waitForFunction(() => /^(intro|count|play)$/.test(window.__sq.sim?.S.phase), null, { timeout: 8000 }).catch(() => {});
const ph = await p.evaluate(() => window.__sq.sim?.S.phase);
check(/^(intro|count|play)$/.test(ph) && Date.now() - t0 < 5000, `the next match started in ${((Date.now() - t0) / 1000).toFixed(1)} s (phase ${ph}; it used to wait 12 s, then need Start)`);
await skipIntro(); await toEnd();
await p.click('#panel [data-act="leave"]'); await p.waitForTimeout(800);
check(await p.evaluate(() => !window.__sq.room && !window.__sq.sim), 'Leave leaves');

console.log('2. A public Auto match, as a guest who finished 1st');
await p.goto('http://local.test/online.html?net=local&room=PF1#play', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('#joinBtn')?.click());
await p.waitForFunction(() => window.__sq.isHost && window.__sq.sim, null, { timeout: 60000 });
await p.evaluate(() => window.__sq.sim.startMatch('ffa')); await skipIntro(); await toEnd();
c = await card();
check(/You finished 1st!/.test(c.text) && /level up|daily tasks/.test(c.text) && c.acts.includes('signin:Sign in'), `guest top-3 nudge: "${(c.text.match(/You finished[^]*?tasks\./) || [''])[0]}"`);
check(/Next match starts by itself/.test(c.text) && c.acts.includes('leave:Leave') && !c.acts.some((a) => a.startsWith('again')), 'says the next match starts by itself; Leave offered; no button that does nothing');
await p.screenshot({ path: 'out/results-auto-guest.png' });
await p.click('#panel [data-act="signin"]'); await p.waitForTimeout(600);
check(await p.isVisible('#acct'), 'Sign in opens the account sheet');
check(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
if (fails.length) { console.log('FAIL:', fails.length); process.exit(1); }
console.log('OK: results card: practice Play again starts at once, Leave leaves; Auto match says it continues by itself; a guest top-3 is nudged to sign in');
