// Mockup A: Snowball Square. Grab the hat, keep it on your head, knock it off theirs.
import { THREE, C, character, animate, Snow, Burst, toon, part, build, glow } from './kit.js?v=896c3a7b98';
import { buildPlaza, makeHat, shadowBlob, ARENA } from './plaza.js?v=896c3a7b98';

const V3 = THREE.Vector3;
const ROUND = 90, BALL_G = 7, BALL_SPEED = 18, HAT_G = 16, HEAD_Y = 2.05;

const intro = `<div class="eyebrow">Mockup A · Arena</div>
<h2>Snowball Square</h2>
<p>Grab the hat from the pedestal and keep it on your head. Every second you wear it earns Nice points. The Naughty elves pelt you to knock it loose. When it pops off, it flies up, and whoever gets a head under it catches it.</p>
<ul><li>60-second rounds, so there's always time for one more</li><li>Catching a flying hat on your head is the big moment: +50</li><li>Snow piles refill your snowballs; standing still gets you hit</li></ul>
<div class="keys"><kbd>WASD</kbd> move · <kbd>Click</kbd> throw at cursor · <kbd>Space</kbd> auto-aim · Phone: drag left side, tap right side</div>
<button class="go">Play round</button>`;

function create(ui) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  const plaza = buildPlaza(scene);
  const snow = new Snow(1400, [60, 24, 60]); scene.add(snow.points);
  const burst = new Burst(320); scene.add(burst.mesh);
  const ballGeo = build([part(new THREE.IcosahedronGeometry(0.17, 0), C.brim, { jit: 0.02 })]);

  const mk = (o, team, isPlayer = false) => {
    const mesh = character(o); scene.add(mesh);
    return { mesh, team, isPlayer, pos: new V3(), vel: new V3(), face: 0, ammo: 0, max: isPlayer ? 6 : 4, stun: 0, cool: 0, regen: 0, throwT: 0, wob: Math.random() * 9 };
  };
  const player = mk({ shirt: C.hat, pants: 0x2d3a63, seed: 1 }, 'nice', true);
  const bots = [[C.elf, 4], [0x58b878, 7], [C.elfDark, 9]].map(([shirt, seed]) => mk({ shirt, seed, pants: 0x3b2a1f, ears: true, skin: 0xf0c7a0 }, 'naughty'));
  const all = [player, ...bots];
  const youRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: C.lantern, transparent: true, opacity: 0.85, depthWrite: false }));
  youRing.position.y = 0.05; scene.add(youRing);

  const hat = { mesh: makeHat(0.88), state: 'pedestal', pos: new V3(), vel: new V3(), holder: null, last: null, cool: 0, bounces: 0, rest: 0, acc: 0 };
  scene.add(hat.mesh);
  const hatShadow = shadowBlob(); scene.add(hatShadow);
  const landRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.86, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
  landRing.position.y = 0.06; scene.add(landRing);
  const hatGlow = glow(0xffd29a, 3.2, 0.3); scene.add(hatGlow);
  const landing = new V3();

  const balls = [];
  const score = { nice: 0, naughty: 0, hits: 0, headers: 0 };
  let mode = 'attract', time = ROUND, hudStr = '';

  function reset() {
    all.forEach((e, i) => {
      const a = Math.PI / 2 + (i / all.length) * Math.PI * 2;
      e.pos.set(Math.cos(a) * 9, 0, Math.sin(a) * 9); e.vel.set(0, 0, 0); e.stun = 0; e.ammo = e.max; e.cool = e.isPlayer ? 0 : 0.8 + Math.random();
    });
    hat.state = 'pedestal'; hat.holder = null;
    balls.forEach((b) => scene.remove(b.mesh)); balls.length = 0;
    Object.assign(score, { nice: 0, naughty: 0, hits: 0, headers: 0 }); time = ROUND;
  }

  const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const live = () => mode === 'play';

  function giveHat(e, caught) {
    hat.state = 'head'; hat.holder = e; hat.acc = 0;
    if (caught) {
      burst.spawn(new V3(e.pos.x, 2.2, e.pos.z), 14, C.gold, 3, 3);
      if (e.team === 'nice') { if (live()) { score.nice += 50; if (e.isPlayer) score.headers++; } ui.pop(new V3(e.pos.x, 2.9, e.pos.z), 'HEADER +50', 'big'); }
      else ui.pop(new V3(e.pos.x, 2.9, e.pos.z), 'Snatched!', 'green');
    }
  }

  function knockHat(dir) {
    const e = hat.holder; hat.state = 'air'; hat.holder = null; hat.last = e; hat.cool = 0.5; hat.bounces = 0;
    hat.pos.set(e.pos.x, HEAD_Y + 0.2, e.pos.z);
    const d = dir.clone().setY(0).normalize();
    hat.vel.set(d.x * 3.4 + (Math.random() - 0.5) * 2.5, 10, d.z * 3.4 + (Math.random() - 0.5) * 2.5);
  }

  function throwBall(e, target) {
    if (e.ammo <= 0 || e.cool > 0 || e.stun > 0) return;
    e.ammo--; e.cool = e.isPlayer && live() ? 0.26 : 1.1 + Math.random() * 1.1; e.throwT = 1;
    const from = new V3(e.pos.x, 1.6, e.pos.z), dir = target.clone().sub(from).setY(0);
    const dist = Math.max(1.5, dir.length()); dir.normalize(); from.addScaledVector(dir, 0.45);
    const tt = dist / BALL_SPEED, vel = dir.clone().multiplyScalar(BALL_SPEED); vel.y = (1.15 - 1.6) / tt + 0.5 * BALL_G * tt;
    const mesh = toon(ballGeo, 0.02); mesh.position.copy(from); scene.add(mesh);
    balls.push({ mesh, pos: from, vel, owner: e, life: 2 });
    e.face = Math.atan2(dir.x, dir.z);
  }

  function hit(e, b) {
    burst.spawn(b.pos.clone(), 16, 0xffffff, 3.5, 3);
    e.stun = 0.9; e.vel.copy(b.vel).setY(0).setLength(5);
    const top = new V3(e.pos.x, 2.6, e.pos.z);
    if (hat.holder === e) { knockHat(b.vel); ui.pop(top, 'KNOCKED OFF!', e.isPlayer ? 'bad' : 'white'); }
    else ui.pop(top, 'SPLAT', e.isPlayer ? 'bad' : 'white');
    if (b.owner.isPlayer && live()) score.hits++;
  }

  const nearestFoe = (e) => all.filter((o) => o.team !== e.team).reduce((b, o) => (d2(o.pos, e.pos) < d2(b.pos, e.pos) ? o : b));
  const nearestPile = (e) => plaza.piles.reduce((b, p) => (d2(p, e.pos) < d2(b, e.pos) ? p : b));
  const lead = (tgt, from, noise) => {
    const t = d2(tgt.pos, from.pos) / BALL_SPEED;
    return new V3(tgt.pos.x + tgt.vel.x * t * 0.8 + (Math.random() - 0.5) * noise, 1.2, tgt.pos.z + tgt.vel.z * t * 0.8 + (Math.random() - 0.5) * noise);
  };

  function ai(e) {
    const h = hat.holder; let goal;
    if (h === e) {
      const foe = nearestFoe(e);
      const away = e.pos.clone().sub(foe.pos).setY(0).normalize();
      const tan = new V3(-e.pos.z, 0, e.pos.x).normalize().multiplyScalar(Math.sin(e.wob) > 0 ? 1 : -1);
      goal = e.pos.clone().addScaledVector(away, 4).addScaledVector(tan, 3);
      if (goal.length() > ARENA - 2) goal.setLength(ARENA - 2);
      if (d2(foe.pos, e.pos) < 8) throwBall(e, lead(foe, e, 1.2));
    } else if (e.ammo === 0 && hat.state === 'head') goal = nearestPile(e).clone();
    else if (hat.state === 'pedestal') goal = new V3(0, 0, 0);
    else if (hat.state === 'air') goal = landing.clone();
    else if (hat.state === 'ground') goal = hat.pos.clone().setY(0);
    else if (h.team !== e.team) {
      const off = e.pos.clone().sub(h.pos).setY(0); off.setLength(5 + Math.sin(e.wob) * 1.5);
      goal = h.pos.clone().add(off);
      if (d2(h.pos, e.pos) < 11) throwBall(e, lead(h, e, 1.6));
    } else {
      const foe = nearestFoe(e); goal = h.pos.clone().lerp(foe.pos, 0.45);
      if (d2(foe.pos, e.pos) < 9) throwBall(e, lead(foe, e, 2));
    }
    const want = goal.sub(e.pos).setY(0);
    return want.length() > 0.35 ? want.normalize() : want.set(0, 0, 0);
  }

  // ---------- input
  const ray = new THREE.Raycaster(), ground = new THREE.Plane(new V3(0, 1, 0), 0), aim = new V3(0, 0, -4);
  let W = innerWidth, H = innerHeight, joyId = null, joyO = { x: 0, y: 0 }; const joyV = { x: 0, y: 0 };
  const groundAt = (cx, cy) => {
    ray.setFromCamera({ x: (cx / W) * 2 - 1, y: -(cy / H) * 2 + 1 }, camera);
    return ray.ray.intersectPlane(ground, new V3());
  };
  const onDown = (e) => {
    if (!live()) return;
    if (e.pointerType === 'touch' && e.clientX < W * 0.45 && joyId === null) {
      joyId = e.pointerId; joyO = { x: e.clientX, y: e.clientY }; ui.joy.hidden = false;
      ui.joy.style.left = e.clientX + 'px'; ui.joy.style.top = e.clientY + 'px'; return;
    }
    const p = groundAt(e.clientX, e.clientY); if (p) { aim.copy(p); throwBall(player, new V3(p.x, 1.15, p.z)); }
  };
  const onMove = (e) => {
    if (e.pointerId === joyId) {
      let x = e.clientX - joyO.x, y = e.clientY - joyO.y; const l = Math.hypot(x, y), m = 42;
      if (l > m) { x *= m / l; y *= m / l; }
      joyV.x = x / m; joyV.y = y / m; ui.joy.style.setProperty('--jx', x + 'px'); ui.joy.style.setProperty('--jy', y + 'px');
    } else if (e.pointerType === 'mouse') { const p = groundAt(e.clientX, e.clientY); if (p) aim.copy(p); }
  };
  const onUp = (e) => { if (e.pointerId === joyId) { joyId = null; joyV.x = joyV.y = 0; ui.joy.hidden = true; } };
  ui.canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);

  function playerWant() {
    const k = ui.input.keys, v = new V3(joyV.x, 0, joyV.y);
    if (k.has('KeyW') || k.has('ArrowUp')) v.z -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) v.z += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) v.x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) v.x += 1;
    if (v.length() > 1) v.normalize();
    if (ui.input.hit.has('Space')) throwBall(player, lead(nearestFoe(player), player, 0));
    return v;
  }

  // ---------- flow
  function start() { reset(); mode = 'play'; }
  function finish() {
    mode = 'attract';
    const win = score.nice > score.naughty;
    ui.card(`<div class="eyebrow">Round over</div>
      <h2>${win ? 'Nice List!' : 'Naughty wins'}</h2>
      <div class="verdict">${win ? 'You out-hatted the elves.' : 'The elves wore it longer. Run it back.'}</div>
      <div class="result"><div class="stat nice"><i>Nice</i><b>${score.nice}</b></div><div class="stat naughty"><i>Naughty</i><b>${score.naughty}</b></div>
      <div class="stat"><i>Headers</i><b>${score.headers}</b></div><div class="stat"><i>Hits</i><b>${score.hits}</b></div></div>
      <button class="go">Play again</button>`, start);
  }
  reset();
  ui.card(intro, start);

  const tmp = new V3(), camTarget = new V3(), camPos = new V3(0, 16, 22);

  function update(dt, t) {
    plaza.update(t); snow.update(dt, t, camTarget); burst.update(dt);

    if (live()) { time -= dt; if (time <= 0) { time = 0; finish(); } }

    // movement
    for (const e of all) {
      e.wob += dt * 0.7; e.cool -= dt;
      e.regen += dt * (d2(nearestPile(e), e.pos) < 1.6 ? 9 : 1);
      if (e.regen > (e.isPlayer ? 2.2 : 3) && e.ammo < e.max) { e.ammo++; e.regen = 0; }
      const want = e.isPlayer && live() ? playerWant() : ai(e);
      const top = (e.isPlayer ? 6.4 : 5.2) * (hat.holder === e ? 0.86 : 1);
      if (e.stun > 0) { e.stun -= dt; e.vel.multiplyScalar(1 - Math.min(1, dt * 4)); }
      else e.vel.lerp(want.multiplyScalar(top), Math.min(1, dt * 10));
      e.pos.addScaledVector(e.vel, dt);
    }
    for (const a of all) {
      for (const b of all) if (a !== b) { const d = d2(a.pos, b.pos); if (d < 0.8 && d > 0) { tmp.copy(a.pos).sub(b.pos).setY(0).setLength((0.8 - d) / 2); a.pos.add(tmp); } }
      const r = Math.hypot(a.pos.x, a.pos.z);
      if (r < 1.45) a.pos.setLength(1.45);
      if (r > ARENA) { a.pos.x *= ARENA / r; a.pos.z *= ARENA / r; }
      const sp = Math.hypot(a.vel.x, a.vel.z);
      if (sp > 0.5 && a.stun <= 0 && a.throwT <= 0) { const f = Math.atan2(a.vel.x, a.vel.z); let dd = f - a.face; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); a.face += dd * Math.min(1, dt * 12); }
      a.throwT = Math.max(0, a.throwT - dt * 3.5);
      animate(a.mesh, dt, a.stun > 0 ? 0 : sp, a.throwT);
      a.mesh.position.copy(a.pos); a.mesh.rotation.y = a.face;
      a.mesh.rotation.z = a.stun > 0 ? Math.sin(t * 28) * 0.18 : 0;
    }
    youRing.position.set(player.pos.x, 0.05, player.pos.z); youRing.visible = live();

    // snowballs
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i]; b.vel.y -= BALL_G * dt; b.pos.addScaledVector(b.vel, dt); b.life -= dt; b.mesh.position.copy(b.pos); b.mesh.rotation.x += dt * 9;
      let done = b.life <= 0 || b.pos.y < 0.08;
      if (b.pos.y < 0.08) burst.spawn(b.pos.clone().setY(0.1), 6, 0xffffff, 2, 1.5);
      if (!done) for (const e of all) {
        if (e === b.owner || e.team === b.owner.team || e.stun > 0) continue;
        if (d2(e.pos, b.pos) < 0.6 && b.pos.y > 0.3 && b.pos.y < 2.4) { hit(e, b); done = true; break; }
      }
      if (done) { scene.remove(b.mesh); balls.splice(i, 1); }
    }

    // the hat
    hatShadow.visible = landRing.visible = false;
    if (hat.state === 'pedestal') {
      hat.pos.set(0, plaza.pedestalTop + 0.05 + Math.sin(t * 2) * 0.06, 0); hat.mesh.rotation.set(0, t * 0.8, 0);
      for (const e of all) if (e.stun <= 0 && d2(e.pos, hat.pos) < 2.05) { giveHat(e, false); break; }
    } else if (hat.state === 'head') {
      const e = hat.holder; hat.pos.set(e.pos.x, HEAD_Y + e.mesh.userData.body.position.y, e.pos.z);
      hat.mesh.rotation.set(0, e.face + Math.PI / 2, e.mesh.rotation.z);
      hat.acc += dt;
      if (hat.acc >= 1) {
        hat.acc -= 1;
        if (live()) { if (e.team === 'nice') score.nice += 10; else score.naughty += 10; }
        ui.pop(new V3(e.pos.x, 2.8, e.pos.z), '+10', e.team === 'nice' ? '' : 'green');
      }
    } else if (hat.state === 'air') {
      hat.cool -= dt; hat.vel.y -= HAT_G * dt; hat.pos.addScaledVector(hat.vel, dt);
      hat.mesh.rotation.x += dt * 7; hat.mesh.rotation.z += dt * 5;
      const r = Math.hypot(hat.pos.x, hat.pos.z);
      if (r > ARENA) { hat.pos.x *= ARENA / r; hat.pos.z *= ARENA / r; hat.vel.x *= -0.6; hat.vel.z *= -0.6; }
      if (hat.vel.y < 0 && hat.pos.y < HEAD_Y + 0.35 && hat.pos.y > HEAD_Y - 0.4) {
        for (const e of all) {
          if ((e === hat.last && hat.cool > 0) || d2(e.pos, hat.pos) > 0.8) continue;
          if (e.stun > 0) { // dazed heads send it flying again
            hat.vel.set((Math.random() - 0.5) * 6, 8, (Math.random() - 0.5) * 6); hat.last = e; hat.cool = 0.3;
            ui.pop(new V3(e.pos.x, 2.7, e.pos.z), 'BOING', 'white');
          } else giveHat(e, true);
          break;
        }
      }
      if (hat.state === 'air' && hat.pos.y <= 0.15) {
        hat.pos.y = 0.15; burst.spawn(hat.pos.clone(), 8, 0xffffff, 2, 1.5);
        if (hat.bounces++ < 2) { hat.vel.y = Math.abs(hat.vel.y) * 0.42; hat.vel.x *= 0.6; hat.vel.z *= 0.6; }
        else { hat.state = 'ground'; hat.rest = 0; hat.mesh.rotation.set(0, hat.mesh.rotation.y, 0.4); }
      }
      if (hat.state === 'air') {
        // where it will come down at head height, so everyone can race there
        const vy = hat.vel.y, dy = hat.pos.y - HEAD_Y, tt = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * HAT_G * dy))) / HAT_G;
        landing.set(hat.pos.x + hat.vel.x * tt, 0, hat.pos.z + hat.vel.z * tt);
        if (landing.length() > ARENA) landing.setLength(ARENA);
        landRing.visible = true; landRing.position.set(landing.x, 0.06, landing.z); landRing.scale.setScalar(1 + Math.sin(t * 14) * 0.12);
      }
      hatShadow.visible = true; hatShadow.position.set(hat.pos.x, 0.04, hat.pos.z); hatShadow.scale.setScalar(Math.max(0.3, 1.3 - hat.pos.y * 0.12));
    } else if (hat.state === 'ground') {
      hat.rest += dt;
      for (const e of all) if (e.stun <= 0 && d2(e.pos, hat.pos) < 1.0) { giveHat(e, false); break; }
      if (hat.state === 'ground' && hat.rest > 5) { // unclaimed: it hops home to the pedestal
        hat.state = 'air'; hat.last = null; hat.bounces = 3;
        const to = new V3(0, 0, 0).sub(hat.pos).setY(0); hat.vel.set(to.x / 1.2, 11, to.z / 1.2);
      }
    }
    hat.mesh.position.copy(hat.pos);
    hat.mesh.scale.setScalar(THREE.MathUtils.lerp(hat.mesh.scale.x, hat.state === 'pedestal' ? 2.2 : 1, Math.min(1, dt * 8)));
    hatGlow.position.set(hat.pos.x, hat.pos.y + 0.4, hat.pos.z); hatGlow.material.opacity = 0.22 + Math.sin(t * 4) * 0.08;

    // camera
    if (live()) {
      camTarget.lerp(tmp.copy(player.pos).multiplyScalar(0.55), Math.min(1, dt * 3));
      const portrait = H > W * 1.1;
      camera.fov = portrait ? 62 : 50; camera.updateProjectionMatrix();
      camPos.lerp(tmp.copy(camTarget).add(portrait ? new V3(0, 21, 15) : new V3(0, 14, 12.5)), Math.min(1, dt * 3));
      camera.position.copy(camPos); camera.lookAt(camTarget.x, 0.6, camTarget.z - 1.2);
    } else {
      const a = t * 0.07; camTarget.set(0, 0, 0);
      camPos.set(Math.sin(a) * 23, 13, Math.cos(a) * 23); camera.position.copy(camPos); camera.lookAt(0, 1, 0);
    }

    // HUD
    const s = live()
      ? `<div class="stat plaque ${time < 10 ? 'warn' : ''}"><i>Time</i><b>${Math.ceil(time)}</b></div>
         <div class="stat plaque nice"><i>Nice</i><b>${score.nice}</b></div>
         <div class="stat plaque naughty"><i>Naughty</i><b>${score.naughty}</b></div>
         <div class="stat plaque"><i>Snowballs</i><div class="pips">${Array.from({ length: player.max }, (_, i) => `<u class="${i < player.ammo ? '' : 'off'}"></u>`).join('')}</div></div>`
      : '';
    if (s !== hudStr) { hudStr = s; ui.hud(s); }
  }

  function dispose() {
    ui.canvas.removeEventListener('pointerdown', onDown);
    removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp);
  }
  function resize(w, h) { W = w; H = h; }

  return { scene, camera, update, dispose, resize, debug: { player, bots, hat, score, start, knock: () => hat.holder && knockHat(new V3(1, 0, 0.3)), get mode() { return mode; }, set time(v) { time = v; } } };
}

export default { create };
