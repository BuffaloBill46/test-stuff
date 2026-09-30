// Santa Hat Spin page: bet chips, Spin button, pool readout, odds legend, last-spins strip, full screen.
// DEMO ONLY: play money (the same demo balance as Slots) and a demo Spin pool kept in this browser.
import { SPIN_RULES, SLICES, odds, spin } from './spin.js';
import { createWheel, MULT_STYLE } from './spin3d.js';

const $ = (s, el = document) => el.querySelector(s);
const money = (v) => '$' + (Math.floor(v * 100 + 1e-6) / 100).toFixed(2);
const cents = (v) => (v < 1 ? Math.round(v * 100) + '¢' : money(v));
const KEY = 'sh_spin_demo', MAX_HISTORY = 16;
const store = { get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }, set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} } };

let view = null, busy = false, bet = 0.1, wallet = null, addWinner = () => {}, shownPool = 0;
const saved = store.get();
const st = saved && Number.isFinite(saved.pool) ? { treasury: 0, history: [], ...saved } : { pool: SPIN_RULES.start, treasury: 0, history: [] };
const test = { next: undefined }; // tests only: force the next slice (0–399)
const card = () => $('#spin .wheelcard');

function render() {
  $('#spinPool').textContent = money(shownPool);
  const h = $('#spinHistory');
  h.innerHTML = st.history.length ? st.history.map((m) => { const [bg, fg] = MULT_STYLE[m]; return `<li style="background:${bg};color:${fg}">${m}×</li>`; }).join('')
    : '<li class="empty">No spins yet.</li>';
}
function odds_() {
  const o = odds();
  $('#oddsList').innerHTML = [5, 4, 3, 2, 1, 0].map((m) => `<li><i style="background:${MULT_STYLE[m][0]}"></i><span><b>${m}×</b> ${m === 1 ? 'money back' : m === 0 ? 'no win' : 'win'}<br>${(o[m] * 100).toFixed(1)}% · 1 in ${+(1 / o[m]).toFixed(1)}</span></li>`).join('');
}
function stamp(text) { const fl = $('#spin .flash'); fl.textContent = text; fl.classList.remove('show'); void fl.offsetWidth; fl.classList.add('show'); }
function setBet(b) { bet = b; document.querySelectorAll('#spin .bets button').forEach((x) => x.setAttribute('aria-checked', String(+x.dataset.bet === b))); }

async function doSpin() {
  if (busy) { view.finishNow(); return; } // tap again: land it now (same slice)
  const res = $('#spin .res');
  if (wallet.get() < bet - 1e-9) { res.textContent = 'Out of demo money. Tap Reset (above the Slots) to play on.'; return; }
  const forced = test.next; test.next = undefined;
  const r = spin(st, bet, Math.random, forced);
  if (r.paused) { res.textContent = r.stopped ? 'Spin is paused right now.' : 'The Spin pool is refilling. Try again in a moment.'; return; }
  busy = true; card().classList.remove('won', 'jackpot'); $('#spin .flash').classList.remove('show');
  wallet.add(-bet); store.set(st);
  res.textContent = 'Spinning… tap again to land it early.';
  await view.spinTo(r.slice, r);
  shownPool = st.pool; wallet.add(r.received);
  st.history.unshift(r.mult); st.history.length = Math.min(st.history.length, MAX_HISTORY);
  if (r.mult >= 2) { // a real win: more back than the spin cost
    card().classList.add(r.mult >= 5 ? 'jackpot' : 'won'); stamp(r.mult >= 5 ? '5× !' : `${r.mult}× WIN`);
    res.innerHTML = `<b>${r.mult}× win!</b> ${money(r.pay)} <span class="dim">· you get ${money(r.received)} after the 3% tax</span>`;
    addWinner(bet >= 1 ? 'spin100' : 'spin10', r.pay, bet, `${r.mult}×`);
  } else if (r.mult === 1) res.innerHTML = `<span class="dim">Money back: ${money(r.pay)} (you get ${money(r.received)} after the 3% tax).</span>`;
  else res.textContent = 'No win this time.';
  store.set(st); render(); busy = false;
}

function toggleFull() {
  const c = card(), btn = $('#spinFs'), isOn = document.fullscreenElement === c || c.classList.contains('max');
  if (isOn) { if (document.fullscreenElement) document.exitFullscreen?.(); c.classList.remove('max'); }
  else if (c.requestFullscreen && document.fullscreenEnabled) c.requestFullscreen().catch(() => c.classList.add('max'));
  else c.classList.add('max');
  setTimeout(() => { const on = document.fullscreenElement === c || c.classList.contains('max'); btn.setAttribute('aria-pressed', String(on)); $('span', btn).textContent = on ? 'Exit full screen' : 'Full screen'; }, 60);
}

let inited = false;
export function initSpin(opts) {
  if (inited) return; inited = true;
  wallet = opts.wallet; addWinner = opts.addWinner || addWinner; shownPool = st.pool;
  view = createWheel($('#spin canvas'));
  $('#spin .spinbtn').addEventListener('click', doSpin);
  $('#spin canvas').addEventListener('click', doSpin);
  document.querySelectorAll('#spin .bets button').forEach((b) => b.addEventListener('click', () => { if (!busy) setBet(+b.dataset.bet); }));
  $('#spinFs').addEventListener('click', toggleFull);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) { const b = $('#spinFs'); b.setAttribute('aria-pressed', 'false'); $('span', b).textContent = 'Full screen'; } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') card().classList.remove('max'); });
  odds_(); render();
  window.__spin = { st, view, test, get busy() { return busy; }, get shownPool() { return shownPool; }, SLICES };
}
export function resetSpin() { if (busy) return; Object.assign(st, { pool: SPIN_RULES.start, treasury: 0, history: [] }); shownPool = st.pool; store.set(st); render(); }
export function showSpin(on) { view?.setActive(on); }
