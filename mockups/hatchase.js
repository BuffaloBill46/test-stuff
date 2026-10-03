// Mockup D: Hat Chase. Gusts keep blowing Santa's hat off. Catch it, stack spares, dodge trees and snow clouds.
import { THREE, C, Snow, Burst, toon, hatGeo, glow } from './kit.js?v=4028a8e4cb';
import { buildNight, Street, sleigh, SPAN } from './village.js?v=4028a8e4cb';

const V3 = THREE.Vector3;
const X_MIN = -12, X_MAX = 5, Y_MIN = 4.5, Y_MAX = 15, STEP = 0.46, MAX_STACK = 12;

const intro = `<div class="eyebrow">Mockup D · Chase</div>
<h2>Hat Chase</h2>
<p>The wind over the village won't quit. Each gust blows the top hat off Santa's head, and you swoop back to catch it before it's gone. Grab the spare hats floating ahead to build a wobbling tower. Every hat on the stack multiplies your score.</p>
<ul><li>Trees and snow clouds knock the top hat loose too</li><li>"GUST" flashes a moment before the wind hits, so you can get ready to chase</li><li>You lose when your last hat is gone for good</li></ul>
<div class="keys"><kbd>WASD</kbd> or <kbd>Arrows</kbd> fly · Phone: drag, and the sleigh follows your finger</div>
<button class="go">Hold onto your hat</button>`;

function create(ui) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  const night = buildNight(scene);
  const street = new Street(scene, { lit: true, naughty: 0, tree: 0.38, clouds: true, seed: 9 });
  const sl = sleigh(); scene.add(sl.group);
  const snow = new Snow(1100, [90, 30, 30]); scene.add(snow.points);
  const burst = new Burst(360); scene.add(burst.mesh);
  const headHat = hatGeo({ scale: 0.76 }), looseHat = hatGeo({ scale: 0.56 });

  // wind streaks shown during a gust
  const streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, fog: false }), 40);
  streaks.frustumCulled = false; scene.add(streaks);
  const streakP = Array.from({ length: 40 }, () => new V3(Math.random() * 60 - 30, 3 + Math.random() * 14, Math.random() * 4 - 1));

  const stack = []; // meshes on Santa's head
  const loose = []; // flying hats: { mesh, pos, vel, spare, glow, age }
  let mode = 'attract', score = 0, dist = 0, catches = 0, elapsed = 0, hudStr = '';
  let sx = -4, sy = 9, vx = 0, vy = 0, stun = 0, invuln = 0, gustIn = 6, warn = 0, spareIn = 3;
  let best = 0; try { best = +localStorage.getItem('sh_hatchase_best') || 0; } catch {}
  const live = () => mode === 'play';

  function setStack(n) {
    while (stack.length > n) sl.anchor.remove(stack.pop());
    while (stack.length < n) {
      const m = toon(headHat, 0.03); m.position.y = stack.length * STEP; m.rotation.y = Math.PI / 2;
      sl.anchor.add(m); stack.push(m);
    }
  }
  const topWorld = () => sl.anchor.localToWorld(new V3(0, stack.length * STEP + 0.2, 0));

  function reset() {
    loose.forEach((h) => scene.remove(h.mesh)); loose.length = 0;
    setStack(1); score = 0; dist = 0; catches = 0; elapsed = 0;
    sx = -4; sy = 9; vx = vy = 0; stun = 0; invuln = 0; gustIn = 6; warn = 0; spareIn = 3;
  }

  function addLoose(pos, vel, spare) {
    const mesh = toon(looseHat, 0.025); mesh.position.copy(pos); scene.add(mesh);
    const g = glow(spare ? C.gold : 0xffffff, spare ? 2.4 : 1.8, spare ? 0.5 : 0.35); mesh.add(g);
    loose.push({ mesh, pos: pos.clone(), vel, spare, age: 0, bob: Math.random() * 6 });
  }

  function knock(n, why) {
    for (let i = 0; i < n && stack.length; i++) {
      const p = topWorld().add(new V3(0, -STEP, 0));
      setStack(stack.length - 1);
      addLoose(p, new V3(-5 - Math.random() * 2, 4 + i * 1.5, 0), false);
    }
    ui.pop(new V3(sx, sy + 3.2, 0), why, 'bad');
  }

  // ---------- input
  let W = innerWidth, H = innerHeight, dragId = null; const target = new V3(); let hasTarget = false;
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new V3(0, 0, 1), 0);
  const toWorld = (cx, cy) => { ray.setFromCamera({ x: (cx / W) * 2 - 1, y: -(cy / H) * 2 + 1 }, camera); return ray.ray.intersectPlane(plane, new V3()); };
  const onDown = (e) => { if (!live()) return; dragId = e.pointerId; const p = toWorld(e.clientX, e.clientY); if (p) { target.copy(p); hasTarget = true; } };
  const onMove = (e) => { if (e.pointerId !== dragId) return; const p = toWorld(e.clientX, e.clientY); if (p) target.copy(p); };
  const onUp = (e) => { if (e.pointerId === dragId) { dragId = null; hasTarget = false; } };
  ui.canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);

  function finish() {
    mode = 'attract';
    const isBest = score > best; if (isBest) { best = score; try { localStorage.setItem('sh_hatchase_best', String(best)); } catch {} }
    ui.card(`<div class="eyebrow">Hatless</div>
      <h2>${isBest ? 'New best!' : 'Gone with the wind'}</h2>
      <div class="verdict">${Math.floor(dist)} m flown, ${catches} hats caught.</div>
      <div class="result"><div class="stat nice"><i>Score</i><b>${score}</b></div><div class="stat"><i>Best</i><b>${best}</b></div></div>
      <button class="go">Fly again</button>`, start);
    reset();
  }
  function start() { reset(); mode = 'play'; }
  reset();
  ui.card(intro, start);

  const tmp = new V3();

  function update(dt, t) {
    elapsed += dt;
    const speed = live() ? 8 + Math.min(elapsed * 0.06, 6) : 8;
    night.tick(dt, t, speed); street.update(dt, speed, t); burst.update(dt); sl.tick(t);
    snow.update(dt, t, new V3(0, 0, 0), -speed * (warn > 0 ? 1.4 : 0.5));

    // steering
    let ax = 0, ay = 0;
    if (live()) {
      const k = ui.input.keys;
      ax = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      ay = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      if (hasTarget) { tmp.set(target.x - sx, target.y + 1.5 - sy, 0); if (tmp.length() > 0.3) { tmp.clampLength(0, 1.6).multiplyScalar(1 / 1.6); ax = tmp.x; ay = tmp.y; } }
    } else {
      // attract: chase the nearest hat, otherwise cruise
      const h = loose.reduce((b, l) => (!b || l.pos.distanceTo(tmp.set(sx, sy, 0)) < b.pos.distanceTo(tmp) ? l : b), null);
      const tx = h ? h.pos.x - 0.2 : -4, ty = h ? h.pos.y - 2.3 : 9 + Math.sin(t * 0.7) * 2.5;
      ax = THREE.MathUtils.clamp(tx - sx, -1, 1); ay = THREE.MathUtils.clamp(ty - sy, -1, 1);
    }
    vx += (ax * 10 - vx) * Math.min(1, dt * 6); vy += (ay * 9 - vy) * Math.min(1, dt * 6);
    if (stun > 0) { stun -= dt; vx -= 6 * dt; }
    sx = THREE.MathUtils.clamp(sx + vx * dt, X_MIN, X_MAX); sy = THREE.MathUtils.clamp(sy + vy * dt, Y_MIN, Y_MAX);
    sl.group.position.set(sx, sy, 0);
    sl.group.rotation.z = stun > 0 ? Math.sin(t * 30) * 0.12 : THREE.MathUtils.clamp(vy * 0.025 - vx * 0.01, -0.2, 0.2);
    invuln -= dt; sl.group.visible = invuln > 0 ? Math.sin(t * 40) > -0.3 : true;

    // the tower wobbles more the taller it gets, and leans back in the wind
    stack.forEach((m, i) => { m.rotation.z = Math.sin(t * 3.2 + i * 0.7) * 0.03 * i + (warn > 0 ? 0.08 * i : 0) - vx * 0.004 * i; m.position.x = Math.sin(t * 3.2 + i * 0.7) * 0.02 * i; });

    // gusts
    if (live() || loose.length === 0) gustIn -= dt;
    if (gustIn <= 1.2 && warn <= 0 && stack.length) { warn = 1.2; ui.pop(new V3(sx + 6, sy + 3, 0), 'GUST!', 'white'); }
    if (warn > 0) { warn -= dt; if (warn <= 0) { knock(stack.length >= 6 ? 2 : 1, 'Whoosh!'); gustIn = Math.max(3.5, 7.5 - elapsed * 0.04) + Math.random() * 2; } }
    streaks.visible = warn > 0 || gustIn > 7.2;
    if (streaks.visible) {
      streakP.forEach((p, i) => { p.x -= dt * 45; if (p.x < -30) p.x += 60; streaks.setMatrixAt(i, new THREE.Matrix4().setPosition(p)); });
      streaks.instanceMatrix.needsUpdate = true;
    }

    // spare hats float in from the right
    spareIn -= dt;
    if (spareIn <= 0) { addLoose(new V3(26, 5.5 + Math.random() * 8.5, 0), new V3(0, 0, 0), true); spareIn = 3.5 + Math.random() * 3; }

    // loose hats: flutter, drift, get caught or lost
    const head = topWorld();
    for (let i = loose.length - 1; i >= 0; i--) {
      const h = loose[i]; h.age += dt;
      if (h.spare) { h.pos.x -= speed * 0.75 * dt; h.pos.y += Math.sin(t * 2 + h.bob) * 0.4 * dt; }
      else {
        h.vel.x += (-(2.5 + speed * 0.15) - h.vel.x) * Math.min(1, dt * 1.5);
        h.vel.y += (-1.6 - h.vel.y) * Math.min(1, dt * 2);
        h.pos.addScaledVector(h.vel, dt); h.pos.y += Math.sin(t * 5 + h.bob) * 0.8 * dt;
      }
      h.mesh.position.copy(h.pos); h.mesh.rotation.set(Math.sin(t * 4 + h.bob) * 0.5, t * 1.5, Math.sin(t * 3 + h.bob) * 0.6);
      if (h.pos.distanceTo(head) < 1.35 && stack.length < MAX_STACK && (h.spare || h.age > 0.7)) {
        scene.remove(h.mesh); loose.splice(i, 1); setStack(stack.length + 1); catches++;
        const bonus = h.spare ? 50 : 30; if (live()) score += bonus;
        burst.spawn(head.clone(), 14, h.spare ? C.gold : 0xffffff, 3, 3);
        ui.pop(head.clone().setY(head.y + 1), stack.length > 1 ? `STACK x${stack.length}` : 'Caught!', h.spare ? 'big' : '');
        continue;
      }
      if (h.pos.x < -24 || h.pos.y < 0.3) {
        scene.remove(h.mesh); loose.splice(i, 1);
        if (!h.spare) { burst.spawn(new V3(Math.max(h.pos.x, -20), Math.max(h.pos.y, 0.5), 0), 10, 0xffffff, 2, 2); ui.pop(new V3(Math.max(h.pos.x, -18), 3, 0), 'Lost!', 'bad'); }
      }
    }

    // trees and snow clouds
    if (stun <= 0 && invuln <= 0) {
      for (const it of street.items) {
        let hit = false;
        if (it.kind === 'tree') {
          const near = THREE.MathUtils.clamp(it.x, sx + SPAN.back, sx + SPAN.front), hw = it.base * (1 - (sy + 0.1) / it.height);
          hit = hw > 0 && Math.abs(it.x - near) < hw + 0.3;
        } else if (it.kind === 'cloud') {
          const nx = THREE.MathUtils.clamp(it.x, sx + SPAN.back, sx + SPAN.front), ny = THREE.MathUtils.clamp(it.g.position.y, sy, sy + 2);
          hit = Math.hypot(it.x - nx, it.g.position.y - ny) < it.r;
        }
        if (hit) {
          stun = 0.6; invuln = 1.5;
          burst.spawn(new V3(sx + 1, sy + 1, 0.5), 20, it.kind === 'tree' ? C.pine : 0xc8d2ec, 4, 3);
          if (stack.length) knock(1, it.kind === 'tree' ? 'Branch!' : 'Snow cloud!');
          break;
        }
      }
    }

    if (live()) {
      dist += speed * dt; score += Math.round(speed * dt * stack.length * 2);
      if (!stack.length && !loose.some((h) => !h.spare)) finish();
    } else if (!stack.length && !loose.some((h) => !h.spare)) setStack(1);

    // camera
    const portrait = H > W * 1.1;
    camera.fov = portrait ? 64 : 50; camera.updateProjectionMatrix();
    camera.position.set(portrait ? -3 : -2.5, 8.5 + (sy - 10) * 0.35, portrait ? 30 : 20);
    camera.lookAt(portrait ? -3 : -2.5, (portrait ? 8.5 : 7.2) + (sy - 10) * 0.35, 0);

    const s = live()
      ? `<div class="stat plaque nice"><i>Score</i><b>${score}</b></div>
         <div class="stat plaque ${stack.length <= 1 ? 'warn' : stack.length >= 4 ? 'naughty' : ''}"><i>Hat stack</i><b>x${stack.length}</b></div>
         <div class="stat plaque"><i>Distance</i><b>${Math.floor(dist)}m</b></div>
         <div class="stat plaque"><i>Best</i><b>${best}</b></div>`
      : '';
    if (s !== hudStr) { hudStr = s; ui.hud(s); }
  }

  function dispose() {
    ui.canvas.removeEventListener('pointerdown', onDown);
    removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp);
  }
  function resize(w, h) { W = w; H = h; }
  return { scene, camera, update, dispose, resize, debug: { start, setStack, loose, get stack() { return stack.length; }, get mode() { return mode; }, get score() { return score; }, knock: () => knock(1, 'test') } };
}

export default { create };
