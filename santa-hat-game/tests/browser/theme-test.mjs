// Plaza themes (Cody, 2026-10-01): pick Halloween on the Avatar screen, it applies at once and is remembered after a reload;
// it still works when storage throws; a theme swap leaves nothing of the old plaza behind; a practice match runs with no
// page errors in both themes, including a swap mid-match. Screenshots of both themes at rest and in a MAXED-OUT practice match
// (8 bodies, the referee's full 18 snowballs in the air; LESSONS: check glow with the scene fully populated) go to out/theme/.
// Run: node theme-test.mjs   (headless draws ~3 frames a second: every wait is for a state, not a fixed time)
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync('out/theme', { recursive: true });
const HALLOWEEN_FOG = 0x3a2440, CHRISTMAS_FOG = 0x232c52;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(w, h, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900, isMobile: w < 900, deviceScaleFactor: 1 });
  if (o.badStorage) await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }); });
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L -m 20 "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.fulfill({ status: 503, body: '' }); });
  const p = await ctx.newPage(), errors = []; p.on('pageerror', (e) => errors.push(e.message));
  // a real reload: once the Avatar tab has rewritten the hash, goto('#play') would only be a same-page hash change
  const load = async () => { if (p.url().startsWith('http://localhost/')) await p.reload({ timeout: 90000 }); else await p.goto('http://localhost/online.html?net=local#play', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await frames(3); };
  const frames = (n) => p.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  await load();
  return { ctx, p, errors, load, frames };
}
const state = (p) => p.evaluate(() => { const s = window.__sq, g = s.gpu(); let stored = 'unreadable'; try { stored = localStorage.getItem('sh_theme'); } catch {}
  return { theme: s.theme, fog: g.fog, geo: g.geometries, tex: g.textures, kids: g.kids, stored,
    pressed: [...document.querySelectorAll('#avtheme [aria-pressed="true"]')].map((b) => b.dataset.theme) }; });
const avatarTab = async (p) => { await p.evaluate(() => document.querySelector('#t-avatar').click()); await p.waitForFunction(() => document.querySelectorAll('#avtheme button').length === 2, null, { timeout: 30000 }); };

// A practice match at its busiest: 8 bodies (a full room) and the referee's cap of 18 snowballs in the air. Practice fills
// only to the referee's 4-body minimum, so this test page alone raises it to 8 for the run (and puts it back after). The test
// keeps everyone's snowballs topped up and cooldowns at zero (the bots then throw as fast as they aim) and throws too.
async function maxedMatch(t, shot) {
  const { p, frames } = t;
  await p.evaluate(() => { document.querySelector('#t-play').click(); document.querySelector('#playUnranked')?.click(); });
  await p.evaluate(async () => { (await import('./sim.js')).K.MIN_BODIES = 8; window.__sq.startPractice(); }); await p.evaluate(() => document.querySelector('#start')?.click());
  await p.waitForFunction(() => { const s = window.__sq; if (/^(intro|count)$/.test(s.sim?.S.phase)) s.sim.S.time = 0; return s.view?.phase === 'play'; }, null, { timeout: 90000 });
  await p.evaluate(() => { window.__max = setInterval(() => { const s = window.__sq, v = s.view; if (!s.sim || !v) return;
    for (const e of s.sim.S.ents) { e.cool = 0; e.ammo = Math.max(e.ammo, e.max); e.stun = 0; }
    const me = v.ents.find((e) => e.peer === s.me.id), foe = v.ents.filter((e) => e.bot).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
    if (me && foe) s.throwAt(foe.x, foe.z); }, 100); });
  await p.waitForFunction(() => (window.__sq.view?.balls.length || 0) >= 14, null, { timeout: 120000 });
  const busy = await p.evaluate(() => ({ bodies: window.__sq.view.ents.length, balls: window.__sq.view.balls.length, phase: window.__sq.view.phase }));
  await p.screenshot({ path: shot });
  return busy;
}
const stopMatch = async (t) => { await t.p.evaluate(async () => { clearInterval(window.__max); (await import('./sim.js')).K.MIN_BODIES = 4; document.querySelector('#leave').click(); }); await t.p.waitForFunction(() => !window.__sq.view || window.__sq.view.phase !== 'play' || !document.querySelector('#leave').offsetParent, null, { timeout: 30000 }).catch(() => {}); await t.frames(2); };

for (const [w, h] of [[1280, 800], [384, 740]]) {
  const S = `${w}×${h}`, t = await open(w, h), { p } = t;
  let s = await state(p);
  check(s.theme === 'christmas' && s.fog?.[0] === CHRISTMAS_FOG, `${S} first visit: Christmas (theme ${s.theme}, fog #${s.fog?.[0].toString(16)})`);
  await p.screenshot({ path: `out/theme/christmas-rest-${w}x${h}.png` });
  const cm = await maxedMatch(t, `out/theme/christmas-match-${w}x${h}.png`);
  check(cm.bodies === 8 && cm.balls >= 14, `${S} Christmas practice match maxed out: ${cm.bodies} bodies, ${cm.balls} snowballs in the air`);
  await stopMatch(t);

  // pick Halloween on the Avatar screen with a real click
  await avatarTab(p);
  s = await state(p); check(s.pressed.join() === 'christmas', `${S} Avatar screen: the picker shows Christmas chosen (${s.pressed})`);
  const before = await state(p);
  await p.locator('[data-theme="halloween"]').click(); await t.frames(3);
  s = await state(p);
  check(s.theme === 'halloween' && s.fog?.[0] === HALLOWEEN_FOG && s.pressed.join() === 'halloween' && s.stored === 'halloween',
    `${S} Halloween applies at once: theme ${s.theme}, fog #${s.fog?.[0].toString(16)}, pressed ${s.pressed}, saved "${s.stored}"`);
  check(s.kids === before.kids, `${S} the scene holds one plaza after the swap (${before.kids} → ${s.kids} top-level objects)`);
  const lay = await p.evaluate(() => { const r = (q) => document.querySelector(q).getBoundingClientRect(), panel = r('.avatar-panel');
    return { scroll: document.documentElement.scrollWidth > innerWidth, inside: [...document.querySelectorAll('#avtheme button')].every((b) => { const q = b.getBoundingClientRect(); return q.left >= panel.left - 1 && q.right <= panel.right + 1 && q.height >= 44; }) }; });
  check(!lay.scroll && lay.inside, `${S} the picker fits the panel, buttons 44 px tall, no sideways scroll`);
  await p.locator('#avtheme').scrollIntoViewIfNeeded(); await p.screenshot({ path: `out/theme/halloween-avatar-${w}x${h}.png` });

  if (w === 1280) { // swapping back and forth must free the old plaza every time (GPU geometry and texture counts come back)
    // A leak grows by a whole plaza (dozens of geometries) every cycle; the attract-mode snowballs make the count wobble by a
    // few frame to frame, so the check allows a wobble under 10 over 3 cycles (seen: 84/85/87/85; with dispose() switched off
    // it went red).
    const cycle = async () => { for (const id of ['christmas', 'halloween']) { await p.evaluate((id) => window.__sq.setTheme(id), id); await t.frames(3); } return state(p); };
    const seen = [await cycle(), await cycle(), await cycle(), await cycle()];
    console.log('    geometries/textures/scene objects after each Christmas→Halloween cycle:', seen.map((x) => `${x.geo}/${x.tex}/${x.kids}`).join('  '));
    const [a, , , z] = seen;
    check(z.geo - a.geo < 10 && z.tex <= a.tex && z.kids === a.kids, `${S} swapping back and forth leaves nothing behind: geometries ${a.geo} → ${z.geo}, textures ${a.tex} → ${z.tex} over 3 more cycles`);
  }

  // remembered after a reload
  await t.load(); s = await state(p);
  check(s.theme === 'halloween' && s.fog?.[0] === HALLOWEEN_FOG, `${S} after a reload: still Halloween (${s.theme})`);
  // the reload keeps the #avatar hash, so go back to Play for the home screen's plaza at rest
  await p.evaluate(() => document.querySelector('#t-play').click()); await t.frames(4);
  await p.screenshot({ path: `out/theme/halloween-rest-${w}x${h}.png` });
  await avatarTab(p); s = await state(p); check(s.pressed.join() === 'halloween', `${S} after a reload the picker shows Halloween chosen`);
  const hm = await maxedMatch(t, `out/theme/halloween-match-${w}x${h}.png`);
  check(hm.bodies === 8 && hm.balls >= 14, `${S} Halloween practice match maxed out: ${hm.bodies} bodies, ${hm.balls} snowballs in the air`);
  // swap mid-match with the camera zoomed out: the new plaza's fog must be pulled back with the zoom like the old one was
  await p.evaluate(() => window.__sq.setZoom(2)); await t.frames(3);
  await p.evaluate(() => window.__sq.setTheme('christmas')); await t.frames(3);
  s = await state(p);
  check(s.theme === 'christmas' && s.fog?.[0] === CHRISTMAS_FOG && Math.abs(s.fog[2] - 78 * 2) < 0.01, `${S} swap mid-match: Christmas, fog pulled back with zoom 2 (far ${s.fog?.[2]})`);
  check(await p.evaluate(() => window.__sq.view?.phase === 'play' && window.__sq.view.ents.length === 8), `${S} the match plays on after the swap`);
  await p.evaluate(() => window.__sq.setZoom(1)); await stopMatch(t);
  check(!t.errors.length, `${S} no page errors` + (t.errors.length ? ': ' + t.errors.join(' | ') : ''));
  await t.ctx.close();
}

{ // the smallest phone: the picker fits with no sideways scroll
  const t = await open(320, 620), { p } = t; await avatarTab(p);
  const lay = await p.evaluate(() => { const vw = innerWidth; return { scroll: document.documentElement.scrollWidth > vw, off: [...document.querySelectorAll('#avtheme button')].filter((b) => { const q = b.getBoundingClientRect(); return q.right > vw || q.left < 0; }).length }; });
  check(!lay.scroll && !lay.off, `320×620 the picker fits, no sideways scroll`);
  await p.locator('#avtheme').scrollIntoViewIfNeeded(); await p.screenshot({ path: 'out/theme/picker-320x620.png' });
  check(!t.errors.length, '320×620 no page errors' + (t.errors.length ? ': ' + t.errors.join(' | ') : '')); await t.ctx.close();
}

{ // storage that throws (private windows, blocked site data): Christmas, the picker still works for this visit, no errors
  const t = await open(1280, 800, { badStorage: true }), { p } = t;
  let s = await state(p); check(s.theme === 'christmas' && s.stored === 'unreadable', `storage throws: page loads in Christmas (${s.theme})`);
  await avatarTab(p); await p.locator('[data-theme="halloween"]').click(); await t.frames(3);
  s = await state(p); check(s.theme === 'halloween' && s.fog?.[0] === HALLOWEEN_FOG && s.pressed.join() === 'halloween', `storage throws: Halloween still applies for this visit (${s.theme})`);
  await t.load(); s = await state(p); check(s.theme === 'christmas', `storage throws: after a reload it's Christmas again (nothing could be remembered)`);
  check(!t.errors.length, 'storage throws: no page errors' + (t.errors.length ? ': ' + t.errors.join(' | ') : '')); await t.ctx.close();
}
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); process.exit(fails.length ? 1 : 0);
