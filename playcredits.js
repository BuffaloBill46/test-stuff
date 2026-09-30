// Play credits on the page: the 1–10 buy counter, the credits readouts, and "Check this result".
// DEMO ONLY: credits are kept in this browser and paid from the demo balance. The real credits live on the server
// (the page will only show the number), and the house steps below run there. Rules: credits.js, the order: house.js.
import { KINDS, MAX_BUY, newLedger, buy, costOf } from './credits.js';
import { createHouse, check } from './house.js';
import { newSeed } from './fair.js';

const $ = (s, el = document) => el.querySelector(s);
const money = (v) => '$' + (Math.floor(v * 100 + 1e-6) / 100).toFixed(2);
const KEY = 'sh_credits_demo';
const store = { get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }, set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} } };
const POOL_NAME = { spin: 'Spin', slots: 'Slots' };

let ledger, house, wallet, onChange = () => {}, last = {}, spinKind = 'spin10'; // last proof per kind; the chosen spin size
const saved = store.get();
ledger = saved && saved.credits && saved.bought ? { ...newLedger(), ...saved } : newLedger();

export const creditsOf = (kind) => ledger.credits[kind];
export const spinKindFor = (bet) => (bet >= 1 ? 'spin100' : 'spin10');
export function setSpinKind(kind) { spinKind = kind; refresh(); }
// The readouts under each play button.
export function refresh() {
  for (const [kind, id] of [['big', 'crBig'], [spinKind, 'crSpin']]) {
    const n = ledger.credits[kind], el = document.getElementById(id); if (!el) continue;
    el.textContent = n; document.getElementById(id + 'What').textContent = n === 1 ? KINDS[kind].one : KINDS[kind].many;
    el.closest('.credrow').classList.toggle('none', n === 0);
  }
  const pb = $('[data-proof="big"]'), ps = $('[data-proof="spin"]');
  if (pb) pb.hidden = !last.big; if (ps) ps.hidden = !last[spinKind];
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
  $('#buyGo').addEventListener('click', () => {
    const cost = costOf(buyKind, count);
    if (wallet.get() < cost - 1e-9) return; // button is disabled then anyway
    wallet.add(-cost);
    const r = buy(ledger, pools, buyKind, count, 'demo-' + newSeed(8)); // real version: the confirmed payment's signature
    if (!r.ok) { wallet.add(cost); $('#buyNote').textContent = 'Couldn\'t buy: ' + r.why; return; }
    store.set(ledger); changed(); closeBuy(true);
  });
  $('[data-buy="big"]').addEventListener('click', () => openBuy('big'));
  $('[data-buy="spin"]').addEventListener('click', () => openBuy(spinKind));
  $('[data-proof="big"]').addEventListener('click', () => showProof('big'));
  $('[data-proof="spin"]').addEventListener('click', () => showProof(spinKind));
  $('#proofClose').addEventListener('click', () => $('#proofDlg').close?.());
  $('#proofCheck').addEventListener('click', recheck);
  window.__credits = { ledger, house, get last() { return last; }, give(kind, n) { buy(ledger, pools, kind, n, 'test-' + newSeed(8)); store.set(ledger); changed(); } };
}
export function resetCredits() { Object.assign(ledger, newLedger()); last = {}; store.set(ledger); refresh(); }

// ---- the buy counter ----
let count = 1, buyKind = 'big', resolveBuy = null;
function setCount(n) {
  count = Math.max(1, Math.min(MAX_BUY, n));
  const K = KINDS[buyKind], cost = costOf(buyKind, count), short = wallet.get() < cost - 1e-9;
  $('#buyCount').textContent = count;
  $('#buyWhat').textContent = count === 1 ? K.one : K.many;
  $('#buyMinus').disabled = count <= 1; $('#buyPlus').disabled = count >= MAX_BUY;
  document.querySelectorAll('#buyQuick button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.n === count)));
  $('#buyGo').textContent = `Buy ${count} · ${money(cost)}`; $('#buyGo').disabled = short;
  $('#buyNote').textContent = short ? `Not enough demo money (${money(wallet.get())}). Tap Reset above the Slots.` : '';
}
// Resolves true once credits are there (bought now or already), false if the player backed out.
export function ready(kind) { return ledger.credits[kind] > 0 ? Promise.resolve(true) : openBuy(kind); }
export function openBuy(kind) {
  if (resolveBuy) return Promise.resolve(false);
  const K = KINDS[kind]; buyKind = kind;
  $('#buyTitle').textContent = K.game === 'spin' ? 'Buy spins' : 'Buy pulls';
  $('#buyEyebrow').textContent = K.game === 'spin' ? `Santa Hat Spin · ${K.bet < 1 ? '10¢' : '$1'} a spin` : 'Big Hat · $1.00 a pull';
  $('#buyPool').textContent = POOL_NAME[K.game];
  setCount(count);
  const d = $('#buyDlg'); if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  return new Promise((res) => { resolveBuy = res; });
}
function closeBuy(ok) { const d = $('#buyDlg'); d.close?.() ?? d.removeAttribute('open'); resolveBuy?.(ok); resolveBuy = null; }

// ---- one play, in the house's order. forced: tests only ----
export async function play(kind, forced) {
  try { return await play_(kind, forced); } catch (e) { refresh(); return { failed: true, why: e.message }; } // never leave a machine locked
}
async function play_(kind, forced) {
  const o = await house.open(kind);
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
export function showProof(kind) {
  const p = last[kind]; if (!p) return;
  $('#proofCheck').disabled = false;
  shown = p;
  $('#proofCommit').textContent = p.commit; $('#proofSeed').textContent = p.playerSeed;
  $('#proofNo').textContent = '#' + p.playNo; $('#proofSecret').textContent = p.secret;
  $('#proofOut').textContent = p.forced ? 'This was a test play: its result was set by a test, so the check below won\'t match it.' : '';
  const d = $('#proofDlg'); if (d.showModal) d.showModal(); else d.setAttribute('open', '');
}
async function recheck() {
  const p = shown; if (!p) return;
  const c = await check(p), K = KINDS[p.kind];
  let what;
  if (K.game === 'spin') what = `slice ${c.outcome.slice} of 400, a ${c.outcome.mult}× result`;
  else if (c.outcome.jackpot) what = 'the pool jackpot (all 25 squares Santa Hats)';
  else what = `reel stops ${c.outcome.stops.join(', ')} (one per reel, each 0–75)`;
  $('#proofOut').innerHTML = c.matches
    ? `<b class="ok">Matches.</b> The revealed secret gives the fingerprint you were shown before the play, and with your number it gives ${what}. That's what you got.`
    : '<b class="bad">Doesn\'t match.</b> The secret doesn\'t give the fingerprint shown before the play.';
}
