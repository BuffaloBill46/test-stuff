// The level 5 and level 10 COSTUMES (Cody, 2026-10-02: "make a special level 5 and a level 10 costume, build 1 for each slot that
// matches itself for each level. Make them stand out and different from everything else. They will be free.")
// 1. Every costume piece draws something of its own (a fingerprint of the drawn model differs from the plain look AND from every
//    other item of that slot); the hats are the character's hat mesh (so they step aside for the Santa hat); a team shirt drops
//    the coat's trim; a costume pack and the Backpack/Toy Sack gear: the gear takes the back (the old rule); wings + satchel both draw.
// 2. The Avatar screen: a Costumes tab with both costumes (tap = every piece) and the back pieces; each piece's tab tags it
//    "Level N costume"; level 1 / 4 can preview but not save the Nutcracker; level 5 saves it (Frost King still locked); level 10
//    saves the Frost King. Desktop and phone screenshots.
// 3. A practice match at night: 8 players in the costumes (front and back), my cosmetic hat hides while I wear the Santa hat,
//    then maxed out (everyone in costume, gear mixed in, gold and crystal snowballs flying); no page errors, frames keep coming.
// 4. A turnaround of each costume (front, side, back) drawn with the game's own model code.
// Run (WSL): node costumes-test.mjs   (screenshots: out/costumes/)
import { createRequire } from 'module'; import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, OUT = 'out/costumes', fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync(OUT, { recursive: true });
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
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
// a local stand-in account at a level (the page's ?net=local accounts keep their database in localStorage)
async function signInAt(p, level) {
  await p.click('#signin'); await p.waitForTimeout(400); await p.fill('#email', `lvl${level}@example.com`); await p.click('#emailBtn'); await p.waitForTimeout(900); await p.click('#acctClose').catch(() => {});
  await p.evaluate((level) => { const d = JSON.parse(localStorage.getItem('sq-local-db')); for (const l of Object.values(d.logins)) d.profiles[l.pid].level = level; localStorage.setItem('sq-local-db', JSON.stringify(d)); }, level);
  await p.reload(); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1000);
}
const avatarTab = async (p, slot) => { await p.click('#t-avatar'); await p.waitForTimeout(500); await p.click(`#avslots [data-slot="${slot}"]`); await p.waitForTimeout(400); };

console.log('1. Every costume piece draws its own look; hats are the hat mesh; team shirt; packs with gear');
{ const { p, ctx, errors } = await open({ width: 1280, height: 800 });
  const r = await p.evaluate(async () => {
    const { avatarCharacter } = await import('./tabs.js'), { ITEMS, DEFAULT_AVATAR, COSTUMES, costumeItems } = await import('./catalog.js');
    const sig = (m) => { let n = 0, sum = 0; m.traverse((o) => { const g = o.geometry; if (!g || o.material?.side === 1) return; const a = g.attributes.position.array, c = g.attributes.color?.array || []; n += a.length / 3; for (let i = 0; i < a.length; i++) sum += a[i] * ((i % 5) + 1) + (c[i] || 0) * 3; }); return n + ':' + Math.round(sum); };
    const look = (a, extra) => sig(avatarCharacter({ ...DEFAULT_AVATAR, ...a }, extra));
    const out = { pieces: [], hats: [], team: null, packs: {} };
    const plain = look({});
    for (const it of ITEMS.filter((i) => i.set && i.slot !== 'snow')) {
      const mine = look({ [it.slot]: it.id }), same = ITEMS.filter((o) => o.slot === it.slot && o.id !== it.id && look({ [it.slot]: o.id }) === mine).map((o) => o.id);
      out.pieces.push({ id: it.id, differs: mine !== plain, same }); }
    // snowball colours: unlike every other snowball colour
    for (const it of ITEMS.filter((i) => i.set && i.slot === 'snow')) out.pieces.push({ id: it.id, differs: true, same: ITEMS.filter((o) => o.slot === 'snow' && o.id !== it.id && o.color === it.color).map((o) => o.id) });
    for (const set of Object.keys(COSTUMES)) { const a = Object.fromEntries(costumeItems(set).map((i) => [i.slot, i.id])), ch = avatarCharacter({ ...DEFAULT_AVATAR, ...a });
      out.hats.push({ set, hatMesh: !!ch.userData.hatMesh });
      // a team shirt: the coat's trim goes (so the team colour reads), the costume trousers stay
      if (set === 'nutcracker') out.team = { costume: look(a, { shirt: 0x3d6fb8 }), plainShirt: look({ ...a, shirt: 'shirt_red' }, { shirt: 0x3d6fb8 }) };
      const pk = a.pack; out.packs[set] = { alone: look({ pack: pk }), withBackpack: look({ pack: pk }, { gear: ['backpack'] }), backpackOnly: look({}, { gear: ['backpack'] }),
        withSatchel: look({ pack: pk }, { gear: ['satchel'] }), satchelOnly: look({}, { gear: ['satchel'] }) }; }
    return out; });
  for (const x of r.pieces) check(x.differs && !x.same.length, `${x.id}: its own look${x.same.length ? ' — SAME AS ' + x.same.join() : ''}`);
  for (const h of r.hats) check(h.hatMesh, `${h.set}: the costume hat is the character's hat mesh (steps aside for the Santa hat)`);
  check(r.team.costume === r.team.plainShirt, 'a team shirt drops the coat\'s trim (team colour reads at a glance); the trousers keep theirs');
  for (const [set, k] of Object.entries(r.packs)) {
    check(k.withBackpack === k.backpackOnly, `${set}: the Backpack gear takes the back (the costume pack steps aside, as every pack does)`);
    check(k.withSatchel !== k.satchelOnly && k.withSatchel !== k.alone, `${set}: the back piece and the Elf Satchel gear both draw`); }
  noErrors(errors, 'models'); await ctx.close(); }

console.log('2. The Avatar screen: Costumes tab, tags, level rules');
for (const vp of [{ width: 1280, height: 860, tag: 'desk' }, { width: 390, height: 844, tag: 'phone' }]) {
  const { p, ctx, errors } = await open(vp);
  await avatarTab(p, 'costume');
  const tabs = await p.evaluate(() => [...document.querySelectorAll('#avslots [data-slot]')].map((b) => b.textContent));
  check(tabs.includes('Costumes') && !tabs.includes('Backpacks'), `${vp.tag}: tabs ${tabs.join(', ')}`);
  const cards = await p.evaluate(() => [...document.querySelectorAll('#avgrid [data-costume]')].map((b) => ({ set: b.dataset.costume, locked: b.classList.contains('locked'), text: b.textContent, img: b.querySelector('img')?.src.startsWith('data:image/png') })));
  check(cards.length === 2 && cards.every((c) => c.locked && c.img) && /Level 5 costume/.test(cards[0].text) && /Level 10 costume/.test(cards[1].text), `${vp.tag} guest: two costume cards, locked, each with a picture (${cards.map((c) => c.set).join(', ')})`);
  const backs = await p.evaluate(() => [...document.querySelectorAll('#avgrid [data-pick]')].map((b) => b.dataset.pick));
  check(backs.join() === 'pack_none,pack_drum,pack_icewings', `${vp.tag}: back pieces to put on or take off: ${backs.join(', ')}`);
  check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${vp.tag}: the Costumes tab fits (no sideways scroll)`);
  await p.screenshot({ path: `${OUT}/${vp.tag}-avatar-costumes-tab.png` });
  // tap the Nutcracker as a guest: previewed (every piece), not savable
  await p.click('#avgrid [data-costume="nutcracker"]'); await p.waitForTimeout(900);
  const g = await p.evaluate(() => ({ pressed: document.querySelector('#avgrid [data-costume="nutcracker"]').getAttribute('aria-pressed'), save: document.querySelector('#avsave').disabled, msg: document.querySelector('#avmsg').textContent }));
  check(g.pressed === 'true' && g.save && /Nutcracker Coat/.test(g.msg) && /isn't unlocked/.test(g.msg), `${vp.tag} guest: the whole costume previewed, Save off ("${g.msg.slice(0, 70)}…")`);
  // the tags on each piece's own tab
  await p.click('#avslots [data-slot="shirt"]'); await p.waitForTimeout(400);
  const tags = await p.evaluate(() => [...document.querySelectorAll('#avgrid [data-pick]')].filter((b) => b.querySelector('.settag')).map((b) => b.dataset.pick + '=' + b.querySelector('.settag').textContent));
  check(tags.join() === 'shirt_nutcracker=Level 5 costume,shirt_frostking=Level 10 costume', `${vp.tag}: Shirts tab tags only the costume coats: ${tags.join(', ')}`);
  if (vp.tag === 'phone') { await p.evaluate(() => document.querySelector('#avgrid').scrollIntoView({ block: 'start' })); await p.waitForTimeout(300); }
  await p.screenshot({ path: `${OUT}/${vp.tag}-avatar-shirts-tags.png` });
  noErrors(errors, vp.tag + ' avatar'); await ctx.close();
}

console.log('3. Level 4 can\'t save the Nutcracker; level 5 can (Frost King still locked); level 10 saves the Frost King');
for (const [level, set, savable] of [[4, 'nutcracker', false], [5, 'nutcracker', true], [5, 'frostking', false], [10, 'frostking', true]]) {
  const { p, ctx, errors } = await open({ width: 1280, height: 860 });
  await signInAt(p, level); await avatarTab(p, 'costume');
  await p.click(`#avgrid [data-costume="${set}"]`); await p.waitForTimeout(900);
  const off = await p.isDisabled('#avsave');
  let saved = null;
  if (!off) { await p.click('#avsave'); await p.waitForFunction(() => /Saved/.test(document.querySelector('#avmsg').textContent), null, { timeout: 20000 }).catch(() => {});
    saved = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('sq-local-db')); return Object.values(d.profiles)[0].avatar; }); }
  const want = await p.evaluate(async (set) => Object.fromEntries((await import('./catalog.js')).costumeItems(set).map((i) => [i.slot, i.id])), set);
  const all = saved && Object.entries(want).every(([s, id]) => saved[s] === id);
  check(savable ? !off && all : off, `level ${level}, ${set}: ${savable ? 'saved, every piece (' + Object.values(want).join(', ') + ')' : 'Save stays off'}`);
  if (savable) { await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/desk-avatar-${set}-front.png` }); }
  noErrors(errors, `level ${level} ${set}`); await ctx.close();
}
// phone Avatar view of each costume (front)
for (const set of ['nutcracker', 'frostking']) {
  const { p, ctx, errors } = await open({ width: 390, height: 844 });
  await avatarTab(p, 'costume'); await p.click(`#avgrid [data-costume="${set}"]`); await p.waitForTimeout(1500);
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/phone-avatar-${set}.png` });
  noErrors(errors, 'phone ' + set); await ctx.close();
}

console.log('4. In a practice match at night: 8 players in costume, front and back; the Santa hat; maxed out');
const COST = async (p) => p.evaluate(async () => { const { costumeItems } = await import('./catalog.js'); return Object.fromEntries(['nutcracker', 'frostking'].map((s) => [s, Object.fromEntries(costumeItems(s).map((i) => [i.slot, i.id]))])); });
for (const vp of [{ width: 1280, height: 800, tag: 'desk' }, { width: 390, height: 844, tag: 'phone' }]) {
  const { p, ctx, errors } = await open({ width: vp.width, height: vp.height });
  const C = await COST(p);
  // me in the Nutcracker; bots alternate; some with gear on top (Backpack, Elf Satchel, Elf Hat) to see the mix
  await p.evaluate(async ([C]) => { (await import('./sim.js')).K.MIN_BODIES = 8; const s = window.__sq; s.me.l = 10; s.me.a = { ...s.me.a, ...C.nutcracker }; s.setZoom(0.6); s.startPractice(); }, [C]);
  await p.waitForFunction(() => document.querySelector('#start'), null, { timeout: 30000 }); await p.evaluate(() => document.querySelector('#start').click());
  await p.waitForFunction(() => { const s = window.__sq; if (/^(intro|count)$/.test(s.sim?.S.phase)) s.sim.S.time = 0; return s.view?.phase === 'play'; }, null, { timeout: 60000 });
  await p.evaluate(async ([C]) => { const { botAvatar } = await import('./refcore.js'), s = window.__sq, sim = s.sim, step = sim.step;
    window.__pin = { face: 0, gear: [[], [], ['backpack'], [], ['satchel'], ['elfhat'], [], []], balls: false, santa: false };
    sim.S.ents.filter((e) => e.bot).forEach((e, i) => Object.assign(botAvatar(e.id), i % 2 ? C.nutcracker : C.frostking));
    sim.step = (dt) => { step(dt); const P = window.__pin, S = sim.S, me = S.ents.find((e) => e.peer === s.me.id), row = [me, ...S.ents.filter((e) => e !== me)];
      row.forEach((e, i) => { const x = -4.2 + i * 1.2; if (e === me) { s.ctl.x = x; s.ctl.z = 3.5; s.ctl.vx = s.ctl.vz = 0; s.ctl.face = P.face; }
        e.x = x; e.z = 3.5; e.vx = e.vz = 0; e.face = P.face; if (e.bot) { e.ammo = 0; e.cool = 99; } e.gear = P.gear[i] || []; });
      S.time = 60;
      if (P.santa) { S.hat.st = 'head'; S.hat.holder = me.id; }
      // gold and crystal snowballs (plain throws by costume wearers) flying over the row
      if (P.balls) while (S.balls.length < 14) { const id = S.nextBall++, dir = id % 2 ? 1 : -1;
        S.balls.push({ id, owner: row[1 + (id % 2)].id, sm: 1, kind: '', r: 1, stunSec: 0, g: 0, age: 0, life: 2, x: -7 * dir, y: 2.2 + (id % 4) * 0.4, z: 1.5 + (id % 5) * 0.9, vx: dir * 12, vy: 2, vz: 0 }); }
    }; }, [C]);
  await p.waitForFunction(() => { const v = window.__sq.view; return v?.ents.length === 8 && v.ents.filter((e) => e.gear.length).length === 3; }, null, { timeout: 30000 });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `${OUT}/${vp.tag}-match-front.png` });
  await p.evaluate(() => { window.__pin.face = Math.PI; }); await p.waitForTimeout(2000);
  await p.screenshot({ path: `${OUT}/${vp.tag}-match-back.png` });
  // normal camera distance (zoom 1): still reads as costumes
  await p.evaluate(() => { window.__pin.face = 0.5; window.__sq.setZoom(1); }); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/${vp.tag}-match-normal-zoom.png` });
  // the Santa hat on my head: my shako steps aside, the others keep theirs
  const myId = await p.evaluate(() => window.__sq.sim.S.ents.find((e) => e.peer === window.__sq.me.id).id);
  const before = await p.evaluate((id) => window.__sq.hatShown(id), myId);
  await p.evaluate(() => { window.__pin.santa = true; window.__sq.setZoom(0.6); }); await p.waitForTimeout(1500);
  const shown = await p.evaluate((id) => ({ me: window.__sq.hatShown(id), others: window.__sq.view.ents.filter((e) => e.id !== id).map((e) => window.__sq.hatShown(e.id)) }), myId);
  check(before === true && shown.me === false && shown.others.filter((x) => x === true).length >= 5, `${vp.tag}: my costume hat shows (${before}), then hides under the Santa hat (${shown.me}); others keep theirs (${shown.others.join(',')})`);
  await p.screenshot({ path: `${OUT}/${vp.tag}-match-santa-hat.png` });
  // maxed out: every body in costume, gear mixed in, 14 gold/crystal snowballs in the air
  await p.evaluate(() => { const P = window.__pin; P.santa = false; P.gear = [['santa'], ['kevlar'], ['backpack'], ['bag'], ['satchel', 'shoes'], ['elfhat'], ['pumpkin'], []]; P.balls = true; });
  await p.waitForFunction(() => window.__sq.view.balls.length >= 10, null, { timeout: 30000 }); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/${vp.tag}-match-max.png` });
  const fr = await p.evaluate(() => new Promise((done) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else done(n); }; requestAnimationFrame(f); }));
  check(fr >= 3, `${vp.tag}: frames keep coming at max (${fr} in 3 s; the test browser draws ~3/s)`);
  noErrors(errors, vp.tag + ' match'); await ctx.close();
}

console.log('5. Turnarounds: each costume front, side and back (the game\'s own model code and lights)');
{ const { p, ctx, errors } = await open({ width: 1280, height: 800 });
  const shots = await p.evaluate(async () => {
    const { avatarCharacter } = await import('./tabs.js'), { THREE, lights } = await import('./kit.js'), { DEFAULT_AVATAR, costumeItems } = await import('./catalog.js');
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(1200, 520, false); const out = {};
    for (const set of ['nutcracker', 'frostking']) {
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0x141b36); lights(scene, { hemi: 1.7, moonI: 1.6 });
      const a = { ...DEFAULT_AVATAR }; for (const i of costumeItems(set)) a[i.slot] = i.id;
      [0, Math.PI / 2, Math.PI].forEach((ry, k) => { const ch = avatarCharacter(a); ch.rotation.y = ry - 0.3; ch.position.x = (k - 1) * 2.2; scene.add(ch); });
      const cam = new THREE.PerspectiveCamera(30, 1200 / 520, 0.1, 50); cam.position.set(0, 1.6, 8.4); cam.lookAt(0, 1.45, 0);
      r.render(scene, cam); out[set] = r.domElement.toDataURL('image/png'); }
    return out; });
  for (const [set, url] of Object.entries(shots)) writeFileSync(`${OUT}/turnaround-${set}.png`, Buffer.from(url.split(',')[1], 'base64'));
  check(Object.keys(shots).length === 2, 'turnarounds drawn: ' + Object.keys(shots).map((s) => `${OUT}/turnaround-${s}.png`).join(', '));
  noErrors(errors, 'turnarounds'); await ctx.close(); }

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED:\n - ${fails.join('\n - ')}` : '\nALL PASSED'); process.exit(fails.length ? 1 : 0);
