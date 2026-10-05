// Stocking Stuffer on the Games tab (Cody's brief, 2026-10-02): size chips, Play 1 / 5 / 10 (a run that plays straight away,
// like every game here), the Game pool readout (one shared pool), the row of 8 gift slots that is also the pay table (the 8th is
// the POOL JACKPOT: 25% of the Game pool at that moment × the turn's size, shown live), the
// "How to win" panel and your last turns. Every turn runs in the house's order (paid → secret locked → drawn → revealed;
// playcredits.js / house.js): the WHOLE turn is decided before the first stocking jiggles; the board only shows it.
// Celebrations follow the money (LESSONS: no losses dressed as wins): the jackpot gets the biggest, with its dollar amount; 3+
// gifts celebrate (5+ bigger); 2 gifts (1.5×) a light touch; 1 gift (0.5×) is a loss and is said plainly. Winners absorb SANTA's 3% tax, and the messages say so.
import { PAYS, WAYS, TOTAL, GIFTS, STOCKINGS, ROW, MAX_OPEN, JP, topMult } from './stocking.js?v=f4ba83e65c';
import { poolJackpot } from './slots.js?v=f4ba83e65c';
import { createStockings } from './stockingboard.js?v=f4ba83e65c';
import { playRun, short } from './playcredits.js?v=f4ba83e65c';
import { runSummary } from './runui.js?v=f4ba83e65c';
import { initRunPick, priceLabel } from './runpick.js?v=f4ba83e65c';
import { showResult } from './gamepool.js?v=f4ba83e65c';
import { play as sfx } from './sfx.js?v=f4ba83e65c';
import { celebrate, tierOf } from './celebrate.js?v=f4ba83e65c';
import { bigShare } from './sharecard.js?v=f4ba83e65c'; // "Share this win" on a big single win (Cody 2026-10-04)

const $ = (s, el = document) => el.querySelector(s);
const money = (v) => '$' + (Math.floor(v * 100 + 1e-6) / 100).toFixed(2);
const cents = (v) => (v < 1 ? Math.round(v * 100) + '¢' : '$' + (Number.isInteger(v) ? v : v.toFixed(2)));
const mult = (m) => `${+m.toFixed(2)}×`;
const amt = (v) => (v < 1 ? `${+(v * 100).toFixed(1)}¢` : money(v + 1e-9)); // exact prizes in the table: 1.75 × 10¢ = 17.5¢
const MAX_HISTORY = 16, TAX = 0.97;
let board = null, bet = 0.1, addWinner = () => {}, pool = () => 0, onPool = () => {}, opening = false, fast = false;
let hold = 0; // a bigger win holds the fireplace a little longer before the next turn (celebrate.js)
const history = [], test = { run: undefined }; // tests only: the next run's turns, one number each (gifts found, 0–8; 8 = the jackpot)
const jpNow = (b) => poolJackpot(pool(), JP.pct, b); // what the pool jackpot is worth right now at size b
const live = { current: null, shown: 0, started: 0, turns: 0, log: [] }; // tests: the turn being shown (decided before its first stocking), how far, what each said

function render() {
  $('#stockPool').textContent = money(pool());
  $('#stockHistory').innerHTML = history.length ? history.map((k) => `<li class="g${k === MAX_OPEN ? 'jp' : Math.min(k, 5)}" title="${k} gift${k === 1 ? '' : 's'}: ${k === MAX_OPEN ? 'the pool jackpot' : mult(PAYS[k])}">${k}<i aria-hidden="true"></i></li>`).join('')
    : '<li class="empty">No turns yet.</li>';
  // the description, the 8th slot and "How to win" carry the pool jackpot's live amount: they follow the pool
  $('#stockDesc').innerHTML = `${GIFTS} stockings hide a gift, ${STOCKINGS - GIFTS} hide coal. Open them until the first coal: the more gifts before it, the bigger the prize. <b>Find ${MAX_OPEN} gifts in a row for the pool jackpot: ${money(jpNow(1))}</b> on a $1 turn right now (${money(jpNow(0.1))} on 10¢). Winnings arrive 3% lighter (SANTA's token tax).`;
  ladder(shownFound, shownDone); jpOdds();
  if ($('#stockHow')?.open || !howTo.done) howTo();
}
// The jackpot's odds, always on show (Cody, 2026-10-03: each game shows its jackpot odds; the other odds went)
function jpOdds() {
  const el = $('#stockOdds'); if (!el) return;
  el.innerHTML = `<span class="jpline">Pool jackpot <b>${money(jpNow(bet))}</b> on a ${cents(bet)} turn right now <span class="dim">(${MAX_OPEN} gifts in a row: ${+(JP.pct * 100).toFixed(2)}% of the Game pool × your turn)</span></span> <b>1 in ${Math.round(TOTAL / WAYS[MAX_OPEN]).toLocaleString('en-US')}</b> to hit it`;
}
// The 8 gift slots: slot k fills with the k-th gift found; under each, what stopping there pays; the 8th is the POOL JACKPOT
// (gold, its live amount at the chosen size as its label's title). The step reached is lit.
let shownFound = 0, shownDone = false;
function ladder(found, done = false) {
  shownFound = found; shownDone = done;
  $('#stockLadder').innerHTML = Array.from({ length: MAX_OPEN }, (_, i) => { const k = i + 1, jp = k === MAX_OPEN, label = jp ? 'JP' : mult(PAYS[k]), said = jp ? `the pool jackpot, ${money(jpNow(bet))} on a ${cents(bet)} turn right now` : mult(PAYS[k]);
    return `<li class="${k <= found ? 'got' : ''}${k === found ? ' now' : ''}${done && k === found ? ' end' : ''}${jp || PAYS[k] > 1 ? ' win' : ''}${jp ? ' jpslot' : ''}"${jp ? ` title="${said}"` : ''}><i aria-hidden="true"></i><b>${label}</b><span class="sr">${k} gift${k === 1 ? '' : 's'}: ${said}</span></li>`; }).join('');
}
// "How to play & win": the rules and what each result pays, from the pay table (never typed in)
function howTo() {
  howTo.done = true;
  // (no chances or payback here: Cody 2026-10-03, only the jackpot's odds are shown, in the line above the box)
  const rows = PAYS.map((p, k) => `<tr class="${p > 1 ? 'win' : ''}"><td>${k === 0 ? 'Coal first' : k}</td><td>${p ? mult(p) : '—'}${p > 0 && p < 1 ? ' <span class="dim">(less back than it cost)</span>' : ''}</td><td>${p ? amt(p * 0.1) : '—'}</td><td>${p ? amt(p) : '—'}</td></tr>`).join('')
    + `<tr class="win jprow"><td>${MAX_OPEN} in a row</td><td>Pool jackpot <span class="dim">(${+(JP.pct * 100).toFixed(2)}% of the Game pool × the turn)</span></td><td>${money(jpNow(0.1))}</td><td>${money(jpNow(1))}</td></tr>`;
  $('#stockHow .body').innerHTML = `<ol class="howrules">
      <li><b>${STOCKINGS} stockings</b> hang on the mantel: <b>${GIFTS} hide a gift</b>, the other ${STOCKINGS - GIFTS} hide a lump of coal (the Naughty List).</li>
      <li><b>Tap the stockings</b> to open them, one at a time, up to ${MAX_OPEN}. <b>The first coal ends the turn.</b></li>
      <li>You're paid by <b>how many gifts you find before the coal</b>. Each of the ${MAX_OPEN} slots under the mantel shows what stopping there pays. <b>${MAX_OPEN} gifts in a row win the pool jackpot</b>: ${+(JP.pct * 100).toFixed(2)}% of the Game pool at that moment, times your turn's size (a $1 turn wins ${+(JP.pct * 100).toFixed(2)}% of the pool, a 10¢ turn a tenth of that).</li>
      <li>1 gift pays back half the turn: less than it cost, so it isn't a win. <b>2 gifts or more</b> pay more than the turn.</li></ol>
    <table class="pays"><thead><tr><th>Gifts before the coal</th><th>Pays</th><th>10¢ turn</th><th>$1 turn</th></tr></thead><tbody>${rows}</tbody></table>
    <p><b>3% SANTA tax:</b> winnings are paid in SANTA and arrive 3% lighter. The token does that, not this game; winners absorb it.</p>
    <p class="dim"><b>Check it yourself:</b> after a turn, tap <b>Check last result</b> to re-run it from the revealed secret.</p>`;
}
function stamp(text) { const fl = $('#stocking .flash'); fl.textContent = text; fl.classList.remove('show'); void fl.offsetWidth; fl.classList.add('show'); }
function setBet(b) {
  bet = b; document.querySelectorAll('#stocking .bets button').forEach((x) => x.setAttribute('aria-checked', String(+x.dataset.sbet === b)));
  document.querySelectorAll('#stocking [data-run]').forEach((x) => { $('small', x).textContent = priceLabel(b * +x.dataset.run); }); // incl. the custom one
  if (inited) { ladder(shownFound, shownDone); jpOdds(); } // the jackpot slot and line say what it's worth at this size
}
const wait = (ms) => new Promise((x) => setTimeout(x, ms));

// A run of n turns at the chosen size: pay once, then the turns play one after another; winnings are sent at the end.
async function startRun(n) {
  if (opening) return;
  opening = true; fast = false; setButtons(false);
  const res = $('#stocking .res'), forced = test.run || [];
  test.run = undefined;
  try {
    const out = await playRun('stocking', bet, n, async (p, i) => {
      $('#runStock').innerHTML = `Turn <b>${i + 1}</b> of <b>${n}</b>`;
      if (!p.r) { res.textContent = p.refunded ? `Turn ${i + 1} couldn't play (${p.stopped ? 'Stocking Stuffer is paused' : p.why || 'the pool is refilling'}): its price comes back with your winnings.` : `Couldn't play (${p.why}).`; return; }
      await showTurn(p.r, p);
      if (i < n - 1) await wait(fast ? 60 : 700 + hold); // a breath between turns (longer after a big win)
    }, forced);
    if (out) { res.innerHTML = runSummary(out, 'turn', 'turns'); showResult(res); }
  } finally { opening = false; fast = false; board.normal(); setButtons(true); $('#runStock').textContent = ''; }
}
// One turn, already decided (r: the stockings Santa opens, in order, and what each holds): show it stocking by stocking.
async function showTurn(r, p) {
  const res = $('#stocking .res'), card = $('#stocking .stockcard');
  live.current = { found: r.found, opened: [...r.opened], mult: r.mult, jackpot: !!r.jackpot }; live.shown = 0; live.started++;
  card.classList.remove('won', 'jackpot'); board.reset(); ladder(0);
  // TAP TO OPEN (Cody): the player taps each stocking. The turn's SEQUENCE is fixed already (r.opened's contents, in order);
  // the k-th tap shows the k-th item, wherever they tap (stocking.js asTapped), so a pick can't change the result.
  const taps = []; if (p.proof) p.proof.taps = taps; live.current.taps = taps; // for Check last result (it shows the turn as tapped)
  res.textContent = 'Tap a stocking to open it!'; // (Cody 2026-10-03: no wording about taps not mattering or the result being set)
  let found = 0;
  for (const [i, s0] of r.opened.entries()) {
    if (i) res.innerHTML = `<span><b>${found} gift${found === 1 ? '' : 's'}…</b> tap another stocking</span>`;
    const s = await board.pick(); taps.push(s);
    sfx('jiggle');
    const gift = r.gifts[s0];
    await board.open(s, gift);
    live.shown++;
    if (gift) { found++; sfx('gift'); ladder(found); res.innerHTML = `<span><b>${found} gift${found === 1 ? '' : 's'}…</b> ${found < MAX_OPEN ? 'tap another stocking' : ''}</span>`; }
    else sfx('coal');
    await wait(fast ? 40 : 260);
  }
  ladder(r.found, true);
  landed(r, p);
}
function setButtons(on) { document.querySelectorAll('#stocking [data-run], #stocking .bets button, #stocking .runpick input, #stocking .runpick [data-step]').forEach((b) => { b.disabled = !on; }); $('#stocking .skip').hidden = on; skipLabel($('#stocking .skip')); }
// Skip ahead is a toggle (Cody): pressed, the run goes fast and the button says "Normal speed"; pressed again, back to normal.
const skipLabel = (b) => { b.textContent = fast ? 'Normal speed' : 'Skip ahead'; b.setAttribute('aria-pressed', String(fast)); };
function landed(r, p) {
  const res = $('#stocking .res'), card = $('#stocking .stockcard'), k = r.found, after = (v) => ` <span class="dim">(${money(v * TAX)} after SANTA's 3% tax)</span>`;
  onPool(p.poolUsd);
  history.unshift(k); history.length = Math.min(history.length, MAX_HISTORY);
  live.turns++; hold = 0;
  if (r.jackpot) { // 8 gifts in a row: THE POOL JACKPOT, the biggest celebration, with the real dollar amount
    card.classList.add('jackpot'); stamp(`POOL JACKPOT ${money(r.pay)}`); hold = celebrate(card, 5, { amount: r.pay, money, fast });
    res.innerHTML = `<span><b>${k} gifts in a row! POOL JACKPOT: ${money(r.pay)}</b> <span class="dim">(${+(r.pct * 100).toFixed(2)}% of the ${money(r.jackpotPool)} Game pool × your ${cents(r.bet)} turn)</span>${after(r.pay)}</span>`;
    res.insertAdjacentHTML('beforeend', bigShare('stocking', r.pay, r.bet, true));
  } else if (k >= 3) { // a real win: celebrate (bigger for 5+ gifts)
    // the tier follows the money (3 gifts 3× nice, 10×+ big, 25×+ huge); the jackpot look is the pool jackpot's alone
    card.classList.add('won'); hold = celebrate(card, tierOf({ ahead: true, mult: r.mult }), { amount: r.pay, money, fast });
    stamp(`${mult(r.mult)} WIN`);
    res.innerHTML = `<span><b>${k} gifts! ${mult(r.mult)} win:</b> ${money(r.pay)}${after(r.pay)}</span>`;
    res.insertAdjacentHTML('beforeend', bigShare('stocking', r.pay, r.bet));
  } else if (k === 2) { // a light touch: no stamp, the tier-1 chime and sparkles (1.5× is ahead)
    res.innerHTML = `<span><b>2 gifts: ${mult(r.mult)} back</b> ${money(r.pay)}${after(r.pay)}</span>`; celebrate(card, tierOf({ ahead: r.ahead, mult: r.mult }), { amount: r.pay, money, fast });
  }
  else if (k === 1) res.innerHTML = `<span class="dim">1 gift, then coal: ${mult(r.mult)} back (${money(r.pay)}). Less than the ${cents(r.bet)} turn.</span>`;
  else res.textContent = 'Coal first. No win this time.';
  if (r.ahead) addWinner(r.bet >= 1 ? 'stock100' : 'stock10', r.pay, r.bet, r.jackpot ? 'pool jackpot' : `${k} gifts · ${mult(r.mult)}`);
  live.log.push({ found: k, text: res.textContent, celebrated: card.classList.contains('won') || card.classList.contains('jackpot'), stamp: card.classList.contains('won') || card.classList.contains('jackpot') ? $('#stocking .flash').textContent : '' });
  render();
}

let inited = false;
export function initStocking(opts) {
  if (inited) return; inited = true;
  addWinner = opts.addWinner || addWinner; pool = opts.pool; onPool = opts.onPool || onPool;
  board = createStockings($('#stocking canvas'));
  document.querySelectorAll('#stocking [data-run]').forEach((b) => b.addEventListener('click', () => startRun(+b.dataset.run)));
  initRunPick($('#stocking .runpick'), { verb: 'Play', priceOf: (n) => priceLabel(bet * n) });
  $('#stocking .skip').addEventListener('click', (e) => { fast = !fast; if (fast) board.hurry(); else board.normal(); skipLabel(e.currentTarget); });
  document.querySelectorAll('#stocking .bets button').forEach((b) => b.addEventListener('click', () => setBet(+b.dataset.sbet)));
  // the size chips and header from the pay table as published (server mode applies it before this runs)
  document.querySelectorAll('#stocking .bets button').forEach((b) => { $('small', b).textContent = `up to ${cents(+b.dataset.sbet * topMult())} + jackpot`; });
  $('#stocking header em').textContent = `10¢ or $1 a turn · up to ${topMult()}× + the pool jackpot`;
  setBet(0.1); ladder(0); howTo(); render();
  window.__stocking = { test, live, history, board, get opening() { return opening; }, get bet() { return bet; }, get fast() { return fast; } };
}
export function showStocking(on) {
  if (!board) return;
  if (on && !showStocking.io && 'IntersectionObserver' in window) { showStocking.io = new IntersectionObserver(([e]) => { showStocking.seen = e.isIntersecting; board.setActive(showStocking.tab && showStocking.seen); }); showStocking.io.observe($('#stocking canvas')); }
  showStocking.tab = on; if (!('IntersectionObserver' in window)) showStocking.seen = true;
  board.setActive(on && !!showStocking.seen);
}
export function refreshStocking() { if (inited) render(); }
export function resetStocking() { history.length = 0; refreshStocking(); }
