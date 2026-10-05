// Mockup B: Be the Hat. You are the hat. Bounce head to head; never touch the snow.
import { THREE, C, character, animate, Snow, Burst, toon, part, build, glow, snowmanGeo, reindeerGeo, rng } from './kit.js?v=4d68b93fc8';
import { buildPlaza, makeHat, shadowBlob, ARENA } from './plaza.js?v=4d68b93fc8';

const V3 = THREE.Vector3, G = THREE;
const GRAV = 15, AIR_ACC = 16, AIR_MAX = 6.5;

// What each head does to you. Ring colors are painted under their feet.
const KINDS = {
  villager: { vy: 9.2, pts: 10, speed: 1.6, ring: 0xffbe5c, label: 'Villager' },
  elf: { vy: 7.4, pts: 15, speed: 2.6, ring: 0x7fe0a0, label: 'Elf' },
  reindeer: { vy: 13.5, pts: 25, speed: 2.0, ring: 0xb39bff, label: 'Reindeer' },
  snowman: { vy: 7.0, pts: 5, speed: 0, ring: 0xf5f1e8, label: 'Snowman' },
};

const intro = `<div class="eyebrow">Mockup B · Bouncer</div>
<h2>Be the Hat</h2>
<p>You are the hat. Steer in the air and land on heads to keep bouncing. The snow is lava. Each head is different: villagers bounce you normally, elves give quick hops for more points, reindeer antlers launch you sky-high, and snowmen are safe but cheap.</p>
<ul><li>Chain different heads to build your combo; landing on the same head twice resets it</li><li>Grab the floating gold stars mid-air for bonus points</li><li>The crowd speeds up the longer you stay airborne</li></ul>
<div class="keys"><kbd>WASD</kbd> or <kbd>Arrows</kbd> steer · Phone: drag anywhere to steer</div>
<button class="go">Hop on</button>`;

function create(ui) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
  const plaza = buildPlaza(scene, { seed: 7 });
  const snow = new Snow(1400, [60, 24, 60]); scene.add(snow.points);
  const burst = new Burst(300); scene.add(burst.mesh);
  const r = rng(99);

  // ---------- crowd
  const crowd = [];
  const ringGeo = new G.RingGeometry(0.5, 0.66, 20).rotateX(-Math.PI / 2);
  const add = (kind, mesh, headY, headFwd, animated) => {
    scene.add(mesh);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: KINDS[kind].ring, transparent: true, opacity: 0.7, depthWrite: false }));
    ring.position.y = 0.05; scene.add(ring);
    const a = r() * 6.28, d = 3 + r() * (ARENA - 4);
    const w = { kind, mesh, ring, headY, headFwd, animated, pos: new V3(Math.cos(a) * d, 0, Math.sin(a) * d), vel: new V3(), face: r() * 6, goal: new V3(), squash: 0 };
    w.goal.copy(w.pos); crowd.push(w); return w;
  };
  const shirts = [0x3d6fb8, 0xb8783d, 0x7a4fa3, 0x2f8f8a, 0xa33d5a];
  for (let i = 0; i < 5; i++) add('villager', character({ shirt: shirts[i], pants: 0x34405e, seed: i + 20, skin: [C.skin, 0xc58c63, 0x8d5a3b, 0xf0c7a0][i % 4] }), 2.1, 0, true);
  for (let i = 0; i < 3; i++) { const m = character({ shirt: C.elf, pants: 0x3b2a1f, ears: true, seed: i + 40, skin: 0xf0c7a0 }); m.scale.setScalar(0.82); add('elf', m, 1.74, 0, true); }
  const rg = reindeerGeo();
  for (let i = 0; i < 2; i++) add('reindeer', toon(rg, 0.035), 2.2, 0.85, false);
  [[-6, 4], [7, -3]].forEach(([x, z], i) => { const w = add('snowman', toon(snowmanGeo(i + 5), 0.035), 2.82, 0, false); w.pos.set(x, 0, z); w.goal.copy(w.pos); });

  // ---------- stars to collect in the air
  const starGeo = build([part(new G.OctahedronGeometry(0.32, 0), 0xffe08a, { scale: [1, 1.3, 1] })]);
  const stars = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(starGeo, new THREE.MeshBasicMaterial({ vertexColors: true })); const gl = glow(0xffd76a, 1.6, 0.45); m.add(gl); scene.add(m);
    return { m, pos: new V3(), bob: r() * 6 };
  });
  const placeStar = (s) => { const a = r() * 6.28, d = 2 + r() * (ARENA - 3); s.pos.set(Math.cos(a) * d, 3.6 + r() * 3, Math.sin(a) * d); };
  stars.forEach(placeStar);

  // ---------- the hat (you)
  const hat = { mesh: makeHat(0.95), pos: new V3(0, 5, 0), vel: new V3(), last: null, squash: 0 };
  scene.add(hat.mesh);
  const shadow = shadowBlob(); scene.add(shadow);
  const aimRing = new THREE.Mesh(new G.RingGeometry(0.55, 0.78, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
  scene.add(aimRing);

  let mode = 'attract', score = 0, combo = 0, bestCombo = 0, bounces = 0, alive = 0, hudStr = '';
  let best = 0; try { best = +localStorage.getItem('sh_bethehat_best') || 0; } catch {}
  const live = () => mode === 'play';

  function reset() {
    hat.pos.set(0, plaza.pedestalTop + 0.1, 0); hat.vel.set(0, 10, 0); hat.last = null;
    score = 0; combo = 0; bestCombo = 0; bounces = 0; alive = 0;
  }

  const headPos = (w, out = new V3()) => out.set(w.pos.x + Math.sin(w.face) * w.headFwd, w.headY, w.pos.z + Math.cos(w.face) * w.headFwd);

  // ---------- input
  let W = innerWidth, H = innerHeight, joyId = null, joyO = { x: 0, y: 0 }; const joyV = { x: 0, y: 0 };
  const onDown = (e) => {
    if (!live() || joyId !== null) return;
    joyId = e.pointerId; joyO = { x: e.clientX, y: e.clientY };
    if (e.pointerType === 'touch') { ui.joy.hidden = false; ui.joy.style.left = e.clientX + 'px'; ui.joy.style.top = e.clientY + 'px'; }
  };
  const onMove = (e) => {
    if (e.pointerId !== joyId) return;
    let x = e.clientX - joyO.x, y = e.clientY - joyO.y; const l = Math.hypot(x, y), m = 42;
    if (l > m) { x *= m / l; y *= m / l; }
    joyV.x = x / m; joyV.y = y / m; ui.joy.style.setProperty('--jx', x + 'px'); ui.joy.style.setProperty('--jy', y + 'px');
  };
  const onUp = (e) => { if (e.pointerId === joyId) { joyId = null; joyV.x = joyV.y = 0; ui.joy.hidden = true; } };
  ui.canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);

  const tmp = new V3(), hp = new V3();
  function steer() {
    if (live()) {
      const k = ui.input.keys, v = new V3(joyV.x, 0, joyV.y);
      if (k.has('KeyW') || k.has('ArrowUp')) v.z -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) v.z += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) v.x -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) v.x += 1;
      return v.length() > 1 ? v.normalize() : v;
    }
    // attract mode: aim for the best-value head we can reach
    let bestW = null, bestS = -1;
    for (const w of crowd) {
      if (w === hat.last) continue;
      headPos(w, hp); const d = Math.hypot(hp.x - hat.pos.x, hp.z - hat.pos.z);
      const s = KINDS[w.kind].pts / (1 + d * d * 0.08);
      if (s > bestS && d < 9) { bestS = s; bestW = w; }
    }
    if (!bestW) return new V3();
    headPos(bestW, hp);
    return tmp.set(hp.x - hat.pos.x - hat.vel.x * 0.25, 0, hp.z - hat.pos.z - hat.vel.z * 0.25).clampLength(0, 1).clone();
  }

  function land(w) {
    const k = KINDS[w.kind];
    const fresh = w !== hat.last;
    combo = fresh ? combo + 1 : 1; bestCombo = Math.max(bestCombo, combo);
    const gained = k.pts * Math.min(combo, 10);
    hat.vel.y = k.vy + Math.min(alive * 0.02, 1.5); hat.last = w; hat.squash = 1; w.squash = 1;
    bounces++;
    headPos(w, hp);
    burst.spawn(hp.clone().setY(hp.y + 0.1), 10, k.ring, 3, 2.5);
    if (live()) score += gained;
    ui.pop(hp.clone().setY(hp.y + 1.1), `+${gained}${combo > 1 ? ' x' + Math.min(combo, 10) : ''}`, w.kind === 'elf' ? 'green' : w.kind === 'reindeer' ? 'big' : '');
    if (!fresh) ui.pop(hp.clone().setY(hp.y + 1.7), 'Same head', 'bad');
  }

  function finish() {
    mode = 'attract';
    burst.spawn(hat.pos.clone(), 26, 0xffffff, 5, 4);
    const isBest = score > best; if (isBest) { best = score; try { localStorage.setItem('sh_bethehat_best', String(best)); } catch {} }
    ui.card(`<div class="eyebrow">Into the snow</div>
      <h2>${isBest ? 'New best!' : 'Plop.'}</h2>
      <div class="verdict">${bounces} heads, longest combo x${bestCombo}.</div>
      <div class="result"><div class="stat nice"><i>Score</i><b>${score}</b></div><div class="stat"><i>Best</i><b>${best}</b></div>
      <div class="stat"><i>Air time</i><b>${alive.toFixed(0)}s</b></div></div>
      <button class="go">Hop on again</button>`, start);
    reset();
  }
  function start() { reset(); mode = 'play'; }
  reset();
  ui.card(intro, start);

  const camPos = new V3(0, 12, 18), camLook = new V3();

  function update(dt, t) {
    plaza.update(t); snow.update(dt, t, hat.pos); burst.update(dt);
    alive += dt;
    const pace = 1 + Math.min(alive / 60, 0.8);

    // crowd wanders
    for (const w of crowd) {
      const k = KINDS[w.kind];
      if (k.speed > 0) {
        if (Math.hypot(w.goal.x - w.pos.x, w.goal.z - w.pos.z) < 0.6) { const a = r() * 6.28, d = 2.5 + r() * (ARENA - 3.5); w.goal.set(Math.cos(a) * d, 0, Math.sin(a) * d); }
        const dir = tmp.copy(w.goal).sub(w.pos).setY(0).normalize();
        w.vel.lerp(dir.multiplyScalar(k.speed * pace), Math.min(1, dt * 3)); w.pos.addScaledVector(w.vel, dt);
        const rr = Math.hypot(w.pos.x, w.pos.z); if (rr < 1.6) w.pos.setLength(1.6);
        let dd = Math.atan2(w.vel.x, w.vel.z) - w.face; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); w.face += dd * Math.min(1, dt * 6);
      }
      w.squash = Math.max(0, w.squash - dt * 5);
      if (w.animated) animate(w.mesh, dt, w.vel.length());
      else if (k.speed > 0) w.mesh.position.y = Math.abs(Math.sin(t * 7 + w.face)) * 0.06;
      w.mesh.position.x = w.pos.x; w.mesh.position.z = w.pos.z; w.mesh.rotation.y = w.face;
      const s = w.mesh.userData.baseScale ?? (w.mesh.userData.baseScale = w.mesh.scale.x);
      w.mesh.scale.set(s * (1 + w.squash * 0.12), s * (1 - w.squash * 0.18), s * (1 + w.squash * 0.12));
      w.ring.position.set(w.pos.x, 0.05, w.pos.z);
    }

    // hat physics
    const want = steer();
    hat.vel.x += want.x * AIR_ACC * dt; hat.vel.z += want.z * AIR_ACC * dt;
    const hs = Math.hypot(hat.vel.x, hat.vel.z); if (hs > AIR_MAX) { hat.vel.x *= AIR_MAX / hs; hat.vel.z *= AIR_MAX / hs; }
    if (want.lengthSq() < 0.01) { hat.vel.x *= 1 - Math.min(1, dt * 1.2); hat.vel.z *= 1 - Math.min(1, dt * 1.2); }
    const prevY = hat.pos.y;
    hat.vel.y -= GRAV * dt; hat.pos.addScaledVector(hat.vel, dt);
    const rr = Math.hypot(hat.pos.x, hat.pos.z);
    if (rr > ARENA + 0.5) { hat.pos.x *= (ARENA + 0.5) / rr; hat.pos.z *= (ARENA + 0.5) / rr; hat.vel.x *= -0.5; hat.vel.z *= -0.5; }

    if (hat.vel.y < 0) {
      // head landings: crossed the head's top this frame and close enough sideways
      let hitW = null;
      for (const w of crowd) {
        headPos(w, hp);
        if (prevY >= hp.y - 0.05 && hat.pos.y <= hp.y + 0.1 && Math.hypot(hp.x - hat.pos.x, hp.z - hat.pos.z) < 0.72) { hitW = w; break; }
      }
      if (hitW) { headPos(hitW, hp); hat.pos.y = hp.y + 0.1; land(hitW); }
      else if (prevY >= plaza.pedestalTop && hat.pos.y <= plaza.pedestalTop + 0.05 && Math.hypot(hat.pos.x, hat.pos.z) < 1.1) {
        hat.pos.y = plaza.pedestalTop + 0.05; hat.vel.y = 9; hat.squash = 1; combo = 0;
        if (hat.last === 'pedestal') { // no camping: a second pedestal bounce shoves you off
          const a = Math.random() * 6.28; hat.vel.set(Math.cos(a) * 5.5, 8, Math.sin(a) * 5.5);
          ui.pop(new V3(0, 3, 0), 'Move along!', 'bad');
        } else ui.pop(new V3(0, 3, 0), 'Pedestal: combo reset', 'white');
        hat.last = 'pedestal';
      }
    }
    if (hat.pos.y <= 0.1) { if (live()) finish(); else { hat.pos.y = 0.1; hat.vel.y = 10; hat.last = null; } }

    // stars
    for (const s of stars) {
      s.bob += dt * 2; s.m.position.set(s.pos.x, s.pos.y + Math.sin(s.bob) * 0.2, s.pos.z); s.m.rotation.y += dt * 2;
      if (s.m.position.distanceTo(hat.pos) < 1.0) {
        burst.spawn(s.m.position.clone(), 12, C.gold, 3, 2);
        if (live()) { score += 25; ui.pop(s.m.position.clone().setY(s.pos.y + 0.8), '+25', ''); }
        placeStar(s);
      }
    }

    // hat visuals
    hat.squash = Math.max(0, hat.squash - dt * 4);
    hat.mesh.position.copy(hat.pos);
    hat.mesh.rotation.set(hat.vel.z * 0.05, Math.atan2(hat.vel.x, hat.vel.z) + Math.PI / 2, -hat.vel.x * 0.05);
    hat.mesh.scale.set(1 + hat.squash * 0.25, 1 - hat.squash * 0.35 + Math.max(0, hat.vel.y) * 0.015, 1 + hat.squash * 0.25);
    shadow.position.set(hat.pos.x, 0.04, hat.pos.z); shadow.scale.setScalar(Math.max(0.35, 1.4 - hat.pos.y * 0.1));
    // predicted touchdown at typical head height
    const vy = hat.vel.y, dy = hat.pos.y - 2.1, tt = dy > -0.3 ? (vy + Math.sqrt(Math.max(0, vy * vy + 2 * GRAV * Math.max(dy, 0)))) / GRAV : 0;
    aimRing.position.set(hat.pos.x + hat.vel.x * tt, 0.06, hat.pos.z + hat.vel.z * tt);
    aimRing.visible = hat.vel.y < 4; aimRing.scale.setScalar(1 + Math.sin(t * 12) * 0.08);

    // camera: behind and above, easing so bounces don't jolt
    const portrait = H > W * 1.1;
    camera.fov = portrait ? 66 : 55; camera.updateProjectionMatrix();
    camLook.lerp(tmp.set(hat.pos.x, Math.min(hat.pos.y, 4) * 0.5 + 0.8, hat.pos.z - 1), Math.min(1, dt * 4));
    camPos.lerp(tmp.set(hat.pos.x * 0.85, 9 + Math.min(hat.pos.y, 8) * 0.35 + (portrait ? 3 : 0), hat.pos.z + (portrait ? 12 : 11)), Math.min(1, dt * 2.5));
    camera.position.copy(camPos); camera.lookAt(camLook);

    const s = live()
      ? `<div class="stat plaque nice"><i>Score</i><b>${score}</b></div>
         <div class="stat plaque ${combo >= 5 ? 'naughty' : ''}"><i>Combo</i><b>x${Math.min(combo, 10)}</b></div>
         <div class="stat plaque"><i>Heads</i><b>${bounces}</b></div>
         <div class="stat plaque"><i>Best</i><b>${best}</b></div>`
      : '';
    if (s !== hudStr) { hudStr = s; ui.hud(s); }
  }

  function dispose() {
    ui.canvas.removeEventListener('pointerdown', onDown);
    removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp);
  }
  function resize(w, h) { W = w; H = h; }
  return { scene, camera, update, dispose, resize, debug: { hat, crowd, start, get mode() { return mode; }, get score() { return score; }, get bounces() { return bounces; } } };
}

export default { create };
