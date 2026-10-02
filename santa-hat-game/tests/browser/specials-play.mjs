// Special snowballs in a real match on the page (Cody, 2026-10-01): the SB buttons under the counter, arming one (button or key),
// the next throw is that special, falling snowballs are drawn, Snowball Rain only on a full counter; phone layout with 3 buttons.
// Run: node specials-play.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function practice(viewport, touch) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.fulfill({ status: 503, body: '' }); });
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost/online.html?net=local', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1200);
  // a level-10 player with Ice Ball, Sky Ball and Snowball Rain in SB1–SB3
  await p.evaluate(() => { const s = window.__sq; s.me.l = 10; Object.assign(s.me.a, { sb1: 'sb_ice', sb2: 'sb_sky', sb3: 'sb_rain' }); s.startPractice(); });
  await p.waitForTimeout(2500); await p.evaluate(() => document.querySelector('#start')?.click());
  await p.waitForFunction(() => { const s = window.__sq; if (/^(intro|count)$/.test(s.sim?.S.phase)) s.sim.S.time = 0; return s.view?.phase === 'play'; }, null, { timeout: 60000 });
  // bots disarmed for this test (as in iceball.test): a stunned player can't throw, and that's not what is being tested here
  await p.evaluate(() => setInterval(() => { for (const e of window.__sq.sim.S.ents) if (e.bot) { e.ammo = 0; e.cool = 99; } }, 50));
  await p.waitForTimeout(3500);
  return { p, errors, ctx };
}
const myEnt = (p) => p.evaluate(() => { const s = window.__sq, e = s.sim.S.ents.find((x) => x.peer === s.me.id); return { ammo: e.ammo, max: e.max, x: e.x, z: e.z }; });
const target = (p) => p.evaluate(() => { const s = window.__sq, me = s.sim.S.ents.find((x) => x.peer === s.me.id), b = s.sim.S.ents.find((x) => x.bot) || me; return [b.x, b.z, me.x, me.z]; });
// (waits for the short throw cooldown first: in a slow test browser 0.26 s of game time takes much longer in real time)
// (then waits until the REFEREE has processed the throw: it reads throws once per frame, and test browsers draw ~3 a second)
const throwAt = async (p) => { await p.waitForFunction(() => window.__sq.ctl.cool <= 0, null, { timeout: 10000 }); const [x, z] = await target(p); await p.evaluate(([x, z]) => window.__sq.throwAt(x, z), [x, z]);
  await p.waitForFunction(() => { const s = window.__sq, e = s.sim.S.ents.find((q) => q.peer === s.me.id); return e.lastTh >= s.ctl.t; }, null, { timeout: 15000 }); };

console.log('1. A computer: three SB buttons; arming Ice Ball (button) throws one; Sky Ball (key E) rains 2 waves; Rain needs a full counter');
{ const { p, errors, ctx } = await practice({ width: 1200, height: 800 }, false);
  const names = await p.evaluate(() => [...document.querySelectorAll('#hud .sbrow button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
  check(names.length === 3 && /Ice Ball 2/.test(names[0]) && /Sky Ball 5/.test(names[1]) && /Snowball Rain all/.test(names[2]), 'buttons: ' + names.join(' | '));
  // each button shows the item's picture (the Store's, drawn in flight) in place of the SB1/SB2/SB3 letters (Cody 2026-10-02)
  const pics = await p.evaluate(() => [...document.querySelectorAll('#hud .sbrow button img.sbpic')].map((i) => i.complete && i.naturalWidth === 160 && i.alt));
  check(pics.join() === 'SB1,SB2,SB3', 'each button has its item picture: ' + pics.join());
  await p.evaluate(() => document.querySelector('#hud [data-sb="0"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  // wait for the redraw (the next frame), not a fixed time: test browsers draw ~3 frames a second
  check(await p.waitForFunction(() => document.querySelector('#hud [data-sb="0"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 10000 }).then(() => true, () => false), 'SB1 shows armed');
  const a0 = (await myEnt(p)).ammo; await throwAt(p); await p.waitForTimeout(250);
  const dbg = () => p.evaluate(() => { const s = window.__sq, e = s.sim.S.ents.find((x) => x.peer === s.me.id), v = s.view.ents.find((x) => x.peer === s.me.id); return JSON.stringify({ armed: s.armed, sp: s.ctl.sp, t: s.ctl.t, lastTh: e.lastTh, simStun: +e.stun.toFixed(2), viewStun: v?.stun, simCool: +e.cool.toFixed(2), refused: e.refused, ctlCool: +s.ctl.cool.toFixed(2), ammo: e.ammo, phase: s.sim.S.phase, balls: s.sim.S.balls.map((b) => b.kind) }); });
  if (!(await p.evaluate(() => window.__sq.sim.S.balls.some((b) => b.kind === 'ice')))) console.log('  (state:', await dbg(), ')');
  check(await p.evaluate(() => window.__sq.sim.S.balls.some((b) => b.kind === 'ice')), 'the next throw is an Ice Ball'); check(a0 - (await myEnt(p)).ammo === 2, 'it used 2 snowballs');
  check(await p.waitForFunction(() => document.querySelector('#hud [data-sb="0"]')?.getAttribute('aria-pressed') !== 'true', null, { timeout: 10000 }).then(() => true, () => false), 'and the button is no longer armed');
  await p.waitForTimeout(500); await p.keyboard.press('KeyE');
  await throwAt(p); await p.waitForTimeout(250);
  if (!(await p.evaluate(() => window.__sq.sim.S.drops.length))) console.log('  (state:', await dbg(), ')');
  const sky = await p.evaluate(() => ({ n: window.__sq.sim.S.drops.length, kinds: [...new Set(window.__sq.sim.S.drops.map((d) => d.kind))], ts: window.__sq.sim.S.drops.map((d) => +d.t.toFixed(2)) }));
  check(sky.n === 10 && sky.kinds.join() === 'sky', `key E armed Sky Ball: 10 snowballs falling in 2 waves (${JSON.stringify(sky)})`);
  await p.waitForTimeout(1200); check(await p.evaluate(() => window.__sq.drawn().drops) > 0, 'falling snowballs are drawn with their landing marks');
  await p.screenshot({ path: 'out/specials-sky.png' });
  check(await p.waitForFunction(() => document.querySelector('#hud [data-sb="2"]')?.disabled === true, null, { timeout: 10000 }).then(() => true, () => false), 'Rain is off until the counter is full');
  await p.waitForFunction(() => { const s = window.__sq, e = s.sim.S.ents.find((x) => x.peer === s.me.id); e.regen = 99; return e.ammo === e.max; }, null, { timeout: 30000 }); await p.waitForTimeout(500);
  check(await p.waitForFunction(() => document.querySelector('#hud [data-sb="2"]')?.disabled === false, null, { timeout: 10000 }).then(() => true, () => false), 'full counter: Rain is on');
  await p.keyboard.press('KeyR'); await throwAt(p); await p.waitForTimeout(400);
  const after = await myEnt(p), drops = await p.evaluate(() => window.__sq.sim.S.drops.length);
  check(after.ammo === 0 && drops >= 30, `Rain: the whole counter used (${after.ammo} left), ${drops} snowballs over the ring`);
  await p.waitForTimeout(1500); await p.screenshot({ path: 'out/specials-rain.png' });
  // the gold "untouchable" ring after grabbing the hat: the page must read the referee's immune flag (it never did until 2026-10-01)
  await p.evaluate(() => { const s = window.__sq; s.sim.S.ents.find((x) => x.peer === s.me.id).immune = 2; });
  check(await p.waitForFunction(() => { const s = window.__sq; return s.view.ents.find((x) => x.peer === s.me.id)?.immune === true; }, null, { timeout: 10000 }).then(() => true, () => false), 'untouchable after the hat: my screen knows (the gold ring)');
  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : '')); await ctx.close(); }

console.log('2. Phones (upright and sideways): the 3 buttons fit, nothing overlaps, they can be tapped');
for (const [w, h] of [[384, 740], [800, 300], [320, 620]]) {
  const { p, errors, ctx } = await practice({ width: w, height: h }, true);
  const r = await p.evaluate(() => { const row = document.querySelector('#hud .sbrow'), rr = row.getBoundingClientRect(), bs = [...row.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
    const others = ['#board', '#zoom', '#joy', '#emotes', '#gamebar .sndbtn', '#leave'].map((s) => document.querySelector(s)).filter((e) => e && !e.hidden).map((e) => [e.id || e.className, e.getBoundingClientRect()]);
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return { inside: rr.right <= innerWidth && rr.bottom <= innerHeight, over: others.filter(([, o]) => hit(rr, o)).map(([n]) => n), minH: Math.min(...bs.map((b) => b.height)), scroll: document.documentElement.scrollWidth > innerWidth }; });
  check(r.inside && !r.over.length && !r.scroll && r.minH >= 32, `${w}×${h}: on screen, no overlaps (${r.over.join(', ') || 'none'}), tappable (${Math.round(r.minH)} px tall)`);
  // the zoom buttons (upright phones: side by side under the sound button, Cody 2026-10-02) cover no info box or top-bar control
  const z = await p.evaluate(() => { const zb = [...document.querySelectorAll('#zoom button')].map((b) => b.getBoundingClientRect()), hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const els = [...document.querySelectorAll('#hud .stat, #gamebar button, #gamebar #roomchip')].filter((e) => e.offsetParent);
    return { on: zb.every((b) => b.right <= innerWidth && b.bottom <= innerHeight && b.top >= 0), over: els.filter((e) => zb.some((b) => hit(b, e.getBoundingClientRect()))).map((e) => e.id || e.className || e.textContent.trim().slice(0, 12)) }; });
  check(z.on && !z.over.length, `${w}×${h}: zoom buttons on screen, covering nothing (${z.over.join(', ') || 'none'})`);
  await p.screenshot({ path: `out/specials-hud-${w}x${h}.png` }); check(!errors.length, 'no page errors'); await ctx.close();
}
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); process.exit(0);
