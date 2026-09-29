// Shared low-poly kit: procedural faceted models, toon shading, ink outlines.
// Every prop is built from primitives and merged into ONE geometry with vertex
// colors, so a whole tree/house/character part costs one draw call (+1 for its outline).
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js';
export { THREE };

export const C = {
  hat: 0xc92a22, hatDark: 0x8f1712, brim: 0xf3efe6, snow: 0xe6ecf5, snowShade: 0xb7c4da,
  ink: 0x0c0f1a, night: 0x141b31, nightLow: 0x33406a, aurora: 0x3fe0b5, lantern: 0xffb347,
  gold: 0xffc94a, goldDeep: 0xc98a1b, pine: 0x2f6b4a, pineDark: 0x224e37, wood: 0x6b4a2e,
  woodDark: 0x45301f, stone: 0x8a8795, stoneDark: 0x5d5a68, skin: 0xe8b894, elf: 0x3d9b5a,
  elfDark: 0x2a6e3f, coal: 0x1d1d24, carrot: 0xf07a22, plaster: 0xe3d6bd, glass: 0xffc766,
};

const V3 = THREE.Vector3;
const _col = new THREE.Color();

function hash(k, n) {
  let t = (k + Math.imul(n, 0x6d2b79f5)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
}

// Offsets keyed by position, so vertices shared between faces move together (no cracks).
function jitter(g, amt, seed) {
  const p = g.attributes.position, v = new V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = (Math.round(v.x * 997) * 73856093) ^ (Math.round(v.y * 997) * 19349663) ^ (Math.round(v.z * 997) * 83492791) ^ (seed * 2654435761);
    p.setXYZ(i, v.x + hash(k, 1) * amt, v.y + hash(k, 2) * amt, v.z + hash(k, 3) * amt);
  }
}

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// One colored, transformed, faceted piece of a model.
export function part(geo, color, o = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const s = o.scale ?? 1;
  const m = new THREE.Matrix4().compose(
    new V3(...(o.pos || [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot || [0, 0, 0]))),
    Array.isArray(s) ? new V3(...s) : new V3(s, s, s));
  g.applyMatrix4(m);
  if (o.jit) jitter(g, o.jit, o.seed || 7);
  _col.set(color);
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = _col.r; c[i * 3 + 1] = _col.g; c[i * 3 + 2] = _col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

export function build(parts) {
  let n = 0; for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) { pos.set(p.attributes.position.array, o); col.set(p.attributes.color.array, o); o += p.attributes.position.array.length; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals(); // non-indexed => per-face normals => faceted look
  // Outline hull needs smooth normals or it splits open at every hard corner.
  const acc = new Map(), nr = g.attributes.normal.array, hn = new Float32Array(n * 3);
  const key = (i) => `${Math.round(pos[i * 3] * 500)},${Math.round(pos[i * 3 + 1] * 500)},${Math.round(pos[i * 3 + 2] * 500)}`;
  for (let i = 0; i < n; i++) { const k = key(i); const a = acc.get(k) || [0, 0, 0]; a[0] += nr[i * 3]; a[1] += nr[i * 3 + 1]; a[2] += nr[i * 3 + 2]; acc.set(k, a); }
  for (let i = 0; i < n; i++) { const a = acc.get(key(i)); const l = Math.hypot(...a) || 1; hn[i * 3] = a[0] / l; hn[i * 3 + 1] = a[1] / l; hn[i * 3 + 2] = a[2] / l; }
  g.setAttribute('hullNormal', new THREE.BufferAttribute(hn, 3));
  g.computeBoundingSphere();
  return g;
}

const grad = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
export const TOON = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad });

const hullCache = new Map();
function hullMat(t) {
  if (hullCache.has(t)) return hullCache.get(t);
  const m = new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uT = { value: t };
    s.vertexShader = 'attribute vec3 hullNormal;\nuniform float uT;\n' +
      s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += hullNormal * uT;');
  };
  m.customProgramCacheKey = () => 'hull' + t;
  hullCache.set(t, m); return m;
}

export function toon(geo, outline = 0.035) {
  const m = new THREE.Mesh(geo, TOON);
  if (outline) m.add(new THREE.Mesh(geo, hullMat(outline)));
  return m;
}

export function toonInstanced(geo, count, outline = 0.035) {
  const m = new THREE.InstancedMesh(geo, TOON, count);
  m.frustumCulled = false;
  if (outline) { const h = new THREE.InstancedMesh(geo, hullMat(outline), count); h.instanceMatrix = m.instanceMatrix; h.frustumCulled = false; m.add(h); }
  return m;
}

export function setInstance(im, i, pos, rotY = 0, scale = 1) {
  const q = new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), rotY);
  const s = typeof scale === 'number' ? new V3(scale, scale, scale) : scale;
  im.setMatrixAt(i, new THREE.Matrix4().compose(pos, q, s));
}

// ---------- textures for glow, snow, sky
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glowTex = canvasTex(64, 64, (x, w) => {
  const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, w);
});
const dotTex = canvasTex(32, 32, (x, w) => {
  const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, w);
});

export function glow(color, size, opacity = 0.55) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  s.scale.set(size, size, 1); return s;
}

export function glowMat(color) { return new THREE.MeshBasicMaterial({ color }); }

export function skyTexture(top = '#0b1024', mid = '#1c2548', bottom = '#3b3f6a') {
  return canvasTex(4, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top); g.addColorStop(0.6, mid); g.addColorStop(1, bottom);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
}

export function stars(count = 500, radius = 260, seed = 3) {
  const r = rng(seed), p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const th = r() * Math.PI * 2, ph = Math.acos(0.15 + r() * 0.85);
    p[i * 3] = Math.sin(ph) * Math.cos(th) * radius; p[i * 3 + 1] = Math.cos(ph) * radius; p[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * radius;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, map: dotTex, transparent: true, depthWrite: false, fog: false, color: 0xdfe7ff }));
}

export class Snow {
  constructor(count, size = [40, 22, 40]) {
    this.size = size; const r = rng(11), p = new Float32Array(count * 3);
    this.drift = new Float32Array(count);
    for (let i = 0; i < count; i++) { p[i * 3] = (r() - 0.5) * size[0]; p[i * 3 + 1] = r() * size[1]; p[i * 3 + 2] = (r() - 0.5) * size[2]; this.drift[i] = r() * 6.28; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.16, map: dotTex, transparent: true, depthWrite: false, color: 0xffffff, opacity: 0.9 }));
    this.points.frustumCulled = false;
  }
  update(dt, t, center, wind = 0) {
    const p = this.points.geometry.attributes.position, a = p.array, [sx, sy, sz] = this.size;
    for (let i = 0; i < p.count; i++) {
      a[i * 3 + 1] -= dt * 1.4;
      a[i * 3] += dt * (Math.sin(t * 0.8 + this.drift[i]) * 0.4 + wind);
      if (a[i * 3 + 1] < 0) a[i * 3 + 1] += sy;
      const dx = a[i * 3] - center.x, dz = a[i * 3 + 2] - center.z;
      if (dx > sx / 2) a[i * 3] -= sx; else if (dx < -sx / 2) a[i * 3] += sx;
      if (dz > sz / 2) a[i * 3 + 2] -= sz; else if (dz < -sz / 2) a[i * 3 + 2] += sz;
    }
    p.needsUpdate = true;
  }
}

export function aurora(width = 220, height = 34) {
  const g = new THREE.PlaneGeometry(width, height, 80, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 0.03) * 18 + Math.sin(x * 0.011) * 10); }
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uT: { value: 0 }, uA: { value: new THREE.Color(0x2fe0a8) }, uB: { value: new THREE.Color(0x7b5cff) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec2 vUv; uniform float uT; uniform vec3 uA; uniform vec3 uB;
      void main(){
        float curtain = 0.55 + 0.45*sin(vUv.x*38. + uT*0.7 + sin(vUv.x*9. - uT*0.4)*2.);
        float fade = smoothstep(0.,0.35,vUv.y) * (1.-smoothstep(0.45,1.,vUv.y));
        float edge = smoothstep(0.,0.08,vUv.x)*smoothstep(1.,0.92,vUv.x);
        vec3 col = mix(uA, uB, smoothstep(0.35,1.,vUv.y));
        gl_FragColor = vec4(col, curtain*fade*edge*0.42);
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.userData.tick = (t) => { m.uniforms.uT.value = t; };
  return mesh;
}

export function lights(scene, o = {}) {
  scene.add(new THREE.HemisphereLight(o.sky ?? 0x8fa6e8, o.ground ?? 0x2b2f4a, o.hemi ?? 1.5));
  const moon = new THREE.DirectionalLight(o.moon ?? 0xcfdcff, o.moonI ?? 1.6);
  moon.position.set(-20, 30, 12); scene.add(moon);
  return moon;
}

// Burst of little faceted chunks (snow puffs, sparkles).
export class Burst {
  constructor(max = 240) {
    this.max = max; this.items = [];
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), max);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  }
  spawn(pos, n, color = 0xffffff, speed = 4, up = 3) {
    _col.set(color);
    for (let i = 0; i < n && this.items.length < this.max; i++) {
      const a = Math.random() * 6.283, s = speed * (0.4 + Math.random() * 0.6);
      this.items.push({ p: pos.clone(), v: new V3(Math.cos(a) * s, up * (0.5 + Math.random()), Math.sin(a) * s), life: 0.5 + Math.random() * 0.5, age: 0, c: _col.clone() });
    }
  }
  update(dt) {
    const m = new THREE.Matrix4();
    this.items = this.items.filter((it) => (it.age += dt) < it.life);
    this.items.forEach((it, i) => {
      it.v.y -= 12 * dt; it.p.addScaledVector(it.v, dt);
      if (it.p.y < 0.05) { it.p.y = 0.05; it.v.multiplyScalar(0.5); }
      const s = 1 - it.age / it.life;
      m.makeScale(s, s, s).setPosition(it.p); this.mesh.setMatrixAt(i, m); this.mesh.setColorAt(i, it.c);
    });
    this.mesh.count = this.items.length;
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---------- prop geometry (all return merged geometries)
const G = THREE;

// A drooping, faceted Santa hat cone. Tip ends up around (0.55, 0.87, 0) above the brim.
function hatCone() {
  const g = new G.CylinderGeometry(0.035, 0.5, 1.1, 7, 5);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + 0.55) / 1.1;
    p.setX(i, p.getX(i) + 0.55 * t * t);
    p.setY(i, p.getY(i) - 0.32 * t * t * t);
  }
  return g;
}

export function hatParts(o = {}) {
  const s = o.scale ?? 1, y = o.y ?? 0, rotY = o.rotY ?? 0, seed = o.seed ?? 5;
  const k = (v) => v * s;
  return [
    part(new G.TorusGeometry(0.46, 0.17, 5, 9), C.brim, { pos: [0, y + k(0.05), 0], rot: [Math.PI / 2, 0, rotY], scale: s, jit: k(0.05), seed }),
    part(hatCone(), C.hat, { pos: [0, y + k(0.62), 0], rot: [0, rotY, 0], scale: s, jit: k(0.06), seed: seed + 1 }),
    part(new G.IcosahedronGeometry(0.2, 0), C.brim, { pos: [k(0.62 * Math.cos(rotY)), y + k(0.86), k(-0.62 * Math.sin(rotY))], scale: s, jit: k(0.03), seed: seed + 2 }),
  ];
}
export function hatGeo(o) { return build(hatParts(o)); }

export function pineGeo(seed = 1, h = 1) {
  const ps = [part(new G.CylinderGeometry(0.16, 0.22, 0.9, 6), C.woodDark, { pos: [0, 0.45, 0], jit: 0.03, seed })];
  for (let i = 0; i < 3; i++) {
    const r = 1.35 - i * 0.36, y = 0.75 + i * 0.78;
    ps.push(part(new G.ConeGeometry(r, 1.35, 7), i % 2 ? C.pineDark : C.pine, { pos: [0, y + 0.675, 0], rot: [0, i * 0.5, 0], jit: 0.09, seed: seed + i * 3 }));
    ps.push(part(new G.ConeGeometry(r * 0.64, 0.72, 7), C.snow, { pos: [0, y + 0.95, 0], rot: [0, i * 0.5, 0], jit: 0.05, seed: seed + i * 3 + 1 }));
  }
  return build(ps.map((g) => { g.scale(h, h, h); return g; }));
}

export function prismGeo(len, w, h) {
  const g = new G.CylinderGeometry(1, 1, 1, 3);
  g.rotateZ(Math.PI / 2); g.rotateX(-Math.PI / 2); g.translate(0, 0.5, 0);
  g.scale(len, h / 1.5, w / 1.732); return g;
}

// Timber cottage. Windows are returned separately so they can be switched on/off.
export function cottage(seed = 1, o = {}) {
  const w = o.w ?? 3.2, d = o.d ?? 2.6, h = o.h ?? 2.1, r = rng(seed);
  const wall = o.wall ?? (r() < 0.5 ? C.plaster : 0xd9c7a6);
  const ps = [
    part(new G.BoxGeometry(w + 0.3, 0.35, d + 0.3), C.stoneDark, { pos: [0, 0.17, 0], jit: 0.05, seed }),
    part(new G.BoxGeometry(w, h, d), wall, { pos: [0, h / 2 + 0.2, 0], jit: 0.04, seed: seed + 1 }),
    part(prismGeo(w + 0.5, d + 0.7, 1.5), C.woodDark, { pos: [0, h + 0.2, 0], jit: 0.04, seed: seed + 2 }),
    part(prismGeo(w + 0.6, d + 0.55, 1.4), C.snow, { pos: [0, h + 0.33, 0], jit: 0.06, seed: seed + 3 }),
    part(new G.BoxGeometry(0.7, 1.3, 0.12), C.wood, { pos: [0, 0.85, d / 2 + 0.04], jit: 0.02, seed: seed + 4 }),
  ];
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) ps.push(part(new G.BoxGeometry(0.16, h, 0.16), C.woodDark, { pos: [x, h / 2 + 0.2, d / 2 + 0.02] }));
  ps.push(part(new G.BoxGeometry(w, 0.14, 0.16), C.woodDark, { pos: [0, h * 0.62, d / 2 + 0.03] }));
  const cx = w * 0.28, cy = h + 1.35;
  ps.push(part(new G.BoxGeometry(0.55, 1.3, 0.55), C.stone, { pos: [cx, cy, 0.1], jit: 0.04, seed: seed + 5 }));
  ps.push(part(new G.BoxGeometry(0.7, 0.18, 0.7), C.snow, { pos: [cx, cy + 0.7, 0.1], jit: 0.05, seed: seed + 6 }));
  const win = [];
  for (const x of [-w * 0.3, w * 0.3]) win.push(part(new G.BoxGeometry(0.5, 0.55, 0.08), C.glass, { pos: [x, h * 0.45 + 0.3, d / 2 + 0.03] }));
  win.push(part(new G.BoxGeometry(0.08, 0.5, 0.45), C.glass, { pos: [w / 2 + 0.03, h * 0.5 + 0.3, 0] }));
  return { body: build(ps), windows: build(win), chimney: new V3(cx, cy + 0.8, 0.1) };
}

export function snowmanGeo(seed = 1) {
  return build([
    part(new G.IcosahedronGeometry(0.7, 1), C.snow, { pos: [0, 0.6, 0], jit: 0.08, seed }),
    part(new G.IcosahedronGeometry(0.52, 1), C.snow, { pos: [0, 1.45, 0], jit: 0.06, seed: seed + 1 }),
    part(new G.IcosahedronGeometry(0.38, 1), C.snow, { pos: [0, 2.1, 0], jit: 0.05, seed: seed + 2 }),
    part(new G.TorusGeometry(0.34, 0.09, 4, 8), C.hat, { pos: [0, 1.83, 0], rot: [Math.PI / 2, 0, 0], jit: 0.03 }),
    part(new G.ConeGeometry(0.07, 0.4, 5), C.carrot, { pos: [0, 2.1, 0.5], rot: [Math.PI / 2, 0, 0] }),
    part(new G.CylinderGeometry(0.3, 0.3, 0.06, 7), C.coal, { pos: [0, 2.4, 0] }),
    part(new G.CylinderGeometry(0.2, 0.22, 0.4, 7), C.coal, { pos: [0, 2.62, 0] }),
    part(new G.BoxGeometry(0.07, 0.07, 0.05), C.coal, { pos: [-0.13, 2.2, 0.35] }),
    part(new G.BoxGeometry(0.07, 0.07, 0.05), C.coal, { pos: [0.13, 2.2, 0.35] }),
    part(new G.CylinderGeometry(0.03, 0.04, 0.9, 4), C.woodDark, { pos: [0.75, 1.6, 0], rot: [0, 0, -1.0] }),
    part(new G.CylinderGeometry(0.03, 0.04, 0.9, 4), C.woodDark, { pos: [-0.75, 1.6, 0], rot: [0, 0, 1.0] }),
  ]);
}

export function giftGeo(color, ribbon = C.gold, s = 0.5) {
  return build([
    part(new G.BoxGeometry(s, s * 0.85, s), color, { pos: [0, s * 0.425, 0], jit: s * 0.04 }),
    part(new G.BoxGeometry(s + 0.02, s * 0.87, s * 0.18), ribbon, { pos: [0, s * 0.425, 0] }),
    part(new G.BoxGeometry(s * 0.18, s * 0.87, s + 0.02), ribbon, { pos: [0, s * 0.425, 0] }),
    part(new G.TetrahedronGeometry(s * 0.2), ribbon, { pos: [-s * 0.12, s * 0.95, 0], rot: [0.4, 0, 0.6] }),
    part(new G.TetrahedronGeometry(s * 0.2), ribbon, { pos: [s * 0.12, s * 0.95, 0], rot: [0.4, 0, -0.6] }),
  ]);
}

// Blocky character with separate limbs for a walk cycle.
export function character(o = {}) {
  const shirt = o.shirt ?? C.hat, pants = o.pants ?? 0x34405e, skin = o.skin ?? C.skin, seed = o.seed ?? 1;
  const g = new G.Group();
  const bodyParts = [
    part(new G.BoxGeometry(0.62, 0.72, 0.38), shirt, { pos: [0, 1.2, 0], jit: 0.03, seed }),
    part(new G.BoxGeometry(0.64, 0.1, 0.4), C.woodDark, { pos: [0, 0.9, 0] }),
    part(new G.BoxGeometry(0.12, 0.1, 0.05), C.gold, { pos: [0, 0.9, 0.21] }),
    part(new G.IcosahedronGeometry(0.28, 0), skin, { pos: [0, 1.82, 0], scale: [1, 1.08, 1], jit: 0.03, seed: seed + 2 }),
    part(new G.BoxGeometry(0.06, 0.08, 0.04), C.ink, { pos: [-0.1, 1.86, 0.25] }),
    part(new G.BoxGeometry(0.06, 0.08, 0.04), C.ink, { pos: [0.1, 1.86, 0.25] }),
  ];
  if (o.ears) bodyParts.push(
    part(new G.ConeGeometry(0.08, 0.34, 4), skin, { pos: [-0.3, 1.9, 0], rot: [0, 0, 1.25] }),
    part(new G.ConeGeometry(0.08, 0.34, 4), skin, { pos: [0.3, 1.9, 0], rot: [0, 0, -1.25] }));
  if (o.cap) bodyParts.push(
    part(new G.ConeGeometry(0.3, 0.7, 6), o.cap, { pos: [0, 2.3, -0.05], rot: [-0.35, 0, 0], jit: 0.03 }),
    part(new G.TorusGeometry(0.27, 0.07, 4, 8), C.brim, { pos: [0, 2.0, 0], rot: [Math.PI / 2, 0, 0] }),
    part(new G.IcosahedronGeometry(0.09, 0), C.gold, { pos: [0, 2.6, -0.28] }));
  const body = toon(build(bodyParts), 0.03); g.add(body);
  const limb = (w, h, color, x, y, extra = []) => {
    const geo = build([part(new G.BoxGeometry(w, h, w), color, { pos: [0, -h / 2, 0], jit: 0.02 }), ...extra]);
    const m = toon(geo, 0.028); m.position.set(x, y, 0); g.add(m); return m;
  };
  const armL = limb(0.2, 0.66, shirt, -0.42, 1.52, [part(new G.BoxGeometry(0.2, 0.14, 0.2), skin, { pos: [0, -0.72, 0] })]);
  const armR = limb(0.2, 0.66, shirt, 0.42, 1.52, [part(new G.BoxGeometry(0.2, 0.14, 0.2), skin, { pos: [0, -0.72, 0] })]);
  const legL = limb(0.24, 0.84, pants, -0.16, 0.86, [part(new G.BoxGeometry(0.26, 0.14, 0.34), C.woodDark, { pos: [0, -0.8, 0.05] })]);
  const legR = limb(0.24, 0.84, pants, 0.16, 0.86, [part(new G.BoxGeometry(0.26, 0.14, 0.34), C.woodDark, { pos: [0, -0.8, 0.05] })]);
  g.userData = { armL, armR, legL, legR, body, phase: Math.random() * 6 };
  return g;
}

export function animate(ch, dt, speed, throwing = 0) {
  const u = ch.userData; u.phase += dt * (4 + speed * 2.2);
  const a = Math.min(1, speed / 4) * 0.75, s = Math.sin(u.phase) * a;
  u.legL.rotation.x = s; u.legR.rotation.x = -s; u.armL.rotation.x = -s * 0.8;
  u.armR.rotation.x = throwing > 0 ? -2.6 * throwing : s * 0.8;
  u.body.position.y = Math.abs(Math.cos(u.phase)) * a * 0.08;
}

export function toScreen(v, camera, w, h) {
  const p = v.clone().project(camera);
  return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, behind: p.z > 1 };
}
