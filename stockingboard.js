// Stocking Stuffer board (canvas): a stone fireplace at night, a pine garland and a snowy mantel with 20 knit stockings
// (two rows of 10), a fire in the hearth. It only SHOWS what the rules already decided (stocking.js / the fair draw): open(s,
// gift) jiggles stocking s, then pops a wrapped present (gold sparkle) or a lump of coal (soot puff).
// Drawn like the Snowball Drop board: flat low-poly shapes with ink outlines, night blue + hat red + lantern gold.
// Glow (LESSONS): ONE soft warm wash from the fire, low alpha, painted (not added light), checked with all 20 stockings open.
// TAP TO OPEN (Cody, 2026-10-02): pick() waits for the player to tap an unopened stocking (or press Enter / Space: the next
// unopened one) and resolves with its number; while it waits the unopened stockings sway a little more. What pops out was
// already decided (stocking.js asTapped): the tap only chooses where.
// createStockings(canvas) → { pick() → Promise(s), open(s, gift) → Promise (resolves as the item pops), reset(), setActive(on),
//   hurry(), normal(), centerOf(s) (tests: where to tap, in CSS pixels on the canvas) }
import { ROW, STOCKINGS } from './stocking.js?v=c2b42ea65b';

const W = 680, H = 600, SLOT = 63, X0 = (W - SLOT * ROW) / 2;
const ROW_Y = [46, 206];                       // hook heights: row 1 hangs from the garland, row 2 from the mantel's front edge
export const ASPECT = H / W;
const INK = '#0c0f1a', RED = '#cf3128', RED_DK = '#9e2119', BRIM = '#f5f1e8', BRIM_DK = '#d9d2c2', PINE = '#2f6b4a', PINE_DK = '#224e37',
  GOLD = '#ffc94a', GOLD_DK = '#c98a1b', LAMP = '#ffb347';
// where stocking s hangs (0–9 top row left to right, 10–19 bottom row)
export const hookOf = (s) => ({ x: X0 + SLOT * ((s % ROW) + 0.5), y: ROW_Y[Math.floor(s / ROW)] });
// knit patterns, by stocking: body, stripes, heel/toe
const KNITS = [[RED, BRIM, BRIM], [BRIM, RED, RED], [RED, PINE, BRIM], [BRIM, PINE, RED]];
const GIFT_WRAP = [[GOLD, RED], [RED, GOLD], [PINE, GOLD], [BRIM, RED]];
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export function createStockings(cv) {
  const ctx = cv.getContext('2d'), reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = Array.from({ length: STOCKINGS }, () => ({ jig: -1, pop: -1, gift: null }));
  let fx = [], active = false, raf = 0, last = performance.now(), clock = 0, speed = 1, pending = [];
  let bg = null, waiting = null; // waiting: pick()'s resolve while it waits for a tap
  function fit() {
    const dpr = Math.min(3, devicePixelRatio || 1), w = cv.clientWidth || 300;
    cv.width = Math.round(w * dpr); cv.height = Math.round(w * ASPECT * dpr); bg = null;
    // resizing clears a canvas: paint one still frame now, so the mantel never sits blank while the draw loop is idle
    if (!raf) draw(performance.now(), 0);
  }
  new ResizeObserver(() => fit()).observe(cv);

  // ---- the still parts, painted once per size into an offscreen canvas ----
  function paintStill() {
    const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    const g = c.getContext('2d'), s = cv.width / W; g.setTransform(s, 0, 0, s, 0, 0); g.lineJoin = 'round';
    const wall = g.createLinearGradient(0, 0, 0, H); wall.addColorStop(0, '#16204a'); wall.addColorStop(1, '#0f1530'); g.fillStyle = wall; g.fillRect(0, 0, W, H);
    // the chimney breast: low-poly stones (jittered corners) on dark mortar
    g.fillStyle = '#24222f'; g.fillRect(14, 0, W - 28, H);
    const r = rng(1225), tones = ['#6f6c7e', '#5d5a68', '#666374', '#53505f'];
    for (let y = -6, row = 0; y < H; y += 36, row++) {
      for (let x = 14 - (row % 2) * 34; x < W - 14;) {
        const w = 52 + r() * 40, j = () => (r() - 0.5) * 6;
        const pts = [[x + 3 + j(), y + 3 + j()], [x + w - 3 + j(), y + 3 + j()], [x + w - 3 + j(), y + 33 + j()], [x + 3 + j(), y + 33 + j()]].map(([a, b]) => [Math.max(16, Math.min(W - 16, a)), b]);
        poly(g, pts, tones[Math.floor(r() * tones.length)], 1.5);
        g.fillStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.moveTo(...pts[0]); g.lineTo(...pts[1]); g.lineTo((pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2); g.closePath(); g.fill(); // a lit facet
        x += w;
      }
    }
    g.lineWidth = 3; g.strokeStyle = INK; g.strokeRect(14, -4, W - 28, H + 8);
    // the firebox: an arched opening, soot-dark, with two crossed logs
    const fb = new Path2D(); fb.moveTo(212, H); fb.lineTo(212, 438); fb.quadraticCurveTo(340, 360, 468, 438); fb.lineTo(468, H); fb.closePath();
    g.fillStyle = '#0b0d17'; g.fill(fb); const soot = g.createLinearGradient(0, 400, 0, H); soot.addColorStop(0, '#05060b'); soot.addColorStop(1, '#2a1a14'); g.fillStyle = soot; g.fill(fb);
    g.lineWidth = 4; g.strokeStyle = INK; g.stroke(fb);
    for (let k = 0; k < 9; k++) { const t = k / 8, ax = 212 + 256 * t, ay = 438 - Math.sin(Math.PI * t) * 40; poly(g, [[ax - 15, ay - 2], [ax + 15, ay - 2], [ax + 13, ay - 20], [ax - 13, ay - 20]].map(([a, b]) => rot(a, b, ax, ay, (t - 0.5) * 0.9)), k === 4 ? '#8a8795' : '#77748a', 2); } // arch stones
    poly(g, [[262, 586], [420, 566], [424, 578], [266, 598]], '#6b4a2e', 2); poly(g, [[258, 566], [418, 590], [414, 600], [254, 578]], '#45301f', 2); // logs
    g.fillStyle = '#c98a1b'; g.beginPath(); g.ellipse(421, 572, 4, 6, 0, 0, 7); g.fill(); g.stroke();
    poly(g, [[150, 588], [530, 588], [540, H + 2], [140, H + 2]], '#8a8795', 2.5); // the hearth slab
    // the mantel: a wooden beam with corbels, chunky snow on top and a few drips over the edge
    poly(g, [[22, 196], [44, 196], [44, 226], [32, 236], [22, 226]], '#45301f', 2); poly(g, [[W - 22, 196], [W - 44, 196], [W - 44, 226], [W - 32, 236], [W - 22, 226]], '#45301f', 2);
    poly(g, [[8, 176], [W - 8, 176], [W - 8, 202], [8, 202]], '#6b4a2e', 2.5); poly(g, [[8, 196], [W - 8, 196], [W - 8, 202], [8, 202]], '#45301f', 0);
    g.strokeStyle = 'rgba(12,15,26,.35)'; g.lineWidth = 1.5; for (const y of [184, 190]) { g.beginPath(); g.moveTo(18, y); g.lineTo(W - 18, y + (y === 184 ? 1 : -1)); g.stroke(); }
    g.lineWidth = 2.5; g.strokeStyle = INK; g.beginPath(); g.moveTo(8, 196); g.lineTo(W - 8, 196); g.stroke();
    snowRidge(g, 8, W - 8, 177, r, 9);
    // the garland: a pine rope swagged between the top row's hooks, with red bows and gold bulbs (solid colour, no glow)
    const hooks = Array.from({ length: ROW + 1 }, (_, i) => X0 + SLOT * i);
    g.lineCap = 'round';
    for (const [wd, col] of [[17, INK], [12, PINE_DK], [7, PINE]]) { g.lineWidth = wd; g.strokeStyle = col; g.beginPath(); g.moveTo(hooks[0] - 20, 30);
      for (let i = 0; i < ROW; i++) { const a = X0 + SLOT * (i + 0.5); g.quadraticCurveTo(a, ROW_Y[0] + 26, hooks[i + 1], 30); } g.lineTo(hooks[ROW] + 20, 30); g.stroke(); }
    for (let i = 0; i < 120; i++) { const t = r(), seg = Math.floor(t * ROW), u = t * ROW - seg, x0 = hooks[seg], x1 = hooks[seg + 1], cx = (x0 + x1) / 2;
      const x = (1 - u) ** 2 * x0 + 2 * (1 - u) * u * cx + u * u * x1, y = (1 - u) ** 2 * 30 + 2 * (1 - u) * u * (ROW_Y[0] + 26) + u * u * 30;
      g.fillStyle = r() < 0.5 ? PINE : '#3d8a5e'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 12, y + (r() - 0.5) * 12); g.lineTo(x + (r() - 0.5) * 10, y + (r() - 0.5) * 10); g.fill(); }
    for (let i = 0; i < 22; i++) { const x = hooks[0] + r() * (hooks[ROW] - hooks[0]), seg = Math.min(ROW - 1, Math.floor((x - X0) / SLOT)), u = (x - hooks[seg]) / SLOT, y = 30 + 4 * u * (1 - u) * (ROW_Y[0] - 4) * 0.9 + 6;
      g.fillStyle = i % 3 ? GOLD : RED; g.lineWidth = 1.5; g.strokeStyle = INK; g.beginPath(); g.arc(x, y, 3.4, 0, 7); g.fill(); g.stroke(); }
    for (const x of hooks) bow(g, x, 30);
    // brass hooks for the bottom row on the mantel's front
    for (let i = 0; i < ROW; i++) { const { x, y } = hookOf(ROW + i); g.fillStyle = GOLD_DK; g.strokeStyle = INK; g.lineWidth = 1.5; g.fillRect(x - 3, y - 6, 6, 6); g.strokeRect(x - 3, y - 6, 6, 6); }
    return c;
  }
  // ---- the fire: tongues of hat red, lantern gold and pale flame, flickering; and ONE soft warm wash (painted, low alpha) ----
  function fire(t) {
    const flick = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1);
    const wash = ctx.createRadialGradient(340, 560, 10, 340, 560, 250); wash.addColorStop(0, `rgba(255,170,80,${0.2 + 0.05 * flick})`); wash.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = wash; ctx.fillRect(90, 330, 500, 270);
    for (const [k, base, hgt, col, ink] of [[0, 300, 82, RED, true], [1, 338, 104, RED, true], [2, 380, 78, RED, true], [3, 322, 64, LAMP, false], [4, 358, 76, LAMP, false], [5, 342, 46, '#fff1b8', false]]) {
      const hh = hgt * (0.82 + 0.18 * (reduce ? 0.5 : Math.sin(t * (5 + k) + k * 1.7) * 0.5 + 0.5)), sway = reduce ? 0 : Math.sin(t * (3.3 + k * 0.4) + k) * 7, w = hgt * 0.36;
      const pts = [[base - w, 584], [base - w * 0.7, 584 - hh * 0.45], [base + sway * 0.6 - w * 0.25, 584 - hh * 0.8], [base + sway, 584 - hh], [base + sway * 0.5 + w * 0.3, 584 - hh * 0.62], [base + w * 0.75, 584 - hh * 0.3], [base + w, 584]];
      poly(ctx, pts, col, ink ? 2 : 0);
    }
    if (!reduce) for (let i = 0; i < 6; i++) { const u = (t * 0.6 + i / 6) % 1, x = 330 + Math.sin(i * 9.1 + t) * 40, y = 560 - u * 150; ctx.fillStyle = `rgba(255,201,74,${1 - u})`; ctx.fillRect(x, y, 3, 3); } // embers
  }
  // ---- one stocking (and what popped out of it) ----
  function stocking(s, t) {
    const { x, y } = hookOf(s), S = st[s], [body, stripe, patch] = KNITS[(s * 7 + Math.floor(s / ROW)) % KNITS.length];
    const jig = S.jig >= 0 ? Math.min(1, (clock - S.jig) / 0.52) : 1, a = S.jig >= 0 && jig < 1 ? Math.sin(jig * Math.PI * 7) * 0.2 * (1 - jig) : reduce ? 0 : Math.sin(t * (waiting && S.jig < 0 ? 2.4 : 1.2) + s * 1.9) * (waiting && S.jig < 0 ? 0.045 : 0.012);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.strokeStyle = BRIM; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-4, 9); ctx.quadraticCurveTo(0, -4, 4, 9); ctx.stroke(); // the hanging loop
    const boot = [[-18, 28], [16, 28], [16, 80], [32, 88], [40, 100], [36, 110], [18, 115], [-6, 115], [-18, 104]];
    poly(ctx, boot, body, 2.5);
    ctx.save(); ctx.beginPath(); boot.forEach(([p, q], i) => (i ? ctx.lineTo(p, q) : ctx.moveTo(p, q))); ctx.closePath(); ctx.clip();
    ctx.fillStyle = stripe; for (const yy of [42, 62]) ctx.fillRect(-20, yy, 40, 7);
    ctx.fillStyle = stripe; for (let k = -18; k < 16; k += 8) { ctx.beginPath(); ctx.moveTo(k, 55); ctx.lineTo(k + 4, 51); ctx.lineTo(k + 8, 55); ctx.lineTo(k + 4, 59); ctx.fill(); } // a knit zigzag
    poly(ctx, [[-18, 96], [-4, 115], [-18, 115]], patch, 0); poly(ctx, [[29, 86], [42, 98], [38, 112], [27, 113]], patch, 0); // heel and toe
    ctx.fillStyle = 'rgba(12,15,26,.22)'; ctx.fillRect(-18, 28, 7, 80); // the shaded side (a facet)
    ctx.restore();
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.beginPath(); boot.forEach(([p, q], i) => (i ? ctx.lineTo(p, q) : ctx.moveTo(p, q))); ctx.closePath(); ctx.stroke();
    // what's inside, rising out of the cuff (behind the fur)
    if (S.pop >= 0) {
      const u = Math.min(1, (clock - S.pop) / 0.32), rise = easeBack(u) * 24;
      ctx.save(); ctx.translate(0, 20 - rise);
      S.gift ? present(s) : coal();
      ctx.restore();
    }
    // the fur cuff: white, bumpy along the bottom, a darker underside
    const cuff = [[-23, 8], [23, 8], [24, 26]]; for (let k = 5; k >= 0; k--) cuff.push([-23 + k * 9.2 + 4.6, 30 + (k % 2) * 2]); cuff.push([-24, 26]);
    poly(ctx, cuff, BRIM, 2.5); ctx.fillStyle = BRIM_DK; ctx.fillRect(-22, 22, 44, 4);
    ctx.restore();
  }
  function present(s) {
    const [box, rib] = GIFT_WRAP[s % GIFT_WRAP.length];
    poly(ctx, [[-14, -18], [14, -18], [14, 6], [-14, 6]], box, 2.5);
    ctx.fillStyle = rib; ctx.fillRect(-3, -18, 6, 24); ctx.fillRect(-14, -9, 28, 5);
    ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.strokeRect(-3, -18, 6, 24);
    poly(ctx, [[0, -18], [-11, -27], [-9, -17]], rib, 1.8); poly(ctx, [[0, -18], [11, -27], [9, -17]], rib, 1.8); // the bow
  }
  function coal() {
    poly(ctx, [[-13, 2], [-15, -8], [-6, -17], [7, -16], [15, -7], [12, 4]], '#1d1d24', 2.5);
    poly(ctx, [[-6, -17], [7, -16], [2, -8], [-6, -9]], '#3a3a46', 0); poly(ctx, [[7, -16], [15, -7], [6, -5], [2, -8]], '#2b2b35', 0); // facets
  }
  // ---- the pop effects: gold sparkles (solid little stars) or a soot puff ----
  function effects(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.age += dt * speed; if (f.age > f.life) { fx.splice(i, 1); continue; }
      const u = f.age / f.life; f.x += f.vx * dt * speed; f.y += f.vy * dt * speed; f.vy += (f.soot ? -10 : 40) * dt * speed;
      if (f.soot) { ctx.fillStyle = `rgba(58,58,70,${0.75 * (1 - u)})`; ctx.beginPath(); ctx.arc(f.x, f.y, 4 + u * 10, 0, 7); ctx.fill(); }
      else { ctx.fillStyle = `rgba(255,232,150,${1 - u})`; star(ctx, f.x, f.y, 5 * (1 - u * 0.5)); }
    }
  }
  function draw(now, dt) {
    if (!bg) bg = paintStill();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(bg, 0, 0);
    const s = cv.width / W; ctx.setTransform(s, 0, 0, s, 0, 0); ctx.lineJoin = 'round';
    fire(now / 1000);
    for (let i = 0; i < STOCKINGS; i++) stocking(i, now / 1000);
    effects(dt);
    // the item pops when the jiggle ends: start it, sparkle or puff, and tell open() (so the page plays the sound right then)
    for (let i = pending.length - 1; i >= 0; i--) { const p = pending[i];
      if (clock - st[p.s].jig >= 0.52) { st[p.s].pop = clock; burst(p.s, p.gift); pending.splice(i, 1); p.done(); } }
  }
  function burst(s, gift) {
    const { x, y } = hookOf(s);
    for (let k = 0; k < (gift ? 9 : 8); k++) { const a = (k / 8) * Math.PI * 2 + 0.3;
      fx.push(gift ? { x, y: y + 4, vx: Math.cos(a) * 70, vy: Math.sin(a) * 60 - 40, age: 0, life: 0.85 } : { x: x + (Math.random() - 0.5) * 16, y: y + 10, vx: Math.cos(a) * 22, vy: -28 - Math.random() * 20, age: 0, life: 0.9, soot: true }); }
  }
  // Draws only while the card is on screen, or while a stocking is still opening (never freeze one mid-pop): a canvas drawing
  // off screen costs every phone (LESSONS), and the fire would otherwise keep it busy forever.
  let visible = false;
  const busy = () => pending.length > 0 || fx.length > 0 || st.some((S) => S.pop >= 0 && clock - S.pop < 0.4);
  function wake() { active = visible || busy(); if (active && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function frame(now) {
    raf = 0; if (!active) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt * speed;
    draw(now, dt);
    if (!visible && !busy()) { active = false; return; }
    raf = requestAnimationFrame(frame);
  }
  // Open stocking s: it jiggles, then pops its present or coal. Resolves the moment the item pops.
  function open(s, gift) {
    return new Promise((done) => { st[s].jig = clock; st[s].pop = -1; st[s].gift = gift; pending.push({ s, gift, done }); wake(); });
  }
  // which unopened stocking is at (x, y) in board units (the boot and its cuff), or -1
  function hit(x, y) { for (let s = 0; s < STOCKINGS; s++) { if (st[s].jig >= 0) continue; const h = hookOf(s); if (x >= h.x - 24 && x <= h.x + 40 && y >= h.y + 4 && y <= h.y + 116) return s; } return -1; }
  function take(s) { const w = waiting; waiting = null; cv.style.cursor = ''; w(s); }
  cv.addEventListener('pointerdown', (e) => { if (!waiting) return; const r = cv.getBoundingClientRect(), s = hit((e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H);
    if (s >= 0) { e.preventDefault(); take(s); } });
  cv.tabIndex = 0; cv.setAttribute('aria-label', 'The mantel: tap a stocking to open it (Enter or Space opens the next one)');
  cv.addEventListener('keydown', (e) => { if (!waiting || !(e.key === 'Enter' || e.key === ' ')) return; e.preventDefault(); const s = st.findIndex((S) => S.jig < 0); if (s >= 0) take(s); });
  function pick() { return new Promise((res) => { waiting = res; cv.style.cursor = 'pointer'; wake(); }); }
  const centerOf = (s) => { const h = hookOf(s); return { x: (h.x + 6) / W * cv.clientWidth, y: (h.y + 70) / H * cv.clientHeight }; };
  function reset() { for (const S of st) { S.jig = -1; S.pop = -1; S.gift = null; } fx = []; wake(); if (!raf) draw(performance.now(), 0); }
  fit();
  return { pick, centerOf, get waiting() { return !!waiting; }, open, reset, setActive: (on) => { visible = on; wake(); }, hurry: () => { speed = 6; }, normal: () => { speed = 1; },
    get opened() { return st.map((S) => (S.pop >= 0 ? (S.gift ? 'gift' : 'coal') : null)); } };
}

// ---- drawing helpers ----
function poly(g, pts, fill, line) {
  g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath();
  g.fillStyle = fill; g.fill(); if (line) { g.lineWidth = line; g.strokeStyle = INK; g.stroke(); }
}
function rot(a, b, cx, cy, ang) { const c = Math.cos(ang), s = Math.sin(ang), dx = a - cx, dy = b - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; }
function snowRidge(g, x0, x1, y, r, step) {
  const pts = [[x0, y + 4]]; for (let x = x0; x <= x1; x += step) pts.push([x, y - 4 - r() * 7]); pts.push([x1, y + 4]);
  g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath(); g.fillStyle = '#eef2fb'; g.fill();
  g.lineWidth = 2; g.strokeStyle = INK; g.beginPath(); pts.slice(1, -1).forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.stroke();
  g.fillStyle = '#c9d6ee'; g.fillRect(x0, y + 1, x1 - x0, 3);
  for (let i = 0; i < 16; i++) { const x = x0 + 20 + r() * (x1 - x0 - 40), d = 4 + r() * 5; g.fillStyle = '#eef2fb'; g.beginPath(); g.arc(x, y + 4, d, 0, Math.PI); g.fill(); g.lineWidth = 1.5; g.stroke(); } // drips over the front
}
function bow(g, x, y) {
  poly(g, [[x, y], [x - 11, y - 8], [x - 10, y + 6]], RED, 1.8); poly(g, [[x, y], [x + 11, y - 8], [x + 10, y + 6]], RED, 1.8);
  poly(g, [[x - 2, y], [x - 6, y + 13], [x - 1, y + 10]], RED_DK, 1.5); poly(g, [[x + 2, y], [x + 6, y + 13], [x + 1, y + 10]], RED_DK, 1.5);
  g.fillStyle = RED_DK; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); g.lineWidth = 1.5; g.strokeStyle = INK; g.stroke();
}
function star(g, x, y, r) {
  g.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, d = k % 2 ? r * 0.38 : r; g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); } g.closePath(); g.fill();
}
const easeBack = (u) => { const c = 1.6; return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; };
