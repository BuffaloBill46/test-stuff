// Santa Hat Slots: the two 3D machines. Each cabinet IS a Santa hat: red faceted cone body, white fur brim for a
// base, and the drooping tip ends in the pom-pom, which is the pull lever. Reels are faceted drums with the ten
// symbols drawn as low-poly models (same kit as the plaza), clipped to the reel window.
import { THREE, C, part, build, toon, lights, glow, hatGeo, pineGeo, snowmanGeo, reindeerGeo, giftGeo, Burst } from './kit.js';
import { SYMBOLS, REELS, STRIP_LEN } from './slots.js';

const G = THREE, V3 = THREE.Vector3;
const CELL = 128, STEP = (Math.PI * 2) / STRIP_LEN;

// ---------- the ten symbols as models
function starGeo(r = 0.62, inner = 0.27, depth = 0.22) {
  const s = new G.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? inner : r;
    i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const g = new G.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.06, bevelSegments: 1 });
  g.translate(0, 0, -depth / 2); return g;
}
function symbolGeo(id) {
  switch (id) {
    case 'hat': return hatGeo({ scale: 1.2 });
    case 'star': return build([part(starGeo(), C.gold, { jit: 0.02 })]);
    case 'reindeer': return reindeerGeo();
    case 'snowman': return snowmanGeo(4);
    case 'present': return giftGeo(C.pine, C.hat, 0.9);
    case 'pine': return pineGeo(6, 0.6);
    case 'snowball': return build([part(new G.IcosahedronGeometry(0.5, 1), C.snow, { jit: 0.05, seed: 9 }), part(new G.IcosahedronGeometry(0.2, 0), C.snowShade, { pos: [0.25, 0.3, 0.22], jit: 0.03 })]);
    case 'bell': return build([
      part(new G.IcosahedronGeometry(0.46, 1), C.gold, { jit: 0.03, seed: 3 }),
      part(new G.BoxGeometry(0.62, 0.07, 0.3), C.goldDeep, { pos: [0, -0.06, 0.34] }),
      part(new G.CylinderGeometry(0.07, 0.07, 0.05, 6), C.ink, { pos: [0, -0.2, 0.44], rot: [Math.PI / 2, 0, 0] }),
      part(new G.TorusGeometry(0.13, 0.05, 4, 8), C.goldDeep, { pos: [0, 0.52, 0] }),
      part(new G.BoxGeometry(0.5, 0.12, 0.12), C.hat, { pos: [0, 0.62, 0.05], rot: [0, 0, 0.35] }),
      part(new G.BoxGeometry(0.5, 0.12, 0.12), C.hat, { pos: [0, 0.62, 0.05], rot: [0, 0, -0.35] }),
    ]);
    case 'lantern': return build([
      part(new G.BoxGeometry(0.5, 0.62, 0.5), C.glass, { pos: [0, 0.5, 0] }),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => part(new G.BoxGeometry(0.09, 0.7, 0.09), C.woodDark, { pos: [x * 0.26, 0.5, z * 0.26] })),
      part(new G.BoxGeometry(0.66, 0.1, 0.66), C.woodDark, { pos: [0, 0.14, 0] }),
      part(new G.ConeGeometry(0.46, 0.34, 4), C.woodDark, { pos: [0, 0.98, 0], rot: [0, Math.PI / 4, 0] }),
      part(new G.TorusGeometry(0.1, 0.035, 4, 8), C.stoneDark, { pos: [0, 1.2, 0] }),
      part(new G.ConeGeometry(0.1, 0.22, 5), 0xfff3c4, { pos: [0, 0.5, 0.2] }),
    ]);
    case 'coal': return build([
      part(new G.DodecahedronGeometry(0.46, 0), C.coal, { jit: 0.12, seed: 11 }),
      part(new G.DodecahedronGeometry(0.28, 0), 0x2a2a33, { pos: [0.34, -0.16, 0.12], jit: 0.08, seed: 12 }),
      part(new G.BoxGeometry(0.1, 0.06, 0.06), C.carrot, { pos: [-0.1, 0.12, 0.42] }),
      part(new G.BoxGeometry(0.06, 0.06, 0.06), C.lantern, { pos: [0.12, -0.08, 0.44] }),
    ]);
  }
}
const VIEW = { hat: [0.25, 0.35], reindeer: [0.9, 0.2], snowman: [0.15, 0.1], pine: [0.1, 0.12], present: [0.35, 0.3], lantern: [0.35, 0.25] };

// Render every symbol once to a small image (used on the reels and in the paytable).
let atlas = null;
export function symbolImages() {
  if (atlas) return atlas;
  const r = new G.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(CELL, CELL, false);
  atlas = {};
  for (const s of SYMBOLS) {
    const scene = new G.Scene(); lights(scene, { hemi: 1.8, moonI: 1.8 });
    const m = toon(symbolGeo(s.id), 0.03), [ry, rx] = VIEW[s.id] || [0.3, 0.15];
    m.rotation.set(rx, ry, 0); scene.add(m);
    const box = new G.Box3().setFromObject(m), sph = box.getBoundingSphere(new G.Sphere());
    const cam = new G.PerspectiveCamera(28, 1, 0.1, 100);
    cam.position.copy(sph.center).add(new V3(0, 0, sph.radius / Math.sin((28 * Math.PI) / 360) * 0.8)); cam.lookAt(sph.center);
    r.render(scene, cam);
    const cv = document.createElement('canvas'); cv.width = cv.height = CELL; cv.getContext('2d').drawImage(r.domElement, 0, 0);
    atlas[s.id] = cv;
    scene.traverse((o) => o.geometry && o.geometry.dispose());
  }
  r.dispose(); r.forceContextLoss?.();
  return atlas;
}

// One tall strip image per reel, in that reel's symbol order. `blur` makes the fast-spinning version.
function reelTexture(strip, blur) {
  const imgs = symbolImages(), cv = document.createElement('canvas');
  cv.width = CELL; cv.height = CELL * STRIP_LEN;
  const x = cv.getContext('2d');
  strip.forEach((sym, i) => {
    const y = i * CELL, g = x.createLinearGradient(0, y, 0, y + CELL);
    g.addColorStop(0, '#e9e2d2'); g.addColorStop(0.5, '#fbf8f1'); g.addColorStop(1, '#e9e2d2');
    x.fillStyle = g; x.fillRect(0, y, CELL, CELL);
    x.fillStyle = '#c9bea6'; x.fillRect(0, y, CELL, 3);
    x.drawImage(imgs[SYMBOLS[sym].id], 4, y + 4, CELL - 8, CELL - 8);
  });
  let out = cv;
  if (blur) { out = document.createElement('canvas'); out.width = cv.width; out.height = cv.height; const o = out.getContext('2d'); o.filter = 'blur(7px)'; o.drawImage(cv, 0, 0); o.drawImage(cv, 0, -CELL * STRIP_LEN + 2); }
  const t = new G.CanvasTexture(out); t.colorSpace = G.SRGBColorSpace; t.anisotropy = 4; return t;
}

// A faceted drum: STRIP_LEN flat faces, face k shows strip cell k. Rotation.x = -k * STEP puts face k on the payline.
function drumGeo(radius, width) {
  const pos = [], uv = [], hw = width / 2;
  for (let k = 0; k < STRIP_LEN; k++) {
    const a0 = -k * STEP + STEP / 2, a1 = -k * STEP - STEP / 2; // top edge, bottom edge
    const y0 = Math.sin(a0) * radius, z0 = Math.cos(a0) * radius, y1 = Math.sin(a1) * radius, z1 = Math.cos(a1) * radius;
    const vT = 1 - k / STRIP_LEN, vB = 1 - (k + 1) / STRIP_LEN;
    pos.push(-hw, y0, z0, -hw, y1, z1, hw, y1, z1, -hw, y0, z0, hw, y1, z1, hw, y0, z0);
    uv.push(0, vT, 0, vB, 1, vB, 0, vT, 1, vB, 1, vT);
  }
  const g = new G.BufferGeometry();
  g.setAttribute('position', new G.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new G.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); return g;
}

// Tapering tube made of faceted cone pieces along a list of points: the hat's drooping tip.
function droopParts(points, r0, r1, color, seed) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], d = new V3().subVectors(b, a), len = d.length();
    const ra = r0 + (r1 - r0) * (i / (points.length - 1)), rb = r0 + (r1 - r0) * ((i + 1) / (points.length - 1));
    const g = new G.CylinderGeometry(rb, ra, len * 1.08, 7, 1);
    const q = new G.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.clone().normalize());
    const e = new G.Euler().setFromQuaternion(q), mid = a.clone().addScaledVector(d, 0.5);
    out.push(part(g, color, { pos: mid.toArray(), rot: [e.x, e.y, e.z], jit: 0.03, seed: seed + i }));
  }
  return out;
}

const KINDS = {
  mini: { body: 2.9, rBase: 1.75, rTop: 0.45, reelW: 0.46, faceH: 0.42, bulbs: 12, star: false },
  big: { body: 4.3, rBase: 2.35, rTop: 0.6, reelW: 0.6, faceH: 0.55, bulbs: 20, star: true },
};

// Builds one machine into its own small renderer on `canvas`.
export function createMachine(canvas, kind) {
  const K = KINDS[kind];
  const renderer = new G.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.localClippingEnabled = true;
  const scene = new G.Scene(); lights(scene, { hemi: 1.6, moonI: 1.5 });
  const warm = new G.DirectionalLight(0xffc98a, 0.9); warm.position.set(6, 3, 8); scene.add(warm);
  const cam = new G.PerspectiveCamera(30, 1, 0.1, 100);

  // --- the reel window, set in a box that sticks out of the front of the hat
  const radius = K.faceH / 2 / Math.sin(STEP / 2), gap = 0.07;
  const winW = K.reelW * 3 + gap * 4, winH = K.faceH * 3 * 0.97;
  const winY = 0.75 + K.body * 0.36, coneAt = (y) => K.rBase + (K.rTop - K.rBase) * ((y - 0.75) / K.body);
  const front = coneAt(winY - winH / 2) + 0.38; // window face z: clear of the cone even at the window's bottom edge
  const frame = 0.16, depth = 0.95;
  const ps = [
    part(new G.CylinderGeometry(K.rBase + 0.1, K.rBase + 0.25, 0.42, 9), C.woodDark, { pos: [0, 0.21, 0], jit: 0.03 }),
    part(new G.TorusGeometry(K.rBase * 0.98, 0.34 + K.rBase * 0.06, 5, 11), C.brim, { pos: [0, 0.62, 0], rot: [Math.PI / 2, 0, 0], jit: 0.07, seed: 3 }),
    part(new G.CylinderGeometry(K.rTop, K.rBase, K.body, 9, 4), C.hat, { pos: [0, 0.75 + K.body / 2, 0], jit: 0.07, seed: 5 }),
    // reel housing: dark back plate + red side walls + gold frame
    part(new G.BoxGeometry(winW + 0.1, winH + 0.1, 0.1), C.ink, { pos: [0, winY, front - depth] }),
    part(new G.BoxGeometry(frame, winH + frame * 2, depth), C.hatDark, { pos: [-(winW / 2 + frame / 2), winY, front - depth / 2] }),
    part(new G.BoxGeometry(frame, winH + frame * 2, depth), C.hatDark, { pos: [winW / 2 + frame / 2, winY, front - depth / 2] }),
    part(new G.BoxGeometry(winW + frame * 2, frame, depth), C.hatDark, { pos: [0, winY + winH / 2 + frame / 2, front - depth / 2] }),
    part(new G.BoxGeometry(winW + frame * 2, frame, depth), C.hatDark, { pos: [0, winY - winH / 2 - frame / 2, front - depth / 2] }),
    part(new G.BoxGeometry(winW + frame * 2 + 0.12, 0.12, 0.14), C.gold, { pos: [0, winY + winH / 2 + frame, front + 0.02] }),
    part(new G.BoxGeometry(winW + frame * 2 + 0.12, 0.12, 0.14), C.gold, { pos: [0, winY - winH / 2 - frame, front + 0.02] }),
    part(new G.BoxGeometry(0.12, winH + frame * 2 + 0.12, 0.14), C.gold, { pos: [-(winW / 2 + frame), winY, front + 0.02] }),
    part(new G.BoxGeometry(0.12, winH + frame * 2 + 0.12, 0.14), C.gold, { pos: [winW / 2 + frame, winY, front + 0.02] }),
    // payline pointers
    part(new G.ConeGeometry(0.1, 0.2, 3), C.gold, { pos: [-(winW / 2 + frame + 0.16), winY, front + 0.04], rot: [0, 0, -Math.PI / 2] }),
    part(new G.ConeGeometry(0.1, 0.2, 3), C.gold, { pos: [winW / 2 + frame + 0.16, winY, front + 0.04], rot: [0, 0, Math.PI / 2] }),
    // coin tray under the window
    part(new G.BoxGeometry(winW * 0.7, 0.2, 0.5), C.woodDark, { pos: [0, 1.05, coneAt(1.05) + 0.1] }),
    part(new G.BoxGeometry(winW * 0.6, 0.06, 0.4), C.goldDeep, { pos: [0, 1.16, coneAt(1.05) + 0.12] }),
  ];
  if (K.star) {
    ps.push(part(new G.TorusGeometry(coneAt(winY + winH / 2 + 0.55) + 0.06, 0.12, 4, 12), C.gold, { pos: [0, winY + winH / 2 + 0.55, 0], rot: [Math.PI / 2, 0, 0] }));
    ps.push(part(starGeo(0.42, 0.18, 0.16), C.gold, { pos: [0, winY + winH / 2 + 0.62, coneAt(winY + winH / 2 + 0.62) + 0.3] }));
  }
  const cabinet = toon(build(ps), 0.035); scene.add(cabinet);

  // --- drooping tip + pom-pom lever, pivoting at the top of the cone
  const topY = 0.75 + K.body, tip = new G.Group(); tip.position.set(0, topY, 0); scene.add(tip);
  const leanOf = (k) => k.rTop + (k.rBase - k.rTop) * 0.45 + 0.6, lean = leanOf(K);
  const pts = [new V3(0, -0.05, 0), new V3(0.25, 0.55, 0), new V3(0.8, 0.8, 0), new V3(lean - 0.1, 0.45, 0.05), new V3(lean + 0.05, -0.35, 0.1), new V3(lean, -1.05, 0.12)];
  tip.add(toon(build(droopParts(pts, K.rTop, 0.08, C.hat, 21)), 0.03));
  const pom = toon(build([part(new G.IcosahedronGeometry(0.34, 1), C.brim, { jit: 0.06, seed: 31 })]), 0.035);
  pom.position.copy(pts.at(-1)).add(new V3(0, -0.28, 0)); tip.add(pom);

  // --- reels
  const planes = (x0, x1) => [new G.Plane(new V3(0, -1, 0), winY + winH / 2), new G.Plane(new V3(0, 1, 0), -(winY - winH / 2)), new G.Plane(new V3(1, 0, 0), -x0), new G.Plane(new V3(-1, 0, 0), x1)];
  const reels = REELS.map((strip, i) => {
    const x = (i - 1) * (K.reelW + gap);
    const sharp = reelTexture(strip, false), blurred = reelTexture(strip, true);
    const mat = new G.MeshBasicMaterial({ map: sharp, clippingPlanes: planes(x - K.reelW / 2, x + K.reelW / 2) });
    const drum = new G.Mesh(drumGeo(radius, K.reelW), mat);
    drum.position.set(x, winY, front - 0.12 - radius); scene.add(drum);
    const start = Math.floor(Math.random() * STRIP_LEN);
    return { drum, mat, sharp, blurred, angle: -start * STEP, stop: start, phase: 'idle', v: 0, t: 0 };
  });
  // shading over the reels: darker toward the top and bottom rows, plus a glass sheen
  const shadeCv = document.createElement('canvas'); shadeCv.width = 8; shadeCv.height = 64;
  { const x = shadeCv.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(12,15,26,.78)'); g.addColorStop(0.3, 'rgba(12,15,26,.12)'); g.addColorStop(0.5, 'rgba(12,15,26,0)'); g.addColorStop(0.7, 'rgba(12,15,26,.12)'); g.addColorStop(1, 'rgba(12,15,26,.78)');
    x.fillStyle = g; x.fillRect(0, 0, 8, 64); }
  const shade = new G.Mesh(new G.PlaneGeometry(winW, winH), new G.MeshBasicMaterial({ map: new G.CanvasTexture(shadeCv), transparent: true, depthWrite: false }));
  shade.position.set(0, winY, front - 0.05); scene.add(shade);
  const line = new G.Mesh(new G.PlaneGeometry(winW, 0.025), new G.MeshBasicMaterial({ color: C.hat, transparent: true, opacity: 0.55 }));
  line.position.set(0, winY, front - 0.04); scene.add(line);

  // --- marquee bulbs around the frame (one instanced mesh; colors animate)
  const bulbPos = [], n = K.bulbs, bw = winW / 2 + frame + 0.06, bh = winH / 2 + frame + 0.06;
  for (let i = 0; i < n; i++) { // walk the frame's perimeter
    const per = 4 * (bw + bh), d = (i / n) * per;
    let x, y; if (d < 2 * bw) { x = -bw + d; y = bh; } else if (d < 2 * bw + 2 * bh) { x = bw; y = bh - (d - 2 * bw); } else if (d < 4 * bw + 2 * bh) { x = bw - (d - 2 * bw - 2 * bh); y = -bh; } else { x = -bw; y = -bh + (d - 4 * bw - 2 * bh); }
    bulbPos.push(new V3(x, winY + y, front + 0.1));
  }
  const bulbs = new G.InstancedMesh(new G.IcosahedronGeometry(0.065, 0), new G.MeshBasicMaterial({ color: 0xffffff }), n);
  bulbPos.forEach((p, i) => { bulbs.setMatrixAt(i, new G.Matrix4().setPosition(p)); bulbs.setColorAt(i, new G.Color(C.lantern)); });
  scene.add(bulbs);
  const halo = glow(C.lantern, winW * 1.1, 0.12); halo.position.set(0, winY, front + 0.2); scene.add(halo);

  const burst = new Burst(160); scene.add(burst.mesh);

  // --- camera framing
  // Both machines share the Big Hat's framing, so the Mini Hat really looks smaller.
  const FB = KINDS.big, topB = 0.75 + FB.body, xMin = -(FB.rBase + 0.5), xMax = leanOf(FB) + 0.5, yMin = 0, yMax = topB + 1.05;
  const cx = (xMin + xMax) / 2, lookY = (yMin + yMax) / 2, spanW = xMax - xMin, spanH = yMax - yMin;
  function resize() {
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 360;
    renderer.setSize(w, h, false); cam.aspect = w / h;
    const tan = Math.tan((cam.fov * Math.PI) / 360), dist = Math.max(spanH / 2 / tan, spanW / 2 / tan / cam.aspect) * 1.06 + FB.rBase;
    cam.position.set(cx, lookY + 0.5, dist); cam.lookAt(cx, lookY, 0); cam.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas); resize();

  // --- animation
  let fx = { kind: null, t: 0 }, pullT = -1, raf = 0, active = false, last = performance.now(), clock = 0, onDone = null;
  const col = new G.Color(), gold = new G.Color(C.gold), lamp = new G.Color(C.lantern), red = new G.Color(C.hat), cream = new G.Color(C.brim);
  const easeOutBack = (t) => { const c1 = 1.25, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  function spin(stops, result = {}) {
    return new Promise((resolve) => {
      onDone = () => resolve(); fx = { kind: null, t: 0 }; pullT = 0;
      reels.forEach((r, i) => { r.phase = 'wind'; r.t = -0.12 * i; r.stop = stops[i]; r.stopAt = 1.1 + i * 0.45; });
      reels.result = result; wake();
    });
  }
  function tick(dt) {
    clock += dt;
    // lever pull: tip swings down and back
    if (pullT >= 0) { pullT += dt; const k = pullT < 0.18 ? pullT / 0.18 : Math.max(0, 1 - (pullT - 0.18) / 0.5); tip.rotation.z = -0.32 * k; pom.scale.setScalar(1 - 0.12 * k); if (pullT > 0.7) { pullT = -1; tip.rotation.z = 0; pom.scale.setScalar(1); } }
    let spinning = false;
    for (const r of reels) {
      if (r.phase === 'idle') continue;
      spinning = true; r.t += dt;
      if (r.phase === 'wind') { if (r.t > 0) { r.phase = 'run'; } else { r.angle -= dt * 0.8; } }
      else if (r.phase === 'run') {
        r.v = Math.min(22, r.v + dt * 70); r.angle += r.v * dt;
        if (r.t >= r.stopAt) { // plan the landing: at least one more lap, finishing on the chosen face
          const target = -r.stop * STEP, twoPi = Math.PI * 2;
          let rem = ((target - r.angle) % twoPi + twoPi) % twoPi; rem += twoPi;
          r.phase = 'land'; r.from = r.angle; r.rem = rem; r.lt = 0; r.dur = rem / (r.v * 0.62);
        }
      } else if (r.phase === 'land') {
        r.lt += dt; const k = Math.min(1, r.lt / r.dur); r.angle = r.from + r.rem * easeOutBack(k);
        if (k >= 1) { r.phase = 'idle'; r.v = 0; r.angle = -r.stop * STEP; burst.spawn(new V3(r.drum.position.x, winY - winH / 2, front + 0.2), 6, C.snow, 1.2, 1.2); }
      }
      const fast = r.phase === 'run' && r.v > 9;
      if (r.mat.map !== (fast ? r.blurred : r.sharp)) { r.mat.map = fast ? r.blurred : r.sharp; r.mat.needsUpdate = true; }
      r.drum.rotation.x = r.angle;
    }
    if (!spinning && onDone) {
      const res = reels.result || {}; fx = { kind: res.jackpot ? 'jackpot' : res.win ? 'win' : null, t: 0 };
      if (fx.kind) { const c = fx.kind === 'jackpot' ? C.gold : C.lantern; burst.spawn(new V3(0, winY + winH / 2, front + 0.3), fx.kind === 'jackpot' ? 120 : 36, c, fx.kind === 'jackpot' ? 3.2 : 2, fx.kind === 'jackpot' ? 5 : 3); }
      const d = onDone; onDone = null; d();
    }
    // bulbs: slow chase at rest, fast chase while spinning, flashing gold/red on a win
    if (fx.kind) fx.t += dt;
    const win = fx.kind && fx.t < (fx.kind === 'jackpot' ? 4 : 1.6);
    for (let i = 0; i < n; i++) {
      if (win) col.copy(Math.floor(fx.t * 10 + i) % 2 ? gold : fx.kind === 'jackpot' ? red : cream);
      else { const speed = spinning ? 14 : 3, on = (Math.floor(clock * speed) + i) % 3 === 0; col.copy(on ? lamp : col.setRGB(0.35, 0.22, 0.1)); }
      bulbs.setColorAt(i, col);
    }
    bulbs.instanceColor.needsUpdate = true;
    halo.material.opacity = win ? 0.28 + 0.1 * Math.sin(fx.t * 20) : 0.1;
    if (fx.kind === 'jackpot' && fx.t < 1.2) { const s = (1.2 - fx.t) * 0.06; cam.position.x = cx + (Math.random() - 0.5) * s; } else cam.position.x = cx;
    burst.update(dt);
    return spinning || pullT >= 0 || win || burst.items.length > 0;
  }
  // Renders continuously while busy; at rest it drops to ~12 fps for the bulb chase.
  function loop(now) {
    raf = 0; if (!active) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const busy = tick(dt); renderer.render(scene, cam);
    if (busy) raf = requestAnimationFrame(loop); else setTimeout(() => { if (active && !raf) raf = requestAnimationFrame(loop); }, 80);
  }
  function wake() { if (active && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  reels.forEach((r) => { r.drum.rotation.x = r.angle; });

  return {
    spin,
    setActive(on) { active = on; if (on) { resize(); wake(); } },
    shown: () => reels.map((r) => r.stop), // strip index on the payline, per reel
    debug: { reels, scene, cam, renderer },
  };
}
