// Snowball Drop on the Games tab: size chips, Drop 1 / 5 / 10 (a run that plays straight away, Cody 2026-10-01), the shared
// Spin pool readout, odds, last drops. Every drop runs in the house's order (paid → secret locked → drawn → revealed;
// playcredits.js / house.js), on the Spin pool (shared, Cody); the run's winnings are sent at the end. The board only
// animates the path the draw already decided. DEMO: the same demo balance as Slots.
import { PAYS, WAYS, TOTAL, payback, realWin } from './plinko.js';
import { createBoard } from './plinkoboard.js';
import { playRun, short } from './playcredits.js';
import { runSummary } from './runui.js';
import { showResult } from './spinui.js';
import { play as sfx } from './sfx.js';

const $ = (s, el = document) => el.querySelector(s);
const money = (v) => '$' + (Math.floor(v * 100 + 1e-6) / 100).toFixed(2);
const MAX_HISTORY = 16;
const STYLE = (m) => (m >= 10 ? ['#cf3128', '#f5f1e8'] : m >= 2 ? ['#c98a1b', '#0c0f1a'] : m >= 1 ? ['#6f8fd0', '#0c0f1a'] : m > 0 ? ['#2e3a6e', '#b9cdf2'] : ['#151a30', '#6f7ba8']);
let board = null, bet = 0.1, wallet = null, addWinner = () => {}, pool = () => 0, onPool = () => {}, opening = false, flying = 0, fast = false;
const history = [], test = { run: undefined }; // tests only: the next run's paths, one per drop (8 × 0/1)

function render() {
  $('#dropPool').textContent = money(pool());
  $('#dropHistory').innerHTML = history.length ? history.map((m) => { const [bg, fg] = STYLE(m); return `<li style="background:${bg};color:${fg}">${m}×</li>`; }).join('')
    : '<li class="empty">No drops yet.</li>';
}
function odds() {
  const groups = [...new Set(PAYS)].sort((a, b) => b - a).map((m) => ({ m, ways: PAYS.reduce((a, p, k) => a + (p === m ? WAYS[k] : 0), 0) }));
  $('#dropOdds').innerHTML = groups.map(({ m, ways }) => `<li><i style="background:${STYLE(m)[0]}"></i><span><b>${m}×</b> ${m >= 10 ? 'the edge presents' : m > 1 ? 'win' : m === 1 ? 'money back' : m > 0 ? 'part back' : 'no win'}<br>${((ways / TOTAL) * 100).toFixed(1)}% · 1 in ${+(TOTAL / ways).toFixed(1)}</span></li>`).join('')
    + `<li><span>Pays back ${(payback() * 100).toFixed(1)}% · a win (5× or 10×) 1 drop in ${(1 / realWin()).toFixed(1)}. Every present is the same width: the pegs make the edges rare.</span></li>`;
}
function stamp(text) { const fl = $('#drop .flash'); fl.textContent = text; fl.classList.remove('show'); void fl.offsetWidth; fl.classList.add('show'); }
function setBet(b) {
  bet = b; document.querySelectorAll('#drop .bets button').forEach((x) => x.setAttribute('aria-checked', String(+x.dataset.dbet === b)));
  document.querySelectorAll('#drop [data-run]').forEach((x) => { const v = Math.round(b * +x.dataset.run * 100) / 100; $('small', x).textContent = v < 1 ? Math.round(v * 100) + '¢' : '$' + v; });
}

// A run of n drops at the chosen size: pay once, then the snowballs drop one after another; winnings are sent at the end.
async function startRun(n) {
  if (opening) return;
  opening = true; fast = false; setButtons(false);
  const res = $('#drop .res'), forced = test.run || [], landings = [];
  test.run = undefined;
  try {
    const out = await playRun('drop', bet, n, async (p, i) => {
      $('#runDrop').innerHTML = `Drop <b>${i + 1}</b> of <b>${n}</b>`;
      if (!p.r) { res.textContent = p.refunded ? `Drop ${i + 1} couldn't play (${p.stopped ? 'Snowball Drop is paused' : p.why || 'the pool is refilling'}): its price comes back with your winnings.` : `Couldn't drop (${p.why}).`; return; }
      flying++; res.textContent = `Dropping… result locked (${short(p.proof.commit)}).`;
      landings.push(board.launch(p.r.path, p.r.bin).then(() => landed(p.r, p)));
      if (!fast) await new Promise((x) => setTimeout(x, 380)); // snowballs a moment apart
    }, forced);
    await Promise.all(landings);
    if (out) { res.innerHTML = runSummary(out, 'drop', 'drops'); showResult(res); }
  } finally { opening = false; fast = false; setButtons(true); $('#runDrop').textContent = ''; }
}
function setButtons(on) { document.querySelectorAll('#drop [data-run], #drop .bets button').forEach((b) => { b.disabled = !on; }); $('#drop .skip').hidden = on; }
function landed(r, p) {
  flying--; if (!flying) wake();
  const res = $('#drop .res'), card = $('#drop .dropcard');
  onPool(p.poolUsd);
  history.unshift(r.mult); history.length = Math.min(history.length, MAX_HISTORY);
  card.classList.remove('won', 'jackpot');
  if (r.ahead) {
    sfx(r.mult >= 10 ? 'bigWin' : 'smallWin'); card.classList.add(r.mult >= 10 ? 'jackpot' : 'won'); stamp(`${r.mult}× WIN`);
    res.innerHTML = `<b>${r.mult}× win!</b> ${money(r.pay)}`;
    addWinner(r.bet >= 1 ? 'drop100' : 'drop10', r.pay, r.bet, `${r.mult}×`);
  } else if (r.mult === 1) res.innerHTML = `<span class="dim">Money back: ${money(r.pay)}.</span>`;
  else if (r.mult > 0) res.innerHTML = `<span class="dim">${r.mult}× back: ${money(r.pay)}.</span>`;
  else res.textContent = 'No win this time.';
  render();
}

let inited = false;
export function initDrop(opts) {
  if (inited) return; inited = true;
  wallet = opts.wallet; addWinner = opts.addWinner || addWinner; pool = opts.pool; onPool = opts.onPool || onPool;
  board = createBoard($('#drop canvas'));
  document.querySelectorAll('#drop [data-run]').forEach((b) => b.addEventListener('click', () => startRun(+b.dataset.run)));
  $('#drop .skip').addEventListener('click', () => { fast = true; board.hurry(); });
  document.querySelectorAll('#drop .bets button').forEach((b) => b.addEventListener('click', () => setBet(+b.dataset.dbet)));
  setBet(0.1); odds(); render();
  window.__drop = { test, get opening() { return opening; }, get flying() { return flying; }, history, get bet() { return bet; } };
}
// The board draws (falling snow, snowballs) only while it's on screen, or while snowballs are still falling: three game
// canvases drawing at once is heavy for a phone, and nobody sees snow that's scrolled away.
let tabOn = false, onScreen = false;
const wake = () => board?.setActive(tabOn && (onScreen || flying > 0));
export function showDrop(on) {
  tabOn = on;
  if (on && board && !showDrop.io && 'IntersectionObserver' in window) { showDrop.io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; wake(); }); showDrop.io.observe($('#drop canvas')); }
  else if (!('IntersectionObserver' in window)) onScreen = true;
  wake();
}
export function refreshDrop() { if (inited) render(); }
export function resetDrop() { history.length = 0; refreshDrop(); }
