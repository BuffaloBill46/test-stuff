// Pictures of the Halloween pass's PUMPKIN KING costume (2026-10-03) for review: the Avatar screen (desktop, the whole costume
// tried on from the Costumes tab, and each piece's tab), a turnaround drawn with the game's own model code, and a practice match
// at night with everyone in it (close and at the normal camera distance, front and back). Checks no page errors.
// Run (Windows Chrome): PW=<folder with node_modules/playwright> node --import ./win-chrome.mjs pumpkinking-shots.mjs
// Screenshots: out/pumpkinking/
import { createRequire } from 'module'; import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, OUT = 'out/pumpkinking', fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync(OUT, { recursive: true });
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(vp) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.abort(); });
  const p = await ctx.newPage(), errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost/online.html?net=local', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(800);
  return { p, ctx, errors };
}
const noErrors = (errors, where) => check(!errors.length, `no page errors (${where})` + (errors.length ? ': ' + errors.join(' | ') : ''));

console.log('1. The Avatar screen (desktop)');
{ const { p, ctx, errors } = await open({ width: 1280, height: 860 });
  await p.click('#t-avatar'); await p.waitForTimeout(500); await p.click('#avslots [data-slot="costume"]'); await p.waitForTimeout(400);
  await p.click('#avgrid [data-costume="pumpkinking"]'); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/avatar-costume.png` });
  const msg = await p.evaluate(() => ({ save: document.querySelector('#avsave').disabled, msg: document.querySelector('#avmsg').textContent }));
  check(msg.save && /isn't unlocked/.test(msg.msg), `guest: previewed, Save off ("${msg.msg.slice(0, 60)}…")`);
  for (const slot of ['face', 'hat', 'shirt']) { await p.click(`#avslots [data-slot="${slot}"]`); await p.waitForTimeout(500);
    await p.evaluate((id) => document.querySelector(`#avgrid [data-pick="${id}"]`)?.scrollIntoView({ block: 'center' }), slot + '_pumpkinking'); await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/avatar-${slot}-tab.png` }); }
  noErrors(errors, 'avatar'); await ctx.close(); }

console.log('2. Turnaround (front, side, back) and a close-up of the head and hat');
{ const { p, ctx, errors } = await open({ width: 1280, height: 800 });
  const shots = await p.evaluate(async () => {
    const { avatarCharacter } = await import('./tabs.js'), { THREE, lights } = await import('./kit.js'), { DEFAULT_AVATAR, costumeItems } = await import('./catalog.js');
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }), out = {};
    const a = { ...DEFAULT_AVATAR }; for (const i of costumeItems('pumpkinking')) a[i.slot] = i.id;
    const scene = (n) => { const s = new THREE.Scene(); s.background = new THREE.Color(0x141b36); lights(s, { hemi: 1.7, moonI: 1.6 }); return s; };
    r.setSize(1500, 560, false); let s = scene();
    [0, Math.PI / 2, Math.PI, -Math.PI / 4].forEach((ry, k) => { const ch = avatarCharacter(a); ch.rotation.y = ry - 0.3; ch.position.x = (k - 1.5) * 2.2; s.add(ch); });
    let cam = new THREE.PerspectiveCamera(30, 1500 / 560, 0.1, 50); cam.position.set(0, 1.6, 9.6); cam.lookAt(0, 1.45, 0); r.render(s, cam); out.turnaround = r.domElement.toDataURL('image/png');
    r.setSize(800, 600, false); s = scene(); const ch = avatarCharacter(a); ch.rotation.y = -0.4; s.add(ch);
    cam = new THREE.PerspectiveCamera(30, 800 / 600, 0.1, 50); cam.position.set(0, 2.3, 2.6); cam.lookAt(0, 2.0, 0); r.render(s, cam); out.head = r.domElement.toDataURL('image/png');
    return out; });
  for (const [k, url] of Object.entries(shots)) writeFileSync(`${OUT}/${k}.png`, Buffer.from(url.split(',')[1], 'base64'));
  noErrors(errors, 'turnaround'); await ctx.close(); }

console.log('3. A practice match at night, everyone in the Pumpkin King');
{ const { p, ctx, errors } = await open({ width: 1280, height: 800 });
  const C = await p.evaluate(async () => Object.fromEntries((await import('./catalog.js')).costumeItems('pumpkinking').map((i) => [i.slot, i.id])));
  await p.evaluate(async (C) => { (await import('./sim.js')).K.MIN_BODIES = 8; const s = window.__sq; s.me.a = { ...s.me.a, ...C }; s.setZoom(0.6); s.startPractice(); }, C);
  await p.waitForFunction(() => document.querySelector('#start'), null, { timeout: 30000 }); await p.evaluate(() => document.querySelector('#start').click());
  await p.waitForFunction(() => { const s = window.__sq; if (/^(intro|count)$/.test(s.sim?.S.phase)) s.sim.S.time = 0; return s.view?.phase === 'play'; }, null, { timeout: 60000 });
  await p.evaluate(async (C) => { const { botAvatar } = await import('./refcore.js'), s = window.__sq, sim = s.sim, step = sim.step;
    window.__pin = { face: 0 };
    sim.S.ents.filter((e) => e.bot).forEach((e) => Object.assign(botAvatar(e.id), C));
    sim.step = (dt) => { step(dt); const S = sim.S, me = S.ents.find((e) => e.peer === s.me.id), row = [me, ...S.ents.filter((e) => e !== me)];
      row.forEach((e, i) => { const x = -4.2 + i * 1.2; if (e === me) { s.ctl.x = x; s.ctl.z = 3.5; s.ctl.vx = s.ctl.vz = 0; s.ctl.face = window.__pin.face; }
        e.x = x; e.z = 3.5; e.vx = e.vz = 0; e.face = window.__pin.face; if (e.bot) { e.ammo = 0; e.cool = 99; } });
      S.time = 60; }; }, C);
  await p.waitForFunction(() => window.__sq.view?.ents.length === 8, null, { timeout: 30000 }); await p.waitForTimeout(2000);
  await p.screenshot({ path: `${OUT}/match-close-front.png` });
  await p.evaluate(() => { window.__pin.face = Math.PI; }); await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/match-close-back.png` });
  await p.evaluate(() => { window.__pin.face = 0.4; window.__sq.setZoom(1); }); await p.waitForTimeout(2500); await p.screenshot({ path: `${OUT}/match-normal-zoom.png` });
  noErrors(errors, 'match'); await ctx.close(); }

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED:\n - ${fails.join('\n - ')}` : '\nALL PASSED'); process.exit(fails.length ? 1 : 0);
