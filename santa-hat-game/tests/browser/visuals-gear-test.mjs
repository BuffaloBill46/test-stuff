// Special gear and special snowballs LOOK special (Cody, 2026-10-01: "a pumpkin should look like a jack o lantern not just orange
// shirt. Santa suit should look like Santa and so on. Then make the special snowballs stand out with either a tracer and or
// shimmer"; "I just want the special stuff to pop out and actually look special").
// 1. Every gear kind draws something DISTINCT on the character (a fingerprint of the drawn model differs from no gear and from
//    every other gear), and a player in a real practice match is redressed from the referee's snapshot (e.gear).
// 2. Screenshots at rest: a lineup of 8 players each in a different gear (front and back), the Store and Avatar gear thumbnails.
// 3. Maxed out: 8 players in gear, 18 special snowballs of every kind + 60 falling drops, desktop and phone: no page errors, the
//    tracers draw, frames keep coming. Plain snowballs with no gear draw NO tracer points (plain stays plain).
// Run: node visuals-gear-test.mjs   (screenshots: out/visuals/)
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, OUT = 'out/visuals', fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function context(viewport) {
  const ctx = await browser.newContext({ viewport });
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.fulfill({ status: 503, body: '' }); });
  return ctx;
}
async function page(viewport) {
  const ctx = await context(viewport), p = await ctx.newPage(), errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost/online.html?net=local', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 });
  return { ctx, p, errors };
}
const KINDS = ['pumpkin', 'kevlar', 'heated', 'santa', 'bag', 'satchel', 'shoes', 'elfhat', 'backpack'];
// A practice match with 8 bodies (MIN_BODIES raised for the test), skipped to play. Every referee step then: bots disarmed and
// pinned in a row facing the camera (`face`), me in the row too, gear put on them from `gear` (a list per body, me first).
async function lineup(p, gear, face = 0) {
  await p.evaluate(async () => { (await import('./sim.js')).K.MIN_BODIES = 8; const s = window.__sq; s.me.l = 8; s.setZoom(0.6); s.startPractice(); });
  await p.waitForFunction(() => document.querySelector('#start'), null, { timeout: 30000 }); await p.evaluate(() => document.querySelector('#start').click());
  await p.waitForFunction(() => { const s = window.__sq; if (/^(intro|count)$/.test(s.sim?.S.phase)) s.sim.S.time = 0; return s.view?.phase === 'play'; }, null, { timeout: 60000 });
  await p.evaluate(([gear, face]) => { const s = window.__sq, sim = s.sim, step = sim.step; window.__pin = { gear, face, balls: null, drops: 0 };
    sim.step = (dt) => { step(dt); const P = window.__pin, S = sim.S, me = S.ents.find((e) => e.peer === s.me.id), row = [me, ...S.ents.filter((e) => e !== me)];
      row.forEach((e, i) => { const x = -4.2 + i * 1.2; if (e === me) { s.ctl.x = x; s.ctl.z = 3.5; s.ctl.vx = s.ctl.vz = 0; s.ctl.face = P.face; }
        e.x = x; e.z = 3.5; e.vx = e.vz = 0; e.face = P.face; if (e.bot) { e.ammo = 0; e.cool = 99; } e.gear = P.gear[i] || []; });
      S.time = 60;
      // max load: keep 18 snowballs of every special kind in the air over the row, and 60 drops falling on it
      if (P.balls) { while (S.balls.length < 18) { const k = P.balls[S.nextBall % P.balls.length], fire = k === 'fire', id = S.nextBall++, dir = id % 2 ? 1 : -1;
          S.balls.push({ id, owner: row[1].id, sm: 1, kind: k, r: k === 'giant' ? 3 : 1, stunSec: 0, g: k === 'split' ? id : 0, age: 0, life: 2,
            x: -7 * dir, y: 2.6 + (id % 4) * 0.5, z: 1 + (id % 5) * 1.1, vx: dir * (fire ? 30 : 15), vy: 2.5, vz: (id % 3 - 1) * 1.5 }); }
        while (S.drops.length < P.drops) S.drops.push({ x: -6 + Math.random() * 12, z: Math.random() * 7, t: 0.3 + Math.random() * 1.3, owner: row[1].id, kind: S.drops.length % 2 ? 'sky' : 'rain' }); }
      };
  }, [gear, face]);
  // wait until every body is drawn with its gear (the views rebuild when the referee's gear changes)
  await p.waitForFunction((n) => { const v = window.__sq.view; return v?.ents.length === 8 && v.ents.filter((e) => e.gear.length).length === n; }, gear.filter((g) => g?.length).length, { timeout: 30000 });
  await p.waitForTimeout(1500);
}
const framesIn = (p, ms) => p.evaluate((ms) => new Promise((done) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else done(n); }; requestAnimationFrame(f); }), ms);

console.log('1. Every gear kind draws something distinct on the character');
{ const { ctx, p, errors } = await page({ width: 1280, height: 800 });
  const sig = await p.evaluate((ks) => { const s = window.__sq; return Object.fromEntries([['none', s.lookOf([])], ...ks.map((k) => [k, s.lookOf([k])]), ['present', s.lookOf(['present'])]]); }, KINDS);
  for (const k of [...KINDS, 'present']) { const same = Object.keys(sig).filter((o) => o !== k && sig[o].n === sig[k].n && Math.abs(sig[o].sum - sig[k].sum) < 0.01);
    check(!same.length && sig[k].n > sig.none.n - 200, `${k}: its own look (${sig[k].n} vertices${sig[k].glow ? ', ' + sig[k].glow + ' glowing' : ''}; plain ${sig.none.n})${same.length ? ' SAME AS ' + same.join() : ''}`); }
  check(sig.pumpkin.glow > 0 && sig.heated.glow > 0, 'the jack-o\'-lantern face and the Heated Coat coil glow (unlit pieces)');
  // in a real match: a bot's drawn look changes when the referee dresses it
  await lineup(p, []);
  const id = await p.evaluate(() => window.__sq.view.ents.find((e) => e.bot).id), before = await p.evaluate((id) => window.__sq.look(id), id);
  await p.evaluate(() => { window.__pin.gear = [[], ['santa', 'shoes']]; });
  await p.waitForFunction((id) => window.__sq.view.ents.find((e) => e.id === id)?.gear.join() === 'santa,shoes', id, { timeout: 30000 });
  await p.waitForTimeout(800); const after = await p.evaluate((id) => window.__sq.look(id), id);
  check(after && before && (after.n !== before.n || after.sum !== before.sum), `a bot dressed by the referee is redrawn (${before?.n} → ${after?.n} vertices)`);
  // plain stays plain: plain snowballs, no gear → not a single tracer point
  await p.evaluate(() => { window.__pin.gear = []; window.__pin.balls = ['']; });
  await p.waitForFunction(() => window.__sq.view.balls.length >= 10 && !window.__sq.view.ents.some((e) => e.gear.length), null, { timeout: 30000 }); await p.waitForTimeout(600);
  check(await p.evaluate(() => window.__sq.sparks()) === 0, 'plain snowballs and no gear: no tracer or shimmer points (' + await p.evaluate(() => window.__sq.sparks()) + ')');
  await p.evaluate(() => { window.__pin.balls = ['ice', 'fire', 'giant', 'split']; window.__sq.sim.S.balls.length = 0; });
  await p.waitForFunction(() => window.__sq.view.balls.filter((b) => b.kind).length >= 10, null, { timeout: 30000 }); await p.waitForTimeout(600);
  check(await p.evaluate(() => window.__sq.sparks()) > 100, 'special snowballs: tracers drawn (' + await p.evaluate(() => window.__sq.sparks()) + ' points)');
  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : '')); await ctx.close(); }

for (const vp of [{ width: 1280, height: 800, tag: 'desk' }, { width: 384, height: 740, tag: 'phone' }]) {
  console.log(`2-3. ${vp.tag} ${vp.width}×${vp.height}: gear at rest, then maxed out`);
  const { ctx, p, errors } = await page({ width: vp.width, height: vp.height });
  const row = vp.tag === 'phone' ? [['pumpkin', 'elfhat'], ['santa'], ['kevlar', 'backpack'], ['heated', 'satchel'], ['bag', 'shoes'], ['pumpkin'], ['elfhat'], ['shoes']]
    : [['pumpkin'], ['kevlar'], ['heated'], ['santa'], ['bag'], ['satchel'], ['shoes'], ['elfhat']];
  await lineup(p, row);
  await p.screenshot({ path: `${OUT}/${vp.tag}-gear-front.png` });
  await p.evaluate(() => { window.__pin.face = Math.PI; window.__pin.gear = [['bag'], ['backpack'], ['satchel'], ['santa', 'elfhat'], ['pumpkin', 'backpack'], ['heated', 'bag'], ['kevlar', 'satchel'], ['shoes']]; });
  await p.waitForFunction(() => window.__sq.view.ents.filter((e) => e.gear.length).length === 8 && window.__sq.view.ents[0].face > 3, null, { timeout: 30000 }); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/${vp.tag}-gear-back.png` });
  // maxed out: everyone in gear, 18 specials of every kind, 60 drops
  await p.evaluate(() => { const P = window.__pin; P.face = 0; P.gear = [['pumpkin', 'elfhat'], ['santa', 'shoes'], ['kevlar', 'backpack'], ['heated', 'satchel'], ['bag'], ['pumpkin'], ['santa'], ['kevlar']]; P.balls = ['ice', 'fire', 'giant', 'split']; P.drops = 60; window.__sq.sim.S.balls.length = 0; });
  await p.waitForFunction(() => { const v = window.__sq.view; return v.balls.filter((b) => b.kind).length >= 14 && v.drops.length >= 50; }, null, { timeout: 40000 }); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/${vp.tag}-max.png` });
  const n = await p.evaluate(() => window.__sq.sparks()), fr = await framesIn(p, 3000);
  await p.screenshot({ path: `${OUT}/${vp.tag}-max2.png` });
  const kinds = await p.evaluate(() => [...new Set(window.__sq.view.balls.map((b) => b.kind))].sort().join());
  check(n > 300 && n <= 1600, `maxed out: ${n} tracer/shimmer points drawn in one call (kinds in the air: ${kinds})`);
  check(fr >= 3, `frames keep coming under max load: ${fr} in 3 s (test browser draws ~3/s)`);
  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  // the Store and the Avatar screen show a picture of each gear (a thumbnail), not a colour chip; the empty slot keeps its chip
  await p.evaluate(() => window.__sq.leaveRoom()); await p.waitForTimeout(500);
  await p.click('#t-store'); await p.waitForFunction(() => document.querySelectorAll('#carousels .shopitem').length > 0, null, { timeout: 30000 });
  const shop = await p.evaluate(() => { const items = [...document.querySelectorAll('#carousels .shopitem')].filter((x) => x.querySelector('button[data-try^="gear_"]')); return { n: items.length, img: items.filter((x) => x.querySelector('img')?.src.startsWith('data:image/png')).length, chip: items.filter((x) => x.querySelector('.chip')).length }; });
  // 9 gear since the Heated Coat was retired (Cody's price sheet, 2026-10-02: not sold or worn)
  check(shop.n === 8 && shop.img === 8 && !shop.chip, `Store: all 8 gear show a picture (retired ones not sold) (${JSON.stringify(shop)})`);
  await p.evaluate(() => [...document.querySelectorAll('#carousels .shopitem')].find((x) => x.querySelector('button[data-try^="gear_"]'))?.scrollIntoView({ block: 'start' })); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/${vp.tag}-store-gear.png` });
  await p.click('#t-avatar'); await p.waitForTimeout(500); await p.click('[data-slot="gear"]'); await p.waitForTimeout(300);
  const av = await p.evaluate(() => { const b = [...document.querySelectorAll('#avgrid [data-pick^="gear_"]')]; return { n: b.length, img: b.filter((x) => x.querySelector('img')).length, chip: b.filter((x) => x.querySelector('.chip')).map((x) => x.dataset.pick), pumpkin: b.some((x) => x.dataset.pick === 'gear_pumpkin') }; });
  check(av.n === 9 && av.img === 8 && !av.pumpkin && av.chip.join() === 'gear_none', `Avatar Special Gear: 8 pictures + the empty slot's chip (retired gear not listed) (${JSON.stringify(av)})`);
  // the Avatar preview wears the slots: Santa Costume in G1
  await p.click('#avsb [data-gslot="g1"]'); await p.waitForTimeout(150); await p.click('#avgrid [data-pick="gear_santa"]'); await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/${vp.tag}-avatar-santa.png` });
  await p.click('#avgrid [data-pick="gear_kevlar"]'); await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/${vp.tag}-avatar-kevlar.png` });
  check(!errors.length, 'no page errors (Store, Avatar)' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED:\n - ${fails.join('\n - ')}` : '\nALL PASSED'); process.exit(fails.length ? 1 : 0);
