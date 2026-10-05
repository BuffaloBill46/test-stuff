// Snowball Drop on the Games tab: size chips, Drop 1 / 5 / 10 (a run that plays straight away, Cody 2026-10-01), the shared Game
// pool readout and its jackpot (board 3: the centre present), odds, last drops. Every drop runs in the house's order (paid → secret locked → drawn → revealed;
// playcredits.js / house.js), on the Spin pool (shared, Cody); the run's winnings are sent at the end. The board only
// animates the path the draw already decided. DEMO: the same demo balance as Slots.
import { jackpotOdds, JP, PAYS2, JACKPOT_BIN, ROWS, BINS } from './plinko.js?v=5cf703f1ce';
import { poolJackpot } from './slots.js?v=5cf703f1ce';
import { createBoard } from './plinkoboard.js?v=5cf703f1ce';
import { playRun, short } from './playcredits.js?v=5cf703f1ce';
import { runSummary } from './runui.js?v=5cf703f1ce';
import { initRunPick, priceLabel } from './runpick.js?v=5cf703f1ce';
import { showResult } from './gamepool.js?v=5cf703f1ce';
import { play as sfx } from './sfx.js?v=5cf703f1ce';
import { celebrate, celebrating, tierOf } from './celebrate.js?v=5cf703f1ce';
import { bigShare } from './sharecard.js?v=5cf703f1ce'; // "Share this win" on a big single win (Cody 2026-10-04)

const $ = (s, el = document) => el.querySelector(s);
const money = (v) => '$' + (Math.floor(v * 100 + 1e-6) / 100).toFixed(2);
const MAX_HISTORY = 16;
const STYLE = (m) => (m === 'JP' || m >= 100 ? ['#ffbe5c', '#7a1414'] : m >= 10 ? ['#cf3128', '#f5f1e8'] : m >= 5 ? ['#c98a1b', '#0c0f1a'] : m >= 1 ? ['#6f8fd0', '#0c0f1a'] : m > 0 ? ['#2e3a6e', '#b9cdf2'] : ['#151a30', '#6f7ba8']);
let board = null, bet = 0.1, wallet = null, addWinner = () => {}, pool = () => 0, onPool = () => {}, opening = false, flying = 0, fast = false;
const history = [], test = { run: undefined }; // tests only: the next run's paths, one per drop (16 × 0/1)

function render() {
  $('#dropPool').textContent = money(pool()); odds(); // the jackpot line follows the pool
  $('#dropHistory').innerHTML = history.length ? history.map((m) => { const [bg, fg] = STYLE(m); return `<li style="background:${bg};color:${fg}">${m === 'JP' ? 'JP' : m + '×'}</li>`; }).join('')
    : '<li class="empty">No drops yet.</li>';
}
// One odds line (Cody, 2026-10-01: in place of the list of presents), from the board's real odds table (board 2, 2026-10-02).
// Board 3 (Cody, 2026-10-02): the centre present is the POOL JACKPOT, 25% of the Game pool at that moment × the drop's size; the
// line shows what it is worth right now at the chosen size, from the live pool (never typed in).
function odds() { $('#dropOdds').innerHTML = `<span class="jpline">Pool jackpot <b>${money(poolJackpot(pool(), JP.pct, bet))}</b> on a ${cents(bet)} drop right now <span class="dim">(${+(JP.pct * 100).toFixed(2)}% of the Game pool × your drop: the centre present)</span></span> <b>1 in ${Math.round(1 / jackpotOdds()).toLocaleString('en-US')}</b> to hit it`; } // only the jackpot's odds (Cody, 2026-10-03)
// "How to play & win" (Cody, 2026-10-03: one per game, no odds besides the jackpot's): the presents' prizes from the board itself
function howTo() {
  const kinds = [...new Set(PAYS2.filter((p, k) => p > 0 && k !== JACKPOT_BIN))].sort((a, b) => b - a);
  const row = (m) => `<tr class="win"><td>${m}× present</td><td>${money(m * 0.1)}</td><td>${money(m)}</td></tr>`;
  $('#dropHow .body').innerHTML = `<ol class="howrules">
      <li><b>Pick a size</b> (10¢ or $1 a drop) and <b>how many drops</b>, then buy. They play straight away.</li>
      <li>Each snowball bounces down ${ROWS} rows of pegs and lands in one of the ${BINS} presents at the bottom.</li>
      <li><b>The present it lands in is your prize:</b> its number times your drop. Empty spaces between presents pay nothing.</li>
      <li><b>The centre present is the pool jackpot:</b> ${+(JP.pct * 100).toFixed(2)}% of the Game pool at that moment, times your drop's size (a $1 drop wins ${+(JP.pct * 100).toFixed(2)}%, a 10¢ drop a tenth of that).</li>
      <li>Everything a run wins is added up and sent to your wallet at the end of the run.</li></ol>
    <table class="pays"><thead><tr><th>Lands in</th><th>10¢ drop</th><th>$1 drop</th></tr></thead><tbody>${kinds.map(row).join('')}
      <tr class="win jprow"><td>Centre present</td><td colspan="2">Pool jackpot (${money(poolJackpot(pool(), JP.pct, 0.1))} / ${money(poolJackpot(pool(), JP.pct, 1))} right now)</td></tr>
      <tr><td>A space between presents</td><td colspan="2" class="dim">No win</td></tr></tbody></table>
    <p><b>3% SANTA tax:</b> winnings are paid in SANTA and arrive 3% lighter. The token does that, not this game.</p>
    <p class="dim"><b>Check it yourself:</b> after a drop, tap <b>Check last result</b> to re-run it from the revealed secret.</p>`;
}
const cents = (v) => (v < 1 ? Math.round(v * 100) + '¢' : '$' + (Number.isInteger(v) ? v : v.toFixed(2)));
function stamp(text) { const fl = $('#drop .flash'); fl.textContent = text; fl.classList.remove('show'); void fl.offsetWidth; fl.classList.add('show'); }
function setBet(b) {
  bet = b; document.querySelectorAll('#drop .bets button').forEach((x) => x.setAttribute('aria-checked', String(+x.dataset.dbet === b)));
  document.querySelectorAll('#drop [data-run]').forEach((x) => { $('small', x).textContent = priceLabel(b * +x.dataset.run); }); // incl. the custom one ($2.50, not $2.5)
  if (inited) odds(); // the jackpot at this size
}

// A run of n drops at the chosen size: pay once, then the snowballs drop one after another; winnings are sent at the end.
async function startRun(n) {
  if (opening) return;
  opening = true; fast = false; setButtons(false); landedWon = 0;
  const res = $('#drop .res'), forced = test.run || [], landings = [];
  test.run = undefined;
  try {
    const out = await playRun('drop', bet, n, async (p, i) => {
      $('#runDrop').innerHTML = `Drop <b>${i + 1}</b> of <b>${n}</b>`;
      if (!p.r) { res.textContent = p.refunded ? `Drop ${i + 1} couldn't play (${p.stopped ? 'Snowball Drop is paused' : p.why || 'the pool is refilling'}): its price comes back with your winnings.` : `Couldn't drop (${p.why}).`; return; }
      flying++; res.textContent = `Dropping… result locked (${short(p.proof.commit)}).`;
      const landing = board.launch(p.r.path, p.r.bin).then(() => landed(p.r, p)); landings.push(landing);
      if (fast) board.hurry();
      if (!fast) await new Promise((x) => setTimeout(x, 380)); // snowballs a moment apart
      return { landed: landing }; // the run counter adds this drop when it lands, not when it was drawn
    }, forced);
    await Promise.all(landings);
    if (out) { res.innerHTML = runSummary(out, 'drop', 'drops'); showResult(res); }
  } finally { opening = false; fast = false; setButtons(true); $('#runDrop').textContent = ''; }
}
function setButtons(on) { document.querySelectorAll('#drop [data-run], #drop .bets button, #drop .runpick input, #drop .runpick [data-step]').forEach((b) => { b.disabled = !on; }); $('#drop .skip').hidden = on; skipLabel($('#drop .skip')); }
// Skip ahead is a toggle (Cody): pressed, the run goes fast and the button says "Normal speed"; pressed again, back to normal.
const skipLabel = (b) => { b.textContent = fast ? 'Normal speed' : 'Skip ahead'; b.setAttribute('aria-pressed', String(fast)); };
let landedWon = 0; // tests: what the balls that have LANDED this run won (the run counter must never show more)
function landed(r, p) {
  flying--; if (!flying) wake(); landedWon += r.pay;
  const res = $('#drop .res'), card = $('#drop .dropcard');
  onPool(p.poolUsd);
  history.unshift(r.jackpot ? 'JP' : r.mult); history.length = Math.min(history.length, MAX_HISTORY);
  if (!celebrating(card)) card.classList.remove('won', 'jackpot'); // not while a bigger win is still on screen
  if (r.jackpot) { // THE POOL JACKPOT (board 3's centre): the biggest celebration, with the real dollar amount
    card.classList.add('jackpot'); stamp(`POOL JACKPOT ${money(r.pay)}`); celebrate(card, 5, { amount: r.pay, money, fast });
    res.innerHTML = `<span><b>POOL JACKPOT! ${money(r.pay)}</b> <span class="dim">(${+(r.pct * 100).toFixed(2)}% of the ${money(r.jackpotPool)} Game pool × your ${cents(r.bet)} drop; ${money(r.pay * 0.97)} after SANTA's 3% tax)</span></span>`;
    addWinner(r.bet >= 1 ? 'drop100' : 'drop10', r.pay, r.bet, 'pool jackpot'); res.insertAdjacentHTML('beforeend', bigShare('drop', r.pay, r.bet, true));
  } else if (r.ahead) {
    // the jackpot look is for the pool jackpot only (a 10× used to borrow it); balls land close together, so a smaller win
    // never covers a bigger one still on screen (it used to replace a jackpot stamp within 0.4 s)
    const tier = tierOf({ ahead: true, mult: r.mult }); card.classList.add('won'); if (celebrating(card) <= tier) stamp(`${r.mult}× WIN`); celebrate(card, tier, { amount: r.pay, money, fast });
    res.innerHTML = `<b>${r.mult}× win!</b> ${money(r.pay)}`;
    addWinner(r.bet >= 1 ? 'drop100' : 'drop10', r.pay, r.bet, `${r.mult}×`); res.insertAdjacentHTML('beforeend', bigShare('drop', r.pay, r.bet));
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
  initRunPick($('#drop .runpick'), { verb: 'Drop', priceOf: (n) => priceLabel(bet * n) });
  $('#drop .skip').addEventListener('click', (e) => { fast = !fast; if (fast) board.hurry(); else board.normal(); skipLabel(e.currentTarget); });
  document.querySelectorAll('#drop .bets button').forEach((b) => b.addEventListener('click', () => setBet(+b.dataset.dbet)));
  setBet(0.1); odds(); render(); howTo();
  $('#dropHow').addEventListener('toggle', () => { if ($('#dropHow').open) howTo(); }); // today's jackpot amounts when opened
  window.__drop = { test, get opening() { return opening; }, get flying() { return flying; }, get landedWon() { return landedWon; }, history, get bet() { return bet; }, get fast() { return fast; } };
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
