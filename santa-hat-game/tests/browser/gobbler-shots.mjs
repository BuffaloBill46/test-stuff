// Pictures of the Thanksgiving pass's GOBBLER costume (2026-10-03) for review, and a check that its hat and tail never hide the
// head: the Avatar screen (desktop and phone, the whole costume tried on from the Costumes tab, and each piece's tab), a head
// close-up from the match camera's angle, a turnaround drawn with the game's own model code, a practice match with everyone in
// it at the normal camera distance (computer and phone, front and back), and a swatch strip of the season's 5 free colours on
// snow and on the dark tiles. Checks no page errors.
// The head check is measured, not eyeballed: from every match camera (player and watcher; computer and phone upright; zoom 0.6
// to 2.5; the player anywhere on the field), facing the camera or turned up to 0.6 either way, a line to each eye, the beak and
// the wattle must reach it as far with the pilgrim hat on as with no hat (the hat hides nothing of the face); turned away, a
// line to the back and top of the head (and the hat) must reach it as far with the tail fan on as with no back piece.
// Run (Windows Chrome): PW=<folder with node_modules/playwright> node --import ./win-chrome.mjs gobbler-shots.mjs
// Screenshots: out/gobbler/
import { createRequire } from 'module'; import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, OUT = 'out/gobbler', fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync(OUT, { recursive: true });
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(vp) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 900, isMobile: vp.width < 900 });
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
const save = (shots) => { for (const [k, url] of Object.entries(shots)) writeFileSync(`${OUT}/${k}.png`, Buffer.from(url.split(',')[1], 'base64')); };

console.log('1. The Avatar screen (desktop and phone)');
for (const vp of [{ width: 1280, height: 860, tag: 'desk' }, { width: 390, height: 844, tag: 'phone' }]) {
  const { p, ctx, errors } = await open(vp);
  await p.click('#t-avatar'); await p.waitForTimeout(500); await p.click('#avslots [data-slot="costume"]'); await p.waitForTimeout(400);
  const card = await p.evaluate(() => document.querySelector('#avgrid [data-costume="gobbler"]')?.textContent || '');
  check(/The Gobbler/.test(card) && /Thanksgiving pass/.test(card), `${vp.tag}: a Gobbler card tagged Thanksgiving pass ("${card.slice(0, 80)}")`);
  const back = await p.evaluate(() => document.querySelector('#avgrid [data-pick="pack_gobbler"]')?.textContent || '');
  check(/The Gobbler's back piece/.test(back) && !/The The/.test(back), `${vp.tag}: the Tail Fan reads "The Gobbler's back piece" ("${back.slice(0, 60)}")`);
  await p.click('#avgrid [data-costume="gobbler"]'); await p.waitForTimeout(1500);
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/${vp.tag}-avatar-costume.png` });
  const msg = await p.evaluate(() => ({ save: document.querySelector('#avsave').disabled, msg: document.querySelector('#avmsg').textContent }));
  check(msg.save && /isn't unlocked/.test(msg.msg), `${vp.tag} guest: previewed, Save off ("${msg.msg.slice(0, 60)}…")`);
  // (back pieces have no tab of their own: they're on the Costumes tab, below the costumes)
  if (vp.tag === 'desk') for (const slot of ['face', 'hat', 'shirt', 'pants', 'costume', 'snow']) { await p.click(`#avslots [data-slot="${slot}"]`); await p.waitForTimeout(500);
    await p.evaluate((id) => document.querySelector(`#avgrid [data-pick="${id}"]`)?.scrollIntoView({ block: 'center' }), (slot === 'costume' ? 'pack' : slot) + '_gobbler'); await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/avatar-${slot === 'costume' ? 'pack' : slot}-tab.png` }); }
  noErrors(errors, vp.tag + ' avatar'); await ctx.close();
}

console.log('2. The head from every match camera: the hat hides no part of the face, the tail never hides the head');
{ const { p, ctx, errors } = await open({ width: 1280, height: 800 });
  const r = await p.evaluate(async () => {
    const { avatarCharacter } = await import('./tabs.js'), { THREE } = await import('./kit.js'), { DEFAULT_AVATAR, costumeItems } = await import('./catalog.js');
    const full = { ...DEFAULT_AVATAR }; for (const i of costumeItems('gobbler')) full[i.slot] = i.id;
    // the solid meshes (not the ink outlines, drawn inside out); `hat`: include the hat mesh or not
    const solids = (ch, hat = true) => { ch.updateMatrixWorld(true); const out = []; ch.traverse((o) => { if (o.isMesh && o.material.side !== THREE.BackSide && (hat || o !== ch.userData.hatMesh)) out.push(o); }); return out; };
    const ray = new THREE.Raycaster(), first = (cam, pt, meshes) => { const d = pt.clone().sub(cam), len = d.length(); ray.set(cam, d.normalize()); ray.far = len + 1; const h = ray.intersectObjects(meshes, false)[0]; return h ? h.distance : Infinity; };
    // the match camera's offsets (online.js: player computer, player phone upright, watcher computer, watcher phone upright),
    // scaled by the zoom, seen from a player standing anywhere on the field (the camera follows 55% of the player's position)
    const BASES = [[0, 14, 12.5], [0, 21, 15], [0, 18, 16], [0, 26, 19]], cams = [];
    for (const b of BASES) for (const z of [0.6, 1, 2.5]) for (const px of [-12, -6, 0, 6, 12]) for (const pz of [-12, -6, 0, 6, 12])
      cams.push(new THREE.Vector3(b[0] * z - 0.45 * px, b[1] * z, b[2] * z - 0.45 * pz));
    const FACE = [[-0.1, 1.885, 0.27], [0.1, 1.885, 0.27], [0, 1.775, 0.42], [0, 1.64, 0.305]], HEAD = [[0, 1.86, -0.26], [0, 2.08, -0.12], [-0.18, 1.9, -0.18], [0.18, 1.9, -0.18], [0, 2.4, -0.15]];
    let faceRays = 0, faceHid = 0, backRays = 0, backHid = 0; const worst = [];
    const withTail = avatarCharacter(full), noTail = avatarCharacter({ ...full, pack: 'pack_none' });
    for (const cam of cams) { const yaw = Math.atan2(cam.x, cam.z);
      for (const dy of [-0.6, -0.3, 0, 0.3, 0.6]) {
        // facing the camera: each face point as far with the hat as without
        withTail.rotation.y = yaw + dy; const a = solids(withTail, true), b = solids(withTail, false);
        for (const f of FACE) { const pt = withTail.localToWorld(new THREE.Vector3(...f)), dh = first(cam, pt, a), dn = first(cam, pt, b); faceRays++;
          if (dh < dn - 0.005) { faceHid++; if (worst.length < 5) worst.push(`face ${f} cam ${cam.toArray().map((v) => v.toFixed(1))} turn ${dy}`); } }
        // turned away: each head point as far with the tail fan as without a back piece
        withTail.rotation.y = noTail.rotation.y = yaw + Math.PI + dy; const c = solids(withTail), d = solids(noTail);
        for (const h of HEAD) { const pt = withTail.localToWorld(new THREE.Vector3(...h)), dt = first(cam, pt, c), dn = first(cam, pt, d); backRays++;
          if (dt < dn - 0.005) { backHid++; if (worst.length < 10) worst.push(`head ${h} cam ${cam.toArray().map((v) => v.toFixed(1))} turn ${dy}`); } } } }
    // the close-up pictures: the head from the computer player camera's angle (front and back), and with the Santa hat on top
    const { lights } = await import('./kit.js'), rd = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }), shots = {};
    rd.setSize(900, 600, false);
    const scene = () => { const s = new THREE.Scene(); s.background = new THREE.Color(0xe6ecf5); lights(s, { hemi: 1.7, moonI: 1.6 }); return s; };
    const dir = new THREE.Vector3(0, 14, 12.5).normalize(), shot = (ry, name) => { const s = scene(), ch = avatarCharacter(full); ch.rotation.y = ry; s.add(ch);
      const cam = new THREE.PerspectiveCamera(30, 1.5, 0.1, 50); cam.position.copy(dir.clone().multiplyScalar(3.2).add(new THREE.Vector3(0, 1.7, 0))); cam.lookAt(0, 1.7, 0);
      rd.render(s, cam); shots[name] = rd.domElement.toDataURL('image/png'); };
    shot(0, 'head-matchcam-front'); shot(0.5, 'head-matchcam-turned'); shot(Math.PI, 'head-matchcam-back'); shot(Math.PI - 0.5, 'head-matchcam-back-turned');
    return { faceRays, faceHid, backRays, backHid, worst, shots };
  });
  save(r.shots);
  check(r.faceHid === 0, `the pilgrim hat hides no face point (eyes, beak, wattle) from any match camera: ${r.faceHid} of ${r.faceRays} lines blocked${r.worst.length ? ' — ' + r.worst.join(' | ') : ''}`);
  check(r.backHid === 0, `the tail fan never hides the head or hat from behind: ${r.backHid} of ${r.backRays} lines blocked`);
  noErrors(errors, 'head check'); await ctx.close(); }

console.log('3. Turnaround (front, side, back, three-quarter) and a close-up of the head and hat');
{ const { p, ctx, errors } = await open({ width: 1280, height: 800 });
  const shots = await p.evaluate(async () => {
    const { avatarCharacter } = await import('./tabs.js'), { THREE, lights } = await import('./kit.js'), { DEFAULT_AVATAR, costumeItems } = await import('./catalog.js');
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }), out = {};
    const a = { ...DEFAULT_AVATAR }; for (const i of costumeItems('gobbler')) a[i.slot] = i.id;
    const scene = () => { const s = new THREE.Scene(); s.background = new THREE.Color(0x141b36); lights(s, { hemi: 1.7, moonI: 1.6 }); return s; };
    r.setSize(1500, 560, false); let s = scene();
    [0, Math.PI / 2, Math.PI, -Math.PI / 4].forEach((ry, k) => { const ch = avatarCharacter(a); ch.rotation.y = ry - 0.3; ch.position.x = (k - 1.5) * 2.2; s.add(ch); });
    let cam = new THREE.PerspectiveCamera(30, 1500 / 560, 0.1, 50); cam.position.set(0, 1.6, 9.6); cam.lookAt(0, 1.45, 0); r.render(s, cam); out.turnaround = r.domElement.toDataURL('image/png');
    r.setSize(800, 600, false); s = scene(); const ch = avatarCharacter(a); ch.rotation.y = -0.4; s.add(ch);
    cam = new THREE.PerspectiveCamera(30, 800 / 600, 0.1, 50); cam.position.set(0, 2.3, 2.6); cam.lookAt(0, 2.0, 0); r.render(s, cam); out.head = r.domElement.toDataURL('image/png');
    return out; });
  save(shots);
  noErrors(errors, 'turnaround'); await ctx.close(); }

console.log('4. A practice match, everyone in the Gobbler, at the normal camera distance (computer and phone)');
for (const vp of [{ width: 1280, height: 800, tag: 'desk' }, { width: 390, height: 844, tag: 'phone' }]) {
  const { p, ctx, errors } = await open(vp);
  const C = await p.evaluate(async () => Object.fromEntries((await import('./catalog.js')).costumeItems('gobbler').map((i) => [i.slot, i.id])));
  await p.evaluate(async (C) => { (await import('./sim.js')).K.MIN_BODIES = 8; const s = window.__sq; s.me.a = { ...s.me.a, ...C }; s.setZoom(1); s.startPractice(); }, C);
  await p.waitForFunction(() => document.querySelector('#start'), null, { timeout: 30000 }); await p.evaluate(() => document.querySelector('#start').click());
  await p.waitForFunction(() => { const s = window.__sq; if (/^(intro|count)$/.test(s.sim?.S.phase)) s.sim.S.time = 0; return s.view?.phase === 'play'; }, null, { timeout: 60000 });
  await p.evaluate(async (C) => { const { botAvatar } = await import('./refcore.js'), s = window.__sq, sim = s.sim, step = sim.step;
    window.__pin = { face: 0.4 };
    sim.S.ents.filter((e) => e.bot).forEach((e) => Object.assign(botAvatar(e.id), C));
    sim.step = (dt) => { step(dt); const S = sim.S, me = S.ents.find((e) => e.peer === s.me.id), row = [me, ...S.ents.filter((e) => e !== me)];
      row.forEach((e, i) => { const x = -4.2 + i * 1.2; if (e === me) { s.ctl.x = x; s.ctl.z = 3.5; s.ctl.vx = s.ctl.vz = 0; s.ctl.face = window.__pin.face; }
        e.x = x; e.z = 3.5; e.vx = e.vz = 0; e.face = window.__pin.face; if (e.bot) { e.ammo = 0; e.cool = 99; } });
      S.time = 60; }; }, C);
  await p.waitForFunction(() => window.__sq.view?.ents.length === 8, null, { timeout: 30000 }); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/${vp.tag}-match-normal-front.png` });
  await p.evaluate(() => { window.__pin.face = Math.PI; }); await p.waitForTimeout(2000); await p.screenshot({ path: `${OUT}/${vp.tag}-match-normal-back.png` });
  await p.evaluate(() => { window.__pin.face = 0; window.__sq.setZoom(0.6); }); await p.waitForTimeout(2500); await p.screenshot({ path: `${OUT}/${vp.tag}-match-close-front.png` });
  noErrors(errors, vp.tag + ' match'); await ctx.close();
}

console.log('5. The 5 free Thanksgiving colours (the Avatar thumbnails) on snow and on the dark tiles');
{ const { p, ctx, errors } = await open({ width: 1280, height: 800 });
  const r = await p.evaluate(async () => {
    const { thumbnail } = await import('./tabs.js'), { ITEMS } = await import('./catalog.js');
    const free = ITEMS.filter((i) => i.season === 'thanksgiving' && !i.set), W = 180, cv = document.createElement('canvas'); cv.width = free.length * W; cv.height = 2 * W + 40;
    const g = cv.getContext('2d'); g.fillStyle = '#e6ecf5'; g.fillRect(0, 0, cv.width, W + 20); g.fillStyle = '#141b36'; g.fillRect(0, W + 20, cv.width, W + 20);
    const img = (src) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.src = src; });
    for (const [k, it] of free.entries()) { const im = await img(thumbnail(it));
      g.drawImage(im, k * W + 10, 0, W - 20, W - 20); g.drawImage(im, k * W + 10, W + 20, W - 20, W - 20);
      g.font = '700 14px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#141b36'; g.fillText(it.name, k * W + W / 2, W + 8); g.fillStyle = '#e6ecf5'; g.fillText(it.name, k * W + W / 2, 2 * W + 34); }
    return { url: cv.toDataURL('image/png'), names: free.map((i) => i.name) }; });
  save({ 'free-colours': r.url });
  check(r.names.join() === 'Cranberry,Pumpkin Pie,Harvest Gold,Maple Leaf,Corn Husk', 'the five free Thanksgiving colours: ' + r.names.join(', '));
  noErrors(errors, 'swatches'); await ctx.close(); }

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED:\n - ${fails.join('\n - ')}` : '\nALL PASSED'); process.exit(fails.length ? 1 : 0);
