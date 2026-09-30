// Santa Hat Spin page: bet chips, Spin button, pool readout, odds legend, last-spins strip, full screen.
// DEMO ONLY: play money (the same demo balance as Slots) and a demo Spin pool kept in this browser.
import { SPIN_RULES, MAIN_SLICES, MAIN, BONUS, STAR, odds } from './spin.js';
import { createWheel, MULT_STYLE } from './spin3d.js';
import { ready, play, short, setSpinKind, spinKindFor } from './playcredits.js';
import { play as sfx } from './sfx.js';

const $ = (s, el = document) => el.querySelector(s);
const money = (v) => '$' + (Math.floor(v * 100 + 1e-6) / 100).toFixed(2);
const cents = (v) => (v < 1 ? Math.round(v * 100) + '¢' : money(v));
const KEY = 'sh_spin_demo', MAX_HISTORY = 16;
const store = { get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }, set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} } };

let view = null, busy = false, bet = 0.1, wallet = null, addWinner = () => {}, shownPool = 0;
const saved = store.get();
const st = saved && Number.isFinite(saved.pool) ? { treasury: 0, history: [], ...saved } : { pool: SPIN_RULES.start, treasury: 0, history: [] };
const test = { next: undefined }; // tests only: force the next main segment (0–39), or [main, bonus]
const card = () => $('#spin .wheelcard');

function render() {
  $('#spinPool').textContent = money(shownPool);
  const h = $('#spinHistory');
  h.innerHTML = st.history.length ? st.history.map((m) => { const [bg, fg] = MULT_STYLE[m]; return `<li style="background:${bg};color:${fg}">${m}×</li>`; }).join('')
    : '<li class="empty">No spins yet.</li>';
}
function odds_() {
  const o = odds(), stars = MAIN.filter((m) => m === STAR).length, count = (list, m) => list.filter((x) => x === m).length;
  const where = (m) => (count(MAIN, m) ? `${count(MAIN, m)} of ${MAIN.length} on the wheel` : `${count(BONUS, m)} of ${BONUS.length} on the bonus wheel`);
  $('#oddsList').innerHTML = [5, 4, 3, 2, 1, 0].filter((m) => o[m]).map((m) => `<li><i style="background:${MULT_STYLE[m][0]}"></i><span><b>${m}×</b> ${m === 1 ? 'money back' : m === 0 ? 'no win' : 'win'} · ${where(m)}<br>${(o[m] * 100).toFixed(1)}% · 1 in ${+(1 / o[m]).toFixed(1)}</span></li>`).join('')
    + (stars ? `<li><i style="background:${MULT_STYLE[STAR][0]}"></i><span><b>★</b> gold star · ${stars} of ${MAIN.length}: spin the bonus wheel<br>${((stars / MAIN.length) * 100).toFixed(1)}% · 1 in ${+(MAIN.length / stars).toFixed(1)}</span></li>` : '');
}
// Phones: the result line sits under the wheel; bring it just into view when the play ends (focus-group finding).
// The bottom tab bar covers the page on phones, so "visible" means above it (a first version missed that).
export const visibleBottom = () => { const t = document.querySelector('#nav .tabs'), r = t?.getBoundingClientRect(); return r && r.top > innerHeight / 2 ? r.top : innerHeight; };
export function showResult(el) { const r = el.getBoundingClientRect(); if (r.bottom > visibleBottom() || r.top < 0) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
function stamp(text) { const fl = $('#spin .flash'); fl.textContent = text; fl.classList.remove('show'); void fl.offsetWidth; fl.classList.add('show'); }
function setBet(b) { bet = b; setSpinKind(spinKindFor(b)); document.querySelectorAll('#spin .bets button').forEach((x) => x.setAttribute('aria-checked', String(+x.dataset.bet === b))); }

async function doSpin() {
  if (busy) { view.finishNow(); return; } // tap again: land it now (same slice)
  const res = $('#spin .res'), kind = spinKindFor(bet);
  if (!(await ready(kind)) || busy) return; // no spins of this size left: the buy counter opens first
  busy = true;
  const forced = test.next; test.next = undefined;
  const p = await play(kind, forced); // the house: pool check, spend a spin, lock the secret, draw (house.js)
  if (!p.r) { busy = false; res.textContent = p.failed ? `Couldn't spin (${p.why}). Your spin is still on your account.` : p.refused ? (p.stopped ? 'Spin is paused right now. Your spin stays on your account.' : 'The Spin pool is refilling. Try again in a moment; your spin is kept.') : 'No spins left.'; return; }
  const r = p.r;
  card().classList.remove('won', 'jackpot'); $('#spin .flash').classList.remove('show');
  store.set(st);
  res.textContent = `Spinning… result locked (${short(p.commit)}). Tap again to land it early.`;
  if (view.mode !== 'main') await view.flipTo('main');
  if (r.bonusSlice !== undefined) { // a gold star: the wheel turns round to its bonus face and spins again
    await view.spinTo(r.slice, { star: true });
    sfx('smallWin'); stamp('★ BONUS'); res.textContent = 'Gold star! Spinning the bonus wheel: 3×, 4× or 5×.';
    await view.flipTo('bonus'); await view.spinTo(r.bonusSlice, r);
  } else await view.spinTo(r.slice, r);
  if (p.server) { st.pool = p.poolUsd; shownPool = st.pool; } // the server's pool; winnings go out as a real payout
  else { shownPool = st.pool; wallet.add(r.received); }
  st.history.unshift(r.mult); st.history.length = Math.min(st.history.length, MAX_HISTORY);
  if (r.mult >= 2) { // a real win: more back than the spin cost
    sfx(r.mult >= 4 ? 'bigWin' : 'smallWin'); card().classList.add(r.mult >= 5 ? 'jackpot' : 'won'); stamp(r.mult >= 5 ? '5× !' : `${r.mult}× WIN`);
    res.innerHTML = `<b>${r.mult}× win!</b> ${money(r.pay)} <span class="dim">· you get ${money(r.received)} after the 3% tax</span>`;
    addWinner(bet >= 1 ? 'spin100' : 'spin10', r.pay, bet, `${r.mult}×`);
  } else if (r.mult === 1) res.innerHTML = `<span class="dim">Money back, less SANTA's 3% tax: you get ${money(r.received)}.</span>`;
  else res.textContent = 'No win this time.';
  store.set(st); render(); busy = false;
  showResult(res);
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
  // The label follows the browser's own report (entering can take longer than a moment on a busy or slow device).
  document.addEventListener('fullscreenchange', () => { const c = card(), b = $('#spinFs'), on = document.fullscreenElement === c || c.classList.contains('max');
    b.setAttribute('aria-pressed', String(on)); $('span', b).textContent = on ? 'Exit full screen' : 'Full screen'; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') card().classList.remove('max'); });
  setBet(+document.querySelector('#spin .bets [aria-checked="true"]').dataset.bet); // the chosen size's price (settings may change it)
  odds_(); render();
  window.__spin = { st, view, test, get busy() { return busy; }, get shownPool() { return shownPool; }, SLICES: MAIN_SLICES };
}
export function resetSpin() { if (busy) return; Object.assign(st, { pool: SPIN_RULES.start, treasury: 0, history: [] }); shownPool = st.pool; store.set(st); render(); }
export function showSpin(on) { view?.setActive(on); }
export const spinState = () => st;
export function refreshSpin() { if (!busy) shownPool = st.pool; store.set(st); render(); }
