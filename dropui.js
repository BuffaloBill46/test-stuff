// Snowball Drop on the Games tab: size chips, the Drop button, the shared Spin pool readout, odds, last drops.
// One BALANCE pays for both sizes (Cody, 2026-10-01): a 10¢ drop takes 10¢ of it, a $1 drop $1. Every drop runs in the
// house's order (pool check → spend → lock the secret → draw → reveal; playcredits.js / house.js), on the Spin pool
// (shared, Cody). The board only animates the path the draw already decided. DEMO: the same demo balance as Slots.
import { PAYS, WAYS, TOTAL, payback, realWin } from './plinko.js';
import { createBoard } from './plinkoboard.js';
import { ready, play, short } from './playcredits.js';
import { showResult } from './spinui.js';
import { play as sfx } from './sfx.js';

const $ = (s, el = document) => el.querySelector(s);
const money = (v) => '$' + (Math.floor(v * 100 + 1e-6) / 100).toFixed(2);
const MAX_HISTORY = 16;
const STYLE = (m) => (m >= 10 ? ['#cf3128', '#f5f1e8'] : m >= 2 ? ['#c98a1b', '#0c0f1a'] : m >= 1 ? ['#6f8fd0', '#0c0f1a'] : m > 0 ? ['#2e3a6e', '#b9cdf2'] : ['#151a30', '#6f7ba8']);
let board = null, bet = 0.1, wallet = null, addWinner = () => {}, pool = () => 0, onPool = () => {}, opening = false, flying = 0;
const history = [], test = { next: undefined }; // tests only: force the next path (8 × 0/1)

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
function setBet(b) { bet = b; document.querySelectorAll('#drop .bets button').forEach((x) => x.setAttribute('aria-checked', String(+x.dataset.dbet === b))); }

async function doDrop() {
  if (opening) return; // one play is being opened/settled (the server allows one at a time); snowballs already falling don't block
  const res = $('#drop .res');
  opening = true;
  try {
    if (!(await ready('drop', bet))) return; // not enough balance for this size: the buy counter opens first
    const forced = test.next; test.next = undefined;
    const p = await play('drop', forced, bet); // the house: pool check, spend 10¢ or $1 of balance, lock the secret, draw
    if (!p.r) { res.textContent = p.failed ? `Couldn't drop (${p.why}). Your balance is untouched.` : p.refused ? (p.stopped ? 'Snowball Drop is paused right now. Your balance is untouched.' : 'The Spin pool is refilling. Try again in a moment; your balance is untouched.') : p.noCredit ? 'Not enough balance for that size.' : 'No balance.'; return; }
    const r = p.r; flying++;
    res.textContent = `Dropping… result locked (${short(p.commit)}).`;
    board.launch(r.path, r.bin).then(() => landed(r, p));
  } finally { opening = false; }
}
function landed(r, p) {
  flying--;
  const res = $('#drop .res'), card = $('#drop .dropcard');
  if (p.server) onPool(p.poolUsd); else { wallet.add(r.received); onPool(); }
  history.unshift(r.mult); history.length = Math.min(history.length, MAX_HISTORY);
  card.classList.remove('won', 'jackpot');
  if (r.ahead) {
    sfx(r.mult >= 10 ? 'bigWin' : 'smallWin'); card.classList.add(r.mult >= 10 ? 'jackpot' : 'won'); stamp(`${r.mult}× WIN`);
    res.innerHTML = `<b>${r.mult}× win!</b> ${money(r.pay)} <span class="dim">· you get ${money(r.received)} after the 3% tax</span>`;
    addWinner(r.bet >= 1 ? 'drop100' : 'drop10', r.pay, r.bet, `${r.mult}×`);
  } else if (r.mult === 1) res.innerHTML = `<span class="dim">Money back, less SANTA's 3% tax: you get ${money(r.received)}.</span>`;
  else if (r.mult > 0) res.innerHTML = `<span class="dim">${r.mult}× back: you get ${money(r.received)}.</span>`;
  else res.textContent = 'No win this time.';
  render(); showResult(res);
}

let inited = false;
export function initDrop(opts) {
  if (inited) return; inited = true;
  wallet = opts.wallet; addWinner = opts.addWinner || addWinner; pool = opts.pool; onPool = opts.onPool || onPool;
  board = createBoard($('#drop canvas'));
  $('#drop .dropbtn').addEventListener('click', doDrop);
  $('#drop canvas').addEventListener('click', doDrop);
  document.querySelectorAll('#drop .bets button').forEach((b) => b.addEventListener('click', () => setBet(+b.dataset.dbet)));
  setBet(0.1); odds(); render();
  window.__drop = { test, get opening() { return opening; }, get flying() { return flying; }, history, get bet() { return bet; } };
}
export function showDrop(on) { board?.setActive(on); }
export function refreshDrop() { if (inited) render(); }
export function resetDrop() { history.length = 0; refreshDrop(); }
