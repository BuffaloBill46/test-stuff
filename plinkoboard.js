// Snowball Drop board (canvas): the hat, the pegs, the presents and their prizes, snowballs hopping along a path the RULES
// already decided (plinko.js / the fair draw). Used by the Games tab (dropui.js) and the preview page (plinko-page.js).
// createBoard(canvas) → { launch(path, bin) → Promise (resolves when that snowball lands), setActive(on), hurry(), flying() }
import { ROWS, BINS, PAYS, WIDTHS, JACKPOT_BIN } from './plinko.js?v=44d774d5c8';

// Board 2 (2026-10-02): 16 rows of pegs over 17 presents. Presents are drawn a little narrower the rarer they are (plinko.js
// WIDTHS: similar sizes, Cody), spread over the same width as the bottom row of pegs.
const W = 680, H = 680, CX = W / 2, GAP = 38, TOP = 92, ROW_H = 30, PEG_R = 4.5, BALL_R = 8.5;
const BIN_Y = TOP + (ROWS - 1) * ROW_H + 30, BIN_H = 50, LABEL_Y = BIN_Y + BIN_H + 24; // prize labels sit on the snow bank
const SPAN = BINS * GAP, UNIT = SPAN / WIDTHS.reduce((a, b) => a + b, 0);
const BIN_L = WIDTHS.reduce((a, w, k) => (a.push(k ? a[k - 1] + WIDTHS[k - 1] * UNIT : CX - SPAN / 2), a), []);
const pegX = (i, j) => CX + (j - i / 2) * GAP, pegY = (i) => TOP + i * ROW_H, binW = (k) => WIDTHS[k] * UNIT, binX = (k) => BIN_L[k] + binW(k) / 2;
export const ASPECT = H / W;
// Colours per prize: the centre (board 3: the POOL JACKPOT; was 100×) gold with a red ribbon and a star; 25× and 10× Santa-hat red with a white brim; 5× gold; 2× frost;
// 0× coal.
const TIER = (m) => (m >= 100 ? { box: '#ffbe5c', rib: '#cf3128' } : m >= 10 ? { box: '#cf3128', rib: '#f5f1e8' } : m >= 5 ? { box: '#c98a1b', rib: '#fff6c8' }
  : m >= 2 ? { box: '#6f8fd0', rib: '#f5f1e8' } : { box: '#151a30', rib: '#26305a' });

export function createBoard(cv) {
  const ctx = cv.getContext('2d'), reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const balls = [], pegHit = new Map(), binHit = new Array(BINS).fill(-1e9);
  const hat = new Image(); hat.src = 'hat-logo.png';
  const flakes = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 0.6 + Math.random() * 1.8, v: 8 + Math.random() * 18 }));
  let active = false, raf = 0, last = performance.now(), speed = 1;
  function fit() { const dpr = Math.min(3, devicePixelRatio || 1), w = cv.clientWidth || 300; cv.width = Math.round(w * dpr); cv.height = Math.round(w * ASPECT * dpr); }
  new ResizeObserver(fit).observe(cv); fit();

  function peg(x, y, lit) {
  if (lit > 0) { const g = ctx.createRadialGradient(x, y, 0, x, y, 20); g.addColorStop(0, `rgba(255,190,92,${0.55 * lit})`); g.addColorStop(1, 'rgba(255,190,92,0)'); ctx.fillStyle = g; ctx.fillRect(x - 20, y - 20, 40, 40); }
  ctx.beginPath(); ctx.arc(x + 1.5, y + 1.5, PEG_R, 0, 7); ctx.fillStyle = '#0c0f1a'; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, PEG_R, 0, 7); ctx.fillStyle = lit > 0 ? '#ffe2a8' : '#ffbe5c'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#0c0f1a'; ctx.stroke();
  ctx.beginPath(); ctx.arc(x - 2, y - 2, 1.8, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
}
  function snowball(x, y, rot, squash) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1 + squash, 1 - squash); ctx.rotate(rot);
  const n = 8, pts = Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * BALL_R, Math.sin((i / n) * Math.PI * 2) * BALL_R]);
  ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath();
  ctx.fillStyle = '#f5f1e8'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.lineTo(...pts[1]); ctx.lineTo(...pts[2]); ctx.lineTo(...pts[3]); ctx.lineTo(...pts[4]); ctx.lineTo(0, 1); ctx.closePath();
  ctx.fillStyle = '#c9d6ee'; ctx.fill(); // shaded low-poly facets underneath
  ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath();
  ctx.lineWidth = 2.2; ctx.strokeStyle = '#0c0f1a'; ctx.stroke();
  ctx.restore();
}
  function present(k, now) {
  const jp = k === JACKPOT_BIN, m = jp ? 100 : PAYS[k], c = TIER(m), since = (now - binHit[k]) / 1000, pop = since < 0.5 ? Math.sin((since / 0.5) * Math.PI) * 8 : 0;
  const w = binW(k) - 5, x = binX(k) - w / 2, y = BIN_Y - pop;
  ctx.fillStyle = '#0c0f1a'; ctx.fillRect(x + 3, y + 3, w, BIN_H);
  ctx.fillStyle = c.box; ctx.fillRect(x, y, w, BIN_H);
  ctx.fillStyle = c.rib; ctx.fillRect(binX(k) - 3, y, 6, BIN_H);                      // ribbon
  if (m >= 10 && m < 100) { ctx.fillStyle = '#f5f1e8'; ctx.fillRect(x, y, w, 12); ctx.fillStyle = '#d9d2c2'; ctx.fillRect(x, y + 9, w, 3); } // the hat's brim
  ctx.lineWidth = 2; ctx.strokeStyle = '#0c0f1a'; ctx.strokeRect(x, y, w, BIN_H);
  if (jp) jackpotTop(binX(k), y, now);                                                   // board 3: the pool jackpot's star
  if (since < 0.9) { ctx.fillStyle = `rgba(255,226,168,${0.5 * (1 - since / 0.9)})`; ctx.fillRect(x, y, w, BIN_H); }
  // the prize, big and dark on the snow bank under its present (readable at phone size). Prizes only: each sits between two
  // coal presents, which get a small grey 0, so 17 labels never crowd each other.
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (jp) { // the centre: the POOL JACKPOT (Cody, 2026-10-02), its word in two short lines so it fits between the two coal 0s
    ctx.fillStyle = '#cf3128'; ctx.font = "800 13px 'Alegreya Sans', sans-serif"; ctx.fillText('POOL', binX(k), LABEL_Y - 9 - (since < 0.5 ? pop : 0));
    ctx.font = "800 15px 'Alegreya Sans', sans-serif"; ctx.fillText('JACKPOT', binX(k), LABEL_Y + 7 - (since < 0.5 ? pop : 0)); return; }
  if (m === 0) { ctx.font = "700 15px 'Alegreya Sans', sans-serif"; ctx.fillStyle = '#8a93b3'; ctx.fillText('0', binX(k), LABEL_Y); return; }
  ctx.font = `800 ${m >= 100 ? 27 : m >= 10 ? 25 : 22}px 'Alegreya Sans', sans-serif`;
  ctx.fillStyle = m >= 10 ? '#cf3128' : m >= 5 ? '#9a6510' : '#34539a';
  ctx.fillText(`${m}×`, binX(k), LABEL_Y - (since < 0.5 ? pop : 0));
}
  // The jackpot present's crest: a five-point gold star with an ink outline sitting on its lid (the game's own star shape), and a
  // slow twinkle (two crossed white glints) that never adds glow to the snow around it. Still when reduced motion is asked for.
  function jackpotTop(cx, y, now) {
    const t = reduce ? 0 : now / 1000, r = 11, cy = y - 7;
    ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, d = i % 2 ? r * 0.45 : r; ctx.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); } ctx.closePath();
    ctx.fillStyle = '#ffc94a'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#0c0f1a'; ctx.stroke();
    const s = 0.5 + 0.5 * Math.sin(t * 3); if (s < 0.15) return;
    ctx.strokeStyle = `rgba(255,255,255,${0.85 * s})`; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(cx + 8, cy - 9 - 4 * s); ctx.lineTo(cx + 8, cy - 9 + 4 * s); ctx.moveTo(cx + 8 - 4 * s, cy - 9); ctx.lineTo(cx + 8 + 4 * s, cy - 9); ctx.stroke();
  }
  function draw(now, dt) {
  const s = cv.width / W; ctx.setTransform(s, 0, 0, s, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#16204a'); g.addColorStop(1, '#0f1530'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const a = ctx.createRadialGradient(CX + 60, 30, 10, CX + 60, 30, 300); a.addColorStop(0, 'rgba(127,224,160,.16)'); a.addColorStop(1, 'rgba(127,224,160,0)');
  ctx.fillStyle = a; ctx.fillRect(0, 0, W, H);                                            // a faint aurora glow, no edges
  ctx.fillStyle = 'rgba(245,241,232,.55)';
  for (const f of flakes) { if (!reduce) { f.y += f.v * dt; if (f.y > H) { f.y = -4; f.x = Math.random() * W; } } ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#eef2fb'; ctx.fillRect(0, BIN_Y + BIN_H - 4, W, H); // snow bank under the presents
  ctx.fillStyle = '#eef2fb'; for (let x = -10; x < W; x += 26) { ctx.beginPath(); ctx.arc(x, BIN_Y + BIN_H - 2, 14, Math.PI, 0); ctx.fill(); }
  if (hat.complete && hat.naturalWidth) ctx.drawImage(hat, CX - 30, 6, 60, 60 * (hat.naturalHeight / hat.naturalWidth));
  for (let i = 0; i < ROWS; i++) for (let j = -1; j <= i + 1; j++) {
    const x = pegX(i, j); if (x < 8 || x > W - 8) continue;
    const hit = pegHit.get(`${i}:${j}`), lit = hit ? Math.max(0, 1 - (now - hit) / 400) : 0; peg(x, pegY(i), lit);
  }
  for (let k = 0; k < BINS; k++) present(k, now);
  // balls: hop from peg to peg along the decided path
  for (let n = balls.length - 1; n >= 0; n--) {
    const b = balls[n], from = b.pts[b.leg], to = b.pts[b.leg + 1], dur = b.leg === 0 ? 0.22 : to.bin !== undefined ? 0.26 : 0.11;
    b.t += (dt * speed) / (reduce ? dur / 3 : dur);
    if (b.t >= 1) {
      b.t = 0; b.leg++;
      if (to.peg) pegHit.set(to.peg, now);
      if (b.leg >= b.pts.length - 1) { binHit[b.bin] = now; balls.splice(n, 1); b.done(); continue; }
    }
    const p = b.pts[b.leg], q = b.pts[b.leg + 1], t = b.t, arc = b.leg === 0 ? 0 : 8;
    const x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t * t - arc * Math.sin(Math.PI * t) * (1 - t);
    snowball(x, y, b.spin + (b.leg + t) * (q.x > p.x ? 0.9 : -0.9), t < 0.12 && b.leg > 0 ? 0.12 * (1 - t / 0.12) : 0);
  }
}
  function frame(now) { raf = 0; if (!active) return; const dt = Math.min(0.05, (now - last) / 1000); last = now; draw(now, dt); raf = requestAnimationFrame(frame); }
  // One snowball along `path` (0 = left, 1 = right at each row) into present `bin`. Resolves when it lands.
  function launch(path, bin) {
    const pts = [{ x: CX, y: 58 }]; let rights = 0;
    for (let i = 0; i < ROWS; i++) { pts.push({ x: pegX(i, rights), y: pegY(i) - PEG_R - BALL_R + 2, peg: `${i}:${rights}` }); rights += path[i]; }
    if (rights !== bin) throw new Error('path and present disagree');
    pts.push({ x: binX(bin), y: BIN_Y + BIN_H / 2 - 4, bin });
    return new Promise((done) => { balls.push({ pts, bin, leg: 0, t: 0, spin: Math.random() * 6, done: () => { if (!balls.length) speed = 1; done(); } }); if (!active) setActive(true); });
  }
  function setActive(on) { active = on || balls.length > 0; if (active && !raf) { last = performance.now(); fit(); raf = requestAnimationFrame(frame); } } // never freeze a falling snowball
  // Skip ahead: the snowballs in the air (and any launched before they all land) fall four times as fast.
  const hurry = () => { speed = 4; };
  const normal = () => { speed = 1; }; // "Normal speed" after Skip ahead (Cody)
  return { launch, setActive, hurry, normal, flying: () => balls.length };
}
