// The winter plaza shared by Snowball Square and Be the Hat.
import { THREE, C, part, build, toon, toonInstanced, setInstance, pineGeo, cottage, snowmanGeo, hatGeo, glow, glowMat,
  skyTexture, stars, aurora, lights, rng } from './kit.js';

const G = THREE, V3 = THREE.Vector3;
export const ARENA = 13.2;

function stallGeo(seed) {
  const ps = [
    part(new G.BoxGeometry(2.6, 1.0, 1.1), C.wood, { pos: [0, 0.5, 0.3], jit: 0.03, seed }),
    part(new G.BoxGeometry(2.8, 0.12, 1.3), C.woodDark, { pos: [0, 1.04, 0.3] }),
    part(new G.BoxGeometry(2.6, 2.2, 0.12), C.woodDark, { pos: [0, 1.1, -0.35] }),
  ];
  for (const x of [-1.3, 1.3]) for (const z of [-0.35, 0.85]) ps.push(part(new G.BoxGeometry(0.12, 2.5, 0.12), C.woodDark, { pos: [x, 1.25, z] }));
  for (let i = 0; i < 7; i++) ps.push(part(new G.BoxGeometry(0.44, 0.1, 1.9), i % 2 ? C.brim : C.hat, { pos: [-1.32 + i * 0.44, 2.55, 0.3], rot: [0.28, 0, 0], jit: 0.02, seed: seed + i }));
  for (let i = 0; i < 3; i++) ps.push(part(new G.BoxGeometry(0.3, 0.3, 0.3), [C.gold, C.elf, C.brim][i], { pos: [-0.7 + i * 0.7, 1.25, 0.4], rot: [0, i, 0], jit: 0.02 }));
  return build(ps);
}

function ringGeo(r, n = 32) {
  const ps = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, len = (2 * Math.PI * r) / n + 0.05;
    ps.push(part(new G.BoxGeometry(len, 0.35, 0.8), i % 2 ? C.stone : C.stoneDark, { pos: [Math.cos(a) * r, 0.14, Math.sin(a) * r], rot: [0, -a + Math.PI / 2, 0], jit: 0.04, seed: i }));
  }
  return build(ps);
}

function groundGeo(radius, seg, color, jit, y = 0, seed = 1) {
  const g = new G.CircleGeometry(radius, seg, 0, Math.PI * 2);
  g.rotateX(-Math.PI / 2);
  // add rings so the ground can undulate
  const r2 = new G.RingGeometry(radius, radius * 3.2, seg, 3); r2.rotateX(-Math.PI / 2);
  const p = r2.attributes.position;
  for (let i = 0; i < p.count; i++) { const d = Math.hypot(p.getX(i), p.getZ(i)); if (d > radius + 0.1) p.setY(i, (d - radius) * 0.18 * (0.6 + Math.sin(p.getX(i) * 0.3) * 0.4)); }
  return build([part(g, color, { pos: [0, y, 0], jit, seed }), part(r2, C.snow, { pos: [0, y, 0], jit: jit * 3, seed: seed + 1 })]);
}

export function buildPlaza(scene, o = {}) {
  const r = rng(o.seed ?? 42);
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0x232c52, 26, 78);
  lights(scene, { hemi: 1.35, moonI: 1.3 });
  const out = { tick: [] };

  scene.add(toon(groundGeo(40, 40, C.snow, 0.05, 0, 3), 0));
  scene.add(toon(build([part(new G.CircleGeometry(ARENA + 0.8, 36).rotateX(-Math.PI / 2), 0xd7deec, { pos: [0, 0.02, 0], jit: 0.03 })]), 0));
  scene.add(toon(ringGeo(ARENA + 1.2), 0.03));

  const st = stars(); scene.add(st);
  const au = aurora(); au.position.set(0, 44, -90); scene.add(au); out.tick.push(au.userData.tick);
  const moon = glow(0xdfe8ff, 26, 0.5); moon.position.set(-60, 55, -110); scene.add(moon);
  const moonDisc = new THREE.Mesh(new G.IcosahedronGeometry(4, 1), glowMat(0xf2f5ff)); moonDisc.position.copy(moon.position); scene.add(moonDisc);

  // forest ring
  const trees = [];
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + r() * 0.1, d = 19 + r() * 14;
    if (Math.sin(a) < -0.55 && d < 26) continue; // leave room for cottages behind
    trees.push([Math.cos(a) * d, Math.sin(a) * d, 0.9 + r() * 0.8, r() * 6]);
  }
  const tg = pineGeo(9), ti = toonInstanced(tg, trees.length, 0.04);
  trees.forEach(([x, z, s, ry], i) => setInstance(ti, i, new V3(x, 0, z), ry, s));
  scene.add(ti);

  // cottages behind the plaza, facing in
  const lit = new THREE.MeshBasicMaterial({ vertexColors: true });
  [[-12, -24, 0.35], [-3, -27, 0.1], [7, -25, -0.2], [16, -21, -0.55]].forEach(([x, z, ry], i) => {
    const c = cottage(i + 3, { w: 3.4 + (i % 2) * 0.8 });
    const g = new G.Group(); g.add(toon(c.body, 0.04)); g.add(new THREE.Mesh(c.windows, lit));
    g.position.set(x, 0, z); g.rotation.y = ry; g.scale.setScalar(1.3); scene.add(g);
  });

  // market stalls + snowmen on the rim
  [[-15.5, 4, 1.9], [15.8, 3, -1.8], [-9, 13.5, 2.6]].forEach(([x, z, ry], i) => {
    const m = toon(stallGeo(i * 5), 0.035); m.position.set(x, 0, z); m.rotation.y = ry; scene.add(m);
  });
  [[-17, -6], [14, 12]].forEach(([x, z], i) => { const m = toon(snowmanGeo(i + 1), 0.035); m.position.set(x, 0, z); m.lookAt(0, 0, 0); scene.add(m); });

  // the big tree with bulbs
  const big = toon(pineGeo(21, 2.3), 0.05); big.position.set(-10, 0, -15); scene.add(big);
  const star = new THREE.Mesh(new G.OctahedronGeometry(0.55, 0), glowMat(0xffd76a)); star.position.set(-10, 7.7, -15); scene.add(star);
  const sg = glow(0xffc34d, 5, 0.7); sg.position.copy(star.position); scene.add(sg);
  const bulbs = new THREE.InstancedMesh(new G.IcosahedronGeometry(0.13, 0), new THREE.MeshBasicMaterial(), 36);
  const bc = [0xff4b3e, 0xffd24a, 0x4bd1ff, 0x7dff8a];
  for (let i = 0; i < 36; i++) {
    const t = i / 36, h = 1.4 + t * 5.6, rad = (1 - t) * 2.9 + 0.2, a = t * 22;
    setInstance(bulbs, i, new V3(-10 + Math.cos(a) * rad, h, -15 + Math.sin(a) * rad));
    bulbs.setColorAt(i, new THREE.Color(bc[i % 4]));
  }
  scene.add(bulbs);
  const treeLight = new THREE.PointLight(0xffb45a, 6, 10, 1.6); treeLight.position.set(-10, 3, -12); scene.add(treeLight);
  out.tick.push((t) => { sg.material.opacity = 0.55 + Math.sin(t * 2) * 0.15; star.rotation.y = t; });

  // centre pedestal with lanterns
  if (o.pedestal !== false) {
    const ped = toon(build([
      part(new G.BoxGeometry(2.4, 0.4, 2.4), C.stoneDark, { pos: [0, 0.2, 0], jit: 0.04 }),
      part(new G.BoxGeometry(1.8, 1.1, 1.8), C.stone, { pos: [0, 0.95, 0], jit: 0.05, seed: 3 }),
      part(new G.BoxGeometry(2.1, 0.22, 2.1), C.stoneDark, { pos: [0, 1.6, 0], jit: 0.03, seed: 4 }),
    ]), 0.04);
    scene.add(ped); out.pedestalTop = 1.71;
  }
  const lanterns = [];
  const lg = build([
    part(new G.BoxGeometry(0.34, 0.08, 0.34), C.coal, { pos: [0, 0.04, 0] }),
    part(new G.BoxGeometry(0.34, 0.08, 0.34), C.coal, { pos: [0, 0.6, 0] }),
    part(new G.ConeGeometry(0.28, 0.22, 4), C.coal, { pos: [0, 0.75, 0], rot: [0, Math.PI / 4, 0] }),
    ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => part(new G.BoxGeometry(0.05, 0.5, 0.05), C.coal, { pos: [a * 0.15, 0.32, b * 0.15] })),
  ]);
  const core = new G.BoxGeometry(0.22, 0.46, 0.22);
  for (let i = 0; i < (o.lanterns ?? 6); i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5, x = Math.cos(a) * 2.2, z = Math.sin(a) * 2.2;
    const l = toon(lg, 0.02); l.position.set(x, 0, z); scene.add(l);
    const c = new THREE.Mesh(core, glowMat(C.glass)); c.position.set(x, 0.32, z); scene.add(c);
    const gl = glow(C.lantern, 1.3, 0.4); gl.position.set(x, 0.4, z); scene.add(gl); lanterns.push(gl);
  }
  const pedLight = new THREE.PointLight(0xffa94a, 5, 8, 1.5); pedLight.position.set(0, 1.4, 1.5); scene.add(pedLight);
  out.tick.push((t) => lanterns.forEach((g, i) => { g.material.opacity = 0.34 + Math.sin(t * 7 + i * 2.1) * 0.05 + Math.sin(t * 13 + i) * 0.03; }));

  // snowball piles (ammo points)
  out.piles = [[-8, -5], [8, -6], [-7, 8], [8, 7]].map(([x, z], i) => {
    const pg = [];
    const rr = rng(i + 9);
    for (let k = 0; k < 9; k++) { const a = rr() * 6.28, d = rr() * 0.5, y = k < 6 ? 0.22 : 0.5; pg.push(part(new G.IcosahedronGeometry(0.24, 0), C.snow, { pos: [Math.cos(a) * d, y, Math.sin(a) * d], jit: 0.02, seed: k })); }
    const m = toon(build(pg), 0.025); m.position.set(x, 0, z); scene.add(m);
    return new V3(x, 0, z);
  });

  out.update = (t) => out.tick.forEach((f) => f(t));
  return out;
}

export function makeHat(scale = 1) { return toon(hatGeo({ scale }), 0.035 * scale); }

export function shadowBlob() {
  const m = new THREE.Mesh(new G.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0c0f1a, transparent: true, opacity: 0.35, depthWrite: false }));
  m.position.y = 0.04; return m;
}
