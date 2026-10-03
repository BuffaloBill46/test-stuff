// Special gear in a real match on the page (Cody, 2026-10-01): the referee gets each player's gear; the snowball counter shows
// the gear's bigger count (Toy Sack = Santa Bag, +50%); Elf Shoes move me 25% faster (and the referee takes it); a Pumpkin
// Costume takes 2 hits to knock down; an Elf Hat is drawn at half size on BOTH screens of a two-player room (the host reads
// the other player's gear from what their browser announces); the load screen lists real gear; the local save refuses gear
// the way the database (015) does. Run: node gear-play.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync('out', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function context(viewport = { width: 1200, height: 800 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.fulfill({ status: 503, body: '' }); });
  return ctx;
}
async function page(ctx) {
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost/online.html?net=local', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 });
  return { p, errors };
}
// A practice match for a player of this level wearing this gear (avatar keys g1/g2); stops at the load screen if asked, else
// skips the intro (time = 0 while intro/count, as specials-play does) and waits for round 1. Bots disarmed: only what the test
// throws can hit me.
async function practice(level, gear, { stopAtIntro = false } = {}) {
  const ctx = await context(), { p, errors } = await page(ctx);
  await p.evaluate(([l, g]) => { const s = window.__sq; s.me.l = l; Object.assign(s.me.a, { g1: 'gear_none', g2: 'gear_none' }, g); s.startPractice(); }, [level, gear]);
  await p.waitForFunction(() => document.querySelector('#start'), null, { timeout: 30000 }); await p.evaluate(() => document.querySelector('#start').click());
  if (stopAtIntro) { await p.waitForFunction(() => window.__sq.sim.S.phase === 'intro' && document.querySelector('#panel.intro .lineup li.me'), null, { timeout: 30000 }); return { p, errors, ctx }; }
  await p.waitForFunction(() => { const s = window.__sq; if (/^(intro|count)$/.test(s.sim?.S.phase)) s.sim.S.time = 0; return s.view?.phase === 'play'; }, null, { timeout: 60000 });
  await p.evaluate(() => setInterval(() => { for (const e of window.__sq.sim.S.ents) if (e.bot) { e.ammo = 0; e.cool = 99; } }, 50));
  return { p, errors, ctx };
}
const me = (p) => p.evaluate(() => { const s = window.__sq, e = s.sim.S.ents.find((x) => x.peer === s.me.id); return { gear: e.gear, max: e.max, ammo: e.ammo, xh: e.xh, stun: e.stun, id: e.id }; });
// Hold the arrow key that heads most toward the middle (3 units from a spawn 9 out: nowhere near the wall or the hat) and record
// my page's top speed (and the referee's) over 0.6 s of GAME time (frames clamped to 1/20 s like the game's), not a fixed sleep:
// the page speeds up by a share per frame, so a frame count alone under-reads on a fast-drawing page.
async function topSpeed(p) {
  const key = await p.evaluate(() => { const c = window.__sq.ctl; return Math.abs(c.x) > Math.abs(c.z) ? (c.x > 0 ? 'KeyA' : 'KeyD') : (c.z > 0 ? 'KeyW' : 'KeyS'); });
  await p.keyboard.down(key);
  const r = await p.evaluate(() => new Promise((done) => { let t = 0, last = performance.now(), top = 0, ref = 0; const s = window.__sq;
    const f = (now) => { const e = s.sim.S.ents.find((x) => x.peer === s.me.id); t += Math.min((now - last) / 1000, 1 / 20); last = now;
      top = Math.max(top, Math.hypot(s.ctl.vx, s.ctl.vz)); ref = Math.max(ref, Math.hypot(e.vx, e.vz)); if (t >= 0.6) done({ top, ref }); else requestAnimationFrame(f); };
    requestAnimationFrame(f); }));
  await p.keyboard.up(key); return r;
}

console.log('1. Level 8 with Toy Sack (Santa Bag) + Elf Shoes: 15 snowballs (10 × 1.5) on the counter; 25% faster than without');
let plain;
{ const { p, errors, ctx } = await practice(8, {});
  plain = await topSpeed(p); check(Math.abs(plain.top - 6.4) < 0.2, `no gear: my page runs at ${plain.top.toFixed(2)} (HUMAN_SPEED 6.4)`);
  check(await p.waitForFunction(() => document.querySelectorAll('#hud .pips u').length === 10, null, { timeout: 10000 }).then(() => true, () => false), 'no gear: 10 pips (level 8)');
  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : '')); await ctx.close(); }
{ const { p, errors, ctx } = await practice(8, { g1: 'gear_sack', g2: 'gear_shoes' });
  const m = await me(p); check(m.gear.join() === 'bag,shoes' && m.max === 15 && m.ammo === 15, `the referee wears it: ${JSON.stringify(m)}`);
  check(await p.waitForFunction(() => document.querySelectorAll('#hud .pips u').length === 15, null, { timeout: 10000 }).then(() => true, () => false),
    'the counter shows 15 pips: ' + (await p.evaluate(() => document.querySelectorAll('#hud .pips u').length)));
  const fast = await topSpeed(p);
  check(Math.abs(fast.top - 8.0) < 0.25 && fast.top > plain.top * 1.2, `Elf Shoes: my page runs at ${fast.top.toFixed(2)} (6.4 × 1.25 = 8.0; without: ${plain.top.toFixed(2)})`);
  check(fast.ref > 7.5, `and the referee takes it (its speed for me ${fast.ref.toFixed(2)}, not clipped to 6.4)`);
  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : '')); await ctx.close(); }

console.log('2. I.C.E. Kevlar Vest (the Pumpkin Costume is retired, 2026-10-03) in a real practice match: the 1st hit takes the extra hit, the 2nd knocks me down, then it comes back');
{ const { p, errors, ctx } = await practice(1, { g1: 'gear_kevlar' });
  // a bot's snowball, thrown at me from 1.5 away by the referee's own rules (the bots themselves are disarmed)
  const hitMe = async () => { const before = await p.evaluate(() => window.__sq.sim.S.ev.filter((v) => v[1] === 'hit').length);
    await p.evaluate(() => { const S = window.__sq.sim.S, e = S.ents.find((x) => x.peer === window.__sq.me.id), b = S.ents.find((x) => x.bot);
      const dx = 0.6, dz = 0.8; S.balls.push({ id: S.nextBall++, owner: b.id, sm: 1, kind: '', r: 1, stunSec: 0, g: 0, age: 0, x: e.x - dx * 1.5, y: 1.15, z: e.z - dz * 1.5, vx: dx * 18, vy: 0, vz: dz * 18, life: 2 }); });
    return p.waitForFunction((n) => { const S = window.__sq.sim.S; return !S.balls.length && S.ev.filter((v) => v[1] === 'hit').length > n; }, before, { timeout: 15000 }).then(() => true, () => false); };
  const m0 = await me(p); check(m0.gear.join() === 'kevlar' && m0.xh === 1, `wearing it: 1 extra hit (${JSON.stringify(m0)})`);
  check(await p.waitForFunction(() => /You · \+1 hit(?!s)/.test(document.querySelector('#hud')?.textContent || ''), null, { timeout: 10000 }).then(() => true, () => false), 'my score plaque says +1 hit');
  check(await hitMe(), 'hit 1 landed'); const m1 = await me(p);
  check(m1.stun <= 0 && m1.xh === 0, `hit 1: still standing, extra hit used (${JSON.stringify(m1)})`);
  check(await p.waitForFunction(() => /You · \+0 hits/.test(document.querySelector('#hud')?.textContent || ''), null, { timeout: 10000 }).then(() => true, () => false), 'the plaque says +0 hits');
  check(await hitMe(), 'hit 2 landed'); const m2 = await me(p);
  check(m2.stun > 0 && m2.xh === 1, `hit 2: knocked down, and the extra hit is back (${JSON.stringify(m2)})`);
  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : '')); await ctx.close(); }

console.log('3. The load screen lists real gear (a Gift Box shows what it turned into); none = "none"');
{ const { p, errors, ctx } = await practice(8, { g1: 'gear_gift', g2: 'gear_shoes' }, { stopAtIntro: true });
  const row = await p.evaluate(() => document.querySelector('#panel .lineup li.me').textContent.replace(/\s+/g, ' ').trim());
  const pick = await p.evaluate(() => { const s = window.__sq; return s.sim.S.ents.find((x) => x.peer === s.me.id).gear.find((k) => k !== 'shoes'); });
  check(/Gear\s*Gift Box \([^)]+\) · Elf Shoes/.test(row) && !!pick, `my row: ${row.slice(row.indexOf('Gear'))} (the referee picked "${pick}")`);
  check(!/coming soon/.test(row), 'no "coming soon"');
  await ctx.close(); check(!errors.length, 'no page errors'); }

console.log('4. Elf Hat in a two-player room: the wearer is drawn at half size on both screens; everyone else full size');
{ const ctx = await context(), A = await page(ctx), B = await page(ctx);
  await A.p.evaluate(() => { const s = window.__sq; s.me.l = 1; Object.assign(s.me.a, { g1: 'gear_none', g2: 'gear_none' }); return s.enterRoom('GEARHAT', false); });
  // B joins second (so A referees, and reads B's gear from what B's browser announces: avatar a, level l)
  await B.p.evaluate(() => { const s = window.__sq; s.me.l = 1; Object.assign(s.me.a, { g1: 'gear_elfhat', g2: 'gear_none' }); return s.enterRoom('GEARHAT', false); });
  const bId = await A.p.waitForFunction((bp) => { const s = window.__sq; return s.isHost && s.sim?.S.ents.find((e) => e.peer === bp && e.gear.includes('elfhat'))?.id; }, await B.p.evaluate(() => window.__sq.me.id), { timeout: 60000 }).then((h) => h.jsonValue(), () => null);
  check(!!bId, 'A referees and put the Elf Hat on B (from B\'s announced avatar)');
  const sizes = (p) => p.evaluate((bId) => { const s = window.__sq; return (s.view?.ents || []).map((e) => [e.id === bId ? 'B' : e.bot ? 'bot' : 'A', s.drawnScale(e.id)]); }, bId);
  for (const [name, P] of [['A (referee)', A.p], ['B (wearer)', B.p]]) {
    const ok = await P.waitForFunction((bId) => window.__sq.drawnScale(bId) === 0.5, bId, { timeout: 30000 }).then(() => true, () => false);
    const all = await sizes(P);
    check(ok && all.filter(([n]) => n !== 'B').every(([, sc]) => sc === 1), `${name}'s screen: ${JSON.stringify(all)}`);
  }
  await B.p.screenshot({ path: 'out/gear-elfhat.png' });
  check(!A.errors.length && !B.errors.length, 'no page errors' + [...A.errors, ...B.errors].map((e) => ': ' + e).join(''));
  await ctx.close(); }

console.log('5. The local stand-in save (?net=local) refuses gear the way the database (015 save_profile) does');
{ const ctx = await context(), { p, errors } = await page(ctx);
  const r = await p.evaluate(async () => {
    const { accounts } = await import('./net.js'), C = await import('./catalog.js'), { statOf } = await import('./gear.js');
    const acct = accounts({ local: true, rules: { SLOTS: C.SLOTS, SB_SLOTS: C.SB_SLOTS, GEAR_SLOTS: C.GEAR_SLOTS, statOf, BY_ID: C.BY_ID, usable: C.usable, DEFAULT_AVATAR: C.DEFAULT_AVATAR } });
    await acct.signIn(); const prof = await acct.profile();
    const db = () => JSON.parse(localStorage.getItem('sq-local-db')), put = (d) => localStorage.setItem('sq-local-db', JSON.stringify(d));
    const setUp = (level, inv) => { const d = db(); d.profiles[prof.id].level = level; d.inv[prof.id] = inv; put(d); };
    const save = (g) => acct.save('Gearo', { ...C.DEFAULT_AVATAR, ...g }).then((x) => [x.avatar.g1, x.avatar.g2].join(','), (e) => 'refused: ' + e.message);
    setUp(1, ['gear_sack', 'gear_backpack', 'gear_shoes', 'gear_santa']); const out = {};
    out.none = await save({});
    out.notOwned = await save({ g1: 'gear_pumpkin' });
    out.owned = await save({ g1: 'gear_sack' });
    out.notGear = await save({ g1: 'sb_ice' });
    out.g2low = await save({ g1: 'gear_sack', g2: 'gear_shoes' });
    out.santaLow = await save({ g1: 'gear_santa' });
    setUp(8, ['gear_sack', 'gear_backpack', 'gear_shoes', 'gear_santa']);
    out.two = await save({ g1: 'gear_sack', g2: 'gear_shoes' });
    out.same = await save({ g1: 'gear_sack', g2: 'gear_sack' });
    out.stack = await save({ g1: 'gear_sack', g2: 'gear_backpack' });
    out.santa = await save({ g1: 'gear_santa' });
    return out; });
  const want = { none: 'gear_none,gear_none', notOwned: /isn't unlocked/, owned: 'gear_sack,gear_none', notGear: /isn't unlocked/, g2low: /level 8/, santaLow: /level 3/,
    two: 'gear_sack,gear_shoes', same: /two slots/, stack: /same stat/, santa: 'gear_santa,gear_none' };
  for (const [k, w] of Object.entries(want)) check(typeof w === 'string' ? r[k] === w : w.test(r[k]), `${k}: ${r[k]}`);
  check(!errors.length, 'no page errors'); await ctx.close(); }

console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); process.exit(0);
