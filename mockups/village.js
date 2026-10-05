// Side-scrolling night village shared by Sleigh Night and Hat Chase.
// The camera stays put; the world scrolls left past the sleigh.
import { THREE, C, part, build, toon, toonInstanced, setInstance, cottage, pineGeo, character, reindeerGeo, glow, glowMat,
  skyTexture, stars, aurora, lights, rng } from './kit.js?v=5cf703f1ce';

const G = THREE, V3 = THREE.Vector3;
const HOUSE_SCALE = 1.25;

function mountainGeo(seed) {
  const r = rng(seed), ps = [];
  for (let i = 0; i < 3; i++) {
    const h = 10 + r() * 10, w = 11 + r() * 7, x = (i - 1) * 13 + r() * 4;
    ps.push(part(new G.ConeGeometry(w, h, 5), i % 2 ? 0x3b4570 : 0x323b63, { pos: [x, h / 2, 0], rot: [0, r() * 3, 0], jit: 1.2, seed: seed + i }));
    ps.push(part(new G.ConeGeometry(w * 0.34, h * 0.34, 5), 0xc9d4ea, { pos: [x, h * 0.83, 0], rot: [0, r() * 3, 0], jit: 0.4, seed: seed + i + 9 }));
  }
  return build(ps);
}

export function buildNight(scene) {
  scene.background = skyTexture('#080c1f', '#19214a', '#3b3e6e');
  scene.fog = new THREE.Fog(0x252d57, 45, 150);
  lights(scene, { hemi: 1.45, moonI: 1.4 });
  scene.add(stars(800, 220, 5));
  const au = aurora(300, 46); au.position.set(0, 46, -130); scene.add(au);
  const moon = glow(0xe3ebff, 34, 0.55); moon.position.set(38, 48, -140); scene.add(moon);
  const disc = new THREE.Mesh(new G.IcosahedronGeometry(5, 1), glowMat(0xf3f6ff)); disc.position.copy(moon.position); scene.add(disc);

  scene.add(toon(build([part(new G.PlaneGeometry(420, 90, 70, 10).rotateX(-Math.PI / 2), C.snow, { pos: [0, 0, -25], jit: 0.3 })]), 0));

  // parallax layers: [objects, speed factor, span]
  const layers = [];
  const mts = [];
  for (let i = 0; i < 7; i++) { const m = toon(mountainGeo(i * 7 + 1), 0.08); m.position.set(-150 + i * 50, -1, -95); scene.add(m); mts.push(m); }
  layers.push({ items: mts, f: 0.08, span: 350 });

  const n = 34, trees = toonInstanced(pineGeo(4), n, 0.05), tr = rng(8), tpos = [];
  for (let i = 0; i < n; i++) tpos.push({ x: -90 + i * (180 / n) + tr() * 3, z: -16 - tr() * 10, s: 1.2 + tr() * 1.1, ry: tr() * 6 });
  scene.add(trees);

  // foreground: snowbanks, fence posts and small pines rushing past closer to the camera
  const bankGeo = build([part(new G.IcosahedronGeometry(1, 1), C.snow, { scale: [2.2, 0.55, 1.2], jit: 0.12 })]);
  const postGeo = build([part(new G.BoxGeometry(0.18, 1.1, 0.18), C.woodDark, { pos: [0, 0.55, 0], jit: 0.02 }), part(new G.BoxGeometry(0.26, 0.14, 0.26), C.snow, { pos: [0, 1.14, 0] }),
    part(new G.BoxGeometry(2.1, 0.12, 0.08), C.wood, { pos: [1.05, 0.75, 0] }), part(new G.BoxGeometry(2.1, 0.12, 0.08), C.wood, { pos: [1.05, 0.35, 0] })]);
  const fg = [[bankGeo, 16, 0.03], [postGeo, 26, 0.02], [pineGeo(31), 7, 0.04]].map(([geo, count, ol]) => {
    const im = toonInstanced(geo, count, ol); scene.add(im);
    const fr = rng(count * 3);
    const span = 110, items = Array.from({ length: count }, (_, i) => ({ x: -55 + (i / count) * span + fr() * 2, z: geo === postGeo ? 7 : 7.5 + fr() * 3, s: geo === postGeo ? 1 : 0.6 + fr() * 0.5, ry: geo === postGeo ? 0 : fr() * 6 }));
    return { im, items, span };
  });

  return {
    tick(dt, t, speed) {
      au.userData.tick(t);
      for (const L of layers) for (const m of L.items) { m.position.x -= speed * L.f * dt; if (m.position.x < -L.span / 2) m.position.x += L.span; }
      for (let i = 0; i < n; i++) {
        const p = tpos[i]; p.x -= speed * 0.55 * dt; if (p.x < -90) p.x += 180;
        setInstance(trees, i, new V3(p.x, 0, p.z), p.ry, p.s);
      }
      trees.instanceMatrix.needsUpdate = true;
      for (const L of fg) {
        L.items.forEach((p, i) => { p.x -= speed * 1.25 * dt; if (p.x < -L.span / 2) p.x += L.span; setInstance(L.im, i, new V3(p.x, 0, p.z), p.ry, p.s); });
        L.im.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

// The street at z=0: houses with chimneys, tall pines, and (optionally) snow clouds.
export class Street {
  constructor(scene, o = {}) {
    this.scene = scene; this.o = o; this.items = []; this.next = o.startX ?? 6; this.r = rng(o.seed ?? 5);
    this.houses = [0, 1, 2, 3].map((i) => cottage(i + 11, { w: 3 + (i % 3) * 0.7, h: 1.9 + (i % 2) * 0.5 }));
    this.naughtyHouse = cottage(77, { w: 3.4, h: 2.1, wall: 0x6a6682 });
    this.pine = pineGeo(13);
    this.cloudGeo = build([0, 1, 2, 3].map((i) => part(new G.IcosahedronGeometry(1 - i * 0.12, 0), i % 2 ? 0x56608a : 0x4a5379, { pos: [(i - 1.5) * 0.9, (i % 2) * 0.35, 0], jit: 0.12, seed: i })));
    this.litMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.darkMat = new THREE.MeshBasicMaterial({ color: 0x252a40 });
    this.coalGeo = build([part(new G.IcosahedronGeometry(0.3, 0), C.coal, { jit: 0.05 })]);
  }

  spawnHouse(x) {
    const naughty = this.r() < (this.o.naughty ?? 0);
    const c = naughty ? this.naughtyHouse : this.houses[Math.floor(this.r() * this.houses.length)];
    const g = new G.Group(); g.add(toon(c.body, 0.035));
    const win = new THREE.Mesh(c.windows, this.o.lit ? this.litMat : this.darkMat); g.add(win);
    c.body.computeBoundingBox(); const bb = c.body.boundingBox;
    const top = new V3(c.chimney.x, c.chimney.y, c.chimney.z);
    if (naughty) { const coal = toon(this.coalGeo, 0.02); coal.position.copy(top).add(new V3(0, 0.15, 0)); g.add(coal); }
    const glowS = glow(C.lantern, 6, 0); glowS.position.set(0, 1.6, 2.2); g.add(glowS);
    if (this.o.lit) glowS.material.opacity = 0.25;
    g.scale.setScalar(HOUSE_SCALE); g.position.set(x, 0, 0); this.scene.add(g);
    const halfW = ((bb.max.x - bb.min.x) / 2) * HOUSE_SCALE;
    this.items.push({ kind: 'house', g, x, naughty, win, glowS, delivered: false, halfW, ridge: c.ridge * HOUSE_SCALE, chimX: top.x * HOUSE_SCALE, chimY: top.y * HOUSE_SCALE });
    return halfW * 2;
  }

  spawnTree(x, s) {
    const g = toon(this.pine, 0.05); g.scale.setScalar(s); g.position.set(x, 0, 0.4); this.scene.add(g);
    this.items.push({ kind: 'tree', g, x, height: 3.75 * s, base: 1.35 * s });
    return 1.8 * s;
  }

  spawnCloud(x, y) {
    const g = toon(this.cloudGeo, 0.05); g.scale.setScalar(1.4); g.position.set(x, y, 0); this.scene.add(g);
    this.items.push({ kind: 'cloud', g, x, y, r: 1.7, bob: this.r() * 6 });
  }

  update(dt, speed, t = 0) {
    for (const it of this.items) {
      it.x -= speed * dt; it.g.position.x = it.x;
      if (it.kind === 'cloud') it.g.position.y = it.y + Math.sin(t * 1.3 + it.bob) * 0.4;
    }
    this.items = this.items.filter((it) => { if (it.x < -45) { this.scene.remove(it.g); return false; } return true; });
    this.next -= speed * dt;
    while (this.next < 48) {
      const roll = this.r();
      let w;
      if (roll < (this.o.tree ?? 0.25)) w = this.spawnTree(this.next + 1, 2.2 + this.r() * 1.3);
      else w = this.spawnHouse(this.next + 2);
      if (this.o.clouds && this.r() < 0.45) this.spawnCloud(this.next + this.r() * 6, 8 + this.r() * 6);
      this.next += w + 2.5 + this.r() * 4;
    }
  }

  light(h) {
    h.delivered = true; h.win.material = this.litMat; h.glowS.material.opacity = 0.35;
  }
}

// Sleigh + Santa + two reindeer, facing +x. `santa` exposes a head anchor for hats.
export function sleigh() {
  const g = new G.Group();
  const ps = [
    part(new G.BoxGeometry(2.3, 0.7, 1.2), C.hat, { pos: [0, 0.75, 0], jit: 0.03 }),
    part(new G.BoxGeometry(0.5, 1.1, 1.2), C.hat, { pos: [-1.0, 1.25, 0], jit: 0.03, seed: 3 }),
    part(new G.BoxGeometry(2.42, 0.12, 1.3), C.gold, { pos: [0, 1.12, 0] }),
    part(new G.BoxGeometry(0.55, 0.12, 1.3), C.gold, { pos: [-1.0, 1.84, 0] }),
    part(new G.BoxGeometry(0.55, 0.55, 1.1), C.hatDark, { pos: [1.15, 0.95, 0], rot: [0, 0, -0.5] }),
    part(new G.IcosahedronGeometry(0.6, 0), 0x8a6a4a, { pos: [-1.15, 1.75, 0], jit: 0.1 }),
  ];
  for (const z of [-0.5, 0.5]) {
    ps.push(part(new G.BoxGeometry(2.8, 0.1, 0.1), C.gold, { pos: [0, 0.1, z] }));
    ps.push(part(new G.TorusGeometry(0.3, 0.06, 4, 8, Math.PI), C.gold, { pos: [1.4, 0.4, z], rot: [0, 0, -Math.PI / 2] }));
    for (const x of [-0.8, 0.7]) ps.push(part(new G.BoxGeometry(0.08, 0.4, 0.08), C.gold, { pos: [x, 0.3, z] }));
    ps.push(part(new G.BoxGeometry(2.0, 0.05, 0.05), C.gold, { pos: [2.3, 1.2, z * 0.9], rot: [0, 0, 0.12] }));
  }
  g.add(toon(build(ps), 0.035));

  const santa = character({ shirt: C.hat, pants: C.hat, beard: true, seed: 3 });
  santa.scale.setScalar(0.72); santa.position.set(-0.2, 0.45, 0); santa.rotation.y = Math.PI / 2;
  const u = santa.userData;
  u.legL.rotation.x = u.legR.rotation.x = -1.35; u.armL.rotation.x = u.armR.rotation.x = -1.0;
  const anchor = new G.Object3D(); anchor.position.set(0, 1.98, 0); santa.add(anchor);
  g.add(santa);

  const rgeo = reindeerGeo(), deer = [];
  for (const z of [-0.5, 0.5]) { const d = toon(rgeo, 0.035); d.rotation.y = Math.PI / 2; d.position.set(3.5, 0.1, z); d.scale.setScalar(0.85); g.add(d); deer.push(d); }
  return {
    group: g, santa, anchor, deer,
    tick(t) { deer.forEach((d, i) => { d.position.y = 0.1 + Math.sin(t * 7 + i * 1.3) * 0.12; d.rotation.z = Math.sin(t * 7 + i) * 0.06; }); },
  };
}

export const SPAN = { front: 4.4, back: -1.4 };
