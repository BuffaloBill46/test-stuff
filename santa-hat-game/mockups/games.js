// Games tab: wires the Slots page (readouts, Pull, full screen, paytable, winners list) to the rules (slots.js) and the
// 3D Big Hat machine (slots3d.js). DEMO ONLY: play money and a demo pool kept in this browser. No SANTA moves.
import { MACHINES, SYMBOLS, POOL_RULES, pull, stats, jackpotAmount } from './slots.js';
import { createMachine, symbolImages } from './slots3d.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const money = (v) => '$' + (Math.floor(v * 100 + 1e-6) / 100).toFixed(2);
const M = MACHINES.big, KEY = 'sh_slots_demo2', DEMO_START = 20, MAX_WINNERS = 30;
const store = { get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }, set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} } };

// Game icons for the shared winners list (Slots now; the two Spin sizes when Spin is built).
const ICONS = {
  slots: '<svg viewBox="0 0 24 24" aria-label="Slots"><path d="M4 20h16l-2-3H6z" fill="#f5f1e8" stroke="#0c0f1a"/><path d="M6 17c1-7 3-12 7-13 3 1 5 4 6 7l-2 1c-1-2-2-4-4-5-2 1-3 5-4 10z" fill="#cf3128" stroke="#0c0f1a"/><circle cx="18" cy="13" r="2" fill="#f5f1e8" stroke="#0c0f1a"/></svg>',
  spin10: '<svg viewBox="0 0 24 24" aria-label="Spin 10¢"><circle cx="12" cy="12" r="9" fill="#1b2344" stroke="#ffbe5c" stroke-width="2"/><path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" stroke="#ffbe5c"/></svg>',
  spin100: '<svg viewBox="0 0 24 24" aria-label="Spin $1"><circle cx="12" cy="12" r="9" fill="#cf3128" stroke="#ffd95c" stroke-width="2"/><path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" stroke="#ffd95c"/></svg>',
};
const GAME_NAMES = { slots: 'Slots', spin10: 'Spin 10¢', spin100: 'Spin $1' };

let inited = false, view = null, busy = false, nameOf = () => 'You';
const saved = store.get();
const state = saved && Number.isFinite(saved.pool) && Number.isFinite(saved.bal)
  ? { treasury: 0, winners: [], ...saved } : { pool: POOL_RULES.start, bal: DEMO_START, treasury: 0, winners: [] };
let shownPool = state.pool; // readouts update when the reels land, so a result isn't spoiled early
const test = { next: undefined }; // tests only: force the next pull ('JACKPOT' or an array of 5 reel stops)

function render() {
  $('#slotPool').textContent = money(shownPool);
  $('#demoBal').textContent = money(state.bal);
  $('#jpAmt').textContent = money(jackpotAmount('big', shownPool));
  $('.machine .pct').textContent = +(M.jackpotPct * 100).toFixed(2) + '%';
  $('#topAmt').textContent = money(100 * M.bet);
  renderWinners();
}

function facts() {
  const s = stats(M);
  $('.machine .facts').innerHTML = [
    ['Pays back', `${(s.payback * 100).toFixed(1)}% on average`],
    ['Top line prize (5 Santa Hats)', `about 1 in ${Math.round(1 / (s.topPerLine * s.lines)).toLocaleString()}`],
    ['Pool jackpot', `1 in ${Math.round(1 / M.poolJackpotOdds).toLocaleString()}`],
    ['Every Santa Hat on the grid', `+${Math.round(M.hatBonus * M.bet * 100)}¢`],
  ].map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('');
}

function paytable() {
  const imgs = symbolImages(), src = (id) => imgs[id].toDataURL('image/png'), usd = (x) => money(x * M.bet);
  const rows = SYMBOLS.filter((s) => M.pays[s.id]).map((s) => {
    const p = M.pays[s.id];
    return `<tr><td><img alt="" src="${src(s.id)}">${esc(s.name)}${s.id === 'hat' ? ' <span class="dim">(wild)</span>' : ''}</td><td>${p[3] ? usd(p[3]) : '—'}</td><td>${p[4] ? usd(p[4]) : '—'}</td><td>${p[5] ? usd(p[5]) : '—'}</td></tr>`;
  }).join('');
  $('#payRows').innerHTML = `<table class="pays"><thead><tr><th>Symbol</th><th>3 in a row</th><th>4 in a row</th><th>5 in a row</th></tr></thead><tbody>${rows}
    <tr class="extra"><td><img alt="" src="${src('hat')}">Each Santa Hat, anywhere</td><td colspan="3">+${usd(M.hatBonus)} each</td></tr>
    <tr class="extra"><td><img alt="" src="${src('hat')}">All 25 squares Santa Hats</td><td colspan="3">Pool jackpot: ${+(M.jackpotPct * 100).toFixed(2)}% of the pool</td></tr>
    <tr><td><img alt="" src="${src('coal')}">Coal</td><td colspan="3" class="dim">No win (hats can't help it)</td></tr></tbody></table>`;
  $('#payLines').innerHTML = M.lines.map((rows, i) => `<figure><div class="mini">${Array.from({ length: M.rows * M.reels }, (_, k) => {
    const row = Math.floor(k / M.reels), r = k % M.reels; return `<i class="${rows[r] === row ? 'on' : ''}"></i>`; }).join('')}</div>Line ${i + 1}</figure>`).join('');
}

function renderWinners() {
  const list = $('#winList'); if (!list) return;
  if (!state.winners.length) { list.innerHTML = '<li class="empty">No wins over the pull price yet. Be the first.</li>'; return; }
  list.innerHTML = state.winners.map((w) => {
    const when = new Date(w.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `<li class="${w.big ? 'big' : ''}">${ICONS[w.game] || ''}<span class="who">${esc(w.name)}<small>${GAME_NAMES[w.game] || w.game} · ${when}${w.note ? ' · ' + esc(w.note) : ''}</small></span><b>${money(w.amount)}</b><span class="gain">+${Math.round(w.gainPct).toLocaleString()}%</span></li>`;
  }).join('');
}
// Shared by every Santa Hat game: `game` is 'slots', 'spin10' or 'spin100'.
export function addWinner(game, amount, bet, note) {
  state.winners.unshift({ game, name: nameOf(), amount, gainPct: ((amount - bet) / bet) * 100, at: Date.now(), note, big: amount >= 10 * bet });
  state.winners.length = Math.min(state.winners.length, MAX_WINNERS);
  store.set(state); renderWinners();
}

function stamp(text) { const fl = $('.machine .flash'); fl.textContent = text; fl.classList.remove('show'); void fl.offsetWidth; fl.classList.add('show'); }

async function doPull() {
  if (busy) { view.slam(); return; } // tap during a spin: stop the reels early
  const card = $('.machine'), res = $('.machine .res');
  if (state.bal < M.bet - 1e-9) { res.textContent = 'Out of demo money. Tap Reset to play on.'; return; }
  const forced = test.next; test.next = undefined;
  const r = pull(state, 'big', Math.random, forced);
  if (r.paused) { res.textContent = r.stopped ? 'Slots are paused right now.' : 'The pool is refilling. Try again in a moment.'; return; }
  busy = true; card.classList.remove('won', 'jackpot'); $('.machine .flash').classList.remove('show');
  state.bal -= M.bet; store.set(state); $('#demoBal').textContent = money(state.bal);
  res.textContent = 'Spinning… tap again to stop early.';
  await view.spin(r.stops, r);
  shownPool = state.pool; state.bal += r.received;
  const lines = r.wins.length, hatsTxt = r.hats ? `${r.hats} Santa Hat${r.hats > 1 ? 's' : ''} +${money(r.hatPay)}` : '';
  if (r.jackpot) {
    card.classList.add('jackpot'); stamp('JACKPOT!');
    res.innerHTML = `<b>POOL JACKPOT!</b> ${money(r.pay)} · you get ${money(r.received)} after the 3% tax`;
    addWinner('slots', r.pay, M.bet, 'pool jackpot');
  } else if (r.ahead) { // only celebrate when the pull pays more than it cost
    const top = r.wins.some((w) => w.top), big = r.pay >= 10 * M.bet;
    card.classList.add('won'); stamp(top ? '100×!' : big ? 'BIG WIN ' + money(r.pay) : 'WIN ' + money(r.pay));
    res.innerHTML = `<b>${top ? '5 Santa Hats!' : big ? 'Big win!' : 'Win!'}</b> ${money(r.pay)}` +
      ` <span class="dim">(${lines} line${lines === 1 ? '' : 's'}${hatsTxt ? ' + ' + hatsTxt : ''}) · you get ${money(r.received)}</span>`;
    addWinner('slots', r.pay, M.bet, top ? '5 Santa Hats' : lines > 1 ? lines + ' lines' : '');
  } else if (r.pay > 0) {
    res.innerHTML = `<span class="dim">Returned ${money(r.pay)}${hatsTxt ? ' (' + hatsTxt + ')' : ''}. Less than the $1 pull.</span>`;
  } else res.textContent = 'No win this time.';
  store.set(state); render(); busy = false;
}

// Full screen: the real Fullscreen API where it works, a fixed overlay where it doesn't (iPhone Safari).
function toggleFull() {
  const card = $('.machine'), btn = $('#fsBtn'), isOn = document.fullscreenElement === card || card.classList.contains('max');
  if (isOn) { if (document.fullscreenElement) document.exitFullscreen?.(); card.classList.remove('max'); }
  else if (card.requestFullscreen && document.fullscreenEnabled) card.requestFullscreen().catch(() => card.classList.add('max'));
  else card.classList.add('max');
  setTimeout(() => { const on = document.fullscreenElement === card || card.classList.contains('max'); btn.setAttribute('aria-pressed', String(on)); $('span', btn).textContent = on ? 'Exit full screen' : 'Full screen'; }, 60);
}

export function initGames(opts = {}) {
  if (inited) return; inited = true;
  if (opts.name) nameOf = opts.name;
  view = createMachine($('.machine canvas'));
  $('.machine .pull').addEventListener('click', doPull);
  $('.machine canvas').addEventListener('click', doPull);
  $('#fsBtn').addEventListener('click', toggleFull);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) { const b = $('#fsBtn'); b.setAttribute('aria-pressed', 'false'); $('span', b).textContent = 'Full screen'; } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('.machine').classList.remove('max'); });
  $('#demoReset').addEventListener('click', () => {
    if (busy) return;
    Object.assign(state, { pool: POOL_RULES.start, bal: DEMO_START, treasury: 0 }); shownPool = state.pool; store.set(state); render();
    $('.machine .res').textContent = 'Pull the pom-pom, or tap the machine. Tap again to stop the reels early.';
  });
  paytable(); facts(); render();
  window.__slots = { state, view, test, get shownPool() { return shownPool; }, get busy() { return busy; } };
}

export function showGames(on, opts) {
  if (on) initGames(opts);
  view?.setActive(on);
}
