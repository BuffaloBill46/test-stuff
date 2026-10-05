// Santa Hat Slots: the Big Hat machine in 3D. The cabinet IS a Santa hat: red faceted cone body, white fur brim for a
// base, and the drooping tip ends in the pom-pom, which is the pull lever. A 5×5 window of flat square reels sits on
// its front; the ten symbols are low-poly models from the same kit as the plaza.
import { THREE, C, part, build, toon, lights, glow, hatGeo, pineGeo, snowmanGeo, reindeerGeo, giftGeo, Burst } from './kit.js?v=1bfe9c1383';
import { SYMBOLS, SYM, MACHINES } from './slots.js?v=1bfe9c1383';
import { play as sfx } from './sfx.js?v=1bfe9c1383';

const G = THREE, V3 = THREE.Vector3;
const CELL = 128;

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

// Square reel tiles: one texture per symbol, plus a motion-blurred copy for fast spinning.
let tileTex = null;
function tiles() {
  if (tileTex) return tileTex;
  const imgs = symbolImages(), mk = (cv) => { const t = new G.CanvasTexture(cv); t.colorSpace = G.SRGBColorSpace; t.anisotropy = 4; return t; };
  tileTex = { sharp: [], blur: [] };
  SYMBOLS.forEach((s, i) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = CELL; const x = cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, CELL); g.addColorStop(0, '#efe8d8'); g.addColorStop(0.5, '#fbf8f1'); g.addColorStop(1, '#eae2d0');
    x.fillStyle = g; x.fillRect(0, 0, CELL, CELL); x.fillStyle = '#cdbfa2'; x.fillRect(0, 0, CELL, 2); x.fillRect(0, CELL - 2, CELL, 2);
    x.drawImage(imgs[s.id], 7, 7, CELL - 14, CELL - 14);
    const b = document.createElement('canvas'); b.width = b.height = CELL; const bx = b.getContext('2d');
    for (let k = -5; k <= 5; k++) { bx.globalAlpha = 0.2; bx.drawImage(cv, 0, k * 5); } // vertical smear
    tileTex.sharp[i] = mk(cv); tileTex.blur[i] = mk(b);
  });
  return tileTex;
}

const LINE_COLORS = ['#ffbe5c', '#7fe0a0', '#ff7a6e', '#b9cdf2', '#f5f1e8', '#ffd95c', '#8fe3ff', '#ff9ad5', '#c5ff7a', '#ffb07a', '#a7a2ff', '#7affd9', '#ffe07a', '#ff8f8f', '#9ad0ff'];

// The Big Hat: a 5×5 slot machine built as a giant Santa hat. Flat square reels scroll inside a window on its front;
// each reel reuses 6 tiles that change symbol as they scroll past, so any strip length works.
export function createMachine(canvas) {
  const M = MACHINES.big, R = M.reels, ROWS = M.rows, L = M.stripLen;
  const renderer = new G.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.localClippingEnabled = true;
  const scene = new G.Scene(); lights(scene, { hemi: 1.6, moonI: 1.5 });
  const warm = new G.DirectionalLight(0xffc98a, 0.9); warm.position.set(6, 3, 8); scene.add(warm);
  const cam = new G.PerspectiveCamera(30, 1, 0.1, 100);

  // --- cabinet: fur brim base, red cone body, reel window box with a gold frame
  const K = { body: 6.2, rBase: 3.25, rTop: 0.75 };
  const c = 0.74, gap = 0.06, winW = R * c + (R + 1) * gap, winH = ROWS * c;
  const winY = 0.75 + K.body * 0.40, coneAt = (y) => K.rBase + (K.rTop - K.rBase) * ((y - 0.75) / K.body);
  const front = coneAt(winY - winH / 2) + 0.38, frame = 0.18, depth = 1.0;
  const ps = [
    part(new G.CylinderGeometry(K.rBase + 0.1, K.rBase + 0.25, 0.42, 10), C.woodDark, { pos: [0, 0.21, 0], jit: 0.03 }),
    part(new G.TorusGeometry(K.rBase * 0.98, 0.5, 5, 12), C.brim, { pos: [0, 0.66, 0], rot: [Math.PI / 2, 0, 0], jit: 0.08, seed: 3 }),
    part(new G.CylinderGeometry(K.rTop, K.rBase, K.body, 10, 4), C.hat, { pos: [0, 0.75 + K.body / 2, 0], jit: 0.08, seed: 5 }),
    part(new G.BoxGeometry(winW + 0.1, winH + 0.1, 0.1), C.ink, { pos: [0, winY, front - depth] }),
    part(new G.BoxGeometry(frame, winH + frame * 2, depth), C.hatDark, { pos: [-(winW / 2 + frame / 2), winY, front - depth / 2] }),
    part(new G.BoxGeometry(frame, winH + frame * 2, depth), C.hatDark, { pos: [winW / 2 + frame / 2, winY, front - depth / 2] }),
    part(new G.BoxGeometry(winW + frame * 2, frame, depth), C.hatDark, { pos: [0, winY + winH / 2 + frame / 2, front - depth / 2] }),
    part(new G.BoxGeometry(winW + frame * 2, frame, depth), C.hatDark, { pos: [0, winY - winH / 2 - frame / 2, front - depth / 2] }),
    part(new G.BoxGeometry(winW + frame * 2 + 0.14, 0.13, 0.15), C.gold, { pos: [0, winY + winH / 2 + frame, front + 0.02] }),
    part(new G.BoxGeometry(winW + frame * 2 + 0.14, 0.13, 0.15), C.gold, { pos: [0, winY - winH / 2 - frame, front + 0.02] }),
    part(new G.BoxGeometry(0.13, winH + frame * 2 + 0.14, 0.15), C.gold, { pos: [-(winW / 2 + frame), winY, front + 0.02] }),
    part(new G.BoxGeometry(0.13, winH + frame * 2 + 0.14, 0.15), C.gold, { pos: [winW / 2 + frame, winY, front + 0.02] }),
  ];
  const starY = winY + winH / 2 + frame + 0.5;
  ps.push(part(starGeo(0.45, 0.19, 0.16), C.gold, { pos: [0, starY, coneAt(starY) + 0.22] })); // star ornament (no hatband)
  const cabinet = toon(build(ps), 0.035); scene.add(cabinet);

  // --- drooping tip + pom-pom lever, pivoting at the top of the cone
  const topY = 0.75 + K.body, tip = new G.Group(); tip.position.set(0, topY, 0); scene.add(tip);
  const lean = K.rTop + (K.rBase - K.rTop) * 0.45 + 0.6;
  const pts = [new V3(0, -0.05, 0), new V3(0.3, 0.6, 0), new V3(0.95, 0.85, 0), new V3(lean - 0.1, 0.45, 0.05), new V3(lean + 0.05, -0.4, 0.1), new V3(lean, -1.2, 0.12)];
  tip.add(toon(build(droopParts(pts, K.rTop, 0.09, C.hat, 21)), 0.03));
  const pom = toon(build([part(new G.IcosahedronGeometry(0.38, 1), C.brim, { jit: 0.06, seed: 31 })]), 0.035);
  pom.position.copy(pts.at(-1)).add(new V3(0, -0.3, 0)); tip.add(pom);

  // --- reels: flat columns of square tiles, clipped to the window
  const T = tiles(), clip = [new G.Plane(new V3(0, -1, 0), winY + winH / 2), new G.Plane(new V3(0, 1, 0), -(winY - winH / 2))];
  const mats = { sharp: T.sharp.map((t) => new G.MeshBasicMaterial({ map: t, clippingPlanes: clip })), blur: T.blur.map((t) => new G.MeshBasicMaterial({ map: t, clippingPlanes: clip })) };
  const cellGeo = new G.PlaneGeometry(c, c), topRowY = winY + winH / 2 - c / 2, mod = (i) => ((i % L) + L) % L;
  const back = new G.Mesh(new G.PlaneGeometry(winW, winH), new G.MeshBasicMaterial({ color: 0x2a2f45 })); back.position.set(0, winY, front - 0.14); scene.add(back);
  const reels = M.strips.map((strip, r) => {
    const x = -winW / 2 + gap + c / 2 + r * (c + gap), start = Math.floor(Math.random() * L);
    const cells = Array.from({ length: ROWS + 1 }, () => { const m = new G.Mesh(cellGeo, mats.sharp[0]); m.position.set(x, 0, front - 0.12); scene.add(m); return m; });
    return { r, x, strip, cells, p: start, stop: start, phase: 'idle', v: 0, t: 0, override: null };
  });
  const symAt = (reel, i) => (reel.override && reel.override.has(mod(i)) ? reel.override.get(mod(i)) : reel.strip[mod(i)]);
  function place(reel) { // row k shows strip index floor(p)+k; p going DOWN scrolls the symbols down
    const base = Math.floor(reel.p), frac = reel.p - base, fast = reel.phase === 'run' && reel.v > 9;
    reel.cells.forEach((m, k) => { m.position.y = topRowY - (k - frac) * c; m.material = (fast ? mats.blur : mats.sharp)[symAt(reel, base + k)]; });
  }
  reels.forEach(place);

  // --- win overlay: paylines, winning squares, hat bonus (a canvas drawn over the window)
  const OW = 640, OH = Math.round((OW * winH) / winW), ocv = document.createElement('canvas'); ocv.width = OW; ocv.height = OH;
  const octx = ocv.getContext('2d'), otex = new G.CanvasTexture(ocv); otex.colorSpace = G.SRGBColorSpace;
  const overlay = new G.Mesh(new G.PlaneGeometry(winW, winH), new G.MeshBasicMaterial({ map: otex, transparent: true, depthWrite: false }));
  overlay.position.set(0, winY, front - 0.03); scene.add(overlay);
  const cx = (r) => ((gap + c / 2 + r * (c + gap)) / winW) * OW, cy = (row) => ((row * c + c / 2) / winH) * OH, cw = (c / winW) * OW;
  function drawOverlay(info) {
    // Reset the canvas instead of clearRect: in testing, a clearRect right after the canvas was uploaded as a texture
    // was sometimes lost, leaving the last win's lines floating over the next spin.
    ocv.width = OW; octx.lineJoin = 'round';
    overlay.visible = !!info;
    if (info) {
      const lit = new Set();
      (info.wins || []).forEach((w) => { for (let r = 0; r < w.count; r++) lit.add(r + ',' + M.lines[w.line][r]); });
      if (info.jackpot) for (let r = 0; r < R; r++) for (let row = 0; row < ROWS; row++) lit.add(r + ',' + row);
      if (lit.size) { // dim everything that didn't win
        octx.fillStyle = 'rgba(12,15,26,.45)';
        for (let r = 0; r < R; r++) for (let row = 0; row < ROWS; row++) if (!lit.has(r + ',' + row)) octx.fillRect(cx(r) - cw / 2, cy(row) - cw / 2, cw, cw);
      }
      (info.wins || []).forEach((w, i) => { // the line itself, through the whole row path, plus frames on its winning squares
        const col = LINE_COLORS[w.line % LINE_COLORS.length], rows = M.lines[w.line];
        octx.strokeStyle = 'rgba(12,15,26,.85)'; octx.lineWidth = 11; octx.lineJoin = 'round'; octx.beginPath();
        rows.forEach((row, r) => (r ? octx.lineTo(cx(r), cy(row)) : octx.moveTo(cx(r) - cw / 2, cy(row)))); octx.lineTo(cx(rows.length - 1) + cw / 2, cy(rows[rows.length - 1])); octx.stroke(); // short diagonals end at the grid edge
        octx.strokeStyle = col; octx.lineWidth = 6; octx.stroke();
        octx.lineWidth = 5; for (let r = 0; r < w.count; r++) octx.strokeRect(cx(r) - cw / 2 + 4, cy(rows[r]) - cw / 2 + 4, cw - 8, cw - 8);
      });
      if (info.grid && !info.jackpot && M.hatBonus) { // every Santa Hat pays the hat bonus
        octx.font = `700 ${Math.round(cw * 0.26)}px Silkscreen, monospace`; octx.textAlign = 'right'; octx.textBaseline = 'bottom';
        info.grid.forEach((col, r) => col.forEach((s, row) => { if (s !== SYM.hat) return;
          const x = cx(r) + cw / 2 - 5, y = cy(row) + cw / 2 - 4, t = '+' + Math.round(M.hatBonus * M.bet * 100) + '¢';
          octx.lineWidth = 5; octx.strokeStyle = '#0c0f1a'; octx.strokeText(t, x, y); octx.fillStyle = '#ffbe5c'; octx.fillText(t, x, y); }));
      }
      if (info.jackpot) { octx.strokeStyle = '#ffd95c'; octx.lineWidth = 10; octx.strokeRect(5, 5, OW - 10, OH - 10); }
    }
    otex.needsUpdate = true;
  }

  // --- marquee bulbs around the frame, and effects
  const n = 26, bw = winW / 2 + frame + 0.07, bh = winH / 2 + frame + 0.07, bulbPos = [];
  for (let i = 0; i < n; i++) {
    const per = 4 * (bw + bh), d = (i / n) * per; let x, y;
    if (d < 2 * bw) { x = -bw + d; y = bh; } else if (d < 2 * bw + 2 * bh) { x = bw; y = bh - (d - 2 * bw); } else if (d < 4 * bw + 2 * bh) { x = bw - (d - 2 * bw - 2 * bh); y = -bh; } else { x = -bw; y = -bh + (d - 4 * bw - 2 * bh); }
    bulbPos.push(new V3(x, winY + y, front + 0.11));
  }
  const bulbs = new G.InstancedMesh(new G.IcosahedronGeometry(0.07, 0), new G.MeshBasicMaterial({ color: 0xffffff }), n);
  bulbPos.forEach((p, i) => { bulbs.setMatrixAt(i, new G.Matrix4().setPosition(p)); bulbs.setColorAt(i, new G.Color(C.lantern)); });
  scene.add(bulbs);
  const halo = glow(C.lantern, winW * 1.15, 0.1); halo.position.set(0, winY, front + 0.2); scene.add(halo);
  const burst = new Burst(220); scene.add(burst.mesh);

  // --- camera: the reels fill most of the screen, with a little of the hat around them (Cody, 2026-10-01: "make the slot game
  // bigger its hard to see"; it used to fit the whole hat, which left the 5×5 grid about half the canvas wide)
  const AROUND = 1.4; // how much shows around the reel window (1 = the reels only)
  const ctr = new V3(0, winY, front);
  function resize() {
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300;
    renderer.setSize(w, h, false); cam.aspect = w / h;
    const tan = Math.tan((cam.fov * Math.PI) / 360), dist = Math.max((winH * AROUND) / 2 / tan, (winW * AROUND) / 2 / tan / cam.aspect);
    cam.position.set(ctr.x, ctr.y + 0.2, front + dist); cam.lookAt(ctr.x, ctr.y, front); cam.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas); resize();

  // --- animation
  let fx = { kind: null, t: 0 }, pullT = -1, raf = 0, active = false, last = performance.now(), clock = 0, onDone = null, info = null, anticipating = false;
  const col = new G.Color(), gold = new G.Color(C.gold), lamp = new G.Color(C.lantern), red = new G.Color(C.hat), cream = new G.Color(C.brim), dimc = new G.Color(0.35, 0.22, 0.1);
  const easeOutBack = (t) => { const c1 = 1.1, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  // stops: strip index shown in the TOP row of each reel (null for the pool jackpot: every square shows a Santa Hat).
  function spin(stops, result) {
    return new Promise((resolve) => {
      info = result; onDone = resolve; fx = { kind: null, t: 0 }; pullT = 0; anticipating = false; drawOverlay(null);
      reels.forEach((r, i) => {
        r.override = null;
        r.stop = stops ? stops[i] : Math.floor(Math.random() * L);
        if (!stops) { r.override = new Map(); for (let k = 0; k < ROWS; k++) r.override.set(mod(r.stop + k), SYM.hat); }
        r.phase = 'wind'; r.t = -0.08 * i; r.v = 0; r.stopAt = 0.85 + i * 0.32; r.slam = false;
      });
      wake();
    });
  }
  function slam() { // tap during a spin: land everything now (same result, just faster)
    reels.forEach((r) => { if (r.phase === 'wind' || r.phase === 'run') { r.phase = 'run'; r.v = Math.max(r.v, 12); r.stopAt = r.t; r.slam = true; } });
  }
  // Honest anticipation: once 3+ reels have landed, if a payline shows Santa Hats on every landed reel, the rest slow down.
  function checkAnticipation(landed) {
    if (anticipating || landed < 3 || landed >= R || !info || !info.grid) return;
    const hatsSoFar = M.lines.some((rows) => rows.length > landed && rows.slice(0, landed).every((row, r) => info.grid[r][row] === SYM.hat)); // only lines that can still grow
    if (hatsSoFar) { anticipating = true; reels.forEach((r, i) => { if (i >= landed && !r.slam) r.stopAt += 0.9 + (i - landed) * 0.35; }); }
  }
  function tick(dt) {
    clock += dt;
    if (pullT >= 0) { pullT += dt; const k = pullT < 0.18 ? pullT / 0.18 : Math.max(0, 1 - (pullT - 0.18) / 0.5); tip.rotation.z = -0.3 * k; pom.scale.setScalar(1 - 0.12 * k); if (pullT > 0.7) { pullT = -1; tip.rotation.z = 0; pom.scale.setScalar(1); } }
    let spinning = false, landed = 0;
    for (const r of reels) {
      if (r.phase === 'idle') { landed++; continue; }
      spinning = true; r.t += dt;
      if (r.phase === 'wind') { if (r.t > 0) r.phase = 'run'; else r.p += dt * 1.2; }
      else if (r.phase === 'run') {
        r.v = Math.min(anticipating && r.stopAt - r.t > 0.4 ? 10 : 24, r.v + dt * 80); r.p -= r.v * dt;
        if (r.t >= r.stopAt) { // plan the landing on the chosen stop, at least a few squares further down
          const minRun = r.slam ? 2 : 5, n2 = Math.floor((r.p - minRun - r.stop) / L);
          r.target = r.stop + L * n2; r.from = r.p; r.lt = 0; r.dur = Math.min(0.7, Math.max(0.16, (r.from - r.target) / (r.v * 0.55)));
          r.phase = 'land';
        }
      } else if (r.phase === 'land') {
        r.lt += dt; const k = Math.min(1, r.lt / r.dur); r.p = r.from + (r.target - r.from) * easeOutBack(k);
        if (k >= 1) { r.phase = 'idle'; r.v = 0; r.p = r.stop; sfx('reelStop'); burst.spawn(new V3(r.x, winY - winH / 2, front + 0.2), 4, C.snow, 1, 1); }
      }
      place(r);
    }
    if (spinning) checkAnticipation(landed);
    if (!spinning && onDone) {
      drawOverlay(info);
      const kind = info.jackpot ? 'jackpot' : info.pay >= 10 * M.bet ? 'big' : info.pay > M.bet ? 'win' : null;
      fx = { kind, t: 0 };
      if (kind) burst.spawn(new V3(0, winY + winH / 2, front + 0.3), kind === 'win' ? 30 : 120, kind === 'win' ? C.lantern : C.gold, kind === 'win' ? 2 : 3.4, kind === 'win' ? 3 : 5);
      const d = onDone; onDone = null; d();
    }
    if (fx.kind) fx.t += dt;
    const celebrate = fx.kind && fx.t < ({ win: 1.6, big: 3, jackpot: 5 })[fx.kind];
    for (let i = 0; i < n; i++) {
      if (celebrate) col.copy(Math.floor(fx.t * 10 + i) % 2 ? gold : fx.kind === 'win' ? cream : red);
      else { const speed = anticipating ? 22 : spinning ? 14 : 3, on = (Math.floor(clock * speed) + i) % 3 === 0; col.copy(on ? lamp : dimc); }
      bulbs.setColorAt(i, col);
    }
    bulbs.instanceColor.needsUpdate = true;
    halo.material.opacity = celebrate ? 0.26 + 0.1 * Math.sin(fx.t * 20) : anticipating ? 0.2 + 0.08 * Math.sin(clock * 16) : 0.08;
    if ((fx.kind === 'jackpot' || fx.kind === 'big') && fx.t < 1.2) cam.position.x = ctr.x + (Math.random() - 0.5) * (1.2 - fx.t) * 0.06; else cam.position.x = ctr.x;
    burst.update(dt);
    return spinning || pullT >= 0 || celebrate || burst.items.length > 0;
  }
  function loop(now) {
    raf = 0; if (!active) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const busy = tick(dt); renderer.render(scene, cam);
    if (busy) raf = requestAnimationFrame(loop); else setTimeout(() => { if (active && !raf) raf = requestAnimationFrame(loop); }, 80);
  }
  function wake() { if (active && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }

  return {
    spin, slam,
    setActive(on) { active = on; if (on) { resize(); wake(); } },
    spinning: () => reels.some((r) => r.phase !== 'idle'),
    shown: () => reels.map((r) => Array.from({ length: ROWS }, (_, k) => symAt(r, Math.round(r.p) + k))), // what each reel shows, top to bottom
    debug: { reels, scene, cam, renderer, overlay: ocv, overlayMesh: overlay },
  };
}
