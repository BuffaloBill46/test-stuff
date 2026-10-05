// SPECIAL SNOWBALLS IN FLIGHT: their colours, tracers and glow, drawn into a Sparks layer (kit.js). Moved out of online.js
// (2026-10-02) so the Store and Avatar pictures (tabs.js thumbnail) draw them with the SAME code as the game: they can't drift.
import { THREE, Sparks } from './kit.js?v=0e9b2ea718';
import { K } from './sim.js?v=0e9b2ea718';

// How each special snowball looks (specials.js `look`): icy, fire-orange, the split's three colours; giant keeps the thrower's colour.
export const BALL_COLOR = { ice: () => 0xbfeaff, fire: () => 0xff7a3a, split: () => 0xcf3128, piece: (b) => [0xcf3128, 0x3f9a66, 0xf5f1e8][b.id % 3] };
// SPECIAL SNOWBALLS STAND OUT (Cody, 2026-10-01: "make the special snowballs stand out with either a tracer and or shimmer";
// "I just want the special stuff to pop out and actually look special"). Each kind gets its own tracer and glow in the one
// Sparks draw call; plain snowballs get none, so a special always reads as special. Trail points are dropped along the ball's
// real path and STAY where they were dropped (their age s grows with the clock, so the point p(now - s) holds still), which
// reads as a trail left in the air, not a tail glued on. Everything is worked out from the referee's ball (kind, position,
// speed), so every screen sees the same; colours are made once here, never per frame.
const SC = (h) => new THREE.Color(h);
export const SOLID = Sparks.SOLID; export const STAR = Sparks.STAR;
export const TR = { ice: SC(0x7fd0ff), iceDeep: SC(0x5fc4ff), white: SC(0xffffff), gold: SC(0xffe2a0), goldStar: SC(0xffc83a),
  fire: [SC(0xffe45a), SC(0xffa020), SC(0xf2501a), SC(0xb3200f)], split: [SC(0xe0302a), SC(0x2fb86a), SC(0xfaf6ec)], sky: SC(0x5fb8f0), rain: SC(0xcfe6ff) };
const tp = new THREE.Vector3();
// a steady pseudo-random -0.5..0.5 for (ball, trail point), so a dropped point keeps its own wobble while it fades
const hh = (a, b) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b | 0, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); return ((h ^ (h >>> 15)) >>> 0) / 4294967296 - 0.5; };
export function tracer(sparks, b, x, y, z, vy, t) {
  const at = (s) => tp.set(x - b.vx * s, y - vy * s - 0.5 * K.BALL_G * s * s, z - b.vz * s);
  // the trail: n points, one dropped every d seconds; each(L 0 new → 1 old, id, s) draws one
  const trail = (n, d, each) => { const u = t / d, f = u - Math.floor(u); for (let k = 0; k < n; k++) { const s = (k + f) * d; each(s / (n * d), Math.floor(u) - k, s); } };
  if (b.kind === 'ice') {
    // Ice Ball: a cold blue glow, and a trail of ice-blue chips and white twinkles that drift down as they fade
    sparks.add(x, y, z, 1.0, TR.iceDeep, 0.5);
    trail(12, 0.012, (L, id, s) => { const p = at(s), tw = 0.5 + 0.5 * Math.sin(t * 26 + id * 1.9), r = 0.25 * L, star = id % 3 === 0;
      sparks.add(p.x + hh(b.id, id) * r, p.y + hh(id, b.id) * r - L * 0.25, p.z + hh(b.id + 7, id) * r, (star ? 0.45 : 0.28) * (1 - L * 0.6) * (0.6 + 0.6 * tw), star ? TR.white : TR.ice, (1 - L) * (0.5 + 0.5 * tw), star ? STAR : SOLID); });
  } else if (b.kind === 'fire') {
    // Fire Ball: a hot flickering glow and a flame trail, yellow to orange to red, rising as it cools, with sparks flung off
    sparks.add(x, y, z, 1.1 * (0.9 + 0.1 * Math.sin(t * 31)), TR.fire[1], 0.55);
    trail(14, 0.007, (L, id, s) => { const p = at(s), fl = 0.8 + 0.3 * Math.sin(t * 40 + id * 2.7), r = 0.18 * L;
      sparks.add(p.x + hh(b.id, id) * r, p.y + L * 0.45, p.z + hh(id, b.id) * r, 0.42 * (1 - L * 0.6) * fl, TR.fire[Math.min(3, Math.floor(L * 4))], 1 - L, SOLID);
      if (id % 3 === 0) sparks.add(p.x + hh(b.id + 3, id) * L * 0.9, p.y + L * 0.7, p.z + hh(id, b.id + 3) * L * 0.9, 0.22, TR.fire[0], 1 - L, STAR); });
  } else if (b.kind === 'giant') {
    // Giant Ball: a slow-pulsing golden shimmer round it, gold twinkles running over its surface, and a heavy powder wake
    const R = 0.17 * (b.r || 3), pu = 0.5 + 0.5 * Math.sin(t * 5);
    sparks.add(x, y, z, R * 3.4 * (1 + 0.08 * pu), TR.gold, 0.16 + 0.1 * pu);
    for (let j = 0; j < 7; j++) { const g = t * 2.6 + j * 0.898, tw = Math.max(0, Math.sin(t * 8 + j * 2.3));
      sparks.add(x + Math.cos(g) * R * 1.05, y + Math.sin(g * 1.3 + j) * R * 0.75, z + Math.sin(g) * R * 1.05, 0.2 + 0.32 * tw, TR.goldStar, 0.3 + 0.7 * tw, STAR | SOLID); }
    trail(7, 0.022, (L, id, s) => { const p = at(s); sparks.add(p.x, p.y, p.z, R * 2.0 * (1 - L * 0.5), TR.white, 0.4 * (1 - L), SOLID); });
  } else if (b.kind === 'split') {
    // Split Ball: a three-colour ribbon (red, green, white strands braided round its path); when it splits, each piece keeps one
    const l = Math.hypot(b.vx, b.vz) || 1, sx = -b.vz / l, sz = b.vx / l;
    trail(14, 0.006, (L, id, s) => { const p = at(s), R = 0.15 * (1 - L * 0.3);
      for (let j = 0; j < 3; j++) { const g = (t - s) * 26 + j * 2.094, c = Math.cos(g) * R;
        sparks.add(p.x + sx * c, p.y + Math.sin(g) * R, p.z + sz * c, 0.17 * (1 - L * 0.5), TR.split[j], 1 - L, SOLID); } });
  } else if (b.kind === 'piece') {
    const c = TR.split[b.id % 3];
    trail(10, 0.008, (L, id, s) => { const p = at(s); sparks.add(p.x, p.y, p.z, 0.2 * (1 - L * 0.5), c, 1 - L, SOLID); });
  }
}
// Sky Ball / Snowball Rain: a streak above each falling snowball (it falls 9 a second) and a white twinkle on the ball itself
export function dropStreak(sparks, p, y, i, t) {
  const c = p.kind === 'sky' ? TR.sky : TR.rain, n = p.kind === 'sky' ? 6 : 4;
  for (let k = 1; k <= n; k++) sparks.add(p.x, y + k * 0.22, p.z, 0.2 * (1 - k / (n + 1)), c, 0.85 * (1 - k / (n + 1)), SOLID);
  const tw = Math.max(0, Math.sin(t * 18 + i * 2.3)); sparks.add(p.x, y, p.z, 0.25 + 0.4 * tw, TR.white, 0.4 + 0.6 * tw, STAR);
}
