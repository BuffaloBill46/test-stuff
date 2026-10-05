// The winter plaza shared by Snowball Square and Be the Hat. Its look comes from a theme (themes.js); the ring, pedestal and
// snowball piles are the same in every theme, because the referee (sim.js) plays on them whatever each player sees.
import { THREE, C, part, build, toon, toonInstanced, setInstance, pineGeo, cottage, snowmanGeo, hatGeo, glow, glowMat,
  skyTexture, stars, aurora, lights, rng, disposeTree } from './kit.js?v=1cebc9f32d';
import { themeOf } from './themes.js?v=1cebc9f32d';

const G = THREE, V3 = THREE.Vector3;
export const ARENA = 13.2;

// Market stall. awn: the awning's two stripe colours; goods: parts for the counter (default: three wrapped presents).
function stallGeo(seed, awn = [C.hat, C.brim], goods = null) {
  const ps = [
    part(new G.BoxGeometry(2.6, 1.0, 1.1), C.wood, { pos: [0, 0.5, 0.3], jit: 0.03, seed }),
    part(new G.BoxGeometry(2.8, 0.12, 1.3), C.woodDark, { pos: [0, 1.04, 0.3] }),
    part(new G.BoxGeometry(2.6, 2.2, 0.12), C.woodDark, { pos: [0, 1.1, -0.35] }),
  ];
  for (const x of [-1.3, 1.3]) for (const z of [-0.35, 0.85]) ps.push(part(new G.BoxGeometry(0.12, 2.5, 0.12), C.woodDark, { pos: [x, 1.25, z] }));
  for (let i = 0; i < 7; i++) ps.push(part(new G.BoxGeometry(0.44, 0.1, 1.9), i % 2 ? awn[1] : awn[0], { pos: [-1.32 + i * 0.44, 2.55, 0.3], rot: [0.28, 0, 0], jit: 0.02, seed: seed + i }));
  if (goods) ps.push(...goods);
  else for (let i = 0; i < 3; i++) ps.push(part(new G.BoxGeometry(0.3, 0.3, 0.3), [C.gold, C.elf, C.brim][i], { pos: [-0.7 + i * 0.7, 1.25, 0.4], rot: [0, i, 0], jit: 0.02 }));
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

function groundGeo(radius, seg, color, jit, y = 0, seed = 1, hills = C.snow) {
  const g = new G.CircleGeometry(radius, seg, 0, Math.PI * 2);
  g.rotateX(-Math.PI / 2);
  // add rings so the ground can undulate
  const r2 = new G.RingGeometry(radius, radius * 3.2, seg, 3); r2.rotateX(-Math.PI / 2);
  const p = r2.attributes.position;
  for (let i = 0; i < p.count; i++) { const d = Math.hypot(p.getX(i), p.getZ(i)); if (d > radius + 0.1) p.setY(i, (d - radius) * 0.18 * (0.6 + Math.sin(p.getX(i) * 0.3) * 0.4)); }
  return build([part(g, color, { pos: [0, y, 0], jit, seed }), part(r2, hills, { pos: [0, y, 0], jit: jit * 3, seed: seed + 1 })]);
}

const PILES = [[-8, -5], [8, -6], [-7, 8], [8, 7]]; // snowball piles (ammo points); the referee has its own copy in sim.js

// o.theme: a themes.js id (default Christmas). Everything is added under one group so a theme can be swapped at runtime:
// out.dispose() removes it and frees what it owns, then buildPlaza again with the new theme.
export function buildPlaza(scene, o = {}) {
  const th = themeOf(o.theme), r = rng(o.seed ?? 42), root = new G.Group(); scene.add(root);
  const sky = skyTexture(...th.sky); scene.background = sky;
  scene.fog = new THREE.Fog(...th.fog);
  lights(root, th.lights);
  const out = { tick: [] };

  root.add(toon(groundGeo(40, 40, th.ground, 0.05, 0, 3, th.hills), 0));
  root.add(toon(build([part(new G.CircleGeometry(ARENA + 0.8, 36).rotateX(-Math.PI / 2), th.floor, { pos: [0, 0.02, 0], jit: 0.03 })]), 0));
  root.add(toon(ringGeo(ARENA + 1.2), 0.03));

  const st = stars(th.stars); root.add(st);
  if (th.aurora) { const au = aurora(); au.position.set(0, 44, -90); root.add(au); out.tick.push(au.userData.tick); }
  const mo = th.moon, moon = glow(mo.glow, mo.size, mo.opacity); moon.position.set(...mo.pos); root.add(moon);
  const moonDisc = new THREE.Mesh(new G.IcosahedronGeometry(mo.r, 1), glowMat(mo.color)); moonDisc.position.copy(moon.position); root.add(moonDisc);

  const halloween = th.props === 'halloween';
  (halloween ? halloweenProps : christmasProps)(root, r, out);

  // centre pedestal, ringed by iron lanterns (Christmas) or jack-o'-lanterns (Halloween)
  if (o.pedestal !== false) {
    const ped = toon(build([
      part(new G.BoxGeometry(2.4, 0.4, 2.4), C.stoneDark, { pos: [0, 0.2, 0], jit: 0.04 }),
      part(new G.BoxGeometry(1.8, 1.1, 1.8), C.stone, { pos: [0, 0.95, 0], jit: 0.05, seed: 3 }),
      part(new G.BoxGeometry(2.1, 0.22, 2.1), C.stoneDark, { pos: [0, 1.6, 0], jit: 0.03, seed: 4 }),
    ]), 0.04);
    root.add(ped); out.pedestalTop = 1.71;
  }
  (halloween ? jackLanterns : ironLanterns)(root, o.lanterns ?? 6, out);

  out.piles = PILES.map(([x, z], i) => {
    const pg = [];
    const rr = rng(i + 9);
    for (let k = 0; k < 9; k++) { const a = rr() * 6.28, d = rr() * 0.5, y = k < 6 ? 0.22 : 0.5; pg.push(part(new G.IcosahedronGeometry(0.24, 0), C.snow, { pos: [Math.cos(a) * d, y, Math.sin(a) * d], jit: 0.02, seed: k })); }
    const m = toon(build(pg), 0.025); m.position.set(x, 0, z); root.add(m);
    return new V3(x, 0, z);
  });

  out.update = (t) => out.tick.forEach((f) => f(t));
  out.dispose = () => { scene.remove(root); disposeTree(root); sky.dispose(); if (scene.background === sky) scene.background = null; scene.fog = null; out.tick.length = 0; };
  return out;
}

function christmasProps(root, r, out) {
  // forest ring
  const trees = [];
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + r() * 0.1, d = 19 + r() * 14;
    if (Math.sin(a) < -0.55 && d < 26) continue; // leave room for cottages behind
    trees.push([Math.cos(a) * d, Math.sin(a) * d, 0.9 + r() * 0.8, r() * 6]);
  }
  const tg = pineGeo(9), ti = toonInstanced(tg, trees.length, 0.04);
  trees.forEach(([x, z, s, ry], i) => setInstance(ti, i, new V3(x, 0, z), ry, s));
  root.add(ti);

  // cottages behind the plaza, facing in
  const lit = new THREE.MeshBasicMaterial({ vertexColors: true });
  COTTAGES.forEach(([x, z, ry], i) => {
    const c = cottage(i + 3, { w: 3.4 + (i % 2) * 0.8 });
    const g = new G.Group(); g.add(toon(c.body, 0.04)); g.add(new THREE.Mesh(c.windows, lit));
    g.position.set(x, 0, z); g.rotation.y = ry; g.scale.setScalar(1.3); root.add(g);
  });

  // market stalls + snowmen on the rim
  STALLS.forEach(([x, z, ry], i) => {
    const m = toon(stallGeo(i * 5), 0.035); m.position.set(x, 0, z); m.rotation.y = ry; root.add(m);
  });
  RIM.forEach(([x, z], i) => { const m = toon(snowmanGeo(i + 1), 0.035); m.position.set(x, 0, z); m.lookAt(0, 0, 0); root.add(m); });

  // the big tree with bulbs
  const big = toon(pineGeo(21, 2.3), 0.05); big.position.set(-10, 0, -15); root.add(big);
  const star = new THREE.Mesh(new G.OctahedronGeometry(0.55, 0), glowMat(0xffd76a)); star.position.set(-10, 7.7, -15); root.add(star);
  const sg = glow(0xffc34d, 5, 0.7); sg.position.copy(star.position); root.add(sg);
  const bulbs = new THREE.InstancedMesh(new G.IcosahedronGeometry(0.13, 0), new THREE.MeshBasicMaterial(), 36);
  const bc = [0xff4b3e, 0xffd24a, 0x4bd1ff, 0x7dff8a];
  for (let i = 0; i < 36; i++) {
    const t = i / 36, h = 1.4 + t * 5.6, rad = (1 - t) * 2.9 + 0.2, a = t * 22;
    setInstance(bulbs, i, new V3(-10 + Math.cos(a) * rad, h, -15 + Math.sin(a) * rad));
    bulbs.setColorAt(i, new THREE.Color(bc[i % 4]));
  }
  root.add(bulbs);
  const treeLight = new THREE.PointLight(0xffb45a, 6, 10, 1.6); treeLight.position.set(-10, 3, -12); root.add(treeLight);
  out.tick.push((t) => { sg.material.opacity = 0.55 + Math.sin(t * 2) * 0.15; star.rotation.y = t; });
}
// Where the props stand (both themes put their own prop in each spot, so the plaza keeps its shape).
const COTTAGES = [[-12, -24, 0.35], [-3, -27, 0.1], [7, -25, -0.2], [16, -21, -0.55]];
const STALLS = [[-15.5, 4, 1.9], [15.8, 3, -1.8], [-9, 13.5, 2.6]];
const RIM = [[-17, -6], [14, 12]]; // snowmen / scarecrows, facing the middle

function ironLanterns(root, n, out) {
  const lanterns = [];
  const lg = build([
    part(new G.BoxGeometry(0.34, 0.08, 0.34), C.coal, { pos: [0, 0.04, 0] }),
    part(new G.BoxGeometry(0.34, 0.08, 0.34), C.coal, { pos: [0, 0.6, 0] }),
    part(new G.ConeGeometry(0.28, 0.22, 4), C.coal, { pos: [0, 0.75, 0], rot: [0, Math.PI / 4, 0] }),
    ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => part(new G.BoxGeometry(0.05, 0.5, 0.05), C.coal, { pos: [a * 0.15, 0.32, b * 0.15] })),
  ]);
  const core = new G.BoxGeometry(0.22, 0.46, 0.22);
  for (let i = 0; i < n; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5, x = Math.cos(a) * 2.2, z = Math.sin(a) * 2.2;
    const l = toon(lg, 0.02); l.position.set(x, 0, z); root.add(l);
    const c = new THREE.Mesh(core, glowMat(C.glass)); c.position.set(x, 0.32, z); root.add(c);
    const gl = glow(C.lantern, 1.3, 0.4); gl.position.set(x, 0.4, z); root.add(gl); lanterns.push(gl);
  }
  const pedLight = new THREE.PointLight(0xffa94a, 5, 8, 1.5); pedLight.position.set(0, 1.4, 1.5); root.add(pedLight);
  out.tick.push((t) => lanterns.forEach((g, i) => { g.material.opacity = 0.34 + Math.sin(t * 7 + i * 2.1) * 0.05 + Math.sin(t * 13 + i) * 0.03; }));
}

// ---------- Halloween: same spots, harvest-time props. Same kit as Christmas (faceted parts, toon shading, ink outlines).
const H = { pumpkin: 0xe0731f, pumpkinDark: 0xb4501a, stem: 0x55602c, candle: 0xffcf5a, bark: 0x3e322d, barkDark: 0x2c2422,
  straw: 0xd2ab55, strawDark: 0x9a7a35, burlap: 0xc4a77a, flannel: 0x8c3a2c, grave: 0x7e7c88, graveDark: 0x5a5866, bat: 0x1c1621,
  roof: 0x4a3c50, apple: 0xb3302a, corn: 0xe2b84a, earth: 0x4f4030,
  // the Halloween folk: bone, zombie skin (grey-green), faded rags, a black cat with a little colour left for the toon shading
  bone: 0xe2d9bf, socket: 0x1c1621, rot: 0x8a9c7c, rag: 0x5b5670, ragBrown: 0x6b5a45, ragRed: 0x6e3b3b, trousers: 0x3c4658,
  cat: 0x26212c, catNose: 0x5a4652, catEye: 0xd8ea3c, web: 0xcfcad8 };

function pumpkinGeo(seed = 1, s = 1) { // standing on y=0, about 0.5 tall; built facing +z (the carved side for a jack-o'-lantern)
  return build([
    part(new G.SphereGeometry(0.32, 9, 6), H.pumpkin, { pos: [0, 0.23, 0], scale: [1, 0.72, 1], jit: 0.02, seed }),
    part(new G.CylinderGeometry(0.03, 0.05, 0.16, 5), H.stem, { pos: [0.02, 0.5, 0], rot: [0, 0, -0.25] }),
    part(new G.BoxGeometry(0.14, 0.02, 0.07), H.stem, { pos: [-0.07, 0.47, 0.03], rot: [0, 0.6, 0.3] }),
  ].map((g) => { g.scale(s, s, s); return g; }));
}
// The carved face, drawn unlit so it reads as candlelight from inside.
function jackFaceGeo() {
  const tri = (r, x, y, z) => part(new G.CylinderGeometry(r, r, 0.08, 3), H.candle, { pos: [x, y, z], rot: [-Math.PI / 2, 0, 0] });
  return build([tri(0.07, -0.11, 0.29, 0.27), tri(0.07, 0.11, 0.29, 0.27), tri(0.04, 0, 0.225, 0.3),
    part(new G.BoxGeometry(0.24, 0.05, 0.08), H.candle, { pos: [0, 0.15, 0.285] }),
    part(new G.BoxGeometry(0.07, 0.05, 0.08), H.candle, { pos: [-0.13, 0.175, 0.265], rot: [0, 0.4, 0.6] }),
    part(new G.BoxGeometry(0.07, 0.05, 0.08), H.candle, { pos: [0.13, 0.175, 0.265], rot: [0, -0.4, -0.6] }),
    part(new G.BoxGeometry(0.05, 0.035, 0.08), H.candle, { pos: [-0.05, 0.12, 0.285] }), part(new G.BoxGeometry(0.05, 0.035, 0.08), H.candle, { pos: [0.05, 0.12, 0.285] }),
  ]);
}
function jackLanterns(root, n, out) {
  const body = pumpkinGeo(4), face = jackFaceGeo(), lit = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }), glows = [];
  for (let i = 0; i < n; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5, x = Math.cos(a) * 2.2, z = Math.sin(a) * 2.2;
    const j = jack(body, face, lit, 1.2); j.position.set(x, 0, z); j.lookAt(x * 2, 0, z * 2); root.add(j); // grinning outwards
    const gl = glow(0xff8f3a, 1.2, 0.32); gl.position.set(x, 0.38, z); root.add(gl); glows.push(gl);
  }
  // the same warm light as the Christmas lanterns, a shade more orange (LESSONS: 2 real lights per scene, ~5-6 intensity)
  const pedLight = new THREE.PointLight(0xff9440, 5, 8, 1.5); pedLight.position.set(0, 1.4, 1.5); root.add(pedLight);
  out.tick.push((t) => glows.forEach((g, i) => { g.material.opacity = 0.3 + Math.sin(t * 6 + i * 2.1) * 0.05 + Math.sin(t * 15 + i) * 0.03; }));
}
function jack(body, face, lit, s = 1) { const j = new G.Group(); j.add(toon(body, 0.025)); j.add(new THREE.Mesh(face, lit)); j.scale.setScalar(s); return j; }

// A leafless tree: a leaning trunk and crooked branches, each with a twig. Returns the twig tips (for hanging lanterns).
function bareTreeGeo(seed = 1, h = 1, n = 5) {
  const rr = rng(seed), ps = [], tips = [];
  const limb = (base, yaw, tilt, len, r0, r1, color) => {
    const dir = new V3(Math.sin(tilt) * Math.cos(yaw), Math.cos(tilt), -Math.sin(tilt) * Math.sin(yaw));
    ps.push(part(new G.CylinderGeometry(r1, r0, len, 5), color, { pos: base.clone().addScaledVector(dir, len / 2).toArray(), rot: [0, yaw, -tilt], jit: r0 * 0.25, seed: seed + ps.length }));
    return base.clone().addScaledVector(dir, len);
  };
  const top = limb(new V3(0, 0, 0), rr() * 6.28, 0.07, 2.3, 0.26, 0.13, H.barkDark);
  limb(top, rr() * 6.28, 0.25, 0.9, 0.13, 0.04, H.bark);
  for (let k = 0; k < n; k++) {
    const yaw = k * 2.4 + rr() * 0.8, base = new V3(0, 1.0 + (k / n) * 1.3, 0), tip = limb(base, yaw, 0.7 + rr() * 0.4, 1.0 + rr() * 0.5, 0.1, 0.05, H.bark);
    tips.push(tip, limb(tip, yaw + (rr() < 0.5 ? -0.7 : 0.7), 0.35 + rr() * 0.3, 0.5 + rr() * 0.3, 0.05, 0.02, H.bark));
  }
  return { geo: build(ps.map((g) => { g.scale(h, h, h); return g; })), tips: tips.map((p) => p.multiplyScalar(h)) };
}

function scarecrowGeo(seed = 1) { // built facing +z, standing on y=0
  const ps = [
    part(new G.BoxGeometry(0.12, 2.5, 0.12), C.woodDark, { pos: [0, 1.25, -0.05], jit: 0.02, seed }),
    part(new G.BoxGeometry(1.8, 0.1, 0.1), C.woodDark, { pos: [0, 1.72, -0.05], jit: 0.02, seed: seed + 1 }),
    part(new G.BoxGeometry(0.6, 0.72, 0.34), H.flannel, { pos: [0, 1.4, 0.03], jit: 0.04, seed: seed + 2 }),
    part(new G.BoxGeometry(1.4, 0.2, 0.22), H.flannel, { pos: [0, 1.72, 0], jit: 0.03, seed: seed + 3 }),
    part(new G.BoxGeometry(0.62, 0.08, 0.36), C.wood, { pos: [0, 1.12, 0.03] }), // rope belt
    part(new G.IcosahedronGeometry(0.27, 1), H.burlap, { pos: [0, 2.06, 0], scale: [1, 1.08, 0.95], jit: 0.03, seed: seed + 4 }),
    part(new G.TorusGeometry(0.16, 0.04, 4, 8), C.wood, { pos: [0, 1.82, 0], rot: [Math.PI / 2, 0, 0] }),
    part(new G.CylinderGeometry(0.46, 0.46, 0.04, 9), H.strawDark, { pos: [0, 2.26, 0], jit: 0.03, seed: seed + 5 }),
    part(new G.ConeGeometry(0.24, 0.42, 7), H.strawDark, { pos: [0, 2.48, 0], rot: [0.1, 0, 0.12], jit: 0.03, seed: seed + 6 }),
    part(new G.BoxGeometry(0.07, 0.07, 0.04), C.coal, { pos: [-0.1, 2.1, 0.25] }), part(new G.BoxGeometry(0.07, 0.07, 0.04), C.coal, { pos: [0.1, 2.1, 0.25] }),
    part(new G.BoxGeometry(0.22, 0.025, 0.04), C.coal, { pos: [0, 1.96, 0.25] }),
    ...[-0.08, 0, 0.08].map((x) => part(new G.BoxGeometry(0.015, 0.06, 0.04), C.coal, { pos: [x, 1.96, 0.26] })), // stitched mouth
  ];
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) ps.push(part(new G.ConeGeometry(0.06, 0.24, 4), H.straw, { pos: [s * (0.78 + k * 0.03), 1.72 + (k - 1) * 0.07, 0], rot: [0, 0, s * -(Math.PI / 2) + (k - 1) * 0.4] }));
  for (let k = 0; k < 5; k++) ps.push(part(new G.ConeGeometry(0.06, 0.26, 4), H.straw, { pos: [-0.24 + k * 0.12, 0.98, 0.05], rot: [Math.PI, 0, (k - 2) * 0.15] }));
  return build(ps);
}

const haleParts = (x, z, ry = 0, seed = 1) => [ // a hay bale with its two twine bands
  part(new G.BoxGeometry(1.1, 0.5, 0.6), H.straw, { pos: [x, 0.25, z], rot: [0, ry, 0], jit: 0.04, seed }),
  ...[-0.3, 0.3].map((b) => part(new G.BoxGeometry(0.05, 0.52, 0.62), H.strawDark, { pos: [x + Math.cos(ry) * b, 0.25, z - Math.sin(ry) * b], rot: [0, ry, 0] })),
];
function harvestGoods(seed) { // on and around a harvest stall: pumpkins, an apple crate, corn cobs; hay bales and a corn shock beside it
  const ps = [
    ...[-0.9, -0.5].map((x, i) => part(new G.SphereGeometry(0.19, 8, 5), i ? H.pumpkinDark : H.pumpkin, { pos: [x, 1.24, 0.42], scale: [1, 0.75, 1], jit: 0.015, seed: seed + i })),
    part(new G.BoxGeometry(0.5, 0.22, 0.4), C.wood, { pos: [0.15, 1.21, 0.4], jit: 0.02, seed }),
    ...[[-0.05, 0.32], [0.12, 0.48], [0.3, 0.34], [0.2, 0.42]].map(([x, z], i) => part(new G.IcosahedronGeometry(0.08, 0), H.apple, { pos: [x, 1.36, z], jit: 0.01, seed: seed + i })),
    ...[0, 1, 2].map((i) => part(new G.ConeGeometry(0.07, 0.4, 5), H.corn, { pos: [0.85, 1.17 + i * 0.03, 0.3 + i * 0.12], rot: [0, 0.3, Math.PI / 2] })),
    part(new G.ConeGeometry(0.5, 2.0, 7), H.strawDark, { pos: [1.85, 1.0, -0.25], jit: 0.06, seed: seed + 3 }),
    part(new G.TorusGeometry(0.2, 0.06, 4, 8), C.wood, { pos: [1.85, 1.25, -0.25], rot: [Math.PI / 2, 0, 0] }),
    ...haleParts(-1.95, 0.55, 0.3, seed + 4), ...haleParts(-1.9, 0.6, 0.2, seed + 5).map((g) => g.translate(0.05, 0.5, -0.05)),
  ];
  return ps;
}

function graveyardGeo(seed = 1) { // a little fenced graveyard, open at the front (+z); about 4 wide
  const rr = rng(seed), ps = [];
  [[-1.2, -0.2], [0, 0], [1.2, -0.3], [-0.6, -1.4], [0.7, -1.3]].forEach(([x, z], i) => {
    const t = (rr() - 0.5) * 0.2, tilt = [0, 0, t], col = i % 2 ? H.graveDark : H.grave;
    // one stone cross, the rest round-topped headstones; each leans a little
    if (i === 2) ps.push(part(new G.BoxGeometry(0.14, 0.95, 0.12), col, { pos: [x, 0.47, z], rot: tilt, jit: 0.02, seed: seed + i }),
      part(new G.BoxGeometry(0.5, 0.13, 0.12), col, { pos: [x - Math.sin(t) * 0.19, 0.66, z], rot: tilt, jit: 0.02 }));
    else ps.push(part(new G.BoxGeometry(0.56, 0.62, 0.16), col, { pos: [x, 0.31, z], rot: tilt, jit: 0.03, seed: seed + i }),
      part(new G.CylinderGeometry(0.28, 0.28, 0.16, 8, 1, false, 0, Math.PI), col, { pos: [x - Math.sin(t) * 0.31, 0.62, z], rot: [Math.PI / 2, 0, Math.PI / 2 + t, 'ZYX'], jit: 0.02, seed: seed + i + 9 }));
    ps.push(part(new G.BoxGeometry(0.62, 0.06, 0.6), H.earth, { pos: [x, 0.03, z + 0.4], jit: 0.04, seed: seed + i + 20 })); // the mound
  });
  const post = (x, z) => part(new G.BoxGeometry(0.1, 0.85, 0.1), C.woodDark, { pos: [x, 0.42, z], jit: 0.02, seed: seed + Math.round(x * 7 + z * 3) });
  const rail = (x, z, len, ry) => [0.3, 0.65].map((y) => part(new G.BoxGeometry(len, 0.07, 0.05), C.wood, { pos: [x, y, z], rot: [0, ry, (rr() - 0.5) * 0.06] }));
  for (const x of [-2.1, -1.05, 0, 1.05, 2.1]) ps.push(post(x, -2.0));
  for (const s of [-1, 1]) { for (const z of [-1.0, 0, 1.0]) ps.push(post(s * 2.1, z)); ps.push(...rail(s * 2.1, -0.5, 3.0, Math.PI / 2)); ps.push(...rail(s * 1.6, 1.0, 1.0, 0)); ps.push(post(s * 1.1, 1.0)); }
  ps.push(...rail(0, -2.0, 4.2, 0));
  return build(ps);
}

function snowPatchGeo(seed = 1) { // a thin, ragged patch of old snow lying flat on the grass
  const g = new G.CircleGeometry(1, 10), p = g.attributes.position, rr = rng(seed);
  for (let i = 1; i < p.count; i++) { const k = 0.82 + rr() * 0.3; p.setXY(i, p.getX(i) * k, p.getY(i) * k); }
  g.rotateX(-Math.PI / 2);
  return build([part(g, C.snow, {})]);
}

function batGroup() { // a bat: body with ears and two flapping wings (the tick moves it)
  const b = new G.Group();
  b.add(toon(build([part(new G.IcosahedronGeometry(0.12, 0), H.bat, { scale: [0.9, 0.8, 1.3] }),
    part(new G.TetrahedronGeometry(0.06), H.bat, { pos: [-0.05, 0.1, 0.1] }), part(new G.TetrahedronGeometry(0.06), H.bat, { pos: [0.05, 0.1, 0.1] })]), 0.015));
  for (const s of [-1, 1]) {
    const w = toon(build([part(new G.BoxGeometry(0.42, 0.02, 0.22), H.bat, { pos: [s * 0.24, 0, 0], jit: 0.03 }),
      part(new G.BoxGeometry(0.2, 0.02, 0.14), H.bat, { pos: [s * 0.5, 0, -0.06], rot: [0, s * 0.4, 0] })]), 0.012);
    b.add(w); b.userData[s < 0 ? 'l' : 'r'] = w;
  }
  return b;
}

// ---------- Halloween folk (Cody, 2026-10-03: "skeletons, a couple black cats, zombies... make it more spooky"). Same kit as
// the scarecrows. A figure is built from a pose (where its hip, chest, head, elbows, hands, knees and feet are), facing +z and
// standing on y=0, so one builder makes the sitting, peeking and waving skeletons and one makes the shambling and rising zombies.
const UP = new V3(0, 1, 0);
// A piece stretched from point a to point b (a bone, a limb, a torso, a tail): make(len) builds it along y, centred.
function along(a, b, make, color, jit = 0, seed = 1) {
  const A = new V3(...a), d = new V3(...b).sub(A), len = d.length(), g = part(make(len), color, { jit, seed });
  const mid = A.addScaledVector(d, 0.5), q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
  return g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new V3(1, 1, 1)));
}
const rod = (a, b, r0, r1, color) => along(a, b, (len) => new G.CylinderGeometry(r1, r0, len, 5), color);
const spotM = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, ry), new V3(s, s, s));
const moved = (ps, m) => ps.map((g) => g.applyMatrix4(m));
const headM = (p) => new THREE.Matrix4().compose(new V3(...p.head), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.headRot || [0, 0, 0]))), new V3(1, 1, 1));
const sides = (c, w, dy) => [-1, 1].map((s) => [c[0] + s * w, c[1] + dy, c[2]]);

function skullParts() { // centred on the cranium, facing +z: dark eye sockets, a nose hole and a grin
  return [
    part(new G.IcosahedronGeometry(0.16, 1), H.bone, { scale: [0.95, 1, 1.08], jit: 0.01, seed: 3 }),
    part(new G.BoxGeometry(0.17, 0.07, 0.12), H.bone, { pos: [0, -0.13, 0.05], jit: 0.01 }),
    ...[-1, 1].map((s) => part(new G.BoxGeometry(0.052, 0.062, 0.03), H.socket, { pos: [s * 0.05, 0, 0.155], rot: [0, s * 0.3, s * 0.15] })),
    part(new G.BoxGeometry(0.03, 0.04, 0.04), H.socket, { pos: [0, -0.06, 0.16] }),
    part(new G.BoxGeometry(0.12, 0.012, 0.03), H.socket, { pos: [0, -0.12, 0.11] }),
  ];
}
// arm: [elbow, hand] from the shoulder sh (a missing arm is built on its own, e.g. the waving one)
const boneArm = (sh, [el, ha]) => [rod(sh, el, 0.026, 0.022, H.bone), rod(el, ha, 0.022, 0.018, H.bone),
  part(new G.IcosahedronGeometry(0.034, 0), H.bone, { pos: el }), part(new G.IcosahedronGeometry(0.045, 0), H.bone, { pos: ha, scale: [1, 1.3, 0.6] })];
function skeletonParts(p) {
  const { hip, chest, head } = p, sh = sides(chest, 0.19, -0.03), hj = sides(hip, 0.1, -0.03);
  const ps = [rod(hip, chest, 0.03, 0.026, H.bone), rod(chest, [head[0], head[1] - 0.15, head[2]], 0.022, 0.02, H.bone), rod(sh[0], sh[1], 0.024, 0.024, H.bone),
    part(new G.BoxGeometry(0.28, 0.1, 0.13), H.bone, { pos: hip, jit: 0.01 }), ...moved(skullParts(), headM(p))];
  // the rib cage: three hoops down from the chest, smaller toward the waist
  for (let k = 0; k < 3; k++) { const t = 0.15 + k * 0.18; ps.push(part(new G.TorusGeometry(0.15 - k * 0.015, 0.022, 3, 8), H.bone, { pos: chest.map((v, i) => v + (hip[i] - v) * t), rot: [Math.PI / 2, 0, 0], scale: [1, 0.72, 1] })); }
  p.arms.forEach((a, i) => { if (a) ps.push(...boneArm(sh[i], a)); });
  p.legs.forEach(([kn, ft], i) => ps.push(rod(hj[i], kn, 0.032, 0.028, H.bone), rod(kn, ft, 0.028, 0.022, H.bone), part(new G.IcosahedronGeometry(0.04, 0), H.bone, { pos: kn }),
    part(new G.BoxGeometry(0.08, 0.04, 0.16), H.bone, { pos: [ft[0], ft[1] - 0.01, ft[2] + 0.05] })));
  return ps;
}

function zombieParts(p, seed = 1) { // grey-green skin, a torn shirt and trousers in muted colours; p.legs null = still in the ground
  const { hip, chest, head } = p, shirt = p.shirt ?? H.rag, rr = rng(seed), sh = sides(chest, 0.24, -0.05), hj = sides(hip, 0.12, -0.05);
  const ps = [along(hip, chest, (len) => new G.BoxGeometry(0.46, len + 0.14, 0.26), shirt, 0.03, seed),
    part(new G.BoxGeometry(0.13, 0.12, 0.02), H.ragBrown, { pos: chest.map((v, i) => (v + hip[i]) / 2 + [0.1, 0.06, 0.13][i]), rot: [0, 0, 0.3] }),
    rod(chest, [head[0], head[1] - 0.15, head[2]], 0.06, 0.055, H.rot),
    ...moved([part(new G.IcosahedronGeometry(0.19, 1), H.rot, { scale: [0.95, 1.08, 1], jit: 0.02, seed }),
      part(new G.BoxGeometry(0.07, 0.05, 0.04), H.socket, { pos: [-0.07, 0.03, 0.17], rot: [0, 0, -0.2] }), part(new G.BoxGeometry(0.06, 0.06, 0.04), H.socket, { pos: [0.07, 0.02, 0.17] }),
      part(new G.BoxGeometry(0.12, 0.04, 0.04), H.socket, { pos: [0.01, -0.09, 0.165], rot: [0, 0, 0.15] }),
      ...[-0.08, 0.02, 0.1].map((x, k) => part(new G.BoxGeometry(0.07, 0.06, 0.07), H.barkDark, { pos: [x, 0.19, -0.02 - k * 0.03], rot: [0, k, 0.3 * (k - 1)] }))], headM(p)),
  ];
  // the shirt's torn hem: ragged points hanging below it
  for (let k = 0; k < 4; k++) ps.push(part(new G.ConeGeometry(0.05, 0.14 + rr() * 0.06, 4), shirt, { pos: [hip[0] - 0.17 + k * 0.11, hip[1] - 0.12, hip[2] + 0.1], rot: [Math.PI, k, 0] }));
  p.arms.forEach(([el, ha], i) => ps.push(rod(sh[i], el, 0.075, 0.07, shirt), part(new G.ConeGeometry(0.05, 0.12, 4), shirt, { pos: [el[0], el[1] - 0.06, el[2]], rot: [Math.PI, 0, 0] }),
    rod(el, ha, 0.055, 0.05, H.rot), part(new G.IcosahedronGeometry(0.075, 0), H.rot, { pos: ha, scale: [1, 0.7, 1.2] })));
  if (p.legs) p.legs.forEach(([kn, ft], i) => ps.push(rod(hj[i], kn, 0.09, 0.085, H.trousers), rod(kn, [ft[0], ft[1] + 0.08, ft[2]], i ? 0.085 : 0.06, i ? 0.075 : 0.05, i ? H.trousers : H.rot),
    part(new G.BoxGeometry(0.12, 0.08, 0.22), i ? H.barkDark : H.rot, { pos: [ft[0], ft[1] + 0.04, ft[2] + 0.05], jit: 0.01 })));
  return ps;
}

// A black cat facing +z on y=0, about 0.4 tall: sitting, or standing with its back arched. Its tail (catTailGeo) and its eyes
// (catEyeParts, drawn unlit like the jack-o'-lantern faces) are separate, so the tail can flick and the eyes catch the dusk.
function catParts(arched) {
  if (!arched) return [
    part(new G.IcosahedronGeometry(0.13, 1), H.cat, { pos: [0, 0.12, -0.03], scale: [0.95, 1, 1.15], jit: 0.01, seed: 2 }),
    part(new G.IcosahedronGeometry(0.09, 1), H.cat, { pos: [0, 0.24, 0.05], scale: [0.9, 1.2, 0.9] }),
    part(new G.IcosahedronGeometry(0.09, 1), H.cat, { pos: [0, 0.36, 0.08], scale: [1.12, 0.92, 0.95] }),
    ...[-1, 1].map((s) => part(new G.ConeGeometry(0.035, 0.09, 4), H.cat, { pos: [s * 0.055, 0.44, 0.07], rot: [0, 0, -s * 0.3] })),
    ...[-1, 1].map((s) => part(new G.CylinderGeometry(0.022, 0.022, 0.2, 4), H.cat, { pos: [s * 0.045, 0.1, 0.1] })),
    part(new G.BoxGeometry(0.05, 0.03, 0.03), H.catNose, { pos: [0, 0.335, 0.16] }),
  ];
  const ps = [ // arched: a half-hoop back with its fur on end, legs stiff, head low and hissing
    part(new G.TorusGeometry(0.15, 0.065, 5, 8, Math.PI), H.cat, { pos: [0, 0.13, 0], rot: [0, Math.PI / 2, 0] }),
    part(new G.IcosahedronGeometry(0.08, 1), H.cat, { pos: [0, 0.15, -0.15] }), part(new G.IcosahedronGeometry(0.075, 1), H.cat, { pos: [0, 0.17, 0.14] }),
    part(new G.IcosahedronGeometry(0.085, 1), H.cat, { pos: [0, 0.2, 0.24], scale: [1.1, 0.95, 1] }),
    ...[-1, 1].map((s) => part(new G.ConeGeometry(0.035, 0.09, 4), H.cat, { pos: [s * 0.05, 0.28, 0.22], rot: [-0.5, 0, -s * 0.4] })),
    part(new G.BoxGeometry(0.05, 0.03, 0.03), H.catNose, { pos: [0, 0.185, 0.32] }), part(new G.BoxGeometry(0.04, 0.03, 0.02), H.socket, { pos: [0, 0.155, 0.315] }),
  ];
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) ps.push(part(new G.CylinderGeometry(0.02, 0.02, 0.18, 4), H.cat, { pos: [x * 0.05, 0.09, z * 0.13] }));
  for (const a of [1.2, 1.57, 1.94]) ps.push(part(new G.ConeGeometry(0.03, 0.08, 4), H.cat, { pos: [0, 0.13 + 0.2 * Math.sin(a), 0.2 * Math.cos(a)], rot: [Math.PI / 2 - a, 0, 0] }));
  return ps;
}
const catEyeParts = (arched) => [-1, 1].map((s) => part(new G.BoxGeometry(0.045, 0.024, 0.02), H.catEye, arched ? { pos: [s * 0.035, 0.215, 0.32], rot: [0, 0, -s * 0.25] } : { pos: [s * 0.037, 0.37, 0.165], rot: [0, 0, -s * 0.25] }));
// the tail, from its root at the origin: up and hooked over (sitting), or straight up and bushy (arched)
const CAT_TAIL = { sit: [0, 0.04, -0.16], arched: [0, 0.16, -0.2] };
const catTailGeo = (arched) => build(arched ? [rod([0, 0, 0], [0, 0.18, -0.04], 0.03, 0.028, H.cat), rod([0, 0.18, -0.04], [0, 0.32, -0.02], 0.028, 0.02, H.cat)]
  : [rod([0, 0, 0], [0.02, 0.14, -0.07], 0.022, 0.02, H.cat), rod([0.02, 0.14, -0.07], [0, 0.3, -0.06], 0.02, 0.018, H.cat), rod([0, 0.3, -0.06], [-0.05, 0.36, 0], 0.018, 0.014, H.cat)]);

function webGeo() { // a corner cobweb, from the corner at the origin out into +x/-y: four threads with three sagging rounds
  const ps = [], th = (a, b) => along(a, b, (len) => new G.BoxGeometry(0.012, len, 0.012), H.web), ang = [0, 1, 2, 3].map((k) => -Math.PI / 2 + (k * Math.PI) / 6);
  ang.forEach((a) => ps.push(th([0, 0, 0], [Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0])));
  for (const rad of [0.18, 0.32, 0.46]) for (let k = 0; k < 3; k++) {
    const p = (a, r) => [Math.cos(a) * r, Math.sin(a) * r, 0];
    ps.push(th(p(ang[k], rad), p((ang[k] + ang[k + 1]) / 2, rad * 0.86)), th(p((ang[k] + ang[k + 1]) / 2, rad * 0.86), p(ang[k + 1], rad)));
  }
  return build(ps);
}

// Where the folk stand. All of it is outside the ring wall (radius 14.4) and none of it on the south side, between the
// match camera and the field; the shots test (tests/browser/halloween-spooky-shots.mjs) checks both.
// Everything that stands still is merged into ONE mesh (plus one for the cat eyes and one for the cobweb); only the parts
// that move get their own: the three zombies (a slow sway), the waving arm and the two cat tails.
function halloweenFolk(root, out, gyM) {
  const still = [], eyes = [], spots = [], at = (parent, x, y, z, ry = 0, s = 1) => (parent ? parent.clone().multiply(spotM(x, y, z, ry, s)) : spotM(x, y, z, ry, s));
  const stallM = (i) => spotM(STALLS[i][0], 0, STALLS[i][1], STALLS[i][2]), face = (x, z) => Math.atan2(-x, -z); // face(): the turn that looks at the middle
  const anchor = (m) => { const g = new G.Group(); m.decompose(g.position, g.quaternion, g.scale); g.userData.spooky = true; root.add(g); return g; };
  const note = (kind, m) => spots.push({ kind, at: new V3().setFromMatrixPosition(m).toArray() });

  // a skeleton sitting against the middle headstone of the graveyard, head lolling
  let m = at(gyM, 0, 0, 0); note('skeleton sitting', m);
  still.push(...moved(skeletonParts({ hip: [0, 0.15, 0.3], chest: [0, 0.6, 0.2], head: [0.05, 0.84, 0.24], headRot: [0.25, 0, -0.35],
    arms: [[[-0.24, 0.36, 0.32], [-0.3, 0.1, 0.48]], [[0.24, 0.4, 0.4], [0.17, 0.34, 0.56]]], legs: [[[-0.14, 0.32, 0.56], [-0.16, 0.05, 0.78]], [[0.15, 0.12, 0.66], [0.2, 0.05, 0.98]]] }), m));
  // a skeleton peeking round the back corner of the west stall, one hand on the post
  m = stallM(0); note('skeleton peeking', at(m, -1.25, 0, -0.75));
  still.push(...moved(skeletonParts({ hip: [-1.0, 0.9, -0.75], chest: [-1.24, 1.36, -0.72], head: [-1.5, 1.56, -0.66], headRot: [0, 0.3, 0.45],
    arms: [[[-1.5, 1.15, -0.55], [-1.39, 1.32, -0.3]], [[-0.86, 1.0, -0.8], [-0.83, 0.72, -0.78]]], legs: [[[-1.12, 0.47, -0.72], [-1.15, 0.03, -0.72]], [[-0.88, 0.47, -0.78], [-0.85, 0.03, -0.8]]] }), m));
  // a cobweb in the same stall's front corner, under the awning (no ink outline: it would turn the threads into black bars)
  const web = toon(webGeo(), 0); web.applyMatrix4(at(m, -1.24, 2.3, 0.92)); web.userData.spooky = true; root.add(web);
  // a skeleton by the big oak, waving at the players (its right arm moves)
  m = spotM(-6.2, 0, -16.6, face(-6.2, -16.6) + 0.3); note('skeleton waving', m);
  still.push(...moved(skeletonParts({ hip: [0, 0.9, 0], chest: [0, 1.38, 0.02], head: [0.02, 1.62, 0.04], headRot: [0, 0, -0.15],
    arms: [[[-0.24, 1.1, 0.02], [-0.27, 0.85, 0.06]], null], legs: [[[-0.11, 0.48, 0.02], [-0.12, 0.04, 0.04]], [[0.11, 0.48, 0.02], [0.12, 0.04, 0.04]]] }), m));
  const arm = toon(build(boneArm([0, 0, 0], [[0.24, 0.18, 0.04], [0.28, 0.48, 0.08]])), 0.015); arm.position.set(0.19, 1.35, 0.02); anchor(m).add(arm);

  // two black cats: one sitting on the graveyard's left gate post, one arched on the east stall's top hay bale
  const tails = [];
  for (const [mm, arched, kind] of [[at(gyM, -1.1, 0.85, 1.0, 0, 1.3), false, 'cat on the gate post'], [at(stallM(1), -1.85, 1.0, 0.55, -Math.PI / 2, 1.3), true, 'cat on the hay']]) {
    note(kind, mm); still.push(...moved(catParts(arched), mm)); eyes.push(...moved(catEyeParts(arched), mm));
    const t = toon(catTailGeo(arched), 0.012); t.position.set(...CAT_TAIL[arched ? 'arched' : 'sit']); anchor(mm).add(t); tails.push(t);
  }

  // three zombies: two shambling in from the north between the oak and the cottages, one climbing out of the ground by the graveyard
  const shamble = { hip: [0, 0.95, 0], chest: [0.03, 1.4, 0.12], head: [0.08, 1.63, 0.22], headRot: [0.2, 0, -0.3],
    arms: [[[-0.22, 1.3, 0.34], [-0.2, 1.24, 0.64]], [[0.22, 1.34, 0.3], [0.21, 1.33, 0.6]]], legs: [[[-0.12, 0.5, 0.12], [-0.13, 0, 0.2]], [[0.13, 0.5, -0.08], [0.15, 0.02, -0.22]]] };
  const zombies = [];
  for (const [x, z, turn, shirt] of [[3.5, -17.2, -0.15, H.rag], [10.4, -14.9, 0.2, H.ragBrown]]) {
    m = spotM(x, 0, z, face(x, z) + turn); note('zombie', m);
    const zm = toon(build(zombieParts({ ...shamble, shirt }, zombies.length + 4)), 0.025); anchor(m).add(zm); zombies.push(zm);
  }
  m = at(gyM, -1.6, 0, 2.5, 0.3); note('zombie rising', m);
  const rising = toon(build([...zombieParts({ hip: [0, -0.2, 0], chest: [0, 0.3, 0.06], head: [0, 0.56, 0.12], headRot: [-0.15, 0, 0.2], shirt: H.ragRed, legs: null,
    arms: [[[-0.3, 0.45, 0.25], [-0.32, 0.72, 0.45]], [[0.28, 0.34, 0.3], [0.36, 0.12, 0.5]]] }, 9),
    part(new G.CylinderGeometry(0.5, 0.68, 0.16, 8), H.earth, { pos: [0, 0.06, 0], jit: 0.05, seed: 9 }),
    ...[[0.55, 0.3], [-0.45, 0.42], [0.1, -0.6]].map(([x, z], k) => part(new G.IcosahedronGeometry(0.1, 0), H.earth, { pos: [x, 0.07, z], jit: 0.03, seed: k }))]), 0.025);
  anchor(m).add(rising); zombies.push(rising);

  const folk = toon(build(still), 0.015); folk.userData.spooky = true; folk.userData.spots = spots; root.add(folk);
  const eyeMesh = new THREE.Mesh(build(eyes), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })); eyeMesh.userData.spooky = true; root.add(eyeMesh);
  out.tick.push((t) => {
    zombies.forEach((z, i) => { z.rotation.z = Math.sin(t * 1.1 + i * 2) * 0.06; z.rotation.x = Math.sin(t * 2.2 + i) * 0.03; });
    rising.position.y = Math.sin(t * 0.9) * 0.04;
    arm.rotation.z = -0.15 + Math.sin(t * 5) * 0.3;
    tails.forEach((tl, i) => { tl.rotation.z = Math.sin(t * (i ? 1.3 : 2.3) + i) * (i ? 0.12 : 0.3); });
  });
}

function halloweenProps(root, r, out) {
  const GY = [18.5, -9]; // the little graveyard, outside the ring on the east side
  // bare trees in the same ring as the Christmas forest, clear of the cottages and the graveyard
  const trees = [];
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + r() * 0.1, d = 19 + r() * 14, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if ((Math.sin(a) < -0.55 && d < 26) || Math.hypot(x - GY[0], z - GY[1]) < 4.5) continue;
    trees.push([x, z, 0.9 + r() * 0.8, r() * 6]);
  }
  [bareTreeGeo(9).geo, bareTreeGeo(14, 1, 6).geo].forEach((tg, k) => {
    const mine = trees.filter((_, i) => i % 2 === k), ti = toonInstanced(tg, mine.length, 0.035);
    mine.forEach(([x, z, s, ry], i) => setInstance(ti, i, new V3(x, 0, z), ry, s * 1.15)); root.add(ti);
  });

  // cottages: the same houses with slate roofs instead of snow, and a jack-o'-lantern on each doorstep
  const lit = new THREE.MeshBasicMaterial({ vertexColors: true }), body = pumpkinGeo(6), face = jackFaceGeo(), faceLit = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const glows = [];
  COTTAGES.forEach(([x, z, ry], i) => {
    const c = cottage(i + 3, { w: 3.4 + (i % 2) * 0.8, roof: H.roof });
    const g = new G.Group(); g.add(toon(c.body, 0.04)); g.add(new THREE.Mesh(c.windows, lit));
    const j = jack(body, face, faceLit, 0.8); j.position.set(0.75, 0.35, 1.2); g.add(j);
    const gl = glow(0xff8f3a, 0.8, 0.28); gl.position.set(0.75, 0.6, 1.3); g.add(gl); glows.push(gl);
    g.position.set(x, 0, z); g.rotation.y = ry; g.scale.setScalar(1.3); root.add(g);
  });

  // harvest stalls (orange-and-black awnings, pumpkins, apples, corn, hay) + scarecrows on the rim
  STALLS.forEach(([x, z, ry], i) => {
    const m = toon(stallGeo(i * 5, [H.pumpkin, H.bat], harvestGoods(i * 5)), 0.035); m.position.set(x, 0, z); m.rotation.y = ry; root.add(m);
  });
  RIM.forEach(([x, z], i) => { const m = toon(scarecrowGeo(i + 1), 0.035); m.position.set(x, 0, z); m.lookAt(0, 0, 0); root.add(m); });

  const gy = toon(graveyardGeo(5), 0.03); gy.position.set(GY[0], 0, GY[1]); gy.lookAt(0, 0, 0); root.add(gy);
  // skeletons, black cats, zombies (and a cobweb) around the plaza; some sit in the graveyard, so they take its spot
  gy.updateMatrix(); halloweenFolk(root, out, gy.matrix);

  // pumpkins piled by the stalls, the graveyard and the doors (never on the ring: pushed out past its wall)
  const pr = rng(31), spots = [];
  for (const [ax, az, n] of [...STALLS.map(([x, z]) => [x, z, 5]), [GY[0], GY[1], 3], ...COTTAGES.map(([x, z]) => [x * 0.82, z * 0.82, 2])])
    for (let k = 0; k < n; k++) { let x = ax + (pr() - 0.5) * 3.6, z = az + (pr() - 0.5) * 3.6; const d = Math.hypot(x, z); if (d < 15.6) { x *= 15.6 / d; z *= 15.6 / d; } spots.push([x, z, 0.7 + pr() * 0.7, pr() * 6]); }
  const pi = toonInstanced(pumpkinGeo(2), spots.length, 0.025);
  spots.forEach(([x, z, s, ry], i) => setInstance(pi, i, new V3(x, 0, z), ry, s)); root.add(pi);

  // "less snow, like a real Halloween": thin old patches on the grass, a bigger one under each snowball pile
  const sr = rng(57), patches = PILES.map(([x, z]) => [x, z, 1.7, 1.3, sr() * 6]);
  for (let k = 0; k < 34; k++) { const a = sr() * 6.28, d = 2.5 + sr() * 30; patches.push([Math.cos(a) * d, Math.sin(a) * d, 0.6 + sr() * 1.2, 0.4 + sr() * 0.7, sr() * 6]); }
  const sp = toonInstanced(snowPatchGeo(3), patches.length, 0);
  patches.forEach(([x, z, sx, sz, ry], i) => setInstance(sp, i, new V3(x, 0.04, z), ry, new V3(sx, 1, sz))); root.add(sp);

  // the big tree: an old bare oak hung with orange and purple paper lanterns, bats circling it
  const oak = bareTreeGeo(21, 2.2, 7), big = toon(oak.geo, 0.05); big.position.set(-10, 0, -15); root.add(big);
  const lamps = new THREE.InstancedMesh(new G.IcosahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial(), oak.tips.length);
  oak.tips.forEach((p, i) => { setInstance(lamps, i, new V3(-10 + p.x, p.y - 0.3, -15 + p.z), 0, new V3(1, 1.3, 1)); lamps.setColorAt(i, new THREE.Color([0xff9a3a, 0xb46cff, 0xff9a3a, 0x9be35a][i % 4])); });
  root.add(lamps);
  const treeLight = new THREE.PointLight(0xff9a4a, 6, 10, 1.6); treeLight.position.set(-10, 3, -12); root.add(treeLight);
  const bats = [0, 1, 2, 3, 4].map(() => { const b = batGroup(); root.add(b); return b; });
  out.tick.push((t) => {
    bats.forEach((b, i) => {
      const a = t * (0.5 + i * 0.08) * (i % 2 ? -1 : 1) + i * 1.3, rad = 3.2 + i * 0.7;
      b.position.set(-10 + Math.cos(a) * rad, 8.2 + i * 0.5 + Math.sin(t * 1.3 + i) * 0.5, -15 + Math.sin(a) * rad);
      b.rotation.y = -a + (i % 2 ? Math.PI : 0); // facing the way it flies (odd bats circle the other way)
      const f = Math.sin(t * 13 + i * 2) * 0.7; b.userData.l.rotation.z = -f; b.userData.r.rotation.z = f;
    });
    glows.forEach((g, i) => { g.material.opacity = 0.26 + Math.sin(t * 6 + i * 1.7) * 0.04; });
  });
}

export function makeHat(scale = 1) { return toon(hatGeo({ scale }), 0.035 * scale); }

export function shadowBlob() {
  const m = new THREE.Mesh(new G.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0c0f1a, transparent: true, opacity: 0.35, depthWrite: false }));
  m.position.y = 0.04; return m;
}
