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

// Frees what a removed prop group owns (plaza themes swap at runtime). TOON and the outline materials are shared with every
// character and prop still on screen, so they are never disposed. (A material's dispose leaves its texture alone, so the
// shared glow and snow-dot textures survive; the plaza frees its own sky texture itself.)
export function disposeTree(root) {
  const shared = new Set([TOON, GEAR_GLOW, ...hullCache.values()]);
  root.traverse((o) => { o.geometry?.dispose(); for (const m of [].concat(o.material || [])) if (!shared.has(m)) m.dispose(); });
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

export function glowMat(color) { return new THREE.MeshBasicMaterial({ color, fog: false }); }

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

// Soft additive glow points, ALL in one draw call (special-snowball tracers and shimmer, Cody 2026-10-01: "make the special
// snowballs stand out with either a tracer and or shimmer"). Refilled every frame from what is on screen (begin, add…, end):
// nothing is created per frame, and 18 snowballs plus 60 falling drops cost the same single call. Sizes are world units.
export class Sparks {
  constructor(max = 1200) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.mode = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aMode', new THREE.BufferAttribute(this.mode, 1).setUsage(THREE.DynamicDrawUsage));
    // uH: half the drawing height in pixels (set on resize), so a size is the same share of the view on every screen
    this.uH = { value: 400 };
    // Premultiplied blending, so each point picks: ADDED light (a glow; alpha 0) or SOLID colour painted over (alpha = cover).
    // Added light can't show red on white snow (it turns pink, then white), so flames, ribbons and chips are solid; halos glow.
    // aMode = mode + brightness: whole part bit 1 = SOLID, bit 2 = STAR (a crisp four-point twinkle); fraction = brightness.
    const m = new THREE.ShaderMaterial({ uniforms: { uH: this.uH }, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      vertexShader: 'attribute vec3 aCol; attribute float aSize; attribute float aMode; uniform float uH; varying vec3 vCol; varying float vMode;\nvoid main(){ vCol = aCol; vMode = aMode; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * projectionMatrix[1][1] * uH / max(0.1, -mv.z); }',
      fragmentShader: 'varying vec3 vCol; varying float vMode;\nvoid main(){ vec2 q = abs(gl_PointCoord - .5) * 2.; float d = max(0., 1. - length(q)), m = d * d, md = floor(vMode), k = fract(vMode);\n' +
        '  if (md >= 2.) m = max(m * m * 1.5, max(0., 1. - q.x * 7.) * (1. - q.y) + max(0., 1. - q.y * 7.) * (1. - q.x));\n' +
        '  if (m <= 0.01) discard; float solid = mod(md, 2.); vec3 c = linearToOutputTexel(vec4(vCol, 1.)).rgb; m = min(1., m * (1. + solid)) * k;\n' +
        '  gl_FragColor = vec4(c * m, solid * m); }' });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; g.setDrawRange(0, 0);
  }
  begin() { this.n = 0; }
  // c: a THREE.Color made once (never per frame); k: brightness 0..1; mode: Sparks.SOLID | Sparks.STAR (0 = a soft glow)
  add(x, y, z, size, c, k = 1, mode = 0) {
    if (this.n >= this.max || k <= 0.01 || size <= 0) return; const i = this.n++, j = i * 3;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z; this.col[j] = c.r; this.col[j + 1] = c.g; this.col[j + 2] = c.b; this.size[i] = size; this.mode[i] = mode + Math.min(k, 0.999);
  }
  end() {
    const g = this.points.geometry; g.setDrawRange(0, this.n);
    for (const a of ['position', 'aCol', 'aSize', 'aMode']) { const at = g.attributes[a]; at.clearUpdateRanges(); at.addUpdateRange(0, Math.max(1, this.n) * at.itemSize); at.needsUpdate = true; }
  }
}
Sparks.SOLID = 1; Sparks.STAR = 2;

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
    // o.roof: what covers the roof and chimney top (snow by default; plaza themes)
    part(prismGeo(w + 0.6, d + 0.55, 1.4), o.roof ?? C.snow, { pos: [0, h + 0.33, 0], jit: 0.06, seed: seed + 3 }),
    part(new G.BoxGeometry(0.7, 1.3, 0.12), C.wood, { pos: [0, 0.85, d / 2 + 0.04], jit: 0.02, seed: seed + 4 }),
  ];
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) ps.push(part(new G.BoxGeometry(0.16, h, 0.16), C.woodDark, { pos: [x, h / 2 + 0.2, d / 2 + 0.02] }));
  ps.push(part(new G.BoxGeometry(w, 0.14, 0.16), C.woodDark, { pos: [0, h * 0.62, d / 2 + 0.03] }));
  const cx = w * 0.28, cy = h + 1.35;
  ps.push(part(new G.BoxGeometry(0.55, 1.3, 0.55), C.stone, { pos: [cx, cy, 0.1], jit: 0.04, seed: seed + 5 }));
  ps.push(part(new G.BoxGeometry(0.7, 0.18, 0.7), o.roof ?? C.snow, { pos: [cx, cy + 0.7, 0.1], jit: 0.05, seed: seed + 6 }));
  const win = [];
  for (const x of [-w * 0.3, w * 0.3]) win.push(part(new G.BoxGeometry(0.5, 0.55, 0.08), C.glass, { pos: [x, h * 0.45 + 0.3, d / 2 + 0.03] }));
  win.push(part(new G.BoxGeometry(0.08, 0.5, 0.45), C.glass, { pos: [w / 2 + 0.03, h * 0.5 + 0.3, 0] }));
  return { body: build(ps), windows: build(win), chimney: new V3(cx, cy + 0.8, 0.1), ridge: h + 0.33 + 1.4 };
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

// Built facing +z, standing on y=0.
export function reindeerGeo() {
  const b = 0x8a5a36, d = 0x5e3b22, ant = 0xe7d3a8;
  const ps = [
    part(new G.BoxGeometry(0.55, 0.55, 1.3), b, { pos: [0, 1.15, 0], jit: 0.04 }),
    part(new G.BoxGeometry(0.5, 0.2, 0.5), C.brim, { pos: [0, 1.12, -0.62], jit: 0.03 }),
    part(new G.BoxGeometry(0.3, 0.6, 0.3), b, { pos: [0, 1.5, 0.62], rot: [0.5, 0, 0] }),
    part(new G.BoxGeometry(0.34, 0.34, 0.56), b, { pos: [0, 1.82, 0.85], jit: 0.03 }),
    part(new G.BoxGeometry(0.16, 0.14, 0.12), C.coal, { pos: [0, 1.78, 1.15] }),
    part(new G.BoxGeometry(0.28, 0.12, 0.1), C.hat, { pos: [0, 1.5, 0.78], rot: [0.5, 0, 0] }),
  ];
  for (const x of [-0.18, 0.18]) for (const z of [-0.5, 0.5]) ps.push(part(new G.BoxGeometry(0.14, 0.9, 0.14), d, { pos: [x, 0.45, z] }));
  for (const s of [-1, 1]) {
    ps.push(part(new G.BoxGeometry(0.07, 0.5, 0.07), ant, { pos: [s * 0.14, 2.15, 0.78], rot: [0, 0, -s * 0.35] }));
    ps.push(part(new G.BoxGeometry(0.07, 0.3, 0.07), ant, { pos: [s * 0.32, 2.28, 0.78], rot: [0, 0, -s * 1.0] }));
    ps.push(part(new G.BoxGeometry(0.07, 0.26, 0.07), ant, { pos: [s * 0.26, 2.36, 0.9], rot: [0.6, 0, -s * 0.2] }));
    ps.push(part(new G.ConeGeometry(0.08, 0.2, 4), b, { pos: [s * 0.22, 1.98, 0.7], rot: [0, 0, -s * 1.2] }));
  }
  return build(ps);
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

// Faces sit on the front of the head (head centre y=1.82, front z≈0.26).
function faceParts(face) {
  const eye = (x, h = 0.08) => part(new G.BoxGeometry(0.06, h, 0.04), C.ink, { pos: [x, 1.86, 0.25] });
  const bit = (w, h, x, y, color = C.ink, rz = 0) => part(new G.BoxGeometry(w, h, 0.04), color, { pos: [x, y, 0.255], rot: [0, 0, rz] });
  const smile = [bit(0.05, 0.035, -0.07, 1.75, C.ink, -0.5), bit(0.08, 0.035, 0, 1.735), bit(0.05, 0.035, 0.07, 1.75, C.ink, 0.5)];
  switch (face) {
    case 'smile': return [eye(-0.1), eye(0.1), ...smile];
    case 'wink': return [eye(-0.1), bit(0.08, 0.025, 0.1, 1.86), ...smile];
    case 'wow': return [eye(-0.1, 0.1), eye(0.1, 0.1), bit(0.07, 0.08, 0, 1.73)];
    case 'shades': return [bit(0.34, 0.09, 0, 1.86, 0x15151c), bit(0.07, 0.025, -0.1, 1.885, 0x6b7390), bit(0.4, 0.025, 0, 1.9, 0x15151c)];
    case 'beard': return [eye(-0.1), eye(0.1),
      part(new G.IcosahedronGeometry(0.26, 0), C.brim, { pos: [0, 1.66, 0.12], scale: [1.1, 1.0, 0.8], jit: 0.04, seed: 9 }),
      part(new G.BoxGeometry(0.62, 0.1, 0.4), C.brim, { pos: [0, 1.52, 0.02] })];
    case 'mask': return [eye(-0.1), eye(0.1), part(new G.BoxGeometry(0.5, 0.16, 0.44), C.hat, { pos: [0, 1.72, 0.03], jit: 0.02 }),
      part(new G.BoxGeometry(0.12, 0.26, 0.06), C.hatDark, { pos: [0.16, 1.58, 0.22], rot: [0.2, 0, 0.2] })];
    // The Gobbler (Thanksgiving pass costume): a friendly turkey face on the player's own head. Big round eyes with a shine,
    // a short golden beak, the red snood drooping over it to one side, a red wattle hanging under it, rosy cheeks.
    case 'gobbler': return [...[-1, 1].flatMap((s) => [part(new G.BoxGeometry(0.09, 0.09, 0.03), 0xfbf6ea, { pos: [s * 0.1, 1.885, 0.252] }),
        part(new G.BoxGeometry(0.05, 0.06, 0.03), C.ink, { pos: [s * 0.095, 1.88, 0.262] }), part(new G.BoxGeometry(0.02, 0.02, 0.02), 0xffffff, { pos: [s * 0.09 + 0.012, 1.895, 0.275] }),
        part(new G.CylinderGeometry(0.035, 0.035, 0.02, 7), 0xe87a7a, { pos: [s * 0.16, 1.79, 0.225], rot: [Math.PI / 2, 0, 0] })]),
      part(new G.ConeGeometry(0.065, 0.17, 4), 0xf2b134, { pos: [0, 1.8, 0.33], rot: [Math.PI / 2 + 0.3, 0, 0], scale: [1.1, 1, 0.8] }),
      part(new G.IcosahedronGeometry(0.035, 0), 0xc81e32, { pos: [0.02, 1.86, 0.3] }),
      part(new G.IcosahedronGeometry(0.04, 0), 0xc81e32, { pos: [0.065, 1.79, 0.36], scale: [0.7, 1.7, 0.7], rot: [0, 0, 0.35] }),
      part(new G.IcosahedronGeometry(0.06, 0), 0xc81e32, { pos: [0, 1.69, 0.29], scale: [0.85, 1.5, 0.7], jit: 0.008, seed: 161 }),
      part(new G.IcosahedronGeometry(0.04, 0), 0xa8162a, { pos: [0.03, 1.62, 0.27], scale: [0.8, 1.3, 0.7] })];
    default: return [eye(-0.1), eye(0.1)];
  }
}

// Full-head faces replace the whole head (and tint the hands to match).
const HEADS = {
  gorilla: { hands: 0x3a3a41, parts: () => [
    part(new G.IcosahedronGeometry(0.3, 1), 0x3d3d45, { pos: [0, 1.82, 0], scale: [1.08, 1.02, 1], jit: 0.03, seed: 31 }),
    part(new G.BoxGeometry(0.44, 0.09, 0.14), 0x2a2a30, { pos: [0, 1.91, 0.21], rot: [0.25, 0, 0], jit: 0.015 }),
    part(new G.IcosahedronGeometry(0.17, 0), 0x5d5864, { pos: [0, 1.73, 0.19], scale: [1.35, 0.85, 0.85], jit: 0.02, seed: 32 }),
    part(new G.BoxGeometry(0.07, 0.035, 0.04), 0xf2efe8, { pos: [-0.1, 1.85, 0.265] }), part(new G.BoxGeometry(0.035, 0.035, 0.04), C.ink, { pos: [-0.09, 1.85, 0.27] }),
    part(new G.BoxGeometry(0.07, 0.035, 0.04), 0xf2efe8, { pos: [0.1, 1.85, 0.265] }), part(new G.BoxGeometry(0.035, 0.035, 0.04), C.ink, { pos: [0.09, 1.85, 0.27] }),
    part(new G.BoxGeometry(0.035, 0.03, 0.03), C.ink, { pos: [-0.045, 1.77, 0.335] }), part(new G.BoxGeometry(0.035, 0.03, 0.03), C.ink, { pos: [0.045, 1.77, 0.335] }),
    part(new G.BoxGeometry(0.05, 0.03, 0.03), C.ink, { pos: [-0.07, 1.67, 0.32], rot: [0, 0, 0.45] }), part(new G.BoxGeometry(0.07, 0.03, 0.03), C.ink, { pos: [0, 1.685, 0.325] }),
    part(new G.BoxGeometry(0.05, 0.03, 0.03), C.ink, { pos: [0.07, 1.67, 0.32], rot: [0, 0, -0.45] }),
  ] },
  snowman: { hands: 0x6b4a2e, parts: () => [
    part(new G.IcosahedronGeometry(0.31, 1), 0xf2f4f8, { pos: [0, 1.82, 0], jit: 0.025, seed: 41 }),
    part(new G.IcosahedronGeometry(0.045, 0), C.coal, { pos: [-0.1, 1.88, 0.27] }), part(new G.IcosahedronGeometry(0.045, 0), C.coal, { pos: [0.1, 1.88, 0.27] }),
    part(new G.ConeGeometry(0.055, 0.24, 5), C.carrot, { pos: [0, 1.8, 0.4], rot: [Math.PI / 2, 0, 0] }),
    part(new G.TorusGeometry(0.25, 0.075, 4, 9), C.hat, { pos: [0, 1.56, 0], rot: [Math.PI / 2, 0, 0], jit: 0.02 }),
    part(new G.BoxGeometry(0.12, 0.34, 0.06), C.hat, { pos: [0.14, 1.4, 0.25], rot: [0.15, 0, 0.12], jit: 0.01 }),
  ] },
  panda: { hands: 0x1d1d22, parts: () => [
    part(new G.IcosahedronGeometry(0.31, 1), 0xf4f4f2, { pos: [0, 1.82, 0], scale: [1.06, 1, 1], jit: 0.025, seed: 51 }),
    part(new G.IcosahedronGeometry(0.1, 0), 0x1d1d22, { pos: [-0.27, 2.0, -0.02] }), part(new G.IcosahedronGeometry(0.1, 0), 0x1d1d22, { pos: [0.27, 2.0, -0.02] }),
    part(new G.IcosahedronGeometry(0.075, 0), 0x1d1d22, { pos: [-0.11, 1.85, 0.25], scale: [1.1, 1.35, 0.5], rot: [0, 0, 0.45] }),
    part(new G.IcosahedronGeometry(0.075, 0), 0x1d1d22, { pos: [0.11, 1.85, 0.25], scale: [1.1, 1.35, 0.5], rot: [0, 0, -0.45] }),
    part(new G.BoxGeometry(0.03, 0.03, 0.03), 0xf4f4f2, { pos: [-0.1, 1.86, 0.29] }), part(new G.BoxGeometry(0.03, 0.03, 0.03), 0xf4f4f2, { pos: [0.1, 1.86, 0.29] }),
    part(new G.TetrahedronGeometry(0.05), 0x1d1d22, { pos: [0, 1.76, 0.31], rot: [0.6, 0.8, 0] }),
    part(new G.BoxGeometry(0.12, 0.05, 0.03), 0x2b1f24, { pos: [0, 1.69, 0.29] }), part(new G.BoxGeometry(0.06, 0.02, 0.03), 0xd9606a, { pos: [0, 1.675, 0.3] }),
  ] },
  // COSTUME faces (catalog.js sets). The Nutcracker: a carved wooden toy's head, a square block (every other head is round),
  // painted: black hair, staring eyes under stern brows, rosy cheeks, a big white moustache, and the nut-cracking jaw with its
  // row of square teeth. White gloves.
  nutcracker: { hands: 0xf6f3ea, parts: () => [
    part(new G.CylinderGeometry(0.29, 0.33, 0.5, 4), 0xf1c9a0, { pos: [0, 1.85, 0], rot: [0, Math.PI / 4, 0], jit: 0.008, seed: 101 }),
    part(new G.BoxGeometry(0.46, 0.3, 0.06), 0x1c1a22, { pos: [0, 1.95, -0.215] }),
    ...[-1, 1].map((s) => part(new G.BoxGeometry(0.05, 0.22, 0.34), 0x1c1a22, { pos: [s * 0.215, 1.96, -0.03] })),
    ...[-1, 1].flatMap((s) => [part(new G.BoxGeometry(0.09, 0.065, 0.03), 0xf6f3ea, { pos: [s * 0.09, 1.88, 0.232] }),
      part(new G.BoxGeometry(0.04, 0.055, 0.03), C.ink, { pos: [s * 0.085, 1.88, 0.245] }),
      part(new G.BoxGeometry(0.12, 0.035, 0.03), C.ink, { pos: [s * 0.09, 1.94, 0.236], rot: [0, 0, s * 0.28] }),
      part(new G.CylinderGeometry(0.045, 0.045, 0.02, 8), 0xe0505a, { pos: [s * 0.14, 1.79, 0.236], rot: [Math.PI / 2, 0, 0] }),
      // the moustache's two big white curls, swept up at the ends
      part(new G.IcosahedronGeometry(0.075, 0), 0xf6f3ea, { pos: [s * 0.08, 1.735, 0.262], scale: [1.6, 0.7, 0.6], rot: [0, 0, s * 0.32] })]),
    part(new G.BoxGeometry(0.07, 0.11, 0.08), 0xe2b48a, { pos: [0, 1.82, 0.26] }),
    part(new G.BoxGeometry(0.26, 0.055, 0.03), C.ink, { pos: [0, 1.665, 0.232] }),
    ...[-0.075, -0.025, 0.025, 0.075].map((x) => part(new G.BoxGeometry(0.042, 0.04, 0.03), 0xf6f3ea, { pos: [x, 1.668, 0.24] })),
    part(new G.BoxGeometry(0.44, 0.1, 0.44), 0xdcae84, { pos: [0, 1.6, 0] }),
    part(new G.BoxGeometry(0.2, 0.08, 0.05), 0xf6f3ea, { pos: [0, 1.585, 0.225] }),
  ] },
  // The Frost King: a pale frosted face with blue ice-crystal facets on the brow and cheeks, frosted white brows, ice-blue
  // glints in the eyes and a beard of short icicles. Icy hands.
  frostking: { hands: 0xc6e0f4, parts: () => [
    part(new G.IcosahedronGeometry(0.3, 1), 0xe8f4fb, { pos: [0, 1.82, 0], jit: 0.02, seed: 111 }),
    part(new G.OctahedronGeometry(0.06), 0x2f7fd8, { pos: [0, 2.0, 0.25], scale: [0.7, 1.3, 0.4] }),
    ...[-1, 1].flatMap((s) => [part(new G.OctahedronGeometry(0.05), 0x5fb0ee, { pos: [s * 0.17, 1.79, 0.225], scale: [0.6, 1.4, 0.4], rot: [0, s * 0.5, s * 0.3] }),
      part(new G.OctahedronGeometry(0.03), 0x2f7fd8, { pos: [s * 0.2, 1.71, 0.19], scale: [0.7, 1.2, 0.5], rot: [0, s * 0.6, 0] }),
      part(new G.BoxGeometry(0.07, 0.07, 0.03), C.ink, { pos: [s * 0.1, 1.87, 0.272] }),
      part(new G.BoxGeometry(0.03, 0.03, 0.03), 0x8fe4ff, { pos: [s * 0.085, 1.885, 0.287] }),
      part(new G.BoxGeometry(0.13, 0.035, 0.03), 0xf6fcff, { pos: [s * 0.1, 1.95, 0.26], rot: [0, 0, -s * 0.22] })]),
    part(new G.BoxGeometry(0.1, 0.025, 0.03), 0x2a4e7a, { pos: [0, 1.7, 0.282] }),
    // the icicle beard: short ice spikes hanging from the chin, longest in the middle
    ...[-0.12, -0.06, 0, 0.06, 0.12].map((x, i) => { const l = [0.1, 0.15, 0.19, 0.15, 0.1][i];
      return part(new G.ConeGeometry(0.035, l, 4), i % 2 ? 0xa8dcff : 0xe8f6ff, { pos: [x, 1.6 - l / 2 + 0.03, 0.2 - Math.abs(x) * 0.4], rot: [Math.PI, 0, 0] }); }),
  ] },
  // The Pumpkin King (Halloween pass): the jack-o'-lantern head, the very one the retired Pumpkin Costume wore (jackHead), its
  // carved face glowing and flickering (`glow`: unlit pieces, character() adds them to the glow mesh). Black gloves.
  pumpkinking: { hands: 0x2b2433, parts: () => jackHead().body, glow: () => jackHead().glow },
};
export const HEAD_FACES = Object.keys(HEADS);

// Blocky character with separate limbs for a walk cycle.
// Cosmetic hats and backpacks (catalog.js slots 'hat' and 'pack'). Head top is ~2.1 high; the back is at z ≈ -0.2.
function hatPieces(shape, color) {
  if (shape === 'beanie') return [part(new G.IcosahedronGeometry(0.3, 1), color, { pos: [0, 2.0, 0], scale: [1, 0.62, 1], jit: 0.02 }),
    part(new G.TorusGeometry(0.27, 0.06, 4, 10), C.brim, { pos: [0, 1.95, 0], rot: [Math.PI / 2, 0, 0] }),
    part(new G.IcosahedronGeometry(0.09, 0), C.brim, { pos: [0, 2.22, 0] })];
  if (shape === 'earmuffs') return [part(new G.TorusGeometry(0.31, 0.03, 4, 10, Math.PI), C.stoneDark, { pos: [0, 1.86, 0], rot: [0, Math.PI / 2, 0] }),
    part(new G.IcosahedronGeometry(0.12, 0), color, { pos: [-0.3, 1.84, 0] }), part(new G.IcosahedronGeometry(0.12, 0), color, { pos: [0.3, 1.84, 0] })];
  if (shape === 'antlers') return [-1, 1].flatMap((sd) => [
    part(new G.BoxGeometry(0.06, 0.42, 0.06), color, { pos: [sd * 0.17, 2.22, 0], rot: [0, 0, -sd * 0.35] }),
    part(new G.BoxGeometry(0.05, 0.2, 0.05), color, { pos: [sd * 0.3, 2.3, 0], rot: [0, 0, -sd * 1.0] }),
    part(new G.BoxGeometry(0.05, 0.18, 0.05), color, { pos: [sd * 0.2, 2.42, 0.02], rot: [0, 0, sd * 0.4] })]);
  if (shape === 'tophat') return [part(new G.CylinderGeometry(0.36, 0.36, 0.05, 10), color, { pos: [0, 2.04, 0] }),
    part(new G.CylinderGeometry(0.22, 0.24, 0.42, 10), color, { pos: [0, 2.27, 0] }),
    part(new G.CylinderGeometry(0.245, 0.245, 0.07, 10), C.hat, { pos: [0, 2.1, 0] })];
  // Costume hats. The Nutcracker's shako: a tall black drum of a hat with gold bands, a peak over the eyes, a gold plate badge
  // with a red centre, and a white plume rising from a red pompom.
  if (shape === 'shako') return [part(new G.CylinderGeometry(0.29, 0.31, 0.46, 10), color, { pos: [0, 2.27, 0] }),
    part(new G.CylinderGeometry(0.318, 0.318, 0.06, 10), C.gold, { pos: [0, 2.07, 0] }),
    part(new G.CylinderGeometry(0.297, 0.297, 0.05, 10), C.gold, { pos: [0, 2.475, 0] }),
    part(new G.BoxGeometry(0.34, 0.035, 0.17), color, { pos: [0, 2.04, 0.33], rot: [0.25, 0, 0] }),
    part(new G.OctahedronGeometry(0.09), C.gold, { pos: [0, 2.28, 0.3], scale: [1, 1.2, 0.4] }),
    part(new G.BoxGeometry(0.06, 0.06, 0.03), 0xc4161c, { pos: [0, 2.28, 0.33] }),
    part(new G.IcosahedronGeometry(0.075, 0), 0xc4161c, { pos: [0, 2.56, 0.12] }),
    part(new G.IcosahedronGeometry(0.1, 0), 0xf6f3ea, { pos: [0, 2.72, 0.11], scale: [0.9, 1.9, 0.9], jit: 0.02, seed: 103 }),
    part(new G.IcosahedronGeometry(0.07, 0), 0xe4ded2, { pos: [0.02, 2.9, 0.08], scale: [0.9, 1.6, 0.9], rot: [0, 0, -0.2], jit: 0.015, seed: 104 })];
  // The Frost King's crown: seven tall jagged ice shards round a blue band (tallest at the front, leaning outward), small
  // shards between them, alternating pale and deeper ice so it reads as clear crystal, and a deep blue gem at the front.
  if (shape === 'icecrown') {
    const ps = [part(new G.TorusGeometry(0.27, 0.05, 4, 14), 0x5aa6e6, { pos: [0, 2.04, 0], rot: [Math.PI / 2, 0, 0] }),
      part(new G.OctahedronGeometry(0.06), 0x2563c8, { pos: [0, 2.07, 0.315], scale: [1, 1.2, 0.6] })];
    [0.5, 0.3, 0.38, 0.26, 0.26, 0.38, 0.3].forEach((h, i) => { const a = (i / 7) * Math.PI * 2, b = a + Math.PI / 7, x = Math.sin(a), z = Math.cos(a);
      ps.push(part(new G.OctahedronGeometry(0.075), i % 2 ? 0x8fcdf6 : color, { pos: [x * 0.27, 2.06 + h * 0.36, z * 0.27], rot: [z * 0.25, 0, -x * 0.25], scale: [0.85, h / 0.15, 0.85] }));
      ps.push(part(new G.OctahedronGeometry(0.05), i % 2 ? 0xe6f6ff : 0x6ab6ee, { pos: [Math.sin(b) * 0.28, 2.1, Math.cos(b) * 0.28], rot: [Math.cos(b) * 0.4, 0, -Math.sin(b) * 0.4], scale: [0.8, 1.8, 0.8] })); });
    return ps;
  }
  // The Pumpkin King's crooked hat: a witch's hat whose tall crown bends over and kinks near the tip, a wide brim tipped a little
  // off level, a purple band with an orange buckle, a green vine curling up the crown with two leaves, and a black bat perched
  // on the brim's side. Brim at 2.06: on the jack-o'-lantern (top ~2.06, stem inside the crown) and on a plain head alike. The
  // brim is NARROWER than the pumpkin (0.34 against 0.36) so the orange head still shows from the game's high camera.
  if (shape === 'crooked') {
    const vine = 0x4f7a2a, leaf = 0x6f9e38, bat = 0x15121b;
    const ps = [part(new G.CylinderGeometry(0.34, 0.35, 0.035, 12), color, { pos: [0, 2.06, 0], rot: [0.06, 0, -0.07], jit: 0.01, seed: 131 }),
      part(crookedCone(0.66), color, { pos: [0, 2.06 + 0.33, 0], rot: [0, 0.5, 0], jit: 0.012, seed: 132 }),
      part(new G.CylinderGeometry(0.193, 0.207, 0.08, 10), 0x7b3fb0, { pos: [0, 2.12, 0] }),
      part(new G.BoxGeometry(0.1, 0.09, 0.03), 0xe8812c, { pos: [0, 2.12, 0.207] }), part(new G.BoxGeometry(0.05, 0.045, 0.035), 0x7b3fb0, { pos: [0, 2.12, 0.212] })];
    // the vine: short green lengths winding up the crown (which narrows as it rises), a leaf on two of them
    [[0.0, 2.2, 0.175], [0.9, 2.3, 0.15], [1.9, 2.4, 0.125], [2.9, 2.5, 0.1]].forEach(([a, y, r], k) => {
      ps.push(part(new G.BoxGeometry(0.035, 0.13, 0.035), vine, { pos: [Math.sin(a + 0.5) * r + (k * 0.03), y, Math.cos(a + 0.5) * r], rot: [0, a, 0.9] }));
      if (k % 2 === 0) ps.push(part(new G.IcosahedronGeometry(0.05, 0), leaf, { pos: [Math.sin(a + 0.9) * (r + 0.03) + k * 0.03, y + 0.03, Math.cos(a + 0.9) * (r + 0.03)], scale: [1.4, 0.45, 0.9], rot: [0, a, 0.4] })); });
    // the bat on the brim's left side: a round body, two pointed ears, two wings swept up and back, orange eyes
    const bx = -0.26, by = 2.13, bz = 0.1;
    ps.push(part(new G.IcosahedronGeometry(0.055, 0), bat, { pos: [bx, by, bz], scale: [1, 1.15, 0.9] }),
      ...[-1, 1].map((s) => part(new G.ConeGeometry(0.018, 0.05, 3), bat, { pos: [bx + s * 0.025, by + 0.07, bz] })),
      ...[-1, 1].map((s) => part(new G.CylinderGeometry(0.09, 0.09, 0.015, 3), bat, { pos: [bx + s * 0.1, by + 0.07, bz - 0.01], rot: [Math.PI / 2, 0, s * 0.9], scale: [1.4, 1, 0.75] })),
      ...[-1, 1].map((s) => part(new G.BoxGeometry(0.015, 0.015, 0.01), 0xff9a1a, { pos: [bx + s * 0.02, by + 0.015, bz + 0.05] })));
    return ps;
  }
  // The Gobbler's pilgrim hat: a tall black crown narrowing a little to its flat top, a dark band with a big square gold buckle
  // at the front, and a turkey feather (brown, an orange band, a cream tip) tucked upright in the band's left side. The brim is
  // NARROWER than the top hat's (0.31 against 0.36), so the face under it shows from the game's high camera.
  if (shape === 'pilgrim') return [part(new G.CylinderGeometry(0.31, 0.31, 0.035, 12), color, { pos: [0, 2.04, 0] }),
    part(new G.CylinderGeometry(0.18, 0.22, 0.44, 10), color, { pos: [0, 2.28, 0], jit: 0.006, seed: 171 }),
    part(new G.CylinderGeometry(0.218, 0.226, 0.08, 10), 0x3b3443, { pos: [0, 2.11, 0] }),
    part(new G.BoxGeometry(0.13, 0.11, 0.03), C.gold, { pos: [0, 2.11, 0.222] }), part(new G.BoxGeometry(0.07, 0.05, 0.035), color, { pos: [0, 2.11, 0.226] }),
    part(new G.BoxGeometry(0.05, 0.2, 0.02), 0x6b4224, { pos: [-0.2, 2.26, 0.06], rot: [0, 0, 0.25] }),
    part(new G.BoxGeometry(0.055, 0.06, 0.022), 0xd2772e, { pos: [-0.234, 2.385, 0.06], rot: [0, 0, 0.25] }),
    part(new G.BoxGeometry(0.055, 0.05, 0.022), 0xf1e3c0, { pos: [-0.248, 2.437, 0.06], rot: [0, 0, 0.25] })];
  return [];
}
// A crooked cone (the Pumpkin King's hat): leans over to one side as it rises, then kinks back at the tip.
function crookedCone(h) {
  const g = new G.CylinderGeometry(0.02, 0.2, h, 8, 6), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + h / 2) / h; p.setX(i, p.getX(i) + 0.2 * t * t - (t > 0.75 ? (t - 0.75) * 0.5 : 0)); p.setY(i, p.getY(i) - 0.06 * t * t * t); }
  return g;
}
// A thin box from point a to point b (ropes, cords). t: a different thickness, for a flat strip (the Gobbler's tail feathers).
function stick(a, b, w, color, t = w) {
  const d = new V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length(), e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize()));
  return part(new G.BoxGeometry(w, len, t), color, { pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot: [e.x, e.y, e.z] });
}
function packPieces(shape, color) {
  if (shape === 'satchel') return [part(new G.BoxGeometry(0.42, 0.4, 0.16), color, { pos: [0, 1.22, -0.29], jit: 0.02 }),
    part(new G.BoxGeometry(0.44, 0.12, 0.18), C.woodDark, { pos: [0, 1.38, -0.29] }), part(new G.BoxGeometry(0.08, 0.06, 0.03), C.gold, { pos: [0, 1.3, -0.38] })];
  if (shape === 'sack') return [part(new G.IcosahedronGeometry(0.34, 1), color, { pos: [0, 1.28, -0.38], scale: [1, 1.15, 0.8], jit: 0.04 }),
    part(new G.CylinderGeometry(0.06, 0.1, 0.14, 6), C.gold, { pos: [0, 1.66, -0.38] })];
  if (shape === 'gift') return [part(new G.BoxGeometry(0.46, 0.46, 0.3), color, { pos: [0, 1.25, -0.36] }),
    part(new G.BoxGeometry(0.08, 0.48, 0.32), C.gold, { pos: [0, 1.25, -0.36] }), part(new G.BoxGeometry(0.48, 0.08, 0.32), C.gold, { pos: [0, 1.25, -0.36] })];
  // Costume packs. The Nutcracker's toy drum, slung across the back on a white sash: a red shell with gold rims and white
  // drumheads at the sides, white ropes zigzagging rim to rim, and two drumsticks crossed on top.
  if (shape === 'drum') {
    const y = 1.24, z = -0.45, R = 0.24, H = 0.17, side = [0, 0, Math.PI / 2], rim = (a, s) => [s * (H - 0.03), y + Math.cos(a) * (R + 0.006), z + Math.sin(a) * (R + 0.006)];
    const ps = [part(new G.CylinderGeometry(R, R, H * 2, 12), color, { pos: [0, y, z], rot: side }),
      ...[-1, 1].flatMap((s) => [part(new G.CylinderGeometry(R + 0.024, R + 0.024, 0.05, 12), C.gold, { pos: [s * H, y, z], rot: side }),
        part(new G.CylinderGeometry(R - 0.012, R - 0.012, 0.02, 12), 0xf6f3ea, { pos: [s * (H + 0.025), y, z], rot: side })]),
      // the sash: over the left shoulder, across the chest to the right hip (and the same way across the back)
      ...[0.2, -0.2].map((zz) => part(new G.BoxGeometry(0.06, 0.82, 0.03), 0xf6f3ea, { pos: [-0.02, 1.27, zz], rot: [0, 0, 0.72] }))];
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, m = a + Math.PI / 10;
      ps.push(stick(rim(a, -1), rim(m, 1), 0.024, 0xf6f3ea), stick(rim(m, 1), rim(a + Math.PI / 5, -1), 0.024, 0xf6f3ea)); }
    for (const s of [-1, 1]) { const c = [0, y + R + 0.045, z + 0.02], f = s * 1.15, d = [-Math.sin(f) * 0.25, Math.cos(f) * 0.25];
      ps.push(part(new G.CylinderGeometry(0.017, 0.02, 0.5, 5), 0xe2bf86, { pos: c, rot: [0, 0, f] }),
        part(new G.IcosahedronGeometry(0.035, 0), 0xf6f3ea, { pos: [c[0] + d[0], c[1] + d[1] + 0.012, c[2]] })); }
    return ps;
  }
  // The Frost King's ice wings: from a blue crystal clasp between the shoulders, four faceted ice feathers a side fanning out
  // and up, pale at the top shading to deeper ice at the bottom.
  if (shape === 'icewings') {
    const ps = [part(new G.OctahedronGeometry(0.08), 0x4f9ee6, { pos: [0, 1.44, -0.25], scale: [1, 1.3, 0.6] })], sw = 0.4;
    const cols = [0xe6f6ff, color, 0x8fcdf6, 0x6ab6ee];
    for (const s of [-1, 1]) [[0.8, 0.74], [0.4, 0.66], [0.02, 0.52], [-0.36, 0.38]].forEach(([t, L], k) => { const r = L / 2;
      ps.push(part(new G.OctahedronGeometry(1), cols[k], { pos: [s * (0.1 + Math.cos(t) * r * Math.cos(sw)), 1.45 + Math.sin(t) * r, -0.27 - Math.cos(t) * r * Math.sin(sw)], rot: [0, s * sw, s * t], scale: [r, 0.085, 0.026] })); });
    return ps;
  }
  // The Pumpkin King's lantern: an iron lantern on the back (base, four corner posts, a window bar round the middle, a pointed
  // roof and a ring to carry it by) on two straps over the shoulders (none down the front: they crossed the jack-o'-lantern's
  // grin and hid the patchwork coat). Its light, the glowing panes and the candle, is packGlow below.
  if (shape === 'lantern') {
    const y = 1.27, z = -0.42, strap = 0x3a2a1c;
    return [part(new G.BoxGeometry(0.32, 0.05, 0.32), color, { pos: [0, y - 0.22, z] }),
      ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => part(new G.BoxGeometry(0.045, 0.42, 0.045), color, { pos: [a * 0.13, y, z + b * 0.13] })),
      part(new G.BoxGeometry(0.29, 0.03, 0.29), color, { pos: [0, y, z] }),
      part(new G.ConeGeometry(0.25, 0.18, 4), color, { pos: [0, y + 0.3, z], rot: [0, Math.PI / 4, 0], jit: 0.01, seed: 141 }),
      part(new G.TorusGeometry(0.06, 0.018, 4, 8), color, { pos: [0, y + 0.44, z] }),
      ...[-0.15, 0.15].map((x) => part(new G.BoxGeometry(0.07, 0.03, 0.42), strap, { pos: [x, 1.575, -0.02] }))];
  }
  // The Gobbler's tail fan: nine flat tail feathers fanned out behind the back from a round brown rump, each banded brown, then
  // orange, then cream, with a dark tip, on two straps over the shoulders. Modest on purpose: the fan leans back a little and
  // its top (about 1.8) stays below the head, so from the game's high camera behind a player the head and hat still show.
  if (shape === 'tailfan') {
    const y = 1.24, z = -0.32, tilt = 0.3, bands = [[0.06, 0.3, 0.1, color], [0.3, 0.42, 0.12, 0xd2772e], [0.42, 0.5, 0.13, 0xf1e3c0], [0.5, 0.55, 0.12, 0x3a2414]];
    const ps = [part(new G.IcosahedronGeometry(0.14, 0), color, { pos: [0, y, z + 0.02], scale: [1.2, 1, 0.8], jit: 0.01, seed: 181 }),
      ...[-0.15, 0.15].map((x) => part(new G.BoxGeometry(0.07, 0.03, 0.42), 0x3a2414, { pos: [x, 1.575, -0.02] }))];
    for (let k = 0; k < 9; k++) { const th = (k / 8 - 0.5) * 2.6, d = [Math.sin(th), Math.cos(th) * Math.cos(tilt), -Math.cos(th) * Math.sin(tilt)], r = k % 2 ? 0.94 : 1;
      for (const [a, b, w, col] of bands) ps.push(stick([d[0] * a * r, y + d[1] * a * r, z - 0.03 + d[2] * a * r - k * 0.002], [d[0] * b * r, y + d[1] * b * r, z - 0.03 + d[2] * b * r - k * 0.002], w, col, 0.022)); }
    return ps;
  }
  return [];
}
// A costume back piece's unlit pieces (character() puts them in the glow mesh, flickering with the jack-o'-lanterns: gearTick).
function packGlow(shape) {
  if (shape === 'lantern') { const y = 1.27, z = -0.42;
    return [part(new G.BoxGeometry(0.225, 0.37, 0.225), 0xff9a1a, { pos: [0, y, z] }), part(new G.IcosahedronGeometry(0.05, 0), 0xffe9a0, { pos: [0, y + 0.05, z - 0.115], scale: [0.8, 1.4, 0.4] })]; }
  return [];
}

// ---------- SPECIAL GEAR worn on the character (Cody, 2026-10-01: "a pumpkin should look like a jack o lantern not just orange
// shirt. Santa suit should look like Santa and so on"). gear.js kinds → pieces MERGED into the character's own meshes (body,
// arms, legs, the hat mesh), so gear costs no extra draw calls; only the warm light of a jack-o'-lantern's carved face and the
// Heated Coat's coil are one small unlit mesh (GEAR_GLOW, shared). The match draws what the REFEREE says each player wears
// (snapshot e.gear: a Present Box already turned into its gear); the Avatar preview and Store thumbnails draw the slots.
// Coordinates: the character faces +z; torso 0.62 × 0.72 × 0.38 centred at y 1.2; head centre y 1.82 (radius ~0.3); arms hang
// from (±0.42, 1.52), hands at -0.72; legs from (±0.16, 0.86), feet at -0.8.
export const GEAR_GLOW = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
// The carved face and coil flicker like a candle (one shared material, so one call a frame moves every wearer's light).
export function gearTick(t) { GEAR_GLOW.color.setScalar(0.82 + 0.12 * Math.sin(t * 9.1) + 0.06 * Math.sin(t * 23.7)); }
// The colour a chip of each extra-hit gear shows when it takes a hit (online.js: a bit of the costume flies off)
export const GEAR_TINT = { pumpkin: 0xe8812c, kevlar: 0xbfe6ff, heated: 0xcf3128, santa: 0xf3efe6 };
// A ridged pumpkin: 16 sides, every other one pulled in, so 8 lobes show as facets in the toon light.
function pumpkinBall(r) {
  const g = new G.SphereGeometry(r, 16, 7), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), k = Math.round(Math.atan2(z, x) / (Math.PI / 8)) & 1 ? 0.86 : 1; p.setXYZ(i, x * k, p.getY(i) * 0.8, z * k); }
  return g;
}
// A floppy cone (Elf Hat): bends over to one side as it rises, like hatCone but taller.
function floppyCone(h) {
  const g = new G.CylinderGeometry(0.025, 0.28, h, 7, 6), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + h / 2) / h; p.setX(i, p.getX(i) + 0.42 * t * t * t); p.setY(i, p.getY(i) - 0.22 * t * t * t * t); }
  return g;
}
// A triangle prism (carved eyes and teeth): `up` points the tip up (true) or down.
const tri = (s, color, pos, up = true, d = 0.06) => part(new G.CylinderGeometry(s, s, d, 3), color, { pos, rot: [Math.PI / 2, up ? Math.PI : 0, 0] });
// The jack-o'-lantern head: the retired Pumpkin Costume gear's, and the Pumpkin King costume's face (HEADS.pumpkinking), one
// shape so it's the pumpkin players already know. body: the lit pumpkin; glow: the carved face (unlit, flickering: gearTick).
// Sits a little low (centre 1.77, on the shoulders) so the Santa hat, worn at the usual height, leaves the carved eyes showing.
function jackHead() {
  return { body: [
    part(pumpkinBall(0.36), 0xf08a2a, { pos: [0, 1.77, 0], jit: 0.012, seed: 61 }),
    part(new G.CylinderGeometry(0.035, 0.06, 0.16, 5), 0x5d6b2a, { pos: [0.02, 2.09, 0], rot: [0.15, 0, -0.25] }),
    part(new G.TetrahedronGeometry(0.07), C.elfDark, { pos: [-0.07, 2.05, 0.03], rot: [0.5, 0.3, 0.9], scale: [1.4, 0.5, 1] }),
    // two pumpkin teeth left standing in the carved grin
    part(new G.BoxGeometry(0.05, 0.045, 0.03), 0xf08a2a, { pos: [-0.05, 1.665, 0.345] }), part(new G.BoxGeometry(0.05, 0.045, 0.03), 0xf08a2a, { pos: [0.06, 1.615, 0.345] }),
  ], glow: [
    // carved triangle eyes and nose, and a wide grin curving up at both ends; the light flickers (gearTick)
    tri(0.09, 0xffd040, [-0.13, 1.83, 0.31]), tri(0.09, 0xffd040, [0.13, 1.83, 0.31]), tri(0.045, 0xffb030, [0, 1.74, 0.335]),
    part(new G.BoxGeometry(0.13, 0.085, 0.05), 0xffb030, { pos: [-0.125, 1.66, 0.305], rot: [0, 0.35, -0.4] }),
    part(new G.BoxGeometry(0.13, 0.085, 0.05), 0xffb030, { pos: [0, 1.635, 0.325] }),
    part(new G.BoxGeometry(0.13, 0.085, 0.05), 0xffb030, { pos: [0.125, 1.66, 0.305], rot: [0, -0.35, 0.4] }),
  ] };
}
// Each gear: body (torso/head/back pieces), hat (replaces the cosmetic hat; steps aside for the Santa hat like one), arm/leg
// (added to each limb, by side -1/+1), feet (replace the boots), sleeve/pants (recolour the limbs), noHead (the pumpkin is the
// head), back (hides a cosmetic backpack), glow (unlit pieces).
const GEAR_LOOKS = {
  pumpkin: () => ({ noHead: true, ...jackHead() }),
  kevlar: () => ({ body: [
    part(new G.BoxGeometry(0.68, 0.6, 0.44), 0x5d8db4, { pos: [0, 1.28, 0], jit: 0.015, seed: 62 }),
    // icy armour plates: four on the chest, one on the back, a pad on each shoulder; dark straps down the sides
    ...[[-0.14, 1.41], [0.14, 1.41], [-0.14, 1.17], [0.14, 1.17]].map(([x, y], i) => part(new G.BoxGeometry(0.24, 0.2, 0.05), 0xbfe6ff, { pos: [x, y, 0.235], jit: 0.012, seed: 63 + i })),
    part(new G.BoxGeometry(0.5, 0.44, 0.05), 0xa9d8f5, { pos: [0, 1.3, -0.235], jit: 0.012, seed: 67 }),
    ...[-1, 1].map((s) => part(new G.BoxGeometry(0.24, 0.08, 0.46), 0xbfe6ff, { pos: [s * 0.25, 1.6, 0], rot: [0, 0, s * -0.25], jit: 0.01 })),
    ...[-1, 1].map((s) => part(new G.BoxGeometry(0.03, 0.56, 0.3), 0x2c3e55, { pos: [s * 0.345, 1.28, 0] })),
    // frost glints along the plates' top edges
    ...[-0.2, 0.08, 0.2].map((x, i) => part(new G.BoxGeometry(0.06, 0.025, 0.02), 0xffffff, { pos: [x, i ? 1.5 : 1.26, 0.262] })),
  ] }),
  heated: () => ({ sleeve: 0xcf3128, body: [
    // puffy quilted bands, alternating shades, with a dark seam between each (a quilted winter coat)
    ...[1.47, 1.27, 1.07, 0.87].map((y, i) => part(new G.BoxGeometry(0.72, 0.22, 0.48), i % 2 ? 0xb52620 : 0xcf3128, { pos: [0, y, 0], jit: 0.025, seed: 70 + i })),
    ...[1.37, 1.17, 0.97].map((y) => part(new G.BoxGeometry(0.7, 0.03, 0.46), 0x6e1410, { pos: [0, y, 0] })),
    part(new G.BoxGeometry(0.52, 0.13, 0.42), 0x8f1712, { pos: [0, 1.62, 0], jit: 0.015 }),
    part(new G.BoxGeometry(0.03, 0.78, 0.04), 0xc9c3b6, { pos: [0, 1.2, 0.25] }),
    // the heater: a dark chest panel with a glowing coil behind it
    part(new G.BoxGeometry(0.2, 0.16, 0.03), 0x2a1a18, { pos: [0.16, 1.43, 0.25] }),
  ], arm: () => [0.18, 0.42].map((y) => part(new G.BoxGeometry(0.26, 0.17, 0.26), 0xcf3128, { pos: [0, -y, 0], jit: 0.02 })),
  glow: [0, 1, 2, 3].map((i) => part(new G.BoxGeometry(0.06, 0.025, 0.02), 0xff8a2a, { pos: [0.1 + i * 0.04, 1.43, 0.27], rot: [0, 0, i % 2 ? -0.8 : 0.8] })) }),
  santa: () => ({ sleeve: 0xcf3128, pants: 0xcf3128, body: [
    part(new G.BoxGeometry(0.68, 0.74, 0.44), 0xcf3128, { pos: [0, 1.2, 0], jit: 0.015, seed: 75 }),
    // white fur: the hem, down the front, the collar
    part(new G.BoxGeometry(0.74, 0.11, 0.5), C.brim, { pos: [0, 0.84, 0], jit: 0.02, seed: 76 }),
    part(new G.BoxGeometry(0.11, 0.66, 0.05), C.brim, { pos: [0, 1.22, 0.225], jit: 0.012 }),
    part(new G.TorusGeometry(0.2, 0.07, 4, 9), C.brim, { pos: [0, 1.6, 0], rot: [Math.PI / 2, 0, 0], jit: 0.015 }),
    // a black belt with a gold buckle
    part(new G.BoxGeometry(0.72, 0.12, 0.48), C.coal, { pos: [0, 1.0, 0] }),
    part(new G.BoxGeometry(0.17, 0.14, 0.04), C.gold, { pos: [0, 1.0, 0.25] }), part(new G.BoxGeometry(0.08, 0.06, 0.04), C.coal, { pos: [0, 1.0, 0.262] }),
    // the white beard and moustache (the eyes stay)
    part(new G.IcosahedronGeometry(0.25, 0), C.brim, { pos: [0, 1.66, 0.13], scale: [1.15, 1.15, 0.8], jit: 0.04, seed: 77 }),
    part(new G.BoxGeometry(0.15, 0.06, 0.06), C.brim, { pos: [-0.07, 1.77, 0.27], rot: [0, 0, 0.25] }), part(new G.BoxGeometry(0.15, 0.06, 0.06), C.brim, { pos: [0.07, 1.77, 0.27], rot: [0, 0, -0.25] }),
  ], hat: hatParts({ scale: 0.62, y: 1.98, rotY: Math.PI / 2 + 0.4, seed: 78 }),
  arm: () => [part(new G.BoxGeometry(0.25, 0.1, 0.25), C.brim, { pos: [0, -0.6, 0], jit: 0.01 })],
  feet: [part(new G.BoxGeometry(0.28, 0.24, 0.36), C.coal, { pos: [0, -0.75, 0.05], jit: 0.01 }), part(new G.BoxGeometry(0.29, 0.07, 0.3), C.brim, { pos: [0, -0.62, 0] })] }),
  present: () => ({ body: [
    // a wrapped present held in front (the Avatar screen and Store; a match shows what it turned into)
    part(new G.BoxGeometry(0.4, 0.36, 0.3), 0x7a4fa3, { pos: [0, 1.1, 0.36], jit: 0.01 }),
    part(new G.BoxGeometry(0.42, 0.38, 0.07), C.gold, { pos: [0, 1.1, 0.36] }), part(new G.BoxGeometry(0.07, 0.38, 0.32), C.gold, { pos: [0, 1.1, 0.36] }),
    part(new G.TetrahedronGeometry(0.09), C.gold, { pos: [-0.06, 1.31, 0.36], rot: [0.4, 0, 0.6] }), part(new G.TetrahedronGeometry(0.09), C.gold, { pos: [0.06, 1.31, 0.36], rot: [0.4, 0, -0.6] }),
  ] }),
  bag: () => ({ back: true, body: [
    // a bulging red toy sack over the back, open at the top, with toys peeking out: a gift, a candy cane, a teddy
    part(new G.IcosahedronGeometry(0.36, 1), 0xb8282a, { pos: [0, 1.3, -0.44], scale: [1.05, 1.2, 0.85], jit: 0.045, seed: 80 }),
    part(new G.TorusGeometry(0.17, 0.05, 4, 8), 0x7e1714, { pos: [0, 1.7, -0.44], rot: [Math.PI / 2 - 0.3, 0, 0] }),
    part(new G.CylinderGeometry(0.03, 0.03, 0.5, 5), C.gold, { pos: [0, 1.38, -0.16], rot: [0.5, 0, 0.9] }),
    part(new G.BoxGeometry(0.16, 0.16, 0.16), C.elf, { pos: [0.08, 1.8, -0.42], rot: [0.2, 0.5, 0.15] }), part(new G.BoxGeometry(0.17, 0.04, 0.17), C.gold, { pos: [0.08, 1.85, -0.42], rot: [0.2, 0.5, 0.15] }),
    part(new G.CylinderGeometry(0.025, 0.025, 0.36, 5), 0xf6f2ea, { pos: [-0.1, 1.84, -0.47], rot: [0, 0, 0.15] }),
    part(new G.BoxGeometry(0.06, 0.04, 0.06), C.hat, { pos: [-0.11, 1.9, -0.47], rot: [0, 0, 0.6] }),
    part(new G.BoxGeometry(0.11, 0.035, 0.05), C.hat, { pos: [-0.16, 2.02, -0.47], rot: [0, 0, -0.5] }),
    part(new G.IcosahedronGeometry(0.075, 0), 0x9a6a3a, { pos: [0.0, 1.8, -0.55] }),
    part(new G.IcosahedronGeometry(0.03, 0), 0x9a6a3a, { pos: [-0.06, 1.86, -0.55] }), part(new G.IcosahedronGeometry(0.03, 0), 0x9a6a3a, { pos: [0.06, 1.86, -0.55] }),
  ] }),
  backpack: () => ({ back: true, body: [
    // a sturdy trail backpack: body, top flap with buckles, front pocket, a rolled sleeping mat on top, straps over the shoulders
    part(new G.BoxGeometry(0.46, 0.56, 0.24), 0x5a3b24, { pos: [0, 1.25, -0.32], jit: 0.02, seed: 85 }),
    part(new G.BoxGeometry(0.48, 0.14, 0.27), 0x3e2817, { pos: [0, 1.5, -0.33], rot: [-0.08, 0, 0], jit: 0.01 }),
    part(new G.BoxGeometry(0.32, 0.22, 0.08), 0x7a5634, { pos: [0, 1.11, -0.46], jit: 0.01 }),
    ...[-0.1, 0.1].map((x) => part(new G.BoxGeometry(0.05, 0.06, 0.03), 0xc9c3b6, { pos: [x, 1.42, -0.47] })),
    part(new G.CylinderGeometry(0.09, 0.09, 0.52, 7), 0x3d6fb0, { pos: [0, 1.64, -0.32], rot: [0, 0, Math.PI / 2] }),
    ...[-0.14, 0.14].map((x) => part(new G.BoxGeometry(0.03, 0.2, 0.2), 0x2b1d12, { pos: [x, 1.64, -0.32] })),
    ...[-0.15, 0.15].flatMap((x) => [part(new G.BoxGeometry(0.07, 0.03, 0.42), 0x2b1d12, { pos: [x, 1.575, -0.02] }),
      part(new G.BoxGeometry(0.07, 0.56, 0.03), 0x2b1d12, { pos: [x, 1.3, 0.2] })]),
  ] }),
  satchel: () => ({ body: [
    // a green messenger satchel on the right hip (a little behind, clear of the swinging arm), its strap across the chest
    part(new G.BoxGeometry(0.32, 0.27, 0.11), C.elf, { pos: [0.27, 0.98, -0.22], rot: [0, -0.7, 0], jit: 0.012, seed: 88 }),
    part(new G.BoxGeometry(0.33, 0.13, 0.125), C.elfDark, { pos: [0.27, 1.06, -0.22], rot: [0, -0.7, 0] }),
    part(new G.BoxGeometry(0.06, 0.05, 0.03), C.gold, { pos: [0.31, 1.0, -0.27], rot: [0, -0.7, 0] }),
    part(new G.BoxGeometry(0.06, 0.82, 0.03), 0x7a5634, { pos: [-0.02, 1.27, 0.2], rot: [0, 0, 0.72] }),
    part(new G.BoxGeometry(0.06, 0.82, 0.03), 0x7a5634, { pos: [-0.02, 1.27, -0.2], rot: [0, 0, 0.72] }),
  ] }),
  shoes: () => ({ feet: [
    // curled-toe green elf shoes with a gold bell on each tip
    part(new G.BoxGeometry(0.28, 0.15, 0.36), C.elf, { pos: [0, -0.8, 0.06], jit: 0.01 }),
    part(new G.BoxGeometry(0.3, 0.06, 0.3), C.hat, { pos: [0, -0.71, 0.02] }),
    part(new G.ConeGeometry(0.09, 0.28, 5), C.elf, { pos: [0, -0.77, 0.32], rot: [Math.PI / 2 - 0.5, 0, 0] }),
    part(new G.ConeGeometry(0.045, 0.14, 5), C.elfDark, { pos: [0, -0.65, 0.43], rot: [-0.5, 0, 0] }),
    part(new G.IcosahedronGeometry(0.045, 0), C.gold, { pos: [0, -0.6, 0.4] }),
  ] }),
  elfhat: (o) => ({ hat: [
    // a tall floppy green elf hat, a red band, a gold bell on its tip
    part(floppyCone(1.0), C.elf, { pos: [0, (o.pumpkin ? 2.0 : 1.98) + 0.5, 0], rot: [0, Math.PI / 2 + 0.5, 0], jit: 0.02, seed: 90 }),
    part(new G.TorusGeometry(0.28, 0.07, 4, 10), C.hat, { pos: [0, o.pumpkin ? 2.0 : 1.98, 0], rot: [Math.PI / 2, 0, 0], jit: 0.012 }),
    part(new G.IcosahedronGeometry(0.075, 0), C.gold, { pos: [0.42 * Math.cos(Math.PI / 2 + 0.5), (o.pumpkin ? 2.0 : 1.98) + 0.78, -0.42 * Math.sin(Math.PI / 2 + 0.5)] }),
  ] }),
};
// Everything a list of gear adds to the character, combined. `keepSleeves`: team matches keep the team colour on the arms.
function gearLook(kinds, { keepSleeves } = {}) {
  const L = { body: [], hat: [], arm: [], feet: null, glow: [], noHead: false, back: false, sleeve: null, pants: null };
  const ks = kinds || [], pumpkin = ks.includes('pumpkin');
  for (const k of ks) { const f = GEAR_LOOKS[k]; if (!f) continue; const g = f({ pumpkin });
    L.body.push(...(g.body || [])); L.glow.push(...(g.glow || [])); if (g.hat) L.hat = g.hat; if (g.arm) L.arm.push(g.arm);
    // Elf Shoes win over the Santa boots (both can be worn: speed and hits)
    if (g.feet && !(L.feet && k === 'santa')) L.feet = g.feet;
    if (g.noHead) L.noHead = true; if (g.back) L.back = true; if (g.sleeve && !keepSleeves) L.sleeve = g.sleeve; if (g.pants) L.pants = g.pants; }
  // Elf Hat over a Santa cap (the hat is the gear doing something)
  if (ks.includes('elfhat') && ks.includes('santa')) L.hat = GEAR_LOOKS.elfhat({ pumpkin }).hat;
  return L;
}

// ---------- COSTUME uniforms (catalog.js `trim` on a costume shirt or pants; Cody 2026-10-02: costumes that "stand out and
// different from everything else"). A shirt is otherwise one colour, so the uniform's extra pieces are added here, merged
// into the body/arm/leg meshes like gear (no extra draw calls). shirt → body pieces + arm cuffs; pants → each leg (by side
// -1/+1: the stripe runs down the OUTSIDE) + the boots. Same coordinates as the gear looks above.
const COSTUME_TRIMS = {
  nutcracker: {
    // a toy soldier's coat: three gold cords across the chest with gold buttons, a gold collar, gold epaulettes with fringe,
    // a white belt with a big gold buckle, coat tails behind, gold cuffs
    shirt: () => ({ body: [
      ...[1.44, 1.3, 1.16].flatMap((y) => [part(new G.BoxGeometry(0.3, 0.035, 0.03), C.gold, { pos: [0, y, 0.2] }),
        ...[-1, 1].map((s) => part(new G.IcosahedronGeometry(0.032, 0), C.gold, { pos: [s * 0.16, y, 0.205] }))]),
      part(new G.BoxGeometry(0.4, 0.09, 0.32), C.gold, { pos: [0, 1.6, 0] }),
      ...[-1, 1].flatMap((s) => [part(new G.BoxGeometry(0.2, 0.06, 0.3), C.gold, { pos: [s * 0.32, 1.585, 0], jit: 0.008 }),
        ...[-0.09, 0, 0.09].map((zz) => part(new G.BoxGeometry(0.03, 0.08, 0.03), C.goldDeep, { pos: [s * 0.41, 1.54, zz] }))]),
      part(new G.BoxGeometry(0.66, 0.12, 0.42), 0xf4f1e8, { pos: [0, 0.9, 0] }),
      part(new G.BoxGeometry(0.16, 0.13, 0.03), C.gold, { pos: [0, 0.9, 0.225] }),
      ...[-1, 1].map((s) => part(new G.BoxGeometry(0.25, 0.26, 0.04), 0xa81218, { pos: [s * 0.13, 0.74, -0.2], rot: [0.12, 0, 0] })),
    ], arm: () => [part(new G.BoxGeometry(0.23, 0.08, 0.23), C.gold, { pos: [0, -0.58, 0] })] }),
    // white trousers with a red stripe down the outside, tall black boots with a gold top and a shine
    pants: { leg: (s) => [part(new G.BoxGeometry(0.03, 0.5, 0.08), 0xc4161c, { pos: [s * 0.122, -0.27, 0] })],
      feet: () => [part(new G.BoxGeometry(0.27, 0.36, 0.3), 0x17171f, { pos: [0, -0.66, 0] }), part(new G.BoxGeometry(0.27, 0.12, 0.36), 0x17171f, { pos: [0, -0.79, 0.05] }),
        part(new G.BoxGeometry(0.28, 0.04, 0.31), C.gold, { pos: [0, -0.48, 0] }), part(new G.BoxGeometry(0.05, 0.12, 0.02), 0x8a8aa0, { pos: [0.06, -0.64, 0.155] })] },
  },
  frostking: {
    // an ice robe: it flares into a short skirt below the belt (wide enough for the legs to swing inside), a deep blue panel
    // down the front with crystal clasps, a navy sash, frost streaks across the chest, and a tall collar of ice shards
    // standing up behind the head; flared ice cuffs
    shirt: () => ({ body: [
      part(new G.CylinderGeometry(0.36, 0.45, 0.28, 8), 0x9fcff2, { pos: [0, 0.76, 0], jit: 0.012, seed: 121 }),
      part(new G.CylinderGeometry(0.465, 0.465, 0.06, 8), 0x2559b0, { pos: [0, 0.63, 0] }),
      part(new G.BoxGeometry(0.15, 0.68, 0.03), 0x2559b0, { pos: [0, 1.22, 0.2] }),
      ...[1.42, 1.26, 1.1].map((y) => part(new G.OctahedronGeometry(0.045), 0xf2fbff, { pos: [0, y, 0.222], scale: [1, 1.3, 0.6] })),
      part(new G.BoxGeometry(0.66, 0.11, 0.42), 0x274a80, { pos: [0, 0.9, 0] }),
      ...[-1, 1].map((s) => part(new G.BoxGeometry(0.03, 0.34, 0.02), 0xf6fcff, { pos: [s * 0.2, 1.32, 0.196], rot: [0, 0, s * 0.45] })),
      ...[-2, -1, 0, 1, 2].map((k) => part(new G.OctahedronGeometry(1), k % 2 ? 0x8fcdf6 : 0xe6f6ff,
        { pos: [k * 0.12, 1.74 + (2 - Math.abs(k)) * 0.03, -0.3 + Math.abs(k) * 0.04], rot: [-0.35, 0, -k * 0.35], scale: [0.06, 0.2 - Math.abs(k) * 0.02, 0.03] })),
    ], arm: () => [part(new G.BoxGeometry(0.27, 0.1, 0.27), 0x8fcdf6, { pos: [0, -0.58, 0] }), part(new G.BoxGeometry(0.28, 0.03, 0.28), 0xf2fbff, { pos: [0, -0.53, 0] })] }),
    // silver trousers with an ice-blue stripe down the outside, ice boots with a white cuff and a crystal on each toe
    pants: { leg: (s) => [part(new G.BoxGeometry(0.03, 0.62, 0.08), 0x4a9be8, { pos: [s * 0.122, -0.36, 0] })],
      feet: () => [part(new G.BoxGeometry(0.27, 0.2, 0.36), 0x8cc6f2, { pos: [0, -0.76, 0.04] }), part(new G.BoxGeometry(0.28, 0.05, 0.3), 0xf2fbff, { pos: [0, -0.655, 0] }),
        part(new G.OctahedronGeometry(0.06), 0xe6f6ff, { pos: [0, -0.77, 0.24], scale: [0.9, 0.8, 1.4] })] },
  },
  pumpkinking: {
    // a stitched patchwork coat: orange, black and lavender patches sewn on with pale cross-stitches, mismatched buttons, an
    // orange sash for a belt, and a tattered hem of purple and black points below it (wide enough for the legs to swing
    // inside); ragged orange cuffs
    shirt: () => { const thread = 0xcbb894, ps = [];
      const patch = (x, y, w, h, rz, col, zz = 0.2) => { const f = Math.sign(zz); ps.push(part(new G.BoxGeometry(w, h, 0.03), col, { pos: [x, y, zz], rot: [0, 0, rz], jit: 0.006 }));
        for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) { const dy = (k - 0.5) * h * 0.45, c = Math.cos(rz), sn = Math.sin(rz), ex = sx * w / 2;
          ps.push(part(new G.BoxGeometry(0.05, 0.013, 0.01), thread, { pos: [x + ex * c - dy * sn, y + ex * sn + dy * c, zz + f * 0.018], rot: [0, 0, rz] })); } };
      patch(-0.14, 1.38, 0.2, 0.18, 0.14, 0xe8812c); patch(0.15, 1.11, 0.17, 0.15, -0.18, 0x17141d); patch(0.16, 1.42, 0.11, 0.1, 0.3, 0x9a72c8);
      patch(0.08, 1.28, 0.24, 0.2, -0.1, 0xd9701f, -0.2); patch(-0.13, 1.06, 0.15, 0.13, 0.2, 0x17141d, -0.2);
      ps.push(part(new G.IcosahedronGeometry(0.035, 0), 0xe8812c, { pos: [0.0, 1.25, 0.205] }), part(new G.IcosahedronGeometry(0.03, 0), thread, { pos: [0.01, 1.0, 0.205] }),
        part(new G.BoxGeometry(0.66, 0.1, 0.42), 0xe8812c, { pos: [0, 0.9, 0] }), part(new G.BoxGeometry(0.09, 0.2, 0.03), 0xc9661c, { pos: [0.18, 0.82, 0.215], rot: [0, 0, 0.2] }),
        part(new G.CylinderGeometry(0.34, 0.41, 0.2, 7), 0x4a2a6e, { pos: [0, 0.76, 0], jit: 0.01, seed: 151 }));
      for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2 + 0.2;
        ps.push(part(new G.ConeGeometry(0.075, 0.17 + (k % 3) * 0.04, 3), k % 2 ? 0x17141d : 0x3a2058, { pos: [Math.sin(a) * 0.37, 0.6 - (k % 3) * 0.02, Math.cos(a) * 0.37], rot: [Math.PI, a, 0] })); }
      return { body: ps, arm: () => [part(new G.BoxGeometry(0.24, 0.08, 0.24), 0xe8812c, { pos: [0, -0.57, 0] }),
        ...[[0.08, 0.08], [-0.08, -0.08]].map(([x, zz]) => part(new G.ConeGeometry(0.045, 0.09, 3), 0xe8812c, { pos: [x, -0.64, zz], rot: [Math.PI, 0, 0] }))] }; },
    // dark trousers wrapped in a winding green vine with leaves, pointed black boots curling up at the toe, orange buckles
    pants: { leg: (s) => [0, 1, 2, 3, 4].flatMap((k) => { const a = k * 1.35 + (s > 0 ? 0 : Math.PI), r = 0.135, y = -0.08 - k * 0.13;
        const out = [part(new G.BoxGeometry(0.04, 0.15, 0.04), 0x4f7a2a, { pos: [Math.sin(a) * r, y, Math.cos(a) * r], rot: [0, a, 0.85] })];
        if (k % 2) out.push(part(new G.IcosahedronGeometry(0.045, 0), 0x6f9e38, { pos: [Math.sin(a + 0.4) * (r + 0.01), y + 0.04, Math.cos(a + 0.4) * (r + 0.01)], scale: [1.4, 0.45, 0.9], rot: [0, a, 0.5] }));
        return out; }),
      feet: () => [part(new G.BoxGeometry(0.26, 0.2, 0.32), 0x17141d, { pos: [0, -0.76, 0.03] }),
        part(new G.ConeGeometry(0.085, 0.2, 5), 0x17141d, { pos: [0, -0.78, 0.26], rot: [Math.PI / 2 - 0.5, 0, 0] }),
        part(new G.IcosahedronGeometry(0.035, 0), 0xe8812c, { pos: [0, -0.7, 0.35] }),
        part(new G.BoxGeometry(0.1, 0.06, 0.02), 0xe8812c, { pos: [0, -0.72, 0.195] })] },
  },
  gobbler: {
    // a brown feather coat: a white pilgrim collar, three overlapping rows of small breast feathers down the chest (bronze,
    // tan, bronze), a black belt with a square gold buckle, and below it a short skirt edged with two layers of feathers (long
    // bronze ones, shorter orange ones over them; wide enough for the legs to swing inside); feathered cuffs
    shirt: () => { const bronze = 0x4f321c, tan = 0xb0702f, orange = 0xd2772e, cream = 0xf3ecdc, ps = [];
      // a feather: a flat diamond pointing down; `a` turns its flat side to face out from the middle (round the hem)
      const feather = (len, w, col, x, y, zz, a = 0) => part(new G.ConeGeometry(w, len, 4), col, { pos: [x, y, zz], rot: [Math.PI, -a, 0], scale: [1, 1, 0.35] });
      ps.push(part(new G.BoxGeometry(0.46, 0.04, 0.34), cream, { pos: [0, 1.575, 0] }),
        ...[-1, 1].map((s) => part(new G.BoxGeometry(0.16, 0.13, 0.03), cream, { pos: [s * 0.085, 1.5, 0.21], rot: [0, 0, s * 0.15] })));
      [[1.39, 5, bronze], [1.28, 4, tan], [1.17, 5, bronze]].forEach(([y, n, col]) => { for (let k = 0; k < n; k++) ps.push(feather(0.15, 0.055, col, (k - (n - 1) / 2) * 0.095, y, 0.205)); });
      ps.push(part(new G.BoxGeometry(0.66, 0.12, 0.42), 0x1c1a1f, { pos: [0, 0.9, 0] }), part(new G.BoxGeometry(0.15, 0.13, 0.03), C.gold, { pos: [0, 0.9, 0.225] }),
        part(new G.BoxGeometry(0.08, 0.06, 0.035), 0x1c1a1f, { pos: [0, 0.9, 0.228] }),
        part(new G.CylinderGeometry(0.34, 0.41, 0.2, 8), 0x6b4224, { pos: [0, 0.76, 0], jit: 0.01, seed: 191 }));
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, b = a + Math.PI / 12;
        ps.push(feather(0.22, 0.075, bronze, Math.sin(a) * 0.37, 0.59, Math.cos(a) * 0.37, a), feather(0.15, 0.065, k % 2 ? orange : tan, Math.sin(b) * 0.395, 0.64, Math.cos(b) * 0.395, b)); }
      return { body: ps, arm: () => [part(new G.BoxGeometry(0.24, 0.08, 0.24), tan, { pos: [0, -0.57, 0] }),
        ...[0, 1, 2, 3].map((k) => { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; return feather(0.1, 0.05, k % 2 ? orange : bronze, Math.sin(a) * 0.1, -0.63, Math.cos(a) * 0.1, a); })] }; },
    // drumstick trousers: each leg a puffed tan "drumstick" at the thigh with a darker band at the knee, white stockings below
    // like the bone, and black pilgrim shoes with a big square gold buckle
    pants: { leg: () => [part(new G.IcosahedronGeometry(0.16, 1), 0xd08f52, { pos: [0, -0.24, 0], scale: [1, 1.45, 1], jit: 0.012, seed: 201 }),
        part(new G.BoxGeometry(0.26, 0.06, 0.26), 0x8a5428, { pos: [0, -0.46, 0] }),
        part(new G.BoxGeometry(0.25, 0.22, 0.25), 0xf3ecdc, { pos: [0, -0.6, 0] })],
      feet: () => [part(new G.BoxGeometry(0.26, 0.14, 0.36), 0x17151b, { pos: [0, -0.79, 0.05] }),
        part(new G.BoxGeometry(0.13, 0.09, 0.02), C.gold, { pos: [0, -0.755, 0.235] }), part(new G.BoxGeometry(0.07, 0.045, 0.025), 0x17151b, { pos: [0, -0.755, 0.238] })] },
  },
};

export function character(o = {}) {
  const look = gearLook(o.gear, { keepSleeves: o.keepSleeves });
  const fullHead = HEADS[o.face];
  // costume trims: a full-body gear coat (Santa Costume: its own sleeves) covers the shirt's; gear trousers cover the pants'
  const shirtTrim = look.sleeve ? null : COSTUME_TRIMS[o.shirtTrim]?.shirt?.(), pantsTrim = look.pants ? null : COSTUME_TRIMS[o.pantsTrim]?.pants;
  const shirt = o.shirt ?? C.hat, pants = look.pants ?? o.pants ?? 0x34405e, skin = o.skin ?? C.skin, seed = o.seed ?? 1;
  const g = new G.Group();
  const bodyParts = [
    part(new G.BoxGeometry(0.62, 0.72, 0.38), shirt, { pos: [0, 1.2, 0], jit: 0.03, seed }),
    part(new G.BoxGeometry(0.64, 0.1, 0.4), C.woodDark, { pos: [0, 0.9, 0] }),
    part(new G.BoxGeometry(0.12, 0.1, 0.05), C.gold, { pos: [0, 0.9, 0.21] }),
    // a Pumpkin Costume's jack-o'-lantern IS the head
    ...(look.noHead ? [] : fullHead ? fullHead.parts() : [
      part(new G.IcosahedronGeometry(0.28, 0), skin, { pos: [0, 1.82, 0], scale: [1, 1.08, 1], jit: 0.03, seed: seed + 2 }),
      ...faceParts(o.face || (o.beard ? 'beard' : 'dots'))]),
    ...(shirtTrim ? shirtTrim.body : []),
    ...look.body,
  ];
  if (o.ears && !look.noHead) bodyParts.push(
    part(new G.ConeGeometry(0.08, 0.34, 4), skin, { pos: [-0.3, 1.9, 0], rot: [0, 0, 1.25] }),
    part(new G.ConeGeometry(0.08, 0.34, 4), skin, { pos: [0.3, 1.9, 0], rot: [0, 0, -1.25] }));
  if (o.cap) bodyParts.push(
    part(new G.ConeGeometry(0.3, 0.7, 6), o.cap, { pos: [0, 2.3, -0.05], rot: [-0.35, 0, 0], jit: 0.03 }),
    part(new G.TorusGeometry(0.27, 0.07, 4, 8), C.brim, { pos: [0, 2.0, 0], rot: [Math.PI / 2, 0, 0] }),
    part(new G.IcosahedronGeometry(0.09, 0), C.gold, { pos: [0, 2.6, -0.28] }));
  // a Toy Sack or Backpack on the back takes the place of a cosmetic backpack
  if (o.pack && !look.back) bodyParts.push(...packPieces(o.pack.shape, o.pack.color));
  const body = toon(build(bodyParts), 0.03); g.add(body);
  // The hat is its own mesh (riding on the body's bob) so the game can hide it while this player wears the Santa hat.
  // An Elf Hat or a Santa Costume's cap takes the cosmetic hat's place (and steps aside for the Santa hat the same way).
  const hp = look.hat.length ? look.hat : o.hat ? hatPieces(o.hat.shape, o.hat.color) : [];
  const hatMesh = hp.length ? toon(build(hp), 0.025) : null; if (hatMesh) body.add(hatMesh);
  // unlit pieces: gear (a jack-o'-lantern's face, a coil), a glowing costume head (the Pumpkin King's carved face, unless gear
  // replaces the head) and a glowing costume back piece (the Pumpkin King's lantern, unless gear covers the back)
  const glowParts = [...look.glow, ...(!look.noHead && fullHead?.glow ? fullHead.glow() : []), ...(o.pack && !look.back ? packGlow(o.pack.shape) : [])];
  if (glowParts.length) body.add(new THREE.Mesh(build(glowParts), GEAR_GLOW));
  const limb = (w, h, color, x, y, extra = []) => {
    const geo = build([part(new G.BoxGeometry(w, h, w), color, { pos: [0, -h / 2, 0], jit: 0.02 }), ...extra]);
    const m = toon(geo, 0.028); m.position.set(x, y, 0); g.add(m); return m;
  };
  const hands = fullHead ? fullHead.hands : skin;
  // gear: sleeves (a coat's colour, cuffs, puffy bands) and feet (Santa's boots, elf shoes)
  // costume trims too: the uniform's cuffs, the trousers' side stripe (by side) and its boots (gear feet win over them)
  const sleeve = look.sleeve ?? shirt, cuffs = () => [...look.arm.flatMap((f) => f()), ...(shirtTrim?.arm ? shirtTrim.arm() : [])];
  const feet = () => (look.feet ? look.feet.map((p) => p.clone()) : pantsTrim?.feet ? pantsTrim.feet() : [part(new G.BoxGeometry(0.26, 0.14, 0.34), C.woodDark, { pos: [0, -0.8, 0.05] })]);
  const stripe = (s) => (pantsTrim?.leg ? pantsTrim.leg(s) : []);
  const armL = limb(0.2, 0.66, sleeve, -0.42, 1.52, [part(new G.BoxGeometry(0.2, 0.14, 0.2), hands, { pos: [0, -0.72, 0] }), ...cuffs()]);
  const armR = limb(0.2, 0.66, sleeve, 0.42, 1.52, [part(new G.BoxGeometry(0.2, 0.14, 0.2), hands, { pos: [0, -0.72, 0] }), ...cuffs()]);
  const legL = limb(0.24, 0.84, pants, -0.16, 0.86, [...feet(), ...stripe(-1)]);
  const legR = limb(0.24, 0.84, pants, 0.16, 0.86, [...feet(), ...stripe(1)]);
  g.userData = { armL, armR, legL, legR, body, hatMesh, phase: Math.random() * 6 };
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
