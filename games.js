// Games tab: wires the Slots page (readouts, Pull buttons, demo balance) to the rules (slots.js) and the 3D
// machines (slots3d.js). DEMO ONLY: play money and a demo pool kept in this browser. No SANTA moves.
import { MACHINES, START_POOL, PAYTABLE, SYMBOLS, pull, jackpotAmount } from './slots.js';
import { createMachine, symbolImages } from './slots3d.js';

const $ = (s, el = document) => el.querySelector(s);
const money = (v) => '$' + (Math.floor(v * 100 + 1e-6) / 100).toFixed(2);
const KEY = 'sh_slots_demo', DEMO_START = 10;
const store = { get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }, set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} } };

let inited = false;
const views = {}, busy = {};
const saved = store.get();
const state = saved && Number.isFinite(saved.pool) && Number.isFinite(saved.bal) ? saved : { pool: START_POOL, bal: DEMO_START };
let shownPool = state.pool; // the readout updates when the reels land, so a jackpot isn't spoiled early
const force = {}; // tests only: force the next result on a machine ('hat', 'star', … or 'none')

function render() {
  $('#slotPool').textContent = money(shownPool);
  $('#demoBal').textContent = money(state.bal);
  for (const id of Object.keys(MACHINES)) {
    const card = $(`.machine[data-m="${id}"]`);
    $('.pct', card).textContent = +(MACHINES[id].jackpotPct * 100).toFixed(2) + '%';
    $('.amt', card).textContent = money(jackpotAmount(id, shownPool));
  }
}

function paytable() {
  const imgs = symbolImages(), src = (id) => imgs[id].toDataURL('image/png');
  const rows = PAYTABLE.map((r) => {
    const name = SYMBOLS.find((s) => s.id === r.sym).name, pay = r.x === 'JACKPOT' ? '<b class="jpword">Jackpot</b>' : `<b>${r.x}×</b> the bet`;
    return `<li><span class="three">${`<img alt="" src="${src(r.sym)}">`.repeat(3)}</span><span>3 × ${name}</span><span>${pay}</span><span class="dim">${(r.p * 100).toFixed(1)}%</span></li>`;
  }).join('');
  $('#payRows').innerHTML = `<ol>${rows}<li><span class="three">${`<img alt="" src="${src('coal')}">`.repeat(3)}</span><span>Anything else, even 3 × Coal</span><span>No win</span><span></span></li></ol>`;
}

// Per-machine facts, worked out from the paytable so they follow Cody's numbers when they go in.
function facts() {
  const fixed = PAYTABLE.filter((r) => r.x !== 'JACKPOT'), top = fixed.reduce((a, r) => (r.x > a.x ? r : a));
  const jp = PAYTABLE.find((r) => r.x === 'JACKPOT'), winP = PAYTABLE.reduce((s, r) => s + r.p, 0);
  const name = (sym) => SYMBOLS.find((s) => s.id === sym).name;
  for (const [id, m] of Object.entries(MACHINES)) {
    $(`.machine[data-m="${id}"] .facts`).innerHTML = [
      ['Jackpot line', `3 × ${name(jp.sym)}`],
      ['Jackpot odds', `1 in ${Math.round(1 / jp.p).toLocaleString()} pulls`],
      ['Biggest fixed win', `${top.x}× · ${money(top.x * m.bet)}`],
      ['Any win', `about 1 in ${(1 / winP).toFixed(1)} pulls`],
    ].map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('');
  }
}

async function doPull(id) {
  if (busy[id]) return;
  const m = MACHINES[id], card = $(`.machine[data-m="${id}"]`), res = $('.res', card), btn = $('.pull', card);
  if (state.bal < m.bet - 1e-9) { res.textContent = 'Out of demo money. Tap Reset to play on.'; return; }
  const f = force[id]; delete force[id];
  const forced = f === undefined ? undefined : f === 'none' ? null : PAYTABLE.find((r) => r.sym === f);
  const r = pull(state, id, Math.random, forced);
  if (r.paused) { res.textContent = 'The pool is refilling. This machine pauses until the pool can cover its biggest win.'; return; }
  busy[id] = true; btn.disabled = true; card.classList.remove('won', 'jackpot'); $('.flash', card).classList.remove('show');
  state.bal -= m.bet; store.set(state); render();
  res.textContent = 'Spinning…';
  await views[id].spin(r.stops, { win: r.pay > 0, jackpot: r.jackpot });
  shownPool = state.pool;
  if (r.pay > 0) {
    state.bal += r.received;
    card.classList.add(r.jackpot ? 'jackpot' : 'won');
    const name = SYMBOLS.find((s) => s.id === r.result.sym).name;
    res.innerHTML = r.jackpot ? `<b>JACKPOT!</b> ${money(r.pay)} · you get ${money(r.received)} after the 3% tax`
      : `<b>${name} × 3!</b> Win ${money(r.pay)} · you get ${money(r.received)}`;
    const fl = $('.flash', card); fl.textContent = r.jackpot ? 'JACKPOT!' : 'WIN ' + money(r.pay);
    void fl.offsetWidth; fl.classList.add('show'); // restart the stamp animation
  } else res.textContent = 'No win this time.';
  store.set(state); render();
  busy[id] = false; btn.disabled = false;
}

export function initGames() {
  if (inited) return; inited = true;
  for (const id of Object.keys(MACHINES)) {
    const card = $(`.machine[data-m="${id}"]`);
    views[id] = createMachine($('canvas', card), id);
    $('.pull', card).addEventListener('click', () => doPull(id));
    $('canvas', card).addEventListener('click', () => doPull(id));
  }
  $('#demoReset').addEventListener('click', () => { if (Object.values(busy).some(Boolean)) return; state.pool = shownPool = START_POOL; state.bal = DEMO_START; store.set(state); render(); document.querySelectorAll('.machine .res').forEach((e) => { e.textContent = 'Pull the pom-pom, or tap the machine.'; }); });
  paytable(); facts(); render();
  window.__slots = { state, views, force, get shownPool() { return shownPool; } };
}

export function showGames(on) {
  if (on) initGames();
  for (const v of Object.values(views)) v.setActive(on);
}
