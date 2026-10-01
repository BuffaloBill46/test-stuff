// Play credits on the page: the 1–10 buy counter, the credits readouts, and "Check this result".
// DEMO ONLY: credits are kept in this browser and paid from the demo balance. The real credits live on the server
// (the page will only show the number), and the house steps below run there. Rules: credits.js, the order: house.js.
import { KINDS, MAX_BUY, newLedger, buy, costOf, balanceOf, unitsFor } from './credits.js';
import { createHouse, check } from './house.js';
import { newSeed } from './fair.js';
import { santaFor, fmtSanta, QUOTE_SECONDS } from './market.js';
import { play as sfx } from './sfx.js';
import { SERVER, call } from './gameserver.js';
export const serverMode = !!SERVER; // ?server=<address>: plays and credits come from the game server

const $ = (s, el = document) => el.querySelector(s);
const money = (v) => '$' + (Math.floor(v * 100 + 1e-6) / 100).toFixed(2);
const KEY = 'sh_credits_demo';
const store = { get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }, set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} } };
const POOL_NAME = { spin: 'Spin', slots: 'Slots' };

let ledger, house, wallet, onChange = () => {}, last = {}, spinKind = 'spin10'; // last proof per kind; the chosen spin size
const saved = store.get();
ledger = saved && saved.credits && saved.bought ? { ...newLedger(), ...saved } : newLedger();

export const creditsOf = (kind) => ledger.credits[kind];
// Which spin size a price belongs to (prices can change in the settings, so compare with the small spin's price).
export const spinKindFor = (bet) => (Math.abs(bet - KINDS.spin10.bet) < 1e-9 ? 'spin10' : 'spin100');
export function setSpinKind(kind) { spinKind = kind; refresh(); }
// The readouts under each play button.
export function refresh() {
  for (const [kind, id] of [['big', 'crBig'], [spinKind, 'crSpin']]) {
    const n = ledger.credits[kind], el = document.getElementById(id); if (!el) continue;
    el.textContent = n; document.getElementById(id + 'What').textContent = n === 1 ? KINDS[kind].one : KINDS[kind].many;
    el.closest('.credrow').classList.toggle('none', n === 0);
  }
  const d = document.getElementById('crDrop'); // Snowball Drop: a dollar balance for both sizes (Cody)
  if (d) { d.textContent = money(balanceOf(ledger, 'drop')); d.closest('.credrow').classList.toggle('none', ledger.credits.drop === 0); }
  const pb = $('[data-proof="big"]'), ps = $('[data-proof="spin"]'), pd = $('[data-proof="drop"]');
  if (pb) pb.hidden = !last.big; if (ps) ps.hidden = !last[spinKind]; if (pd) pd.hidden = !last.drop;
}
const changed = () => { refresh(); onChange(); };

export function initCredits(opts) {
  wallet = opts.wallet; onChange = opts.onChange || onChange;
  opts.pools.spin.prepaid = true; opts.pools.slots.prepaid = true; // entries reach the pool when credits are bought
  house = createHouse(ledger, opts.pools);
  const pools = opts.pools;
  $('#buyMinus').addEventListener('click', () => setCount(count - 1));
  $('#buyPlus').addEventListener('click', () => setCount(count + 1));
  document.querySelectorAll('#buyQuick button').forEach((b) => b.addEventListener('click', () => setCount(+b.dataset.n)));
  $('#buyCancel').addEventListener('click', () => closeBuy(false));
  $('#buyDlg').addEventListener('cancel', (e) => { e.preventDefault(); closeBuy(false); });
  $('#buyGo').addEventListener('click', async () => {
    if (serverMode) return buyFromServer();
    const cost = costOf(buyKind, count);
    if (wallet.get() < cost - 1e-9) return; // button is disabled then anyway
    wallet.add(-cost);
    const r = buy(ledger, pools, buyKind, count, 'demo-' + newSeed(8)); // real version: the confirmed payment's signature
    if (!r.ok) { wallet.add(cost); $('#buyNote').textContent = 'Couldn\'t buy: ' + r.why; return; }
    store.set(ledger); changed(); sfx('buy'); closeBuy(true);
  });
  $('[data-buy="big"]').addEventListener('click', () => openBuy('big'));
  $('[data-buy="spin"]').addEventListener('click', () => openBuy(spinKind));
  $('[data-proof="big"]').addEventListener('click', () => showProof('big'));
  $('[data-proof="spin"]').addEventListener('click', () => showProof(spinKind));
  $('[data-buy="drop"]')?.addEventListener('click', () => openBuy('drop'));
  $('[data-proof="drop"]')?.addEventListener('click', () => showProof('drop'));
  $('#proofClose').addEventListener('click', () => $('#proofDlg').close?.());
  $('#proofCheck').addEventListener('click', recheck);
  if (serverMode) syncCredits();
  window.__credits = { ledger, house, get last() { return last; }, give(kind, n) { buy(ledger, pools, kind, n, 'test-' + newSeed(8)); store.set(ledger); changed(); } };
}
// Server mode: the credit numbers shown come from the server (the page never decides them).
export async function syncCredits() {
  const r = await call('credits');
  if (r.credits) { for (const k of Object.keys(ledger.credits)) ledger.credits[k] = 0; for (const c of r.credits) ledger.credits[c.kind] += +c.left_n; refresh(); } // rows bought at different prices add up
  return r;
}
export function resetCredits() { Object.assign(ledger, newLedger()); last = {}; store.set(ledger); refresh(); }

// ---- the buy counter ----
let count = 1, buyKind = 'big', resolveBuy = null, price = null;
export function setPrice(p) { price = p; if (resolveBuy) setCount(count); }
function setCount(n) {
  count = Math.max(1, Math.min(MAX_BUY, n));
  const K = KINDS[buyKind], cost = costOf(buyKind, count), short = wallet.get() < cost - 1e-9;
  $('#buyCount').textContent = K.balance ? '$' + count : count; // Snowball Drop: dollars of balance
  $('#buyWhat').textContent = K.balance ? 'Snowball Drop balance' : count === 1 ? K.one : K.many;
  $('#buyMinus').disabled = count <= 1; $('#buyPlus').disabled = count >= MAX_BUY;
  document.querySelectorAll('#buyQuick button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.n === count)));
  $('#buyGo').textContent = K.balance ? `Add ${money(cost)} to your balance` : `Buy ${count} · ${money(cost)}`; $('#buyGo').disabled = short;
  $('#buyQuick').querySelectorAll('button').forEach((b) => { b.textContent = K.balance ? '$' + b.dataset.n : b.dataset.n; });
  $('#buySanta').innerHTML = price ? `≈ <b>${fmtSanta(santaFor(cost, price))} SANTA</b> at today's price. The real checkout locks the price for ${QUOTE_SECONDS} seconds.` : '';
  $('#buyNote').textContent = short ? `Not enough demo money (${money(wallet.get())}). Tap Reset above the Slots.` : '';
}
// Resolves true once credits are there (bought now or already), false if the player backed out.
// bet: a balance kind's play size (Snowball Drop: a $1 drop needs $1 of balance, a 10¢ drop 10¢).
export function ready(kind, bet) { return ledger.credits[kind] >= unitsFor(kind, bet ?? KINDS[kind].bet) ? Promise.resolve(true) : openBuy(kind); }
export function openBuy(kind) {
  if (resolveBuy) return Promise.resolve(false);
  const K = KINDS[kind]; buyKind = kind;
  $('#buyTitle').textContent = K.balance ? 'Add to your balance' : K.game === 'spin' ? 'Buy spins' : 'Buy pulls';
  $('#buyEyebrow').textContent = K.balance ? 'Snowball Drop · play 10¢ or $1 drops from it' : K.game === 'spin' ? `Santa Hat Spin · ${K.bet < 1 ? '10¢' : '$1'} a spin` : 'Big Hat · $1.00 a pull';
  $('#buyPool').textContent = POOL_NAME[K.game];
  setCount(count);
  const d = $('#buyDlg'); if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  $('#buyGo').focus(); // the main action, not '+' (focus-group finding: the ringed '+' looked pre-selected)
  return new Promise((res) => { resolveBuy = res; });
}
function closeBuy(ok) { const d = $('#buyDlg'); d.close?.() ?? d.removeAttribute('open'); resolveBuy?.(ok); resolveBuy = null; }

// ---- one play, in the house's order. forced: tests only ----
// Server mode buying: quote → the wallet pays (window.santaPay, not built here) → the server checks the payment → credits.
async function buyFromServer() {
  const note = $('#buyNote'); $('#buyGo').disabled = true; note.textContent = 'Getting a price…';
  const q = await call('quote', { kind: buyKind, n: count });
  if (q.error) { note.textContent = q.error; $('#buyGo').disabled = false; return; }
  if (typeof window.santaPay !== 'function') { note.textContent = 'Wallet payments aren\'t connected yet.'; $('#buyGo').disabled = false; return; }
  let signature; try { note.textContent = 'Approve the payment in your wallet…'; signature = await window.santaPay(q); }
  catch (e) { note.textContent = 'Payment cancelled.'; $('#buyGo').disabled = false; return; }
  note.textContent = 'Confirming the payment…';
  const b = await call('buy', { quote: q.id, signature });
  $('#buyGo').disabled = false;
  if (b.error) { note.textContent = b.error; return; }
  await syncCredits(); sfx('buy'); closeBuy(true);
}

// bet: the size, for a balance kind (Snowball Drop).
export async function play(kind, forced, bet) {
  if (serverMode) {
    try {
      const o = await call('open', { kind, bet });
      if (o.busy) return { failed: true, why: 'your last play is still finishing' }; // one play at a time
      if (!o.ticket) { await syncCredits(); return o.error ? { failed: true, why: o.error } : o; }
      const s = await call('settle', { ticket: o.ticket, seed: newSeed(16) }); // our number goes in only after the fingerprint came back
      await syncCredits();
      if (!s.r) return s.error ? { failed: true, why: s.error } : s;
      if (s.proof.commit !== o.commit) return { failed: true, why: 'the server changed its locked fingerprint' }; // never trust, check
      last[kind] = s.proof; refresh();
      return { r: s.r, proof: s.proof, commit: o.commit, poolUsd: s.poolUsd, server: true };
    } catch (e) { refresh(); return { failed: true, why: 'the game server can\'t be reached' }; }
  }
  try { return await play_(kind, forced, bet); } catch (e) { refresh(); return { failed: true, why: e.message }; } // never leave a machine locked
}
async function play_(kind, forced, bet) {
  const o = await house.open(kind, bet);
  if (!o.ticket) { store.set(ledger); refresh(); return o; } // refused or failed (credit kept) or no credit
  refresh();
  const s = await house.settle(o.ticket, newSeed(16), forced); // the player's number is made only after the fingerprint arrived
  if (!s.r) { store.set(ledger); refresh(); return s; }
  store.set(ledger);
  if (s.proof) last[kind] = s.proof;
  refresh();
  return { ...s, commit: o.commit };
}
export const short = (h) => h.slice(0, 8);

// ---- "Check this result" ----
let shown = null;
export function showProof(kind) { if (last[kind]) showProofOf(last[kind]); }
function showProofOf(p) {
  $('#proofCheck').disabled = false;
  shown = p;
  $('#proofCommit').textContent = p.commit; $('#proofSeed').textContent = p.playerSeed;
  $('#proofNo').textContent = '#' + p.playNo; $('#proofSecret').textContent = p.secret;
  $('#proofOut').textContent = p.forced ? 'This was a test play: its result was set by a test, so the check below won\'t match it.' : '';
  const d = $('#proofDlg'); if (d.showModal) d.showModal(); else d.setAttribute('open', '');
}
// Server mode: re-check on the settings (odds) this play ran on, fetched by version (public), not today's.
async function cfgForProof(p) {
  if (!serverMode || p.settingsVersion === undefined) return null;
  const r = await call('settings', { version: p.settingsVersion }); if (!r?.settings) return null;
  const { build } = await import('./settings.js'); return build(r.settings);
}
async function recheck() {
  const p = shown; if (!p) return;
  const c = await check(p, await cfgForProof(p)), K = KINDS[p.kind];
  let what;
  if (p.kind === 'drop') what = `the bounces ${c.outcome.path.map((x) => (x ? 'R' : 'L')).join(' ')} (one per row of pegs), present ${c.outcome.bin + 1} of 9: a ${c.outcome.mult}× result`;
  else if (K.game === 'spin') what = c.outcome.bonusSlice !== undefined ? `main-wheel segment ${c.outcome.slice + 1} of 40 (a gold star), then bonus-wheel segment ${c.outcome.bonusSlice + 1} of 12: a ${c.outcome.mult}× result`
    : `main-wheel segment ${c.outcome.slice + 1} of 40, a ${c.outcome.mult}× result`;
  else if (c.outcome.jackpot) what = 'the pool jackpot (all 25 squares Santa Hats)';
  else what = `reel stops ${c.outcome.stops.join(', ')} (one per reel, each 0–75)`;
  $('#proofOut').innerHTML = c.matches
    ? `<b class="ok">Matches.</b> The revealed secret gives the fingerprint you were shown before the play, and with your number it gives ${what}. That's what you got.`
    : '<b class="bad">Doesn\'t match.</b> The secret doesn\'t give the fingerprint shown before the play.';
}
