// The escrow admin screen (admin.html): pool status, Stop / Resume, settings. Every action is a message Cody's wallet signs
// (adminmsg.js); the server checks it (server/admin.js). Open with ?server=<the games Edge Function address>.
import { adminMessage } from './adminmsg.js';
import { LOTTERIES } from './lottery.js';
import { POOL_RULES } from './slots.js';
import { SPIN_RULES, MAIN_SLICES, BONUS_SLICES } from './spin.js';
import { DEFAULT_SETTINGS, check, itemsWith } from './settings.js';
import { ITEMS, SLOTS } from './catalog.js';
import { SYMBOLS } from './slots.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; };
const SERVER = new URLSearchParams(location.search).get('server');
const DEFAULTS = { slots: { ...POOL_RULES, jackpotPct: 0.25 }, spin: SPIN_RULES };
const FIELDS = { start: 'Starting amount ($)', skimAt: 'Skim when the pool reaches ($)', skim: 'Skim amount ($)', topOffBelow: 'Top off below ($)', topOffTo: 'Top off up to ($)', jackpotPct: 'Pool jackpot (share, 0–0.5)' };
let wallet = null, address = null, state = null;
const msg = (t, cls = '') => { $('#msg').textContent = t; $('#msg').className = cls; };
const post = async (body, admin) => (await fetch(SERVER, { method: 'POST', headers: { 'content-type': 'application/json', ...(admin ? { 'x-santa-admin': '1' } : {}) }, body: JSON.stringify(body) })).json();
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const nonce = () => hex(crypto.getRandomValues(new Uint8Array(16)));

async function load() {
  if (!SERVER) { $('#pools').innerHTML = '<p class="dim">Open this page with ?server=&lt;the game server address&gt;.</p>'; return; }
  state = await post({ action: 'pools' });
  $('#pools').innerHTML = state.pools.map((p) => { const R = { ...DEFAULTS[p.game], ...p.rules };
    return `<article class="plaque pool"><div class="eyebrow">${esc(p.game)} pool</div><b class="big">${(p.santaRaw / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })} SANTA</b>
      <p><span class="state ${R.paused ? 'off' : 'on'}">${R.paused ? 'Stopped' : 'Running'}</span></p>
      <p class="dim">Skim $${R.skim} at $${R.skimAt} · top off below $${R.topOffBelow} to $${R.topOffTo}${p.game === 'slots' ? ` · jackpot ${Math.round(R.jackpotPct * 100)}%` : ''}</p>
      <div class="row"><button type="button" class="${R.paused ? '' : 'stop'}" data-act="${R.paused ? 'resume' : 'pause'}" data-game="${esc(p.game)}">${R.paused ? 'Resume' : 'Stop (emergency)'}</button></div></article>`; }).join('');
  // Frozen run payouts: who, how much, which game, and a Release button (wallet-signed, like every action here).
  const held = state.held || [], NAMES = { spin: 'Spin', drop: 'Snowball Drop', big: 'Big Hat' }, $usd = (v) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  $('#frozenBox').classList.toggle('alert', held.length > 0);
  $('#frozen').innerHTML = held.length ? `<table><tr><th>Player</th><th>Wallet</th><th>Run</th><th>Amount</th><th>Frozen</th><th></th></tr>${held.map((h) => `<tr><td>${esc(h.name || 'player')}</td><td><code>${esc(h.wallet)}</code></td><td>${esc(NAMES[h.kind] || h.kind)} · ${h.n} × ${$usd(h.bet)}</td><td><b>${$usd(h.usd)}</b><br><span class="dim">${(h.santaRaw / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })} SANTA</span></td><td>${esc(new Date(h.at).toLocaleString())}</td><td><button type="button" data-release="${h.id}" data-game="${esc(h.game)}">Release</button></td></tr>`).join('')}</table>` : 'None frozen.';
  const STATUS = { needs_approval: 'waiting for your deposit', queued: 'queued', sending: 'sending', failed: 'failed (will retry)' };
  $('#pending').innerHTML = state.pending.length ? `<table><tr><th>Pool</th><th>What</th><th>SANTA</th><th>Status</th></tr>${state.pending.map((t) => `<tr><td>${esc(t.game)}</td><td>${esc(t.kind)}</td><td>${(t.amount_raw / 1e6).toFixed(2)}</td><td>${esc(STATUS[t.status] || t.status)}</td></tr>`).join('')}</table>` : 'None.';
  // What to send for waiting top-offs: the pool must RECEIVE the amount, and SANTA's 3% tax comes off on the way.
  $('#toSend').innerHTML = state.pools.map((p) => { const owed = state.pending.filter((t) => t.game === p.game && t.kind === 'top-off' && t.status === 'needs_approval').reduce((a, t) => a + +t.amount_raw, 0);
    return owed ? `<p><b>${esc(p.game)} pool:</b> send <b>${Math.ceil(owed / 0.97 / 1e6).toLocaleString()} SANTA</b> (${Math.ceil(owed / 1e6).toLocaleString()} arrives after the 3% tax) to <code>${esc(p.wallet || 'the pool wallet (address not set on the server yet)')}</code></p>` : ''; }).join('');
  $('#log').innerHTML = state.log.length ? `<table><tr><th>When</th><th>Pool</th><th>Action</th><th>By</th></tr>${state.log.map((l) => `<tr><td>${esc(new Date(l.at).toLocaleString())}</td><td>${esc(l.game)}</td><td>${esc(l.what)}</td><td>${esc(String(l.by).slice(0, 6))}…</td></tr>`).join('')}</table>` : 'No changes yet.';
  fields();
}
function fields() {
  const g = $('#game').value, p = state?.pools.find((x) => x.game === g), R = { ...DEFAULTS[g], ...(p?.rules || {}) };
  $('#fields').innerHTML = Object.keys(FIELDS).filter((k) => k in DEFAULTS[g]).map((k) => `<label>${FIELDS[k]}<input type="number" step="any" data-k="${k}" value="${R[k]}"></label>`).join('');
}
async function act(action, game, settings = {}) {
  if (!wallet) return msg('Connect the admin wallet first.', 'bad');
  const message = adminMessage({ action, game, settings, at: new Date().toISOString(), nonce: nonce() });
  let signature; try { signature = (await wallet.signMessage(new TextEncoder().encode(message), 'utf8')).signature; } catch { return msg('Signing was cancelled.', 'bad'); }
  const r = await post({ wallet: address, message, signature: hex(new Uint8Array(signature)) }, true);
  if (r.error) return msg('Refused: ' + r.error, 'bad');
  if (action === 'lottery-owed') { owedList(r); return msg(r.owed.length ? `${r.owed.length} lottery payment(s) to send.` : 'No lottery winners waiting.', 'ok'); }
  if (action === 'lottery-paid' || action === 'lottery-mode') { msg(action === 'lottery-paid' ? `Recorded: payout #${r.payout} paid (${(r.arrived / 1e6).toLocaleString()} SANTA arrived). It's in the public log.` : `Lottery payouts are now ${r.mode}. It's in the public log.`, 'ok'); return act('lottery-owed', 'lottery'); }
  if (action === 'bot-signals') { bots(r); return msg(`Checked ${r.checkedRuns} runs from the last 24 hours: ${r.flagged.length ? r.flagged.length + ' player(s) to look at.' : 'nothing looks scripted.'}`, 'ok'); }
  await load(); // refresh the pools and log FIRST, so "Done" never shows next to the old state (e.g. still "Running")
  msg(action === 'set-settings' ? `Published settings version ${r.version}. New plays use it now; it's in the public log.` : action === 'record-deposit' ? `Recorded: ${(r.arrived / 1e6).toLocaleString()} SANTA arrived in the ${game} pool (${(r.coveredTopOffs / 1e6).toLocaleString()} paid waiting top-offs, ${(r.addedToPool / 1e6).toLocaleString()} added to the pool).` : action === 'release-payout' ? `Released payout #${r.payout} ($${r.usd.toFixed(2)}): it goes to the player's wallet on the next payout pass. It's in the public log.` : `Done: ${action} on the ${game} pool. It's in the public log.`, 'ok');
}
$('#connect').addEventListener('click', async () => {
  wallet = window.phantom?.solana || window.solflare || window.backpack?.solana || window.solana || null;
  if (!wallet) return msg('No Solana wallet found in this browser.', 'bad');
  try { await wallet.connect?.(); address = wallet.publicKey.toString(); $('#who').textContent = 'Connected: ' + address; } catch { msg('Connecting was cancelled.', 'bad'); }
});
$('#pools').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act, b.dataset.game); });
$('#frozen').addEventListener('click', (e) => { const b = e.target.closest('[data-release]'); if (b) act('release-payout', b.dataset.game, { payout: +b.dataset.release }); });
// Possible bots (read only): who, their wallet in full (this list is private), and each signal with the numbers behind it.
function bots(r) {
  $('#botsBox').classList.toggle('alert', r.flagged.some((f) => f.reasons.some((x) => x.strong)));
  $('#bots').innerHTML = r.flagged.length ? `<table><tr><th>Player</th><th>Wallet</th><th>Runs</th><th>Signals</th></tr>${r.flagged.map((f) => `<tr><td>${esc(f.name || 'player')}</td><td><code>${esc(f.wallet || '')}</code></td><td>${f.runs}</td><td><ul>${f.reasons.map((x) => `<li${x.strong ? ' class="strong"' : ''}>${esc(x.signal)}${x.strong ? ' (strong)' : ''}: ${esc(x.why)}</li>`).join('')}</ul></td></tr>`).join('')}</table>` : 'Nothing looks scripted in the last 24 hours.';
}
$('#botCheck').addEventListener('click', () => act('bot-signals', 'all'));
// The lottery's manual payouts: who, their FULL wallet (to send to), what for, and how much to send; paste the transaction to record it.
function owedList(r) {
  $('#lotMode').textContent = 'Payouts are ' + r.mode + '.';
  $('#lotteryBox').classList.toggle('alert', r.owed.length > 0);
  const what = (o) => (o.place === 0 ? 'refund (paid after the Christmas draw)' : ['', '1st', '2nd', '3rd'][o.place] + ' place');
  $('#lotOwed').innerHTML = r.owed.length ? `<table><tr><th>Player</th><th>Send to</th><th>For</th><th>Send</th><th>Transaction</th></tr>${r.owed.map((o) => `<tr><td>${esc(o.name || 'player')}</td><td><code>${esc(o.wallet)}</code></td><td>${esc(LOTTERIES[o.lottery]?.name || o.lottery)} · ${esc(new Date(o.drawsAt).toLocaleDateString())} · ${what(o)}</td><td><b>${(o.raw / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 })} SANTA</b></td><td><input type="text" placeholder="paste the signature" data-lottx="${o.id}"><button type="button" data-lotpaid="${o.id}">Record</button></td></tr>`).join('')}</table>` : 'Nobody waiting.';
}
$('#lotLoad').addEventListener('click', () => act('lottery-owed', 'lottery'));
$('#lotAuto').addEventListener('click', () => act('lottery-mode', 'lottery', { mode: 'auto' }));
$('#lotManual').addEventListener('click', () => act('lottery-mode', 'lottery', { mode: 'manual' }));
$('#lotOwed').addEventListener('click', (e) => { const b = e.target.closest('[data-lotpaid]'); if (!b) return;
  const tx = document.querySelector(`[data-lottx="${b.dataset.lotpaid}"]`).value.trim(); if (!tx) return msg('Paste the transaction signature first.', 'bad');
  act('lottery-paid', 'lottery', { payout: +b.dataset.lotpaid, tx }); });
$('#game').addEventListener('change', fields);
$('#depSave').addEventListener('click', () => { const tx = $('#depTx').value.trim(); if (!tx) return msg('Paste the transaction signature first.', 'bad'); act('record-deposit', $('#depGame').value, { tx }); });
$('#save').addEventListener('click', () => {
  const g = $('#game').value, p = state?.pools.find((x) => x.game === g), R = { ...DEFAULTS[g], ...(p?.rules || {}) }, changed = {};
  for (const el of document.querySelectorAll('#fields [data-k]')) { const v = Number(el.value); if (v !== R[el.dataset.k]) changed[el.dataset.k] = v; }
  if (!Object.keys(changed).length) return msg('Nothing changed.');
  act('set-rules', g, changed);
});
// ---------- Game settings editor: prices, odds, prizes, store. A live preview runs the same guard rails as the server.
let gs = null, added = [];
const PRICE_LABEL = { spin10: 'Small spin', spin100: 'Big spin', big: 'Big Hat pull', ticket: 'Ranked ticket' };
const numInput = (k, v, step = 'any') => `<input type="number" step="${step}" data-gs="${k}" value="${v}">`;
async function loadSettings() {
  const r = await post({ action: 'settings' }); gs = r.settings || structuredClone(DEFAULT_SETTINGS); added = [];
  $('#gsVer').textContent = `· version ${r.version ?? 0}`;
  $('#gsPrices').innerHTML = Object.entries(gs.prices).map(([k, v]) => `<label>${PRICE_LABEL[k] || k}${numInput('prices.' + k, v)}</label>`).join('');
  const segLabel = (m) => (m === 'star' ? '★ gold star (to the bonus wheel)' : `${m}× ${m === '0' ? '(no win)' : m === '1' ? '(money back)' : ''}`);
  $('#gsSlices').innerHTML = Object.entries(gs.spin.main).map(([m, n]) => `<label>${segLabel(m)}${numInput('main.' + m, n, 1)}</label>`).join('');
  $('#gsBonus').innerHTML = Object.entries(gs.spin.bonus).map(([m, n]) => `<label>${segLabel(m)}${numInput('bonus.' + m, n, 1)}</label>`).join('');
  $('#gsBig').innerHTML = `<label>Pool jackpot: share of the pool (0.01–0.5)${numInput('big.jackpotPct', gs.big.jackpotPct)}</label>
    <label>Pool jackpot: 1 in …${numInput('big.jackpotOdds', gs.big.jackpotOdds, 1)}</label><label>Hat bonus (× the pull price, per Santa Hat)${numInput('big.hatBonus', gs.big.hatBonus)}</label>`;
  $('#gsCounts').innerHTML = SYMBOLS.map((x) => `<label>${x.name}${numInput('counts.' + x.id, gs.big.counts[x.id], 1)}</label>`).join('');
  $('#gsPays').innerHTML = `<div class="pays"><b class="dim">Line prize</b><b class="dim">3 in a row</b><b class="dim">4</b><b class="dim">5</b>${
    SYMBOLS.filter((x) => x.id !== 'coal').map((x) => `<span>${x.name}</span>${[3, 4, 5].map((n) => numInput(`pays.${x.id}.${n}`, gs.big.pays[x.id]?.[n] ?? '')).join('')}`).join('')}</div>`;
  renderItems();
  $('#gsNew').innerHTML = `<label>Id (e.g. shirt_mint)<input data-new="id"></label><label>Name<input data-new="name"></label>
    <label>Slot<select data-new="slot">${['shirt', 'pants', 'snow'].map((x) => `<option>${x}</option>`).join('')}</select></label><label>Colour<input type="color" data-new="color" value="#98e0c0"></label>
    <label>Price ($, or empty)<input type="number" step="any" data-new="price"></label><label>Level (or empty)<input type="number" step="1" data-new="level"></label>`;
  preview();
}
function renderItems() {
  const list = itemsWith({ store: { items: [...(gs.store?.items || []), ...added] } });
  $('#gsItems').innerHTML = `<table class="items"><tr><th>Item</th><th>Slot</th><th>Price $</th><th>Level</th></tr>${list.map((it) => `<tr data-item="${esc(it.id)}"><td>${it.color !== undefined ? `<span class="swatch" style="background:#${it.color.toString(16).padStart(6, '0')}"></span> ` : ''}${esc(it.name)}</td><td>${esc(it.slot)}</td>
    <td><input type="number" step="any" data-f="price" value="${it.price ?? ''}"></td><td><input type="number" step="1" data-f="level" value="${it.level ?? ''}"></td></tr>`).join('')}</table>`;
}
// Read the form into a settings record.
function gather() {
  const s = structuredClone(gs); delete s.version; const v = (k) => document.querySelector(`[data-gs="${k}"]`)?.value;
  for (const k of Object.keys(s.prices)) s.prices[k] = Number(v('prices.' + k));
  for (const w of ['main', 'bonus']) for (const m of Object.keys(s.spin[w])) s.spin[w][m] = Number(v(`${w}.${m}`));
  for (const k of ['jackpotPct', 'jackpotOdds', 'hatBonus']) s.big[k] = Number(v('big.' + k));
  for (const x of SYMBOLS) s.big.counts[x.id] = Number(v('counts.' + x.id));
  s.big.pays = {}; for (const x of SYMBOLS) for (const n of [3, 4, 5]) { const raw = v(`pays.${x.id}.${n}`); if (raw !== undefined && raw !== '') (s.big.pays[x.id] ||= {})[n] = Number(raw); }
  // store: an entry for every item whose price/level differs from the built-in catalog, plus the new ones
  const byId = Object.fromEntries(ITEMS.map((x) => [x.id, x])), out = [];
  for (const tr of document.querySelectorAll('#gsItems tr[data-item]')) {
    const id = tr.dataset.item, price = tr.querySelector('[data-f="price"]').value, level = tr.querySelector('[data-f="level"]').value;
    const base = byId[id] || added.find((a) => a.id === id) || {}, row = { id, slot: base.slot, name: base.name };
    if (base.color !== undefined && !byId[id]) row.color = base.color;
    if (price !== '') row.price = Number(price); else if (level !== '') row.level = Number(level);
    const same = byId[id] && (row.price ?? null) === (byId[id].price ?? null) && (row.level ?? null) === (byId[id].level ?? null);
    if (!same) out.push(row);
  }
  s.store = { items: out };
  return s;
}
let timer = 0;
function preview() {
  clearTimeout(timer); timer = setTimeout(() => {
    const s = gather(), sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    $('#gsSliceTotal').textContent = `(${sum(s.spin.main)} of ${MAIN_SLICES})`; $('#gsBonusTotal').textContent = `(${sum(s.spin.bonus)} of ${BONUS_SLICES})`;
    const rules = Object.fromEntries((state?.pools || []).map((p) => [p.game, { ...DEFAULTS[p.game], ...p.rules }]));
    const c = check({ ...s, version: 0 }, { spin: rules.spin || SPIN_RULES, slots: rules.slots || POOL_RULES }), r = c.report;
    $('#gsPreview').innerHTML = (r ? `<p>Spin pays back <b>${(r.spin.payback * 100).toFixed(1)}%</b>; a real win (2× or more) <b>1 in ${(1 / r.spin.realWin).toFixed(1)}</b> spins; top prize ${r.spin.top}×.</p>
      <p>Big Hat pays back <b>${(r.big.payback * 100).toFixed(1)}%</b>; a win over the pull price about <b>1 in ${(1 / r.big.realWin).toFixed(1)}</b> pulls; top line prize <b>$${r.big.topPrize.toFixed(2)}</b>${r.big.top100 ? ` (about 1 in ${Math.round(r.big.top100).toLocaleString()})` : ''}; jackpot ${esc(r.big.jackpot)}.</p>` : '')
      + (c.ok ? '<p class="dim">These settings are safe to publish.</p>' : `<p class="bad">Can't publish yet:</p><ul class="bad">${c.problems.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`);
    $('#gsSave').disabled = !c.ok;
  }, 250);
}
$('#gs').addEventListener('input', preview);
$('#gsAdd').addEventListener('click', () => {
  const g = (k) => document.querySelector(`[data-new="${k}"]`).value, it = { id: g('id').trim(), name: g('name').trim(), slot: g('slot'), color: parseInt(g('color').slice(1), 16) };
  if (g('price') !== '') it.price = Number(g('price')); else if (g('level') !== '') it.level = Number(g('level'));
  added = added.filter((a) => a.id !== it.id).concat(it); renderItems(); preview();
});
$('#gsSave').addEventListener('click', async () => { await act('set-settings', 'all', gather()); await loadSettings(); });

load().then(loadSettings).catch((e) => msg('Couldn\'t reach the game server: ' + e.message, 'bad'));
