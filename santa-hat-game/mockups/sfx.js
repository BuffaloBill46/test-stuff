// Sound effects, made in code with the browser's Web Audio (no sound files to download or license).
// Each sound is built from what the thing is: sleigh bells for a catch, a soft packed-snow thump for a hit, a wooden
// clack for a reel stop, a peg tick for the wheel. Quiet by design; one master volume and a mute that's remembered.
// The audio engine starts on the first tap (browsers only allow sound after the player touches the page).
const KEY = 'sh_sound';
let ctx = null, master = null, noiseBuf = null;
let muted = (() => { try { return localStorage.getItem(KEY) === 'off'; } catch { return false; } })();
export const stats = { played: 0, byName: {} }; // tests: what would have played

function start() {
  if (ctx || typeof AudioContext === 'undefined') return;
  ctx = new AudioContext(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
if (typeof window !== 'undefined') for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, () => { start(); ctx?.resume?.(); }, { passive: true });

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m; try { localStorage.setItem(KEY, m ? 'off' : 'on'); } catch {}
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.02);
  document.querySelectorAll('.sndbtn').forEach((b) => { b.setAttribute('aria-pressed', String(!m)); b.title = m ? 'Sound off' : 'Sound on'; b.classList.toggle('off', m); });
}

// building blocks
function tone(freq, t0, dur, { type = 'sine', vol = 0.3, to = null, attack = 0.005 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0); if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(t0, dur, { vol = 0.3, filter = 'lowpass', freq = 800, to = null, q = 0.7 } = {}) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = filter; f.frequency.setValueAtTime(freq, t0); if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur); f.Q.value = q;
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(master); s.start(t0); s.stop(t0 + dur + 0.02);
}
// a sleigh bell: a bright metallic ring (inharmonic partials) with a tiny rattle
function bell(t0, base = 1800, vol = 0.12) {
  for (const [m, v] of [[1, 1], [2.76, 0.5], [5.4, 0.25]]) tone(base * m, t0, 0.35, { type: 'sine', vol: vol * v });
  noise(t0, 0.06, { vol: vol * 0.8, filter: 'highpass', freq: 6000 });
}

const SOUNDS = {
  splat: (t) => { noise(t, 0.18, { vol: 0.35, freq: 900, to: 200 }); tone(140, t, 0.12, { vol: 0.2, to: 70 }); },           // packed snow on a coat
  knock: (t) => { tone(220, t, 0.25, { type: 'triangle', vol: 0.25, to: 520 }); noise(t, 0.08, { vol: 0.2, freq: 1500 }); },  // hat pops off
  catch: (t) => { [0, 0.07, 0.14].forEach((d, i) => bell(t + d, 1700 + i * 260)); },                                         // sleigh bells
  boing: (t) => tone(180, t, 0.3, { type: 'triangle', vol: 0.22, to: 420 }),
  round: (t) => { bell(t, 1320, 0.1); bell(t + 0.18, 1760, 0.1); },
  throw: (t) => noise(t, 0.15, { vol: 0.12, filter: 'bandpass', freq: 600, to: 2400, q: 1.2 }),                             // whoosh
  reelStop: (t) => { tone(300, t, 0.07, { type: 'square', vol: 0.06, to: 180 }); noise(t, 0.04, { vol: 0.15, filter: 'bandpass', freq: 1800 }); }, // wooden clack
  spinTick: (t) => noise(t, 0.025, { vol: 0.12, filter: 'bandpass', freq: 3200, q: 3 }),                                   // peg past the flapper
  buy: (t) => { tone(1046, t, 0.12, { vol: 0.1 }); tone(1568, t + 0.06, 0.18, { vol: 0.1 }); },                              // coin-ish chime
  smallWin: (t) => { [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.08, 0.25, { type: 'triangle', vol: 0.12 })); bell(t + 0.24, 2000, 0.08); },
  bigWin: (t) => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, t + i * 0.09, 0.4, { type: 'triangle', vol: 0.14 })); for (let i = 0; i < 6; i++) bell(t + 0.3 + i * 0.09, 1600 + (i % 3) * 300, 0.08); },
  jackpot: (t) => { for (let r = 0; r < 3; r++) [523, 659, 784, 1046].forEach((f, i) => tone(f * (1 + r * 0.25), t + r * 0.45 + i * 0.08, 0.5, { type: 'triangle', vol: 0.13 })); for (let i = 0; i < 14; i++) bell(t + i * 0.1, 1500 + (i % 4) * 250, 0.07); },
};

// Play a sound by name. Silent (and harmless) before the first tap or when muted.
export function play(name) {
  stats.played++; stats.byName[name] = (stats.byName[name] || 0) + 1;
  if (muted || !ctx || ctx.state === 'closed' || !SOUNDS[name]) return;
  try { SOUNDS[name](ctx.currentTime + 0.01); } catch {}
}
export const NAMES = Object.keys(SOUNDS);

// Wire every sound button on the page.
export function initSoundButtons() {
  document.querySelectorAll('.sndbtn').forEach((b) => { if (b.dataset.wired) return; b.dataset.wired = '1'; b.addEventListener('click', () => { start(); setMuted(!muted); if (!muted) play('buy'); }); });
  setMuted(muted);
  window.__sfx = { stats, get state() { return ctx?.state || 'not started'; }, get muted() { return muted; } }; // tests
}
