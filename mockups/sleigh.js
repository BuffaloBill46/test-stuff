// Mockup C: Sleigh Night. Drop presents down chimneys; skip the Naughty houses; dodge the tall pines.
import { THREE, C, Snow, Burst, toon, giftGeo, glow } from './kit.js?v=2cca0899bc';
import { buildNight, Street, sleigh, SPAN } from './village.js?v=2cca0899bc';

const V3 = THREE.Vector3;
const SX = -5, ROUND = 75, GIFT_G = 16, Y_MIN = 6.8, Y_MAX = 14, CHIMNEY_Y = 5.3;

const intro = `<div class="eyebrow">Mockup C · Delivery</div>
<h2>Sleigh Night</h2>
<p>Fly the sleigh over the village and drop presents down the chimneys. Each house you deliver to lights up behind you. Houses with coal on the chimney are Naughty: skip them. Tall pines knock you off course.</p>
<ul><li>The glowing marker shows where a chimney needs to be when you drop. It turns gold when it's lined up</li><li>Dead-centre drops are PERFECT: bigger points and +2 seconds</li><li>Chain deliveries for a combo multiplier; one miss and it resets</li></ul>
<div class="keys"><kbd>W</kbd>/<kbd>S</kbd> climb and dive · <kbd>Space</kbd> or <kbd>Click</kbd> drop · Phone: drag up and down, tap to drop</div>
<button class="go">Take off</button>`;

function create(ui) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  const night = buildNight(scene);
  const street = new Street(scene, { lit: false, naughty: 0.2, tree: 0.22, seed: 3 });
  const sl = sleigh(); scene.add(sl.group);
  const snow = new Snow(900, [90, 30, 30]); scene.add(snow.points);
  const burst = new Burst(360); scene.add(burst.mesh);
  const gifts = [C.hat, C.elf, 0x4b7bd1, C.gold].map((c, i) => giftGeo(c, i === 3 ? C.hat : C.gold, 0.55));

  // drop marker: where a chimney must be *now* for a drop to land in it
  const marker = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
  const chevron = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 3), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
  chevron.rotation.z = Math.PI; chevron.position.y = 0.9; marker.add(ring, chevron);
  const markerGlow = glow(C.gold, 3, 0); marker.add(markerGlow);
  marker.position.z = 1.4; scene.add(marker);

  let mode = 'attract', time = ROUND, score = 0, combo = 0, delivered = 0, perfects = 0, elapsed = 0;
  let y = 10, vy = 0, stun = 0, cool = 0, hudStr = '';
  const presents = [];
  let best = 0; try { best = +localStorage.getItem('sh_sleigh_best') || 0; } catch {}
  const live = () => mode === 'play';

  function reset() { time = ROUND; score = 0; combo = 0; delivered = 0; perfects = 0; elapsed = 0; y = 10; vy = 0; stun = 0; }

  function drop() {
    if (cool > 0 || stun > 0) return;
    cool = 0.28;
    const mesh = toon(gifts[Math.floor(Math.random() * gifts.length)], 0.025);
    const pos = new V3(SX - 0.9, y + 1.2, 0.1); mesh.position.copy(pos); scene.add(mesh);
    presents.push({ mesh, pos, vel: new V3(-0.4, 1.5, 0), spin: (Math.random() - 0.5) * 8 });
  }

  const fallTime = (y0) => { const v = 1.5, dy = y0 - CHIMNEY_Y; return (v + Math.sqrt(v * v + 2 * GIFT_G * Math.max(dy, 0))) / GIFT_G; };

  function deliver(h, dx, p) {
    const at = new V3(h.x + h.chimX, h.chimY + 1, 0.5);
    if (h.naughty) {
      if (live()) score = Math.max(0, score - 50);
      combo = 0; burst.spawn(at, 14, C.coal, 3, 3); ui.pop(at.setY(at.y + 0.6), 'NAUGHTY -50', 'bad'); return;
    }
    if (h.delivered) { if (live()) score += 10; ui.pop(at, '+10', 'white'); return; }
    street.light(h);
    const perfect = dx < 0.2; combo++;
    const mult = Math.min(combo, 8), gained = (perfect ? 250 : 100) * mult;
    if (live()) { score += gained; delivered++; if (perfect) { perfects++; time += 2; } }
    burst.spawn(at, perfect ? 30 : 16, perfect ? C.gold : 0xffe2a8, 3.5, 4);
    ui.pop(at.clone().setY(at.y + 0.6), perfect ? `PERFECT +${gained}` : `+${gained}`, perfect ? 'big' : '');
    if (perfect) ui.pop(at.clone().setY(at.y + 1.6), '+2s', 'green');
  }

  // ---------- input
  let W = innerWidth, H = innerHeight, dragId = null, dragY0 = 0, sleighY0 = 0, moved = 0;
  const onDown = (e) => {
    if (!live()) return;
    if (e.pointerType === 'mouse') { drop(); return; }
    dragId = e.pointerId; dragY0 = e.clientY; sleighY0 = y; moved = 0;
  };
  const onMove = (e) => {
    if (e.pointerId !== dragId) return;
    const d = e.clientY - dragY0; moved = Math.max(moved, Math.abs(d));
    y = THREE.MathUtils.clamp(sleighY0 - d * (16 / H), Y_MIN, Y_MAX);
  };
  const onUp = (e) => { if (e.pointerId !== dragId) return; if (moved < 12) drop(); dragId = null; };
  ui.canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);

  function finish() {
    mode = 'attract';
    const isBest = score > best; if (isBest) { best = score; try { localStorage.setItem('sh_sleigh_best', String(best)); } catch {} }
    ui.card(`<div class="eyebrow">Sack's empty</div>
      <h2>${isBest ? 'New best!' : 'Night done'}</h2>
      <div class="verdict">${delivered} houses lit, ${perfects} perfect.</div>
      <div class="result"><div class="stat nice"><i>Score</i><b>${score}</b></div><div class="stat"><i>Best</i><b>${best}</b></div></div>
      <button class="go">Fly again</button>`, start);
  }
  function start() { reset(); mode = 'play'; }
  reset();
  ui.card(intro, start);

  let nextTarget = null;

  function update(dt, t) {
    elapsed += dt;
    const speed = live() ? 7 + Math.min(elapsed * 0.07, 5.5) : 7;
    night.tick(dt, t, speed); street.update(dt, speed, t); burst.update(dt); sl.tick(t);
    snow.update(dt, t, new V3(0, 0, 0), -speed * 0.5);
    cool -= dt;

    if (live()) {
      time -= dt; if (time <= 0) { time = 0; finish(); }
      const k = ui.input.keys;
      const dir = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      if (dragId === null) { vy += (dir * 9 - vy) * Math.min(1, dt * 6); y += vy * dt; }
      if (ui.input.hit.has('Space') || ui.input.hit.has('Enter')) drop();
    } else {
      y += (9.5 + Math.sin(t * 0.6) * 2 - y) * Math.min(1, dt * 2);
    }
    if (stun > 0) { stun -= dt; y += dt * 4; }
    y = THREE.MathUtils.clamp(y, Y_MIN, Y_MAX);
    sl.group.position.set(SX, y, 0);
    sl.group.rotation.z = stun > 0 ? Math.sin(t * 30) * 0.12 : THREE.MathUtils.clamp(vy * 0.03, -0.15, 0.15);

    // marker + "lined up" check
    const tf = fallTime(y + 1.2), mx = SX - 0.9 + (speed - 0.4) * tf;
    marker.position.x = mx; marker.position.y = CHIMNEY_Y + 0.7;
    nextTarget = null;
    for (const it of street.items) {
      if (it.kind !== 'house' || it.delivered || it.naughty) continue;
      if (Math.abs(it.x + it.chimX - mx) < 0.35) { nextTarget = it; break; }
    }
    const on = !!nextTarget;
    ring.material.color.set(on ? C.gold : 0xffffff); chevron.material.color.set(on ? C.gold : 0xffffff);
    markerGlow.material.opacity = on ? 0.5 : 0;
    marker.scale.setScalar(on ? 1.25 + Math.sin(t * 16) * 0.08 : 1);
    if (!live() && on && Math.random() < 0.35) drop(); // attract mode delivers by itself

    // presents
    for (let i = presents.length - 1; i >= 0; i--) {
      const p = presents[i], prevY = p.pos.y;
      p.vel.y -= GIFT_G * dt; p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos); p.mesh.rotation.z += p.spin * dt; p.mesh.rotation.x += p.spin * 0.5 * dt;
      let done = false;
      for (const h of street.items) {
        if (h.kind !== 'house') continue;
        const cx = h.x + h.chimX, dx = Math.abs(p.pos.x - cx);
        if (prevY >= h.chimY - 0.1 && p.pos.y <= h.chimY + 0.05 && dx < 0.55) { deliver(h, dx, p); done = true; break; }
        if (Math.abs(p.pos.x - h.x) < h.halfW && p.pos.y < h.ridge) {
          burst.spawn(p.pos.clone(), 8, 0xffffff, 2.5, 2); combo = 0; ui.pop(p.pos.clone().setY(p.pos.y + 0.8), 'miss', 'bad'); done = true; break;
        }
      }
      if (!done && p.pos.y < 0.3) { burst.spawn(p.pos.clone(), 8, 0xffffff, 2, 1.5); if (combo) ui.pop(p.pos.clone().setY(1.2), 'miss', 'bad'); combo = 0; done = true; }
      if (done) { scene.remove(p.mesh); presents.splice(i, 1); }
    }

    // tall pines clip the sleigh
    if (stun <= 0) for (const it of street.items) {
      if (it.kind !== 'tree') continue;
      const near = THREE.MathUtils.clamp(it.x, SX + SPAN.back, SX + SPAN.front), hw = it.base * (1 - (y + 0.1) / it.height);
      if (hw > 0 && Math.abs(it.x - near) < hw + 0.3) {
        stun = 1.1; combo = 0; if (live()) time = Math.max(0, time - 4);
        burst.spawn(new V3(it.x, y + 0.5, 0.5), 22, C.pine, 4, 3); ui.pop(new V3(SX, y + 3, 0), 'BRANCH! -4s', 'bad');
        break;
      }
    }

    // camera
    const portrait = H > W * 1.1;
    camera.fov = portrait ? 72 : 50; camera.updateProjectionMatrix();
    camera.position.set(portrait ? -1.5 : 1.5, 7.5 + (y - 10) * 0.25, portrait ? 30 : 23);
    camera.lookAt(portrait ? -1.5 : 1.5, 6.2 + (y - 10) * 0.25, 0);

    const s = live()
      ? `<div class="stat plaque ${time < 10 ? 'warn' : ''}"><i>Time</i><b>${Math.ceil(time)}</b></div>
         <div class="stat plaque nice"><i>Score</i><b>${score}</b></div>
         <div class="stat plaque ${combo >= 3 ? 'naughty' : ''}"><i>Combo</i><b>x${Math.min(Math.max(combo, 1), 8)}</b></div>
         <div class="stat plaque"><i>Houses lit</i><b>${delivered}</b></div>`
      : '';
    if (s !== hudStr) { hudStr = s; ui.hud(s); }
  }

  function dispose() {
    ui.canvas.removeEventListener('pointerdown', onDown);
    removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp);
  }
  function resize(w, h) { W = w; H = h; }
  return { scene, camera, update, dispose, resize, debug: { start, street, get mode() { return mode; }, get score() { return score; }, get delivered() { return delivered; }, get y() { return y; }, drop } };
}

export default { create };
