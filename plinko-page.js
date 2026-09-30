// Snowball Drop preview page: draws the board and animates each drop along the path the rules already decided (plinko.js).
import { ROWS, BINS, PAYS, WAYS, TOTAL, payback, realWin, drop } from './plinko.js';

const $ = (s) => document.querySelector(s);
const cv = $('#board'), ctx = cv.getContext('2d');
const W = 500, H = 560, CX = W / 2, GAP = 54, TOP = 100, ROW_H = 44, PEG_R = 6, BALL_R = 11;
const BIN_Y = TOP + (ROWS - 1) * ROW_H + 36, BIN_H = 58, LABEL_Y = BIN_Y + BIN_H + 26; // prize labels sit on the snow bank
const pegX = (i, j) => CX + (j - i / 2) * GAP, pegY = (i) => TOP + i * ROW_H, binX = (k) => CX + (k - (BINS - 1) / 2) * GAP;
const money = (x) => '$' + x.toFixed(2);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

let bal = 10, bet = 0.1, dropped = 0;
const balls = [], pegHit = new Map(), binHit = new Array(BINS).fill(-1e9), recent = [], log = [];
const hat = new Image(); hat.src = 'hat-logo.png';
const flakes = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 0.6 + Math.random() * 1.8, v: 8 + Math.random() * 18 }));

// Colours per prize: the rare 5× presents are Santa-hat red with a white brim; 2× pine; 1.2× frost; the rest plain plaque.
const TIER = (m) => (m >= 5 ? { box: '#cf3128', rib: '#f5f1e8', text: '#f5f1e8' } : m >= 2 ? { box: '#3f9e6a', rib: '#ffbe5c', text: '#0c0f1a' }
  : m > 1 ? { box: '#6f8fd0', rib: '#f5f1e8', text: '#0c0f1a' } : { box: '#2e3a6e', rib: '#b9cdf2', text: '#b9cdf2' });

function fit() {
  const dpr = Math.min(3, devicePixelRatio || 1), w = cv.clientWidth;
  cv.width = Math.round(w * dpr); cv.height = Math.round(w * (H / W) * dpr);
}
addEventListener('resize', fit); fit();

function newBall() {
  if (bal + 1e-9 < bet) { $('#res').innerHTML = 'Out of demo money. Reload the page to start again.'; return; }
  bal = Math.round((bal - bet) * 100) / 100; renderBal(); dropped++;
  const r = drop(bet), pts = [{ x: CX, y: 58 }];
  let rights = 0;
  for (let i = 0; i < ROWS; i++) { pts.push({ x: pegX(i, rights), y: pegY(i) - PEG_R - BALL_R + 2, peg: `${i}:${rights}` }); rights += r.path[i]; }
  pts.push({ x: binX(r.bin), y: BIN_Y + BIN_H / 2 - 4, bin: r.bin });
  balls.push({ r, pts, leg: 0, t: 0, spin: Math.random() * 6 });
}
function landed(b) {
  const r = b.r; log.push(r); bal = Math.round((bal + r.pay) * 100) / 100; renderBal(); binHit[r.bin] = performance.now();
  recent.unshift(r); recent.length = Math.min(recent.length, 14);
  $('#res').innerHTML = r.mult >= 5 ? `<b>5×!</b> <span class="up">+${money(r.pay)}</span> off the very edge. 1 in 128.`
    : r.ahead ? `<b>${r.mult}×</b> <span class="up">+${money(r.pay)}</span> back on a ${money(r.bet)} drop.`
    : `<b>${r.mult}×</b> ${money(r.pay)} back on a ${money(r.bet)} drop.`;
  $('#strip').innerHTML = recent.map((x) => `<span class="${x.mult >= 5 ? 'top' : x.ahead ? 'win' : ''}">${x.mult}×</span>`).join('');
}
const renderBal = () => { $('#bal').textContent = money(bal); };

// ---------- drawing
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
  const m = PAYS[k], c = TIER(m), since = (now - binHit[k]) / 1000, pop = since < 0.5 ? Math.sin((since / 0.5) * Math.PI) * 8 : 0;
  const w = GAP - 6, x = binX(k) - w / 2, y = BIN_Y - pop;
  ctx.fillStyle = '#0c0f1a'; ctx.fillRect(x + 3, y + 3, w, BIN_H);
  ctx.fillStyle = c.box; ctx.fillRect(x, y, w, BIN_H);
  ctx.fillStyle = c.rib; ctx.fillRect(binX(k) - 4, y, 8, BIN_H);                      // ribbon
  if (m >= 5) { ctx.fillStyle = '#f5f1e8'; ctx.fillRect(x, y, w, 12); ctx.fillStyle = '#d9d2c2'; ctx.fillRect(x, y + 9, w, 3); } // the hat's brim
  ctx.lineWidth = 2; ctx.strokeStyle = '#0c0f1a'; ctx.strokeRect(x, y, w, BIN_H);
  if (since < 0.9) { ctx.fillStyle = `rgba(255,226,168,${0.5 * (1 - since / 0.9)})`; ctx.fillRect(x, y, w, BIN_H); }
  // the prize, big and dark on the snow bank under its present (readable at phone size)
  ctx.font = `800 ${m >= 5 ? 26 : 22}px 'Alegreya Sans', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = m >= 5 ? '#cf3128' : m >= 2 ? '#2c7a4f' : m > 1 ? '#34539a' : '#5a6485';
  ctx.fillText(`${m}×`, binX(k), LABEL_Y - (since < 0.5 ? pop : 0));
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
    const x = pegX(i, j); if (x < 12 || x > W - 12) continue;
    const hit = pegHit.get(`${i}:${j}`), lit = hit ? Math.max(0, 1 - (now - hit) / 400) : 0; peg(x, pegY(i), lit);
  }
  for (let k = 0; k < BINS; k++) present(k, now);
  // balls: hop from peg to peg along the decided path
  for (let n = balls.length - 1; n >= 0; n--) {
    const b = balls[n], from = b.pts[b.leg], to = b.pts[b.leg + 1], dur = b.leg === 0 ? 0.22 : to.bin !== undefined ? 0.26 : 0.15;
    b.t += dt / (reduce ? dur / 3 : dur);
    if (b.t >= 1) {
      b.t = 0; b.leg++;
      if (to.peg) pegHit.set(to.peg, now);
      if (b.leg >= b.pts.length - 1) { landed(b); balls.splice(n, 1); continue; }
    }
    const p = b.pts[b.leg], q = b.pts[b.leg + 1], t = b.t, arc = b.leg === 0 ? 0 : 12;
    const x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t * t - arc * Math.sin(Math.PI * t) * (1 - t);
    snowball(x, y, b.spin + (b.leg + t) * (q.x > p.x ? 0.9 : -0.9), t < 0.12 && b.leg > 0 ? 0.12 * (1 - t / 0.12) : 0);
  }
}
let last = performance.now();
function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; draw(now, dt); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

// ---------- controls
$('#drop').addEventListener('click', newBall);
cv.addEventListener('click', newBall);
document.querySelectorAll('[data-bet]').forEach((b) => b.addEventListener('click', () => {
  bet = +b.dataset.bet; document.querySelectorAll('[data-bet]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
}));
// Odds legend, from the same numbers the game uses
const groups = [...new Set(PAYS)].sort((a, b) => b - a).map((m) => ({ m, ways: PAYS.reduce((a, p, k) => a + (p === m ? WAYS[k] : 0), 0) }));
$('#oddsTable').innerHTML = groups.map((g) => `<tr><td>${g.m}×</td><td>${g.m >= 5 ? 'an edge present' : g.m > 1 ? 'more back than it cost' : 'part of it back'}</td><td>1 in ${(TOTAL / g.ways).toFixed(g.ways * 10 >= TOTAL ? 1 : 0)}</td></tr>`).join('');
$('#oddsNote').textContent = `Pays back ${(payback() * 100).toFixed(1)}% over time (the same range as Spin). About 1 drop in ${(1 / realWin()).toFixed(1)} gives back more than it cost. Winnings are paid in SANTA, and SANTA's 3% tax comes off on the way.`;
window.__drop = { newBall, get bal() { return bal; }, get flying() { return balls.length; }, get recent() { return recent; }, get log() { return log; }, get dropped() { return dropped; } };
