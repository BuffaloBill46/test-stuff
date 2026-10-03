// Halloween folk (Cody, 2026-10-03: "add some skeletons, a couple black cats, zombies... make it more spooky"). Screenshots
// to out/halloween-spooky/: a wide view of the plaza, a close-up of each new figure, and the real game's match camera on a
// computer and a phone, at rest and with the match maxed out (8 bodies, the snowball cap in the air: the cat eyes must not
// wash out or look like a game item). And the hard rules, as checks rather than a look:
//   - every vertex of the new props is outside the ring wall (radius 14.4), and none of them is on the camera's (south) side;
//   - none of them blocks the field: rays from every match camera (player and watcher, computer, phone upright and sideways,
//     zoom 0.6 to 4, following a player anywhere on the field) to points on the field hit none of them;
//   - the Christmas plaza has none of them.
// It prints what the Halloween plaza costs to draw (draw calls, triangles, vertices).
// Run: node halloween-spooky-shots.mjs   (on Windows: PW=<playwright folder> node --import ./win-chrome.mjs halloween-spooky-shots.mjs)
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, OUT = 'out/halloween-spooky', fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const serve = (ctx, extra = {}) => ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L -m 20 "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0];
    if (extra[p]) return route.fulfill({ body: extra[p], contentType: 'text/html' });
    const f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.fulfill({ status: 503, body: '' }); });

// ---------- 1. The plaza on its own (plaza.js straight into a bare page): checks, cost, wide view and close-ups
const HARNESS = `<!doctype html><body style="margin:0;background:#000"><script type="module">
import { THREE } from './kit.js'; import { buildPlaza } from './plaza.js';
const cv = document.createElement('canvas'); document.body.appendChild(cv);
const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true }); r.setPixelRatio(1);
const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 400); let plaza = null;
const mine = () => { const l = []; scene.traverse((o) => { if (o.userData.spooky) l.push(o); }); return l; };
window.api = {
  build(theme, t = 3.7) { if (plaza) plaza.dispose(); plaza = buildPlaza(scene, { theme }); plaza.update(t); scene.updateMatrixWorld(true); return mine().length; },
  at(t) { plaza.update(t); scene.updateMatrixWorld(true); },
  spots() { let s = null; scene.traverse((o) => { if (o.userData.spots) s = o.userData.spots; }); return s; },
  reach() { // how close to the middle any vertex of the new props comes, and how far south (toward the camera) any reaches
    let min = Infinity, maxZ = -Infinity, n = 0; const v = new THREE.Vector3();
    for (const top of mine()) top.traverse((o) => { if (!o.isMesh) return; const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); n++; min = Math.min(min, Math.hypot(v.x, v.z)); maxZ = Math.max(maxZ, v.z); } });
    return { min, maxZ, n };
  },
  // A new prop hides part of the field when the line from the camera through one of its points carries on INTO the field
  // (inside radius 13.2, between the ground and hat height 2.4). Checked for every vertex of every new prop, from every camera
  // (stricter than "on screen": it ignores the screen edges). Cheap, unlike casting rays at the merged mesh, which spans the plaza.
  blocked(cfgs) {
    const pts = [], v = new THREE.Vector3(); let hidden = 0, tried = 0, worst = null;
    for (const top of mine()) top.traverse((o) => { if (!o.isMesh) return; const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); pts.push(v.x, v.y, v.z); } });
    for (const k of cfgs) for (let px = -12; px <= 12; px += 3) for (let pz = -12; pz <= 12; pz += 3) {
      if (Math.hypot(px, pz) > 13) continue;
      const tx = px * k.follow, tz = pz * k.follow, cx = tx + k.base[0] * k.zoom, cy = k.base[1] * k.zoom, cz = tz + k.base[2] * k.zoom;
      for (let i = 0; i < pts.length; i += 3) {
        const dx = pts[i] - cx, dy = pts[i + 1] - cy, dz = pts[i + 2] - cz; tried++;
        if (dy >= 0) continue; // going up or level: never comes down into the field
        // the stretch of the line beyond the vertex (s >= 1) that is between hat height and the ground
        const s0 = Math.max(1, (2.4 - cy) / dy), s1 = (0 - cy) / dy; if (s1 < s0) continue;
        const hh = dx * dx + dz * dz, s = Math.min(s1, Math.max(s0, -(cx * dx + cz * dz) / hh)), hx = cx + s * dx, hz = cz + s * dz;
        if (Math.hypot(hx, hz) < 13.2) { hidden++; worst ||= { cam: k.name, from: [cx, cy, cz], through: [pts[i], pts[i + 1], pts[i + 2]] }; }
      }
    }
    return { hidden, seen: tried, worst };
  },
  cost() { let verts = 0; scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isSprite) verts += (o.geometry.attributes.position?.count || 0) * (o.count || 1); });
    r.setSize(800, 500, false); cam.aspect = 1.6; cam.fov = 60; cam.updateProjectionMatrix(); cam.position.set(0, 90, 1); cam.lookAt(0, 0, 0);
    r.info.autoReset = false; r.info.reset(); r.render(scene, cam); return { calls: r.info.render.calls, tris: r.info.render.triangles, verts }; },
  shot(pos, look, w = 960, h = 600, fov = 50) { r.setSize(w, h, false); cam.aspect = w / h; cam.fov = fov; cam.updateProjectionMatrix();
    cam.position.set(...pos); cam.lookAt(...look); r.render(scene, cam); return cv.toDataURL('image/png'); },
};
window.ready = true;
</script>`;
{
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } }); await serve(ctx, { 'harness.html': HARNESS });
  const p = await ctx.newPage(), errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost/harness.html'); await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
  const save = async (name, ...a) => writeFileSync(`${OUT}/${name}.png`, Buffer.from((await p.evaluate((a) => window.api.shot(...a), a)).split(',')[1], 'base64'));

  check(await p.evaluate(() => window.api.build('christmas')) === 0, 'Christmas: none of the new props');
  const nH = await p.evaluate(() => window.api.build('halloween'));
  const spots = await p.evaluate(() => window.api.spots());
  check(nH > 0 && spots?.length === 8, `Halloween: the new props are there (${nH} pieces, ${spots?.length} figures: ${spots?.map((s) => s.kind).join(', ')})`);
  // the props move a little (sway, wave, tails), so measure at a few moments
  let reach = { min: Infinity, maxZ: -Infinity };
  for (const t of [0, 1.3, 3.7, 7.9]) { await p.evaluate((t) => window.api.at(t), t); const q = await p.evaluate(() => window.api.reach()); reach = { min: Math.min(reach.min, q.min), maxZ: Math.max(reach.maxZ, q.maxZ), n: q.n }; }
  check(reach.min > 14.4 + 0.5, `every new vertex is outside the ring wall: the nearest is ${reach.min.toFixed(2)} from the middle (wall 14.4; ${reach.n} vertices)`);
  check(reach.maxZ < 6, `nothing new on the camera's (south) side: the furthest south is z ${reach.maxZ.toFixed(2)}`);

  // the match cameras exactly as online.js places them (player: follows 0.55 of the player's spot; watcher: half the hat's)
  const cams = [];
  for (const zoom of [0.6, 1, 2, 4]) for (const [name, aspect, portrait] of [['computer', 1280 / 800, false], ['phone upright', 384 / 740, true], ['phone sideways', 844 / 390, false]]) {
    cams.push({ name: `player ${name} zoom ${zoom}`, zoom, aspect, fov: portrait ? 62 : 50, base: portrait ? [0, 21, 15] : [0, 14, 12.5], lookY: 0.6, lookBack: 1.2, follow: 0.55 });
    cams.push({ name: `watcher ${name} zoom ${zoom}`, zoom, aspect, fov: portrait ? 66 : 52, base: portrait ? [0, 26, 19] : [0, 18, 16], lookY: 0.5, lookBack: 1, follow: 0.5 });
  }
  let bl = { hidden: 0, seen: 0, worst: null };
  for (const t of [0, 3.7]) { await p.evaluate((t) => window.api.at(t), t); const b = await p.evaluate((c) => window.api.blocked(c), cams); bl = { hidden: bl.hidden + b.hidden, seen: bl.seen + b.seen, worst: bl.worst || b.worst }; }
  check(bl.hidden === 0, `no match camera loses sight of the field: ${bl.hidden} of ${bl.seen} lines from a camera through a new prop reach the field (${cams.length} cameras × player spots × prop vertices)` + (bl.worst ? ' first: ' + JSON.stringify(bl.worst) : ''));

  await p.evaluate(() => window.api.at(3.7));
  const cost = await p.evaluate(() => window.api.cost());
  console.log(`    Halloween plaza, whole plaza in view: ${cost.calls} draw calls, ${cost.tris} triangles, ${cost.verts} vertices (outlines included)`);
  check(cost.calls <= 140 && cost.verts <= 150000, `Halloween stays in budget (≤ 140 draw calls, ≤ 150k vertices; was 120 and 121.5k before the folk)`);

  // wide views: the whole plaza from high on the south side, and from the north-east over the graveyard
  await save('wide-plaza', [0, 34, 36], [0, 0, -4], 1280, 800);
  await save('wide-from-east', [26, 16, 14], [0, 0, -6], 1280, 800);
  // close-ups: each figure from the middle's side (they face it), a little above
  for (const [i, s] of spots.entries()) {
    const [x, y, z] = s.at, d = Math.hypot(x, z), ux = -x / d, uz = -z / d, cat = s.kind.startsWith('cat'), peek = s.kind.includes('peeking');
    const back = cat ? 1.5 : 3.2, up = cat ? 0.7 : 1.4, side = peek ? 1.6 : 0.5, aim = cat ? 0.25 : 0.9;
    const pos = [x + ux * back - uz * side, y + up, z + uz * back + ux * side];
    await save(`close-${i + 1}-${s.kind.replace(/\s+/g, '-')}`, pos, [x, y + aim, z], 900, 600, 45);
  }
  check(!errors.length, 'plaza page: no errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

// ---------- 2. The real game page (theme-test.mjs's setup): the plaza at rest and the match camera, computer and phone
async function open(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900, isMobile: w < 900, deviceScaleFactor: 1 }); await serve(ctx);
  const p = await ctx.newPage(), errors = []; p.on('pageerror', (e) => errors.push(e.message));
  const frames = (n) => p.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  await p.goto('http://localhost/online.html?net=local#play', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await frames(3);
  return { ctx, p, errors, frames };
}
for (const [w, h] of [[1280, 800], [384, 740]]) {
  const S = `${w}x${h}`, t = await open(w, h), { p } = t;
  await p.evaluate(() => window.__sq.setTheme('halloween')); await t.frames(4);
  check(await p.evaluate(() => window.__sq.theme) === 'halloween', `${S} Halloween on`);
  await p.screenshot({ path: `${OUT}/game-rest-${S}.png` });
  // a practice match, the normal camera (zoom 1)
  await p.evaluate(() => { window.__sq.setZoom(1); document.querySelector('#t-play').click(); document.querySelector('#playUnranked')?.click(); });
  await p.evaluate(async () => { (await import('./sim.js')).K.MIN_BODIES = 8; window.__sq.startPractice(); }); await p.evaluate(() => document.querySelector('#start')?.click());
  await p.waitForFunction(() => { const s = window.__sq; if (/^(intro|count)$/.test(s.sim?.S.phase)) s.sim.S.time = 0; return s.view?.phase === 'play'; }, null, { timeout: 90000 });
  await t.frames(20);
  await p.screenshot({ path: `${OUT}/match-${S}.png` });
  // maxed out: everyone's snowballs topped up and thrown as fast as they aim (as theme-test.mjs does), then pulled back a
  // little so the figures around the ring are in the picture with the snowballs
  await p.evaluate(() => { window.__max = setInterval(() => { const s = window.__sq, v = s.view; if (!s.sim || !v) return;
    for (const e of s.sim.S.ents) { e.cool = 0; e.ammo = Math.max(e.ammo, e.max); e.stun = 0; }
    const me = v.ents.find((e) => e.peer === s.me.id), foe = v.ents.filter((e) => e.bot).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
    if (me && foe) s.throwAt(foe.x, foe.z); }, 100); });
  await p.waitForFunction(() => (window.__sq.view?.balls.length || 0) >= 12, null, { timeout: 120000 });
  await p.screenshot({ path: `${OUT}/match-maxed-${S}.png` });
  await p.evaluate(() => window.__sq.setZoom(1.75)); await t.frames(30);
  await p.screenshot({ path: `${OUT}/match-maxed-zoomed-out-${S}.png` });
  const busy = await p.evaluate(() => ({ bodies: window.__sq.view.ents.length, balls: window.__sq.view.balls.length }));
  check(busy.bodies === 8, `${S} maxed match: ${busy.bodies} bodies, ${busy.balls} snowballs in the air`);
  await p.evaluate(async () => { clearInterval(window.__max); window.__sq.setZoom(1); (await import('./sim.js')).K.MIN_BODIES = 4; });
  check(!t.errors.length, `${S} no page errors` + (t.errors.length ? ': ' + t.errors.join(' | ') : ''));
  await t.ctx.close();
}
console.log(`Screenshots in tests/browser/${OUT}/`);
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); process.exit(fails.length ? 1 : 0);
