// The escrow admin screen (admin.html): pool status, Stop / Resume, settings. Every action is a message Cody's wallet signs
// (adminmsg.js); the server checks it (server/admin.js). Open with ?server=<the games Edge Function address>.
import { adminMessage } from './adminmsg.js';
import { POOL_RULES } from './slots.js';
import { SPIN_RULES } from './spin.js';

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
  $('#pending').innerHTML = state.pending.length ? `<table><tr><th>Pool</th><th>What</th><th>SANTA</th><th>Status</th></tr>${state.pending.map((t) => `<tr><td>${esc(t.game)}</td><td>${esc(t.kind)}</td><td>${(t.amount_raw / 1e6).toFixed(2)}</td><td>${esc(t.status)}</td></tr>`).join('')}</table>` : 'None.';
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
  msg(`Done: ${action} on the ${game} pool. It's in the public log.`, 'ok'); await load();
}
$('#connect').addEventListener('click', async () => {
  wallet = window.phantom?.solana || window.solflare || window.backpack?.solana || window.solana || null;
  if (!wallet) return msg('No Solana wallet found in this browser.', 'bad');
  try { await wallet.connect?.(); address = wallet.publicKey.toString(); $('#who').textContent = 'Connected: ' + address; } catch { msg('Connecting was cancelled.', 'bad'); }
});
$('#pools').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act, b.dataset.game); });
$('#game').addEventListener('change', fields);
$('#save').addEventListener('click', () => {
  const g = $('#game').value, p = state?.pools.find((x) => x.game === g), R = { ...DEFAULTS[g], ...(p?.rules || {}) }, changed = {};
  for (const el of document.querySelectorAll('#fields [data-k]')) { const v = Number(el.value); if (v !== R[el.dataset.k]) changed[el.dataset.k] = v; }
  if (!Object.keys(changed).length) return msg('Nothing changed.');
  act('set-rules', g, changed);
});
load().catch((e) => msg('Couldn\'t reach the game server: ' + e.message, 'bad'));
