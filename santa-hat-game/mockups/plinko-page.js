// Snowball Drop preview page: draws the board and animates each drop along the path the rules already decided (plinko.js).
import { PAYS, WAYS, TOTAL, payback, realWin, drop } from './plinko.js';

import { createBoard } from './plinkoboard.js';

const $ = (s) => document.querySelector(s);
const cv = $('#board'), board = createBoard(cv);
const money = (x) => '$' + x.toFixed(2);

let bal = 10, bet = 0.1, dropped = 0, flying = 0;
const recent = [], log = [];

function newBall() {
  if (bal + 1e-9 < bet) { $('#res').innerHTML = 'Out of demo money. Reload the page to start again.'; return; }
  bal = Math.round((bal - bet) * 100) / 100; renderBal(); dropped++; flying++;
  const r = drop(bet);
  board.launch(r.path, r.bin).then(() => { flying--; landed(r); });
}
function landed(r) {
  log.push(r); bal = Math.round((bal + r.pay) * 100) / 100; renderBal();
  recent.unshift(r); recent.length = Math.min(recent.length, 14);
  $('#res').innerHTML = r.mult >= 10 ? `<b>10×!</b> <span class="up">+${money(r.pay)}</span> off the very edge. 1 in 128.`
    : r.mult === 0 ? `<b>0×</b> Nothing this time.` : r.mult === 1 ? `<b>1×</b> Money back: ${money(r.pay)}.`
    : r.ahead ? `<b>${r.mult}×</b> <span class="up">+${money(r.pay)}</span> back on a ${money(r.bet)} drop.`
    : `<b>${r.mult}×</b> ${money(r.pay)} back on a ${money(r.bet)} drop.`;
  $('#strip').innerHTML = recent.map((x) => `<span class="${x.mult >= 10 ? 'top' : x.ahead ? 'win' : ''}">${x.mult}×</span>`).join('');
}
const renderBal = () => { $('#bal').textContent = money(bal); };
board.setActive(true);

// ---------- controls
$('#drop').addEventListener('click', newBall);
cv.addEventListener('click', newBall);
document.querySelectorAll('[data-bet]').forEach((b) => b.addEventListener('click', () => {
  bet = +b.dataset.bet; document.querySelectorAll('[data-bet]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
}));
// Odds legend, from the same numbers the game uses
const groups = [...new Set(PAYS)].sort((a, b) => b - a).map((m) => ({ m, ways: PAYS.reduce((a, p, k) => a + (p === m ? WAYS[k] : 0), 0) }));
$('#oddsTable').innerHTML = groups.map((g) => `<tr><td>${g.m}×</td><td>${g.m >= 10 ? 'an edge present' : g.m > 1 ? 'more back than it cost' : g.m === 1 ? 'money back' : g.m > 0 ? 'part of it back' : 'nothing'}</td><td>1 in ${(TOTAL / g.ways).toFixed(g.ways * 10 >= TOTAL ? 1 : 0)}</td></tr>`).join('');
$('#oddsNote').textContent = `Pays back ${(payback() * 100).toFixed(1)}% over time. About 1 drop in ${(1 / realWin()).toFixed(1)} gives back more than it cost. Winnings are paid in SANTA, and SANTA's 3% tax comes off on the way.`;
window.__drop = { newBall, get bal() { return bal; }, get flying() { return flying; }, get recent() { return recent; }, get log() { return log; }, get dropped() { return dropped; } };
