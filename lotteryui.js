// The Santa Lottery on the Store tab (Cody, 2026-10-01; rules mockups/lottery.js, server server/lottery.js).
// Five lotteries, each with its ticket price, its winners, a live countdown and (with the game server) the pot and tickets sold.
// Buying uses the same one-payment wallet step as the games (wallet.js: 10% burned, the rest to the lottery wallet). Recent
// results can be re-checked in this browser: the draw is re-run from public data alone (mockups/lottery.js drawWinners).
// Without the game server (today's site) buying says so plainly: nothing is sold and nothing is drawn here.
import { LOTTERIES, LIVE_LOTTERIES, nextDraw, salesFor, drawWinners } from './lottery.js?v=810de0dff9';
import { SERVER, call, walletReady, payError, forPlayer, WALLET_LOAD_FAILED } from './gameserver.js?v=810de0dff9';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const santa = (raw) => (raw / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' SANTA';
const money = (v) => (v < 1 ? Math.round(v * 100) + '¢' : '$' + v.toFixed(2));
const winnersText = (split) => (split.length === 1 ? 'One winner takes the pot' : 'Top 3 win: 60% · 25% · 15%');
let live = null; // the server's answer (pots, tickets, recent draws)

function left(ms) {
  if (ms <= 0) return 'drawing now';
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}
// Your tickets in each draw, as THIS browser bought them (the server's public answer has totals, not who holds what). Keyed by
// lottery + draw time, so a new draw starts at 0.
const MINE = 'santa.myLotteryTickets';
// The draw's key: the server's own draw time when it has answered (the draw actually open), else this browser's schedule.
const drawKey = (kind) => kind + '@' + (live?.open?.find((x) => x.lottery === kind)?.drawsAt ?? nextDraw(kind, Date.now()));
const mineOf = (kind) => { try { return JSON.parse(localStorage.getItem(MINE) || '{}')[drawKey(kind)] || 0; } catch { return 0; } };
// filed under the draw the SERVER says the tickets are in (its reply's drawsAt; moved tickets count in the next draw)
const addMine = (kind, n, drawsAt) => { try { const m = JSON.parse(localStorage.getItem(MINE) || '{}'), k = drawsAt ? kind + '@' + drawsAt : drawKey(kind); m[k] = (m[k] || 0) + n; localStorage.setItem(MINE, JSON.stringify(m)); } catch {} };
// The card's changing parts (Cody, 2026-10-01: laid out like his other game's lottery cards): a notice, then rows of facts.
const info = (kind) => { const o = live?.open?.find((x) => x.lottery === kind), L = LOTTERIES[kind], mine = mineOf(kind), sold = o ? o.tickets : 0;
  const notice = !SERVER ? '🧪 Test version: tickets aren\'t on sale yet, so there\'s nothing to win this draw.'
    : o && o.sales === false ? 'Sales are closed: this draw is about to be drawn.'
    // Cody, 2026-10-02: tickets are final once bought (DESIGN_NOTES → Santa Lottery)
    : `Ticket sales close 5 minutes before the draw. 10% of every ticket is burned; the rest is the pot. All tickets are final: no refunds.`;
  return { notice, rows: [['Ticket', money(L.ticket)], ['Prize pot', o ? santa(o.pot_raw) : '–'], ['Tickets sold', o ? sold.toLocaleString() : '–'],
    ['Winners', L.split.length === 1 ? '1 takes it all' : 'Top 3 · 60/25/15'], ['Yours', `${mine} of ${sold.toLocaleString()} · ${sold ? ((mine / sold) * 100).toFixed(1) : '0.0'}%`]] }; };
// A ticket in each lottery's colour (daily red, weekly gold, Christmas green), like the icons in Cody's other game.
const ICON = { 'daily-10': '#e5484d', 'daily-100': '#e5484d', 'weekly-10': '#f5c542', 'weekly-100': '#f5c542', christmas: '#3fb950' };
const ticketIcon = (kind) => `<svg class="lotico" viewBox="0 0 32 22" aria-hidden="true"><path d="M2 3h28v5a3 3 0 0 0 0 6v5H2v-5a3 3 0 0 0 0-6z" fill="${ICON[kind] || '#f5c542'}"/><path d="M8 7h16v8H8z" fill="none" stroke="#0c0d12" stroke-width="2" opacity=".55"/><path d="M11 11h10" stroke="#0c0d12" stroke-width="2" opacity=".55"/></svg>`;
function card(kind) {
  const L = LOTTERIES[kind], at = nextDraw(kind, Date.now()), i = info(kind);
  const when = at === null ? 'Drawn' : kind === 'christmas' ? `<b data-left="${at}">${left(at - Date.now())}</b>` : `<b data-left="${at}">${left(at - Date.now())}</b>`;
  return `<article class="lotcard" data-lot="${kind}">
    <header>${ticketIcon(kind)}<h3>${esc(L.name)}</h3></header>
    <p class="lotnotice">${esc(i.notice)}</p>
    <dl class="lotrows">${i.rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}<div><dt>Draws in</dt><dd>${when}</dd></div></dl>
    ${kind === 'christmas' ? '<p class="lotwhen">Draws December 23, 9 PM Eastern (Indiana time)</p>' : ''}
    <div class="lotbuy" role="group" aria-label="How many ${esc(L.name)} tickets">
      ${[1, 5, 10].map((n) => `<button type="button" data-amt="${n}">${n}</button>`).join('')}
      <input type="number" min="1" max="10000" step="1" value="1" aria-label="How many tickets">
    </div>
    <button class="lotgo" data-buy="custom">Buy tickets</button>
    <p class="lotnote" aria-live="polite"></p></article>`;
}
// The cards are built ONCE; later updates only change their changing parts (countdown, pot, tickets), so a buy message or a
// number being typed is never wiped by the 30-second refresh. A card is rebuilt only when its draw time moves on.
function render() {
  const kinds = LIVE_LOTTERIES.filter((k) => nextDraw(k, Date.now()) !== null), grid = $('#lotGrid'); // switched-off ones aren't shown
  for (const c of [...grid.children]) if (!kinds.includes(c.dataset.lot)) c.remove();
  for (const k of kinds) {
    let c = grid.querySelector(`[data-lot="${k}"]`); const at = String(nextDraw(k, Date.now()));
    if (!c || (c.querySelector('[data-left]') && c.querySelector('[data-left]').dataset.left !== at)) { const t = document.createElement('template'); t.innerHTML = card(k).trim(); const n = t.content.firstChild; c ? c.replaceWith(n) : grid.append(n); c = n; }
    const i = info(k); c.querySelector('.lotnotice').textContent = i.notice;
    c.querySelectorAll('.lotrows dd').forEach((dd, n) => { if (i.rows[n]) dd.textContent = i.rows[n][1]; });
  }
  const recent = live?.recent || [];
  $('#lotResults').innerHTML = recent.length ? `<h3>Recent draws</h3><ol class="lotres">${recent.map((r) => `<li data-draw="${r.id}">
      <b>${esc(LOTTERIES[r.kind]?.name || r.kind)}</b> · ${esc(new Date(r.draws_at).toLocaleDateString())} · pot ${santa(r.pot_raw)} · ${r.tickets} tickets
      <span>${r.winners.length ? r.winners.map((w) => `${['', '1st', '2nd', '3rd'][w.place]} ${esc(w.name)} ${santa(w.amount_raw)}`).join(' · ') : 'no tickets, no winners'}</span>
      ${r.tickets ? '<button class="sec" data-check>Check this draw</button><em class="lotcheck"></em>' : ''}</li>`).join('')}</ol>` : '';
}
const tick = () => document.querySelectorAll('[data-left]').forEach((b) => { b.textContent = left(+b.dataset.left - Date.now()); });

async function refresh() {
  try { const r = await call('lottery'); if (r && Array.isArray(r.open)) { live = r; render(); } } catch {}
}

// Buying: price (60 s) → the wallet pays once → the server checks the payment and numbers the tickets. Remembered in this
// browser between paying and the server accepting it, so a closed tab or dropped network never loses a paid ticket.
const PENDING = 'santa.pendingLottery';
const remember = (v) => { try { v ? localStorage.setItem(PENDING, JSON.stringify(v)) : localStorage.removeItem(PENDING); } catch {} };
async function buyPaid(quote, signature) {
  remember({ quote, signature, at: Date.now() }); let b;
  for (let i = 0; i < 40; i++) {
    try { b = await call('lottery-buy', { quote, signature }); } catch { b = { error: 'the game server didn\'t answer', retry: true }; }
    if (b.error && /on our side|answered 5\d\d/.test(b.error)) b.retry = true; // the server failed, it didn't refuse: keep the payment
    if (!b.error || !(b.retry || /not finalized|not found/.test(b.error))) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!b.error || /already used/.test(b.error) || !(b.retry || /not finalized|not found/.test(b.error))) remember(null);
  else b = { error: `Your payment went through but isn't confirmed yet. We'll keep trying when you come back (payment ${signature.slice(0, 8)}…).` };
  return b;
}
async function resumePaid() {
  let p; try { p = JSON.parse(localStorage.getItem(PENDING) || 'null'); } catch {}
  if (!SERVER || !p?.signature) return;
  if (Date.now() - p.at > 86_400_000) return remember(null);
  const b = await call('lottery-buy', { quote: p.quote, signature: p.signature });
  if (!b.error || /already used/.test(b.error)) remember(null);
}
async function buy(kind, n, note) {
  if (!SERVER) { note.textContent = 'Ticket sales open soon. This is the test version: nothing is sold yet.'; return; }
  if (!Number.isInteger(n) || n < 1 || n > 10000) { note.textContent = 'Pick between 1 and 10,000 tickets.'; return; }
  note.textContent = 'Getting a price…';
  const q = await call('lottery-quote', { lottery: kind, n });
  if (q.closed) { note.textContent = q.why || 'Sales are closed for this draw.'; return; }
  if (q.error) { note.textContent = forPlayer(q.error); return; }
  await walletReady;
  if (typeof window.santaPay !== 'function') { note.textContent = WALLET_LOAD_FAILED; return; }
  let signature; try { note.textContent = `Approve ${q.n} ticket${q.n === 1 ? '' : 's'} (${money(q.usd)}) in your wallet…`; signature = await window.santaPay(q); }
  catch (e) { note.textContent = payError(e); return; }
  note.textContent = 'Confirming the payment…';
  const b = await buyPaid(q.id, signature);
  if (b.error) { note.textContent = b.error; return; }
  if (!b.refunded && b.tickets) addMine(kind, b.tickets.last - b.tickets.first + 1, b.drawsAt);
  note.textContent = b.refunded ? b.note : `You have tickets #${b.tickets.first}${b.tickets.last > b.tickets.first ? '–#' + b.tickets.last : ''}${b.moved ? ' in the NEXT draw (this one had closed)' : ''}. Good luck!`;
  refresh();
}

// "Check this draw": re-run it here from the public answer alone and compare the winners' wallets (shown shortened).
async function check(li) {
  const out = li.querySelector('.lotcheck'); out.textContent = 'Checking…';
  try {
    const t = await call('lottery-tickets', { draw: li.dataset.draw }), r = live.recent.find((x) => x.id === +li.dataset.draw);
    if (t.error) { out.textContent = t.error; return; }
    const tickets = t.tickets.flatMap(([first, n, w]) => Array.from({ length: n }, (_, i) => ({ id: first + i, wallet: w })));
    const mine = await drawWinners({ secret: t.secret, blockhash: t.blockhash, tickets, drawId: t.id, places: LOTTERIES[t.lottery].split.length });
    const same = mine.length === r.winners.length && mine.every((w, i) => w.ticket.wallet === r.winners[i].wallet);
    const fp = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(t.secret.match(/../g).map((h) => parseInt(h, 16)))))].map((b) => b.toString(16).padStart(2, '0')).join('');
    out.textContent = same && fp === t.commit ? `Matches: the secret fits the fingerprint published before sales, and re-running the draw gives the same winners (ticket${mine.length === 1 ? '' : 's'} ${mine.map((w) => '#' + w.ticket.id).join(', ')}).` : 'Does NOT match. Please tell us.';
  } catch { out.textContent = 'Could not check right now.'; }
}

export function initLottery() {
  if (!$('#lotGrid')) return;
  render(); setInterval(tick, 1000);
  // 1 / 5 / 10 pick how many; "Buy tickets" buys that many (or whatever was typed)
  $('#lotGrid').addEventListener('click', (e) => { const a = e.target.closest('[data-amt]'); if (a) { $('input', a.closest('[data-lot]')).value = a.dataset.amt; return; } });
  $('#lotGrid').addEventListener('click', (e) => { const b = e.target.closest('[data-buy]'); if (!b) return; const c = b.closest('[data-lot]');
    const n = b.dataset.buy === 'custom' ? Math.floor(Number($('input', c).value)) : +b.dataset.buy; buy(c.dataset.lot, n, $('.lotnote', c)); });
  $('#lotResults').addEventListener('click', (e) => { const b = e.target.closest('[data-check]'); if (b) check(b.closest('[data-draw]')); });
  if (SERVER) { refresh(); setInterval(refresh, 30000); resumePaid(); }
  window.__lottery = { get live() { return live; }, render, refresh };
}
