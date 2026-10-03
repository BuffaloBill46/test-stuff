// Santa Hat Spin: the 3D prize wheel. Two painted faces on one wheel: the MAIN face (40 equal segments, 3 of them gold
// stars) and the BONUS face (12 equal segments: 3×, 4×, 5×). Landing on a star flips the wheel round to its bonus face,
// which then spins too. Pine-wreath rim with chasing bulbs, gold pegs at every segment edge, a candy-cane flapper that
// flicks as the pegs pass, gold rim stars marking the star segments (and the bonus 5×), a Santa hat on the hub.
// The wheel always lands exactly on the segment the rules picked.
import { THREE, C, part, build, toon, lights, glow, hatGeo, Burst } from './kit.js?v=4028a8e4cb';
import { MAIN, BONUS, STAR } from './spin.js?v=4028a8e4cb';
import { play as sfx } from './sfx.js?v=4028a8e4cb';

const G = THREE, V3 = THREE.Vector3, TAU = Math.PI * 2;
export const MULT_STYLE = { // face colour, label colour
  [STAR]: ['#ffc94a', '#8f1712'], 0: ['#26305a', '#6f7ba8'], 1: ['#f5f1e8', '#8f1712'], 2: ['#2f6b4a', '#f5f1e8'], 3: ['#cf3128', '#ffe7a0'], 4: ['#ffc94a', '#0c0f1a'], 5: ['#ffe27a', '#8f1712'],
};

function starPath(x, px, py, r) { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; x.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr); } x.closePath(); }
// One face: `list` is the wheel's segments clockwise from the top (a multiplier, or STAR). Every segment the same size.
function faceTexture(list, bonus) {
  const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d'), c = S / 2, R = S / 2 - 4, a0 = -Math.PI / 2, TH = TAU / list.length;
  x.fillStyle = '#0c0f1a'; x.beginPath(); x.arc(c, c, R + 4, 0, TAU); x.fill();
  list.forEach((mult, i) => {
    const s = a0 + i * TH, e = s + TH, m = (s + e) / 2, [bg, fg] = MULT_STYLE[mult];
    x.beginPath(); x.moveTo(c, c); x.arc(c, c, R, s, e); x.closePath();
    if (mult === STAR || mult >= 4) { const g = x.createRadialGradient(c, c, R * 0.2, c, c, R); g.addColorStop(0, '#fff6c8'); g.addColorStop(1, bg); x.fillStyle = g; } else x.fillStyle = bg;
    x.fill(); x.lineWidth = 3; x.strokeStyle = '#0c0f1a'; x.stroke();
    if (mult === STAR) { // a big gold star: "go to the bonus wheel"
      const px = c + Math.cos(m) * R * 0.74, py = c + Math.sin(m) * R * 0.74;
      starPath(x, px, py, 40); x.fillStyle = '#ffe27a'; x.fill(); x.lineWidth = 5; x.strokeStyle = '#8f1712'; x.stroke();
      return;
    }
    x.save(); x.translate(c, c); x.rotate(m); x.textAlign = 'right'; x.textBaseline = 'middle'; // label along the radius, reading outward
    x.font = `800 ${bonus ? 110 : 58}px 'Grenze Gotisch', Georgia, serif`;
    x.lineWidth = bonus ? 9 : 6; x.strokeStyle = mult === 1 ? 'rgba(245,241,232,.9)' : 'rgba(12,15,26,.55)'; x.strokeText(mult + '×', R - 22, 0);
    x.fillStyle = fg; x.fillText(mult + '×', R - 22, 0); x.restore();
  });
  x.beginPath(); x.arc(c, c, R * 0.24, 0, TAU); x.fillStyle = bonus ? '#c98a1b' : '#8f1712'; x.fill(); x.lineWidth = 6; x.strokeStyle = '#0c0f1a'; x.stroke();
  if (bonus) { x.font = "800 64px 'Grenze Gotisch', Georgia, serif"; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff6c8'; x.fillText('BONUS', c, c + R * 0.34); }
  const t = new G.CanvasTexture(cv); t.colorSpace = G.SRGBColorSpace; t.anisotropy = 8; return t;
}
function starGeo(r = 0.2, inner = 0.09, depth = 0.08) {
  const s = new G.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? inner : r; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  const g = new G.ExtrudeGeometry(s, { depth, bevelEnabled: false }); g.translate(0, 0, -depth / 2); return g;
}

export function createWheel(canvas) {
  const renderer = new G.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new G.Scene(); lights(scene, { hemi: 1.6, moonI: 1.4 });
  const warm = new G.DirectionalLight(0xffc98a, 0.8); warm.position.set(5, 4, 8); scene.add(warm);
  const cam = new G.PerspectiveCamera(30, 1, 0.1, 100);
  const R = 2.3, cy = 3.05;

  // stand: snowy base, wooden post, fur trim
  scene.add(toon(build([
    part(new G.CylinderGeometry(1.6, 1.9, 0.4, 9), C.woodDark, { pos: [0, 0.2, 0], jit: 0.03 }),
    part(new G.TorusGeometry(1.55, 0.3, 5, 11), C.brim, { pos: [0, 0.45, 0], rot: [Math.PI / 2, 0, 0], jit: 0.06, seed: 4 }),
    part(new G.BoxGeometry(0.5, cy - 0.3, 0.5), C.wood, { pos: [0, (cy - 0.3) / 2 + 0.3, -0.45], jit: 0.02 }),
    part(new G.BoxGeometry(0.7, 0.7, 0.35), C.woodDark, { pos: [0, cy, -0.35] }),
  ]), 0.035));

  // the spinning wheel: face + wreath rim + pegs + rim stars + hub hat
  const wheel = new G.Group(); wheel.position.set(0, cy, 0); scene.add(wheel);
  // two faces (main, bonus), each with its own pegs and rim stars; only one shows at a time. Face textures are drawn when
  // first needed (the fonts must be loaded) and redrawn if the published settings change the wheels.
  const faces = {}, mkFace = (kind) => {
    const list = kind === 'bonus' ? BONUS : MAIN, TH = TAU / list.length, grp = new G.Group();
    const face = new G.Mesh(new G.CircleGeometry(R, 128), new G.MeshBasicMaterial({ map: faceTexture(list, kind === 'bonus') })); face.position.z = 0.1; grp.add(face); // in front of the wooden disc (0.06), or the two flicker
    const pegs = [], stars = [];
    list.forEach((mult, i) => { const a = Math.PI / 2 - i * TH; pegs.push(part(new G.CylinderGeometry(0.045, 0.055, 0.18, 6), C.gold, { pos: [Math.cos(a) * (R - 0.08), Math.sin(a) * (R - 0.08), 0.14], rot: [Math.PI / 2, 0, 0] }));
      if (mult === STAR || mult >= 5) { const b = Math.PI / 2 - (i + 0.5) * TH; stars.push(part(starGeo(0.24), C.gold, { pos: [Math.cos(b) * (R + 0.34), Math.sin(b) * (R + 0.34), 0.2], rot: [0, 0, b - Math.PI / 2] })); } });
    grp.add(toon(build(pegs), 0.02)); if (stars.length) grp.add(toon(build(stars), 0.025));
    return { grp, list, TH, key: list.join(','), pegAngles: list.map((_, i) => i * TH) };
  };
  const faceOf = (kind) => { const want = (kind === 'bonus' ? BONUS : MAIN).join(',');
    if (!faces[kind] || faces[kind].key !== want) { if (faces[kind]) wheel.remove(faces[kind].grp); faces[kind] = mkFace(kind); wheel.add(faces[kind].grp); }
    return faces[kind]; };
  let mode = 'main';
  const back = toon(build([part(new G.CylinderGeometry(R + 0.05, R + 0.05, 0.12, 48), C.woodDark, { rot: [Math.PI / 2, 0, 0] })]), 0.03); wheel.add(back);
  const wreathParts = [part(new G.TorusGeometry(R + 0.12, 0.2, 5, 40), C.pine, { jit: 0.06, seed: 8 })];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; wreathParts.push(part(new G.IcosahedronGeometry(0.13, 0), C.snow, { pos: [Math.cos(a) * (R + 0.14), Math.sin(a) * (R + 0.14), 0.16], jit: 0.04, seed: i })); }
  wheel.add(toon(build(wreathParts), 0.03));
  const hat = toon(hatGeo({ scale: 0.72 }), 0.03); hat.rotation.x = Math.PI / 2; hat.position.z = 0.3; wheel.add(hat);

  // bulbs around the rim (don't spin; they chase)
  const n = 32, bulbs = new G.InstancedMesh(new G.IcosahedronGeometry(0.075, 0), new G.MeshBasicMaterial({ color: 0xffffff }), n);
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; bulbs.setMatrixAt(i, new G.Matrix4().setPosition(Math.cos(a) * (R + 0.46), cy + Math.sin(a) * (R + 0.46), 0.1)); bulbs.setColorAt(i, new G.Color(C.lantern)); }
  scene.add(bulbs);

  // candy-cane flapper at the top, pivoting on its top end
  const flap = new G.Group(); flap.position.set(0, cy + R + 0.55, 0.3); scene.add(flap);
  const caneParts = [];
  for (let i = 0; i < 5; i++) caneParts.push(part(new G.CylinderGeometry(0.09, 0.09, 0.14, 7), i % 2 ? C.brim : C.hat, { pos: [0, -0.1 - i * 0.14, 0] }));
  caneParts.push(part(new G.ConeGeometry(0.13, 0.3, 7), C.hat, { pos: [0, -0.9, 0], rot: [Math.PI, 0, 0] }));
  caneParts.push(part(new G.TorusGeometry(0.16, 0.08, 5, 10, Math.PI), C.hat, { pos: [0.16, 0, 0] }));
  flap.add(toon(build(caneParts), 0.03));
  const halo = glow(C.lantern, R * 2.6, 0.08); halo.position.set(0, cy, -0.2); scene.add(halo);
  const burst = new Burst(200); scene.add(burst.mesh);

  // camera: fit wheel, rim stars and stand
  const box = new G.Box3(new V3(-(R + 0.7), 0, -1), new V3(R + 0.7, cy + R + 0.95, 1)), ctr = box.getCenter(new V3()), size = box.getSize(new V3());
  function resize() {
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300; renderer.setSize(w, h, false); cam.aspect = w / h;
    const tan = Math.tan((cam.fov * Math.PI) / 360), dist = Math.max(size.y / 2 / tan, size.x / 2 / tan / cam.aspect) * 1.04 + 1;
    cam.position.set(0, ctr.y + 0.3, dist); cam.lookAt(0, ctr.y, 0); cam.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas); resize();

  // --- motion. `turn` = clockwise angle turned; the pointer (top) shows slice floor(((-turn) mod 2π) / TH).
  let turn = 0, spinning = null, raf = 0, active = false, last = performance.now(), clock = 0, flapV = 0, flapA = 0, fx = { kind: null, t: 0 }, flip = null;
  const mod = (a) => ((a % TAU) + TAU) % TAU, cur = () => faceOf(mode), sliceAt = (t) => Math.floor(mod(-t) / cur().TH) % cur().list.length;
  function show(kind) { mode = kind; const f = faceOf(kind); for (const k of Object.keys(faces)) faces[k].grp.visible = faces[k] === f; }
  // Turn the wheel round to the other face (a quick flip about its upright axis; the faces swap when it's edge-on).
  function flipTo(kind) {
    if (mode === kind && !flip) { show(kind); return Promise.resolve(); }
    return new Promise((resolve) => { flip = { to: kind, t: 0, dur: 0.7, swapped: false, resolve }; wake(); });
  }
  const col = new G.Color(), lamp = new G.Color(C.lantern), gold = new G.Color(C.gold), red = new G.Color(C.hat), cream = new G.Color(C.brim), dimc = new G.Color(0.35, 0.22, 0.1);

  function spinTo(slice, info = {}) {
    return new Promise((resolve) => {
      const u = 0.2 + Math.random() * 0.6, targetMod = mod(-(slice + u) * cur().TH); // land inside the segment, not on its edge
      const delta = mod(targetMod - mod(turn)) + TAU * (4 + Math.floor(Math.random() * 2));
      spinning = { from: turn, delta, t: 0, dur: 4.6 + Math.random() * 0.8, resolve, info }; fx = { kind: null, t: 0 }; wake();
    });
  }
  const easeOut = (t) => 1 - Math.pow(1 - t, 4); // long, smooth coast
  function tick(dt) {
    clock += dt;
    let speed = 0;
    if (spinning) {
      const s = spinning; s.t += dt; const k = Math.min(1, s.t / s.dur), prev = turn;
      turn = s.from + s.delta * easeOut(k); speed = (turn - prev) / Math.max(dt, 1e-4);
      if (k >= 1) { spinning = null; const info = s.info; fx = { kind: info.star ? 'win' : info.mult >= 5 ? 'top' : info.mult >= 2 ? 'win' : null, t: 0 };
        if (fx.kind) burst.spawn(new V3(0, cy + R * 0.6, 0.6), fx.kind === 'top' ? 140 : 40, fx.kind === 'top' ? C.gold : C.lantern, fx.kind === 'top' ? 3.4 : 2.2, fx.kind === 'top' ? 5 : 3);
        s.resolve(); }
    }
    if (flip) { flip.t += dt; const k = Math.min(1, flip.t / flip.dur);
      if (k >= 0.5 && !flip.swapped) { flip.swapped = true; show(flip.to); }
      wheel.rotation.y = Math.sin(k * Math.PI) * (Math.PI / 2); // edge-on at the middle, face-on at both ends
      if (k >= 1) { wheel.rotation.y = 0; const r = flip.resolve; flip = null; r(); } }
    wheel.rotation.z = -turn;
    // flapper: pushed when a peg passes under it, springs back
    const at = mod(-turn); let near = Infinity; for (const p of cur().pegAngles) { let d = mod(p - at); if (d > Math.PI) d -= TAU; if (Math.abs(d) < Math.abs(near)) near = d; }
    if (Math.abs(near) < 0.03 && speed > 0.2) { if (flapV > -speed * 0.05) sfx('spinTick'); flapV -= speed * 0.06; } // one tick per peg
    flapV += (-flapA * 90 - flapV * 9) * dt; flapA += flapV * dt; flapA = Math.max(-0.7, Math.min(0.25, flapA)); flap.rotation.z = flapA;
    if (fx.kind) fx.t += dt;
    const party = fx.kind && fx.t < (fx.kind === 'top' ? 4 : 1.6);
    for (let i = 0; i < n; i++) {
      if (party) col.copy(Math.floor(fx.t * 10 + i) % 2 ? gold : fx.kind === 'top' ? red : cream);
      else { const sp = spinning ? 16 : 3, on = (Math.floor(clock * sp) + i) % 4 === 0; col.copy(on ? lamp : dimc); }
      bulbs.setColorAt(i, col);
    }
    bulbs.instanceColor.needsUpdate = true;
    halo.material.opacity = party ? 0.2 + 0.08 * Math.sin(fx.t * 18) : 0.07;
    burst.update(dt);
    return !!spinning || !!flip || party || burst.items.length > 0 || Math.abs(flapA) > 0.002;
  }
  function loop(now) {
    raf = 0; if (!active) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const busy = tick(dt); renderer.render(scene, cam);
    if (busy) raf = requestAnimationFrame(loop); else setTimeout(() => { if (active && !raf) raf = requestAnimationFrame(loop); }, 80);
  }
  function wake() { if (active && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function finishNow() { if (spinning) { spinning.t = spinning.dur; wake(); } } // tap to stop: same slice, lands now

  return {
    spinTo, finishNow, flipTo, get mode() { return mode; },
    setActive(on) { active = on; if (on) { show(mode); resize(); wake(); } },
    spinning: () => !!spinning,
    shownSlice: () => sliceAt(turn), shownMult: () => cur().list[sliceAt(turn)], // on the bonus face: the bonus result
    debug: { scene, cam, renderer },
  };
}
