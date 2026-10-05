// Marketing gameplay clip (Cody's player intro video, 2026-10-04): a REAL practice match on the page, tall 9:16, recorded by
// the browser. Me = the normal look; the first four bots wear Panda / Frost King / Nutcracker / Pumpkin King (only this
// recording swaps their looks: a served copy of refcore.js reads globalThis.__promo; the repo file is untouched).
// Writes marketing/raw/gameplay-<n>.webm. Run: node promo-gameplay.mjs [seconds=14] [zoom=1.7] [tag]
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = path.resolve('../../mockups'), OUT = path.resolve('../../marketing/raw'); mkdirSync(OUT, { recursive: true });
const SECS = +(process.argv[2] || 14), ZOOM = process.argv[3] || '1.7', TAG = process.argv[4] || 'a';
// Options (Cody 2026-10-05: "show them playing in the halloween arena and then the xmas arena, then 1 screenshot of each arena full
// with them playing"): THEME=halloween|christmas (the plaza), BODIES=8 (a full arena: me + 7), W/H (the window), SHOT=<file.png> with
// SHOT_AT=<seconds> (one picture of the page at that moment, saved to marketing/stills/), NOREC=1 (picture only, no video).
const W = +(process.env.W || 540), H = +(process.env.H || 960), THEME = process.env.THEME || '', BODIES = +(process.env.BODIES || 5);
const SHOT = process.env.SHOT || '', SHOT_AT = +(process.env.SHOT_AT || 8), NOREC = !!process.env.NOREC;
const LOOKS = [
  { face: 'face_panda', shirt: 'shirt_coal', pants: 'pants_snow', hat: 'hat_earmuffs' },
  { shirt: 'shirt_frostking', pants: 'pants_frostking', face: 'face_frostking', hat: 'hat_icecrown', pack: 'pack_icewings', snow: 'snow_crystal' },
  { shirt: 'shirt_nutcracker', pants: 'pants_nutcracker', face: 'face_nutcracker', hat: 'hat_nutcracker', pack: 'pack_drum', snow: 'snow_nutcracker' },
  { shirt: 'shirt_pumpkinking', pants: 'pants_pumpkinking', face: 'face_pumpkinking', hat: 'hat_pumpkinking', pack: 'pack_pumpkinking', snow: 'snow_pumpkinking' },
];
// headed: a headless Chrome never hands the recorder fresh frames of the 3D view (the clip came out frozen)
const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await ctx.addInitScript(([looks, zoom]) => {
  localStorage.setItem('santa.coached', '1'); localStorage.setItem('sh_zoom', zoom); localStorage.setItem('sq_name', 'SnowStorm');
  if (globalThis.__theme) localStorage.setItem('sh_theme', globalThis.__theme);
  globalThis.__promo = { queue: looks.map((l) => ({ shirt: 'shirt_red', pants: 'pants_navy', face: 'face_dots', skin: 'skin_2', hat: 'hat_none', pack: 'pack_none', snow: 'snow_white', ...l })), map: {} };
}, [LOOKS, ZOOM]);
if (THEME) await ctx.addInitScript((t) => { localStorage.setItem('sh_theme', t); }, THEME);
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.fulfill({ status: 503, body: '' }); } }
  if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    let body = readFileSync(f);
    if (p === 'sim.js') body = body.toString().replace('MIN_BODIES: 4,', `MIN_BODIES: ${BODIES},`); // me + the four costumes (+ more: a full arena)
    if (p === 'refcore.js') body = body.toString().replace('export function botAvatar(id) {', 'export function botAvatar(id) { const P = globalThis.__promo; if (P) { if (!(id in P.map) && P.queue.length) P.map[id] = cleanAvatar(P.queue.shift()); if (P.map[id]) return P.map[id]; }');
    return route.fulfill({ body, contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : p.endsWith('.css') ? 'text/css' : 'text/html' }); }
  return route.fulfill({ status: 503, body: '' }); });
const page = await ctx.newPage(); page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost/online.html?net=local', { timeout: 90000 }); await page.waitForFunction(() => window.__sq, null, { timeout: 90000 });
await page.evaluate(() => { const s = window.__sq; s.me.n = 'SnowStorm'; Object.assign(s.me.a, { shirt: 'shirt_red', pants: 'pants_navy', face: 'face_dots', skin: 'skin_2', hat: 'hat_beanie', pack: 'pack_none' }); s.me.l = 8; s.startPractice(); });
await page.waitForFunction(() => document.querySelector('#start'), null, { timeout: 30000 }); await page.evaluate(() => document.querySelector('#start').click());
await page.waitForFunction(() => { const s = window.__sq; if (/^(intro|count)$/.test(s.sim?.S.phase)) s.sim.S.time = 0; return s.view?.phase === 'play'; }, null, { timeout: 60000 });
// the browser's own recorder on the game's 3D view (no HUD: just the match), 30 fps
await page.evaluate(() => { const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 12e6 }); const parts = [];
  rec.ondataavailable = (e) => parts.push(e.data); window.__rec = { rec, parts }; rec.start(500); });
let shotDone = !SHOT;
const t0 = Date.now();
// play like a person: run in bursts, throw at whoever is nearest (a tap on their spot on the screen)
const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
while (Date.now() - t0 < SECS * 1000) {
  // chase the hat (or whoever wears it), so the camera, which follows me, stays where the fight is
  const dir = await page.evaluate(() => { const s = window.__sq, S = s.sim.S, me = S.ents.find((x) => x.peer === s.me.id); if (!me) return null;
    const h = S.hat, w = h.holder >= 0 ? S.ents.find((e) => e.id === h.holder) : null, tx = w ? w.x : h.x, tz = w ? w.z : h.z;
    if (w === me) return { dx: -me.x, dz: -me.z }; return { dx: tx - me.x, dz: tz - me.z }; });
  const pick = (d) => { const out = []; if (!d || Math.hypot(d.dx, d.dz) < 1.2) return [keys[Math.floor(Math.random() * 4)]];
    if (Math.abs(d.dx) > 0.6) out.push(d.dx > 0 ? 'KeyD' : 'KeyA'); if (Math.abs(d.dz) > 0.6) out.push(d.dz > 0 ? 'KeyS' : 'KeyW'); return out; };
  const [k = 'KeyW', k2 = k] = Math.random() < 0.8 ? pick(dir) : [keys[Math.floor(Math.random() * 4)]];
  await page.keyboard.down(k); if (k2 !== k) await page.keyboard.down(k2);
  for (let i = 0; i < 3; i++) {
    const tgt = await page.evaluate(() => { const s = window.__sq, me = s.sim.S.ents.find((x) => x.peer === s.me.id); if (!me) return null;
      const o = s.sim.S.ents.filter((x) => x !== me && !x.out).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
      return o && s.toScreen ? s.toScreen(o.x, o.z) : null; });
    if (tgt) await page.mouse.click(tgt[0], tgt[1]); else await page.mouse.click(W / 2 + (Math.random() - 0.5) * 200, H / 2 + (Math.random() - 0.5) * 200);
    await page.waitForTimeout(250);
  }
  await page.keyboard.up(k); await page.keyboard.up(k2);
  if (!shotDone && Date.now() - t0 >= SHOT_AT * 1000) { shotDone = true; await page.screenshot({ path: path.join(OUT, '..', 'stills', SHOT) }); console.log('picture', SHOT); }
  if (process.env.DBG) console.log(await page.evaluate(() => { const S = window.__sq.sim.S; return [S.phase, S.time?.toFixed?.(1), window.__sq.view?.phase, S.ents.map((e) => e.x.toFixed(1)).join(" ")].join(" | "); }));
}
const b64 = await page.evaluate(() => new Promise((done) => { const { rec, parts } = window.__rec; rec.onstop = async () => { const buf = new Uint8Array(await new Blob(parts).arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode(...buf.subarray(i, i + 32768)); done(btoa(s)); }; rec.stop(); }));
await ctx.close(); await browser.close();
writeFileSync(path.join(OUT, `gameplay-${TAG}.webm`), Buffer.from(b64, 'base64')); console.log('saved', `gameplay-${TAG}.webm`);
