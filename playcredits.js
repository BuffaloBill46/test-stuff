// Buying and playing RUNS on the page (Cody, 2026-10-01): "buy 1, 5 or 10 on each game; whatever they buy auto plays", and
// the run's winnings are sent to the player's wallet automatically when its last play is done. No stored credits.
// One run: the confirm dialog (price, SANTA amount) → the payment → the plays, played one after another by the game's own
// card (spinui.js, dropui.js, games.js) → the run's winnings sent. Plus "Check this result" for the last play of each game.
// DEMO: the house runs in this browser and pays from / to the demo balance. Server mode (?server=): the game server does it.
import { KINDS, newLedger, costOf } from './credits.js';
import { createHouse, check } from './house.js';
import { newSeed } from './fair.js';
import { santaFor, fmtSanta, QUOTE_SECONDS } from './market.js';
import { FEE } from './slots.js';
import { play as sfx } from './sfx.js';
import { SERVER, call } from './gameserver.js';
export const serverMode = !!SERVER; // ?server=<address>: plays come from the game server

const $ = (s, el = document) => el.querySelector(s);
const money = (v) => '$' + (Math.floor(v * 100 + 1e-6) / 100).toFixed(2);
const cents = (v) => (v < 1 ? Math.round(v * 100) + '¢' : '$' + (Number.isInteger(v) ? v : v.toFixed(2)));
const POOL_NAME = { spin: 'Spin', slots: 'Slots' };

let ledger = newLedger(), house, wallet, onChange = () => {}, last = {}, price = null; // last proof per game
const busy = {}; // a run in progress, per game

export function refresh() {
  for (const k of Object.keys(KINDS)) { const b = $(`[data-proof="${k}"]`); if (b) b.hidden = !last[k]; }
}
export function initCredits(opts) {
  wallet = opts.wallet; onChange = opts.onChange || onChange;
  opts.pools.spin.prepaid = true; opts.pools.slots.prepaid = true; // entries reach the pool at purchase
  house = createHouse(ledger, opts.pools);
  $('#buyCancel').addEventListener('click', () => closeBuy(false));
  $('#buyDlg').addEventListener('cancel', (e) => { e.preventDefault(); closeBuy(false); });
  $('#buyGo').addEventListener('click', () => resolveGo?.());
  for (const k of Object.keys(KINDS)) $(`[data-proof="${k}"]`)?.addEventListener('click', () => showProof(k));
  $('#proofClose').addEventListener('click', () => $('#proofDlg').close?.());
  $('#proofCheck').addEventListener('click', recheck);
  window.__credits = { ledger, house, get last() { return last; } };
}
export const resetCredits = () => { last = {}; refresh(); };
export function setPrice(p) { price = p; }

// ---- the confirm dialog: what this run costs; Pay & play ----
let resolveBuy = null, resolveGo = null;
function confirmRun(kind, bet, n) {
  if (resolveBuy) return Promise.resolve(false);
  const K = KINDS[kind], cost = costOf(n, bet), poor = !serverMode && wallet.get() < cost - 1e-9;
  $('#buyEyebrow').textContent = `${K.name} · ${cents(bet)} a ${K.one}`;
  $('#buyTitle').textContent = `Play ${n} ${n === 1 ? K.one : K.many}`;
  $('#buyWhat').textContent = `${n} × ${cents(bet)} = ${money(cost)}`;
  $('#buyPool').textContent = POOL_NAME[K.game];
  $('#buySanta').innerHTML = price ? `≈ <b>${fmtSanta(santaFor(cost, price))} SANTA</b> at today's price. The real checkout locks the price for ${QUOTE_SECONDS} seconds.` : '';
  $('#buyNote').textContent = poor ? `Not enough demo money (${money(wallet.get())}). Tap Reset above the Slots.` : '';
  $('#buyGo').textContent = `Pay ${money(cost)} & play`; $('#buyGo').disabled = poor;
  const d = $('#buyDlg'); if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  $('#buyGo').focus();
  return new Promise((res) => { resolveBuy = res; resolveGo = () => res(true); });
}
function closeBuy(ok) { const d = $('#buyDlg'); d.close?.() ?? d.removeAttribute('open'); resolveBuy?.(ok); resolveBuy = null; resolveGo = null; }

// Server mode paying: quote → the wallet pays (window.santaPay, not built here) → the server checks the payment → the plays.
async function payOnServer(kind, bet, n) {
  const note = $('#buyNote'); $('#buyGo').disabled = true; note.textContent = 'Getting a price…';
  const q = await call('quote', { kind, n, bet });
  if (q.busy) { note.textContent = 'Your last run is still finishing. Try again in a moment.'; $('#buyGo').disabled = false; return null; }
  if (q.refused) { note.textContent = q.stopped ? 'This game is paused right now. Nothing was charged.' : 'The prize pool is refilling. Try again soon; nothing was charged.'; $('#buyGo').disabled = false; return null; }
  if (q.error) { note.textContent = q.error; $('#buyGo').disabled = false; return null; }
  if (typeof window.santaPay !== 'function') { note.textContent = 'Wallet payments aren\'t connected yet.'; $('#buyGo').disabled = false; return null; }
  let signature; try { note.textContent = 'Approve the payment in your wallet…'; signature = await window.santaPay(q); }
  catch (e) { note.textContent = 'Payment cancelled.'; $('#buyGo').disabled = false; return null; }
  note.textContent = 'Confirming the payment…';
  const b = await call('buy', { quote: q.id, signature });
  $('#buyGo').disabled = false;
  if (b.error) { note.textContent = b.error; return null; }
  return b;
}

// ---- one run ----
// Asks, pays, then plays each play in the house's order, calling onPlay(result, i, n) after each so the card can animate it
// (the card awaits its animation; the next play is drawn only after). forced (tests only): a list, one per play.
// Returns { n, results, won, sent } once the run is done, or null if the player backed out (nothing charged).
export async function playRun(kind, bet, n, onPlay, forced = []) {
  if (busy[kind]) return null;
  busy[kind] = true;
  try {
    // The dialog stays open until the run is paid for or the player cancels (a refused quote can be retried).
    let b = null, ok = await confirmRun(kind, bet, n);
    while (ok) {
      if (serverMode) b = await payOnServer(kind, bet, n);
      else {
        const cost = costOf(n, bet); wallet.add(-cost); sfx('buy');
        b = await house.buy(kind, bet, n, 'demo-' + newSeed(8)); // real version: the confirmed payment's signature
        if (b.failed) { wallet.add(cost); $('#buyNote').textContent = 'Couldn\'t buy: ' + b.why; b = null; }
      }
      if (b) break;
      ok = await new Promise((res) => { resolveBuy = res; resolveGo = () => res(true); });
    }
    if (!b) return null;
    closeBuy(true); onChange();
    const results = []; let won = 0, sent = b.sent ?? null;
    for (const [i, p] of b.plays.entries()) {
      let s;
      try { s = serverMode ? await call('settle', { ticket: p.ticket, seed: newSeed(16) }) : await house.settle(p.ticket, newSeed(16), forced[i]); }
      catch (e) { s = { failed: true, why: 'the game server can\'t be reached' }; }
      if (s.r && s.proof && s.proof.commit !== p.commit) s = { failed: true, why: 'the server changed its locked fingerprint' }; // never trust, check
      if (s.proof) last[kind] = s.proof;
      if (s.r) won += s.r.pay;
      if (s.sent !== undefined) sent = s.sent;
      results.push(s); refresh(); onChange();
      await onPlay(s, i, n);
    }
    // demo: the house "sends" the run's winnings to the demo balance, 3% lighter (SANTA's tax), all at once
    if (!serverMode && sent) wallet.add(sent * (1 - FEE));
    onChange();
    return { n, results, won: Math.round(won * 100) / 100, sent: sent ?? 0, received: (sent ?? 0) * (1 - FEE) };
  } finally { busy[kind] = false; }
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
