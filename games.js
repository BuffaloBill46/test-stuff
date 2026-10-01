// Games tab: wires the Slots page (readouts, Pull, full screen, paytable, winners list) to the rules (slots.js) and the
// 3D Big Hat machine (slots3d.js). DEMO ONLY: play money and a demo pool kept in this browser. No SANTA moves.
import { MACHINES, SYMBOLS, POOL_RULES, pull, stats, evaluate, jackpotAmount } from './slots.js';
import { createMachine, symbolImages } from './slots3d.js';
import { initSpin, showSpin, resetSpin, spinState, refreshSpin, showResult } from './spinui.js';
import { initDrop, showDrop, refreshDrop, resetDrop } from './dropui.js';
import { initCredits, playRun, short, refresh as refreshCredits, resetCredits, setPrice } from './playcredits.js';
import { runSummary } from './runui.js';
import { livePrice, liveFee, santaFor, fmtSanta } from './market.js';
import { FEE } from './slots.js';
import { play as sfx } from './sfx.js';
import { SERVER, call, settingsReady } from './gameserver.js';
import { KINDS, SIZES } from './credits.js';
import { topMult } from './spin.js';

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
ICONS.drop10 = ICONS.drop100 = '<svg viewBox="0 0 24 24" aria-label="Snowball Drop"><circle cx="12" cy="12" r="8" fill="#f5f1e8" stroke="#0c0f1a" stroke-width="2"/><path d="M8 10l3 2 4-3" stroke="#c9d6ee" stroke-width="2" fill="none"/></svg>';
const GAME_NAMES = { slots: 'Slots', spin10: 'Spin 10¢', spin100: 'Spin $1', drop10: 'Snowball Drop 10¢', drop100: 'Snowball Drop $1' };

let inited = false, view = null, busy = false, nameOf = () => 'You';
const saved = store.get();
const state = saved && Number.isFinite(saved.pool) && Number.isFinite(saved.bal)
  ? { treasury: 0, winners: [], ...saved } : { pool: POOL_RULES.start, bal: DEMO_START, treasury: 0, winners: [] };
let shownPool = state.pool; // readouts update when the reels land, so a result isn't spoiled early
const test = { run: undefined }; // tests only: the next run's pulls, one each ('JACKPOT' or an array of 5 reel stops)

function render() {
  $('#slotPool').textContent = money(shownPool);
  $('#demoBal').textContent = money(state.bal);
  $('#jpAmt').textContent = money(jackpotAmount('big', shownPool));
  $('#slots .machine .pct').textContent = +(M.jackpotPct * 100).toFixed(2) + '%';
  $('#topAmt').textContent = money(100 * M.bet);
  renderWinners();
}

function facts() {
  const s = stats(M);
  $('#slots .machine .facts').innerHTML = [
    ['Pays back', `${(s.payback * 100).toFixed(1)}% on average, plus the pool jackpot`], // about 80% with the jackpot (tests/slots.test.mjs simulates it)
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
  $('#payRows').innerHTML = winTable(src, usd);
  $('#payLines').innerHTML = M.lines.map((rows, i) => `<figure><div class="mini">${Array.from({ length: M.rows * M.reels }, (_, k) => {
    const row = Math.floor(k / M.reels), r = k % M.reels; return `<i class="${rows[r] === row ? 'on' : ''}"></i>`; }).join('')}</div>Line ${i + 1}</figure>`).join('');
}
function winTable(src, usd) {
  const rows = SYMBOLS.filter((s) => M.pays[s.id]).map((s) => {
    const p = M.pays[s.id];
    return `<tr><td><img alt="" src="${src(s.id)}">${esc(s.name)}${s.id === 'hat' ? ' <span class="dim">(wild)</span>' : ''}</td><td>${p[3] ? usd(p[3]) : '—'}</td><td>${p[4] ? usd(p[4]) : '—'}</td><td>${p[5] ? usd(p[5]) : '—'}</td></tr>`;
  }).join('');
  return `<table class="pays"><thead><tr><th>Symbol</th><th>3 in a row</th><th>4 in a row</th><th>5 in a row</th></tr></thead><tbody>${rows}
    <tr class="extra"><td><img alt="" src="${src('hat')}">Each Santa Hat, anywhere</td><td colspan="3">+${usd(M.hatBonus)} each</td></tr>
    <tr class="extra"><td><img alt="" src="${src('hat')}">All 25 squares Santa Hats</td><td colspan="3">Pool jackpot: ${+(M.jackpotPct * 100).toFixed(2)}% of the pool</td></tr>
    <tr><td><img alt="" src="${src('coal')}">Coal</td><td colspan="3" class="dim">No win (hats can't help it)</td></tr></tbody></table>`;
}

// "How to win": example grids whose captions and prizes come from the real rules (evaluate), so they can't drift.
const EXAMPLES = [
  { title: '3 in a row', note: 'Three matching symbols from the left reel, along a payline.', place: [[0, 2, 'snowball'], [1, 2, 'snowball'], [2, 2, 'snowball']] },
  { title: 'Santa Hat is wild', note: 'The hat fills in for a Star, making 4 Stars in a row.', place: [[0, 2, 'star'], [1, 2, 'hat'], [2, 2, 'star'], [3, 2, 'star']] },
  { title: 'Diagonals count too', note: 'A diagonal from the first reel, stepping down a row each reel: 4 Reindeer.', place: [[0, 1, 'reindeer'], [1, 2, 'reindeer'], [2, 3, 'reindeer'], [3, 4, 'reindeer']] },
  { title: 'Two lines at once', note: 'Every winning line on a pull adds up.', place: [[0, 1, 'bell'], [1, 1, 'bell'], [2, 1, 'bell'], [0, 3, 'pine'], [1, 3, 'pine'], [2, 3, 'pine'], [3, 3, 'pine']] },
  { title: 'Hat bonus', note: 'No line, but every Santa Hat on the grid still pays a little.', place: [[1, 0, 'hat'], [3, 4, 'hat'], [4, 2, 'hat']] },
  { title: 'Top line prize: 100×', note: '5 Santa Hats in a row on a line, plus their hat bonus.', place: [0, 1, 2, 3, 4].map((r) => [r, 2, 'hat']), coal: true },
  { title: 'Pool jackpot', note: 'All 25 squares Santa Hats. Its own rare draw (1 in 25,000).', jackpot: true },
];
function exampleGrid(ex) {
  const S = (id) => SYMBOLS.findIndex((x) => x.id === id), used = new Set((ex.place || []).map((p) => p[2]));
  const fill = ['lantern', 'pine', 'present', 'bell', 'snowman', 'reindeer', 'star', 'snowball'].filter((id) => !used.has(id));
  // Background that can't win: the left reel is Coal (Coal never pays), the others cycle symbols the example doesn't use.
  const grid = Array.from({ length: M.reels }, (_, r) => Array.from({ length: M.rows }, (_, row) => (ex.jackpot ? S('hat') : r === 0 || ex.coal ? S('coal') : S(fill[(r * 2 + row * 3) % fill.length]))));
  for (const [r, row, id] of ex.place || []) grid[r][row] = S(id);
  return grid;
}
function howToWin() {
  const imgs = symbolImages(), src = (id) => imgs[id].toDataURL('image/png'), usd = (x) => money(x * M.bet);
  $('#howExamples').innerHTML = EXAMPLES.map((ex) => {
    const grid = exampleGrid(ex), wins = ex.jackpot ? [] : evaluate(M, grid), lit = new Set();
    wins.forEach((w) => { for (let r = 0; r < w.count; r++) lit.add(r + ',' + M.lines[w.line][r]); });
    const hats = ex.jackpot ? 0 : grid.flat().filter((x) => SYMBOLS[x].id === 'hat').length;
    grid.forEach((col, r) => col.forEach((x, row) => { if (ex.jackpot || SYMBOLS[x].id === 'hat') lit.add(r + ',' + row); }));
    const pay = wins.reduce((a, w) => a + w.pay, 0) + hats * M.hatBonus * M.bet;
    const parts = wins.map((w) => `${w.count} × ${SYMBOLS[w.sym].name} (line ${w.line + 1}) ${money(w.pay)}`);
    if (hats) parts.push(`${hats} hat${hats > 1 ? 's' : ''} × ${Math.round(M.hatBonus * M.bet * 100)}¢`);
    const cells = Array.from({ length: M.rows * M.reels }, (_, k) => { const row = Math.floor(k / M.reels), r = k % M.reels;
      return `<span class="${lit.has(r + ',' + row) ? 'on' : ''}"><img alt="" src="${src(SYMBOLS[grid[r][row]].id)}"></span>`; }).join('');
    const payTxt = ex.jackpot ? `${+(M.jackpotPct * 100).toFixed(2)}% of the pool · now ${money(jackpotAmount('big', shownPool))}` : money(pay);
    return `<figure class="example"><div class="g">${cells}</div><h4>${esc(ex.title)} · <b class="pay">${payTxt}</b></h4><p>${esc(ex.note)}${parts.length ? ' ' + esc(parts.join(' + ')) + '.' : ''}</p></figure>`;
  }).join('');
  $('#howTable').innerHTML = winTable(src, usd);
}
function openHow() { howToWin(); const d = $('#howDlg'); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }

function renderWinners() {
  const list = $('#winList'); if (!list) return;
  if (!state.winners.length) { list.innerHTML = '<li class="empty">No wins over the pull price yet. Be the first.</li>'; return; }
  list.innerHTML = state.winners.map((w) => {
    const when = new Date(w.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `<li class="${w.big ? 'big' : ''}">${ICONS[w.game] || ''}<span class="who">${esc(w.name)}<small>${GAME_NAMES[w.game] || w.game} · ${when}${w.note ? ' · ' + esc(w.note) : ''}</small></span><b>${money(w.amount)}</b><span class="gain">+${Math.round(w.gainPct).toLocaleString()}%</span></li>`;
  }).join('');
}
// Shared by every Santa Hat game: `game` is 'slots', 'spin10', 'spin100', 'drop10' or 'drop100'.
// Server mode: the list is everyone's recent wins, from the server.
async function loadWinners() {
  if (!SERVER) return;
  const r = await call('winners').catch(() => ({}));
  if (Array.isArray(r.winners)) { state.winners = r.winners.slice(0, MAX_WINNERS); renderWinners(); }
}
export function addWinner(game, amount, bet, note) {
  if (SERVER) { loadWinners(); return; } // the server already recorded it; refresh the shared list
  state.winners.unshift({ game, name: nameOf(), amount, gainPct: ((amount - bet) / bet) * 100, at: Date.now(), note, big: amount >= 10 * bet });
  state.winners.length = Math.min(state.winners.length, MAX_WINNERS);
  store.set(state); renderWinners();
}

function stamp(text) { const fl = $('#slots .machine .flash'); fl.textContent = text; fl.classList.remove('show'); void fl.offsetWidth; fl.classList.add('show'); }

// A run of 1, 5 or 10 pulls (Cody, 2026-10-01): pay once, the pulls play one after another, winnings are sent at the end.
let fast = false;
async function startRun(n) {
  if (busy) return;
  busy = true; fast = false; setButtons(false);
  const res = $('#slots .machine .res'), forced = test.run || [];
  test.run = undefined;
  try {
    const out = await playRun('big', M.bet, n, showPull, forced);
    if (out) { res.innerHTML = runSummary(out, 'pull', 'pulls'); showResult(res); }
  } finally { busy = false; fast = false; setButtons(true); $('#runBig').textContent = ''; }
}
function setButtons(on) { document.querySelectorAll('#slots [data-run]').forEach((b) => { b.disabled = !on; }); $('#slots .skip').hidden = on; }
async function showPull(p, i, n) {
  const card = $('#slots .machine'), res = $('#slots .machine .res');
  $('#runBig').innerHTML = `Pull <b>${i + 1}</b> of <b>${n}</b>`;
  if (!p.r) { res.textContent = p.refunded ? `Pull ${i + 1} couldn't play (${p.stopped ? 'Slots are paused' : p.why || 'the pool is refilling'}): its $1 comes back with your winnings.` : `Couldn't pull (${p.why}).`; return; }
  const r = p.r;
  card.classList.remove('won', 'jackpot'); $('#slots .machine .flash').classList.remove('show');
  res.textContent = `Spinning… result locked (${short(p.proof.commit)}).`;
  const go = view.spin(r.stops, r); if (fast) view.slam(); await go;
  if (p.poolUsd !== undefined) state.pool = p.poolUsd; // server mode: the server's pool
  shownPool = state.pool;
  const lines = r.wins.length, hatsTxt = r.hats ? `${r.hats} Santa Hat${r.hats > 1 ? 's' : ''} +${money(r.hatPay)}` : '';
  if (r.jackpot) {
    card.classList.add('jackpot'); stamp('JACKPOT!'); sfx('jackpot');
    res.innerHTML = `<b>POOL JACKPOT!</b> ${money(r.pay)}`;
    addWinner('slots', r.pay, M.bet, 'pool jackpot');
  } else if (r.ahead) { // only celebrate when the pull pays more than it cost
    const top = r.wins.some((w) => w.top), big = r.pay >= 10 * M.bet;
    sfx(big || top ? 'bigWin' : 'smallWin'); card.classList.add('won'); stamp(top ? '100×!' : big ? 'BIG WIN ' + money(r.pay) : 'WIN ' + money(r.pay));
    res.innerHTML = `<b>${top ? '5 Santa Hats!' : big ? 'Big win!' : 'Win!'}</b> ${money(r.pay)}` +
      ` <span class="dim">(${lines} line${lines === 1 ? '' : 's'}${hatsTxt ? ' + ' + hatsTxt : ''})</span>`;
    addWinner('slots', r.pay, M.bet, top ? '5 Santa Hats' : lines > 1 ? lines + ' lines' : '');
  } else if (r.pay > 0) {
    res.innerHTML = `<span class="dim">Returned ${money(r.pay)}${hatsTxt ? ' (' + hatsTxt + ')' : ''}. Less than the $1 pull.</span>`;
  } else res.textContent = 'No win this time.';
  store.set(state); render();
  if (i < n - 1 && !fast) await new Promise((x) => setTimeout(x, 450)); // a breath between pulls
}

// Full screen: the real Fullscreen API where it works, a fixed overlay where it doesn't (iPhone Safari).
function toggleFull() {
  const card = $('#slots .machine'), btn = $('#fsBtn'), isOn = document.fullscreenElement === card || card.classList.contains('max');
  if (isOn) { if (document.fullscreenElement) document.exitFullscreen?.(); card.classList.remove('max'); }
  else if (card.requestFullscreen && document.fullscreenEnabled) card.requestFullscreen().catch(() => card.classList.add('max'));
  else card.classList.add('max');
  setTimeout(() => { const on = document.fullscreenElement === card || card.classList.contains('max'); btn.setAttribute('aria-pressed', String(on)); $('span', btn).textContent = on ? 'Exit full screen' : 'Full screen'; }, 60);
}

export async function initGames(opts = {}) {
  if (inited) return; inited = true;
  if (opts.name) nameOf = opts.name;
  // Server mode: draw the machine, wheel and prices from the published settings (Cody's admin screen), not the built-in ones.
  if (SERVER && (await settingsReady)) labelsFromSettings();
  view = createMachine($('#slots .machine canvas'));
  document.querySelectorAll('#slots [data-run]').forEach((b) => b.addEventListener('click', () => startRun(+b.dataset.run)));
  $('#slots .skip').addEventListener('click', () => { fast = true; view.slam(); });
  $('#slots .machine canvas').addEventListener('click', () => { if (busy) view.slam(); }); // tap the machine: stop the reels now
  $('#fsBtn').addEventListener('click', toggleFull);
  $('#howBtn').addEventListener('click', openHow);
  $('#howClose').addEventListener('click', () => $('#howDlg').close?.() ?? $('#howDlg').removeAttribute('open'));
  $('#howDlg').addEventListener('click', (e) => { // tap outside the panel (on the dimmed backdrop) to close
    const b = e.currentTarget.getBoundingClientRect();
    if (e.target === e.currentTarget && (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom)) e.currentTarget.close?.();
  });
  // The label follows the browser's own report (entering can take longer than a moment on a busy or slow device).
  document.addEventListener('fullscreenchange', () => { const c = $('#slots .machine'), b = $('#fsBtn'), on = document.fullscreenElement === c || c.classList.contains('max');
    b.setAttribute('aria-pressed', String(on)); $('span', b).textContent = on ? 'Exit full screen' : 'Full screen'; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#slots .machine').classList.remove('max'); });
  $('#demoReset').addEventListener('click', () => {
    if (busy) return;
    Object.assign(state, { pool: POOL_RULES.start, bal: DEMO_START, treasury: 0 }); shownPool = state.pool; store.set(state); render(); resetSpin(); resetDrop(); resetCredits();
    $('#slots .machine .res').textContent = 'Pull the pom-pom, or tap the machine. Tap again to stop the reels early.';
  });
  paytable(); facts(); render();
  // Santa Hat Spin shares the demo balance and the Recent winners list.
  const wallet = { get: () => state.bal, add: (x) => { state.bal += x; store.set(state); $('#demoBal').textContent = money(state.bal); } };
  initSpin({ wallet, addWinner });
  // Snowball Drop plays from the Spin pool (Cody): its readout is the Spin pool's, and a drop updates both cards.
  const sp = spinState();
  initDrop({ wallet, addWinner, pool: () => sp.pool, onPool: (usd) => { if (usd !== undefined) sp.pool = usd; refreshSpin(); refreshDrop(); } });
  // Runs: buying moves the entry money into that game's pool straight away, so the pool readouts update on purchase.
  initCredits({ wallet, pools: { slots: state, spin: spinState() }, onChange: () => { shownPool = state.pool; store.set(state); render(); refreshSpin(); refreshDrop(); } });
  refreshCredits();
  showMarket();
  loadWinners();
  window.__slots = { state, view, test, get shownPool() { return shownPool; }, get busy() { return busy; } };
}

// Live SANTA price and the token's live tax (read-only lookups). Refreshed every minute while the page is open.
async function showMarket() {
  const el = $('#liveMarket');
  const [p, f] = await Promise.allSettled([livePrice(), liveFee()]);
  const bits = [];
  if (p.status === 'fulfilled') { setPrice(p.value); bits.push(`1 SANTA = <b>$${p.value.usd.toPrecision(3)}</b> · $1 ≈ <b>${fmtSanta(santaFor(1, p.value))} SANTA</b>`); }
  if (f.status === 'fulfilled') {
    const pct = f.value.bps / 100;
    bits.push(`token tax <b>${pct}%</b> (read live from the token)`);
    if (Math.abs(f.value.bps / 10000 - FEE) > 1e-9) bits.push(`<span class="warn">The tax changed: the demo math still assumes ${FEE * 100}%.</span>`);
  }
  el.innerHTML = bits.length ? bits.join(' · ') : 'Live SANTA price unavailable right now.';
  setTimeout(showMarket, 60000);
}

function labelsFromSettings() {
  const c = (v) => (v < 1 ? Math.round(v * 100) + '¢' : '$' + (Number.isInteger(v) ? v : v.toFixed(2))), top = topMult(); // the wheels as published (applyToGame updates them in place)
  for (const [cls, i] of [['chip10', 0], ['chip100', 1]]) {
    // the Spin balance's two sizes, as published
    const b = $('#spin .' + cls), bet = SIZES.spin[i]; b.dataset.bet = bet; $('b', b).textContent = c(bet); $('small', b).textContent = `win up to ${c(bet * top)}`;
  }
  $('#slots .machine header em').textContent = `${money(M.bet)} a pull · 5×5 · 11 lines`;
  document.querySelectorAll('#slots [data-run]').forEach((x) => { $('small', x).textContent = c(M.bet * +x.dataset.run); }); // each button's price
  document.querySelectorAll('.hatc').forEach((e) => { e.textContent = c(M.hatBonus * M.bet); }); // the per-hat bonus as published
  $('#spin .wheelcard header em').textContent = `${c(SIZES.spin[0])} or ${c(SIZES.spin[1])} a spin · up to ${top}×`;
}

export async function showGames(on, opts) {
  if (on) await initGames(opts);
  view?.setActive(on); showSpin(on); showDrop(on);
}
