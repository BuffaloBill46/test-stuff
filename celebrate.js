// TIERED WIN CELEBRATIONS (Cody, 2026-10-04: "tiered winning animations, so people feel energy when they win a bigger pot").
// One scale for all three quick games (Big Hat, Snowball Drop, Stocking Stuffer), by how many times the stake came back:
//   tier 1 WIN (over 1×, under 3×)  a small chime and a few sparkles
//   tier 2 NICE WIN (3× to 9×)      the amount counts up, gold sparkles and coins, a brighter chime
//   tier 3 BIG WIN (10× to 24×)     longer count-up, coins and snow, light rays, the machine shakes
//   tier 4 HUGE WIN (25× and up)    confetti fountain, rays, shake, the border flashes, a fanfare
//   tier 5 the POOL JACKPOT         everything, in three waves, the longest count-up
// !! THE RULE (RESEARCH.md "losses disguised as wins"): only a play that came out AHEAD celebrates. tierOf() returns 0 for
// anything else, and celebrate(card, 0) does nothing. Never celebrate a return smaller than the stake.
// The game's own stamp (.flash: "3× WIN", "POOL JACKPOT $95.21") is unchanged; this adds the tier word, the count-up, the effects
// and the sound. A lower tier landing while a higher one still plays (Snowball Drop's balls land close together) never
// interrupts it: celebrating(card) tells a game whether to hold its stamp back. Reduced motion: no shake, no particles.
import { play as sfx } from './sfx.js?v=2d3bd4b23e';

export const TIERS = [
  null,
  { word: '', min: 1, sound: 'smallWin', fx: 12, tally: 0, hold: 0, ms: 1500 },
  { word: 'NICE WIN', min: 3, sound: 'niceWin', fx: 40, tally: 0.7, hold: 250, ms: 2200 },
  { word: 'BIG WIN', min: 10, sound: 'bigWin', fx: 95, tally: 1.3, hold: 800, ms: 3000, rays: true },
  { word: 'HUGE WIN', min: 25, sound: 'hugeWin', fx: 170, tally: 2.0, hold: 1500, ms: 3800, rays: true, confetti: true },
  { word: '', min: Infinity, sound: 'jackpot', fx: 230, tally: 2.8, hold: 2400, ms: 5000, rays: true, confetti: true, waves: 3 },
];

// ahead: the play paid more than it cost; mult: what came back ÷ the stake; jackpot: the pool jackpot.
export function tierOf({ ahead, jackpot = false, mult = 0 }) {
  if (jackpot) return 5;
  if (!ahead || !(mult > 1)) return 0;
  return mult >= 25 ? 4 : mult >= 10 ? 3 : mult >= 3 ? 2 : 1;
}

const live = new WeakMap(); // card → { tier, until, raf, parts, rays, t0 }
const now = () => performance.now();
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// The tier still playing on this card (0 when none).
export function celebrating(card) { const s = live.get(card); return s && now() < s.until ? s.tier : 0; }

function layers(card) {
  const screen = card.querySelector('.screen'); if (!screen) return null;
  let fx = screen.querySelector('canvas.fx'), word = screen.querySelector('.tierword'), tally = screen.querySelector('.tally');
  if (!fx) { fx = document.createElement('canvas'); fx.className = 'fx'; fx.setAttribute('aria-hidden', 'true'); screen.appendChild(fx); }
  if (!word) { word = document.createElement('div'); word.className = 'tierword'; word.setAttribute('aria-hidden', 'true'); screen.appendChild(word); }
  if (!tally) { tally = document.createElement('div'); tally.className = 'tally'; tally.setAttribute('aria-hidden', 'true'); screen.appendChild(tally); }
  return { screen, fx, word, tally };
}

const GOLD = ['#ffbe5c', '#f0b323', '#ffe27a'], CONFETTI = ['#cf3128', '#ffbe5c', '#7fe0a0', '#b9cdf2', '#f5f1e8', '#ff7a96'];
function burst(st, n, tier, w, h) {
  for (let i = 0; i < n; i++) {
    const kind = tier >= 4 && i % 2 ? 'confetti' : tier >= 2 && i % 3 === 0 ? 'coin' : tier >= 3 && i % 3 === 1 ? 'snow' : 'spark';
    const a = -Math.PI / 2 + (Math.random() - 0.5) * (kind === 'confetti' ? 1.6 : 2.6), sp = (0.35 + Math.random() * 0.75) * h * (tier >= 4 ? 1.5 : 1.1);
    st.parts.push({ kind, x: w * (0.5 + (Math.random() - 0.5) * 0.25), y: h * 0.48, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 12,
      size: (kind === 'confetti' ? 0.018 : kind === 'coin' ? 0.03 : kind === 'snow' ? 0.012 : 0.01) * w * (0.7 + Math.random() * 0.6),
      color: kind === 'confetti' ? CONFETTI[i % CONFETTI.length] : kind === 'snow' ? '#f5f1e8' : GOLD[i % GOLD.length], life: 0, max: 1.4 + Math.random() * 1.2 });
  }
}

function animate(card, st, fx) {
  const g = fx.getContext('2d'); let last = now();
  const step = () => {
    const t = now(), dt = Math.min(0.05, (t - last) / 1000), age = (t - st.t0) / 1000; last = t;
    const w = fx.width, h = fx.height; g.clearRect(0, 0, w, h);
    // light rays: slow turning wedges behind the stamp, fading out
    if (st.rays && age < st.rays) { const a = Math.min(1, age / 0.3) * Math.max(0, 1 - age / st.rays) * 0.35; g.save(); g.translate(w / 2, h * 0.45); g.rotate(age * 0.6);
      for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.beginPath(); g.moveTo(0, 0); g.lineTo(w, -w * 0.09); g.lineTo(w, w * 0.09); g.closePath(); g.fillStyle = `rgba(255,214,120,${a})`; g.fill(); } g.restore(); }
    for (const p of st.parts) {
      p.life += dt; const drag = p.kind === 'confetti' ? 1.8 : p.kind === 'snow' ? 1.2 : 0.6;
      p.vx -= p.vx * drag * dt; p.vy += (p.kind === 'snow' ? 0.25 : p.kind === 'confetti' ? 0.45 : 0.9) * h * dt - p.vy * drag * 0.4 * dt;
      if (p.kind === 'confetti') p.vx += Math.sin(p.life * 7 + p.rot) * w * 0.4 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      const fade = Math.max(0, 1 - Math.max(0, p.life - p.max * 0.6) / (p.max * 0.4)); if (fade <= 0) continue;
      g.save(); g.globalAlpha = fade; g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.color;
      if (p.kind === 'confetti') g.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9);
      else if (p.kind === 'coin') { g.scale(Math.abs(Math.cos(p.rot)) + 0.15, 1); g.beginPath(); g.arc(0, 0, p.size, 0, 6.29); g.fill(); g.strokeStyle = '#8f5a12'; g.lineWidth = p.size * 0.18; g.stroke(); }
      else if (p.kind === 'snow') { g.beginPath(); g.arc(0, 0, p.size, 0, 6.29); g.fill(); }
      else { const s = p.size * (1 + 0.5 * Math.sin(p.life * 18)); g.beginPath(); for (let k = 0; k < 8; k++) { const r = k % 2 ? s * 0.35 : s * 1.6, a = (k * Math.PI) / 4; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); }
      g.restore();
    }
    st.parts = st.parts.filter((p) => p.life < p.max && p.y < h * 1.2);
    while (st.waves.length && age >= st.waves[0]) { st.waves.shift(); burst(st, st.waveN, st.tier, w, h); }
    if (st.parts.length || st.waves.length || (st.rays && age < st.rays)) st.raf = requestAnimationFrame(step); else { g.clearRect(0, 0, w, h); st.raf = 0; }
  };
  cancelAnimationFrame(st.raf); st.raf = requestAnimationFrame(step);
}

// Celebrate a result on a game card (.machine). opts: { amount, money (formatter), fast (Skip ahead) }.
// Returns how long the game should hold before its next play (ms; short under Skip ahead).
export function celebrate(card, tier, { amount = 0, money = (x) => '$' + x.toFixed(2), fast = false } = {}) {
  const T = TIERS[tier]; if (!T || !card) return 0;
  const busy = celebrating(card), L = layers(card); if (!L) return 0;
  if (busy > tier) { // a bigger one is still playing: a few extra sparkles, nothing louder
    const st = live.get(card); if (st && !reducedMotion()) { burst(st, 6, 1, L.fx.width, L.fx.height); if (!st.raf) animate(card, st, L.fx); }
    return 0;
  }
  sfx(T.sound);
  const speed = fast ? 0.45 : 1, ms = T.ms * speed;
  for (let k = 1; k <= 5; k++) card.classList.remove('t' + k); void card.offsetWidth; card.classList.add('t' + tier);
  // tier word and the count-up
  L.word.textContent = T.word; L.word.classList.toggle('show', !!T.word);
  const prev = live.get(card); if (prev) { cancelAnimationFrame(prev.raf); cancelAnimationFrame(prev.tallyRaf); clearTimeout(prev.timer); }
  const st = { tier, t0: now(), until: now() + ms, parts: [], waves: [], waveN: 0, rays: T.rays ? (ms / 1000) * 0.8 : 0, raf: 0, tallyRaf: 0, timer: 0 };
  live.set(card, st);
  if (T.tally && amount > 0) { const dur = T.tally * speed * 1000, t0 = now(); L.tally.classList.add('show');
    const count = () => { const k = Math.min(1, (now() - t0) / dur), e = 1 - (1 - k) ** 3; L.tally.textContent = money(amount * e); if (k < 1) st.tallyRaf = requestAnimationFrame(count); };
    count(); } else { L.tally.classList.remove('show'); L.tally.textContent = ''; }
  // effects
  if (!reducedMotion()) {
    const r = L.screen.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    L.fx.width = Math.max(1, Math.round(r.width * dpr)); L.fx.height = Math.max(1, Math.round(r.height * dpr));
    const waves = T.waves || (tier >= 4 ? 2 : 1); st.waveN = Math.round(T.fx / waves);
    burst(st, st.waveN, tier, L.fx.width, L.fx.height); for (let k = 1; k < waves; k++) st.waves.push(k * 0.7 * speed);
    animate(card, st, L.fx);
  }
  st.timer = setTimeout(() => { card.classList.remove('t' + tier); L.word.classList.remove('show'); L.tally.classList.remove('show'); }, ms);
  return fast ? Math.min(T.hold, 300) : T.hold;
}
