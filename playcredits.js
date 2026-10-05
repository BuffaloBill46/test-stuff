// Buying and playing RUNS on the page (Cody, 2026-10-01): "buy 1, 5 or 10 on each game; whatever they buy auto plays", and
// the run's winnings are sent to the player's wallet automatically when its last play is done. No stored credits.
// One run: the confirm dialog (price, SANTA amount) → the payment → the plays, played one after another by the game's own
// card (dropui.js, stockingui.js, games.js) → the run's winnings sent. Plus "Check this result" for the last play of each game.
// DEMO: the house runs in this browser and pays from / to the demo balance. Server mode (?server=): the game server does it.
import { KINDS, newLedger, costOf } from './credits.js?v=2cca0899bc';
import { createHouse, check } from './house.js?v=2cca0899bc';
import { newSeed } from './fair.js?v=2cca0899bc';
import { santaFor, fmtSanta, QUOTE_SECONDS } from './market.js?v=2cca0899bc';
import { FEE } from './slots.js?v=2cca0899bc';
import { asTapped } from './stocking.js?v=2cca0899bc';
import { play as sfx } from './sfx.js?v=2cca0899bc';
import { SERVER, call, walletReady, payError, forPlayer, WALLET_LOAD_FAILED } from './gameserver.js?v=2cca0899bc';
import { withSlowDown } from './slowdown.js?v=2cca0899bc';
export const serverMode = !!SERVER; // ?server=<address>: plays come from the game server

const $ = (s, el = document) => el.querySelector(s);
const money = (v) => '$' + (Math.floor(v * 100 + 1e-6) / 100).toFixed(2);
const cents = (v) => (v < 1 ? Math.round(v * 100) + '¢' : '$' + (Number.isInteger(v) ? v : v.toFixed(2)));
// ONE GAME POOL (Cody, 2026-10-02): every game's money goes into the shared pool (key 'spin'), shown as "Game"
const POOL_NAME = { spin: 'Game', slots: 'Slots' };

let ledger = newLedger(), house, wallet, onChange = () => {}, last = {}, price = null; // last proof per game
const busy = {}; // a run in progress, per game

// ---- the run counter between each game and its buy buttons (Cody, 2026-10-01: "a small counter next to each game that keeps
// track and auto resets after each run", then "between the game and buy buttons"). Plays done of the run and what they have won so far (before
// SANTA's 3% token tax). It stays up after the run so the result can be read, and starts again at 0 with the next run.
function runCounter(kind, done, n, won) {
  const el = $(`[data-runcount="${kind}"]`); if (!el) return;
  $('b', el).textContent = `${done} / ${n}`; $('span', el).textContent = `won ${money(won)}`;
}
export function refresh() {
  for (const k of Object.keys(KINDS)) { const b = $(`[data-proof="${k}"]`); if (b) b.hidden = !last[k]; }
}
export function initCredits(opts) {
  // Server mode: no demo balance here (live-site test 2026-10-02: the buy dialog and the Drop card still said "Demo")
  if (serverMode) { $('#buyDemo')?.setAttribute('hidden', ''); document.querySelectorAll('.slotshead .demo').forEach((d) => { d.hidden = true; }); }
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
  $('#buySanta').innerHTML = price ? `≈ <b>${fmtSanta(santaFor(cost, price))} SANTA</b> at today's price. The real checkout locks the price for ${QUOTE_SECONDS} seconds, and this run's winnings are paid in SANTA at that same price.` : '';
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
  if (q.error) { note.textContent = forPlayer(q.error, () => $('#buyDlg').close()); $('#buyGo').disabled = false; return null; }
  await walletReady;
  if (typeof window.santaPay !== 'function') { note.textContent = WALLET_LOAD_FAILED; $('#buyGo').disabled = false; return null; }
  let signature; try { note.textContent = 'Approve the payment in your wallet…'; signature = await window.santaPay(q); }
  catch (e) { note.textContent = payError(e); $('#buyGo').disabled = false; return null; }
  note.textContent = 'Confirming the payment…';
  const b = await buyPaid(q.id, signature);
  $('#buyGo').disabled = false;
  if (b.error) { note.textContent = b.error; return null; }
  return b;
}

// The player HAS paid: keep asking the server until it accepts the payment (it only takes finalized ones). The payment is
// remembered in this browser first, so if the tab closes or the network drops right now, the next visit hands it to the
// server again (resumePaid). A payment is used once by the server, so asking twice can never buy twice.
const PENDING = 'santa.pendingPayment';
const remember = (v) => { try { v ? localStorage.setItem(PENDING, JSON.stringify(v)) : localStorage.removeItem(PENDING); } catch {} };
async function buyPaid(quote, signature) {
  remember({ quote, signature, at: Date.now() });
  let b;
  for (let i = 0; i < 40; i++) {
    try { b = await call('buy', { quote, signature }); } catch { b = { error: 'the game server didn\'t answer', retry: true }; }
    if (b.error && /on our side|answered 5\d\d/.test(b.error)) b.retry = true; // the server failed, it didn't refuse: keep the payment
    if (!b.error || !(b.retry || /not finalized|not found/.test(b.error))) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!b.error || /already used/.test(b.error)) remember(null); // done (or done before); anything else stays to retry next visit
  else if (!(b.retry || /not finalized|not found/.test(b.error))) remember(null); // refused for good (e.g. paid too late): retrying can't help
  else b = { error: `Your payment went through but isn't confirmed yet. We'll keep trying when you come back (payment ${signature.slice(0, 8)}…).` };
  return b;
}
// On load in server mode: a payment the server never got (closed tab, dropped network) is handed over now, and its plays are
// played straight away (same fair order; the last one queues the run's payout), so the winnings still reach the wallet.
// Kept for a day, then dropped (a payment the server still refuses after a day isn't going to be accepted).
export async function resumePaid() {
  let p; try { p = JSON.parse(localStorage.getItem(PENDING) || 'null'); } catch {}
  if (!serverMode || !p?.signature) return null;
  if (Date.now() - p.at > 86_400_000) { remember(null); return null; }
  const b = await call('buy', { quote: p.quote, signature: p.signature });
  if (b.error && !/already used/.test(b.error)) return null;
  remember(null);
  if (b.error) return null; // it had been accepted already
  let won = 0;
  for (const pl of b.plays || []) { const s = await call('settle', { ticket: pl.ticket, seed: newSeed(16) }); won += s?.r?.pay || 0; }
  return { ...b, won };
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
    runCounter(kind, 0, n, 0); // a new run: the counter starts again
    const results = []; let won = 0, sent = b.sent ?? null, held = !!b.held, counted = 0, wonShown = 0;
    for (const [i, p] of b.plays.entries()) {
      let s;
      try { s = serverMode ? await withSlowDown(() => call('settle', { ticket: p.ticket, seed: newSeed(16) })) : await house.settle(p.ticket, newSeed(16), forced[i]); }
      catch (e) { s = { failed: true, why: 'the game server can\'t be reached' }; }
      if (s.r && s.proof && s.proof.commit !== p.commit) s = { failed: true, why: 'the server changed its locked fingerprint' }; // never trust, check
      if (s.proof) last[kind] = s.proof;
      if (s.r) won += s.r.pay;
      if (s.sent !== undefined) { sent = s.sent; held = !!s.held; }
      results.push(s); refresh(); onChange();
      // The run counter moves when the PLAYER SEES the result (Cody 2026-10-02: the Drop's total ran ~1 s ahead of its balls;
      // and it must never give away a Stocking Stuffer turn before its stockings are tapped): after the game's own animation, or,
      // for a game that keeps going while one plays out (Snowball Drop: balls in flight), when the result it returns has landed.
      const shown = await onPlay(s, i, n), pay = s.r ? s.r.pay : 0, count = () => runCounter(kind, ++counted, n, (wonShown += pay));
      if (shown?.landed) shown.landed.then(count, count); else count();
    }
    // demo: the house "sends" the run's winnings to the demo balance, 3% lighter (SANTA's tax), all at once
    if (!serverMode && sent) wallet.add(sent * (1 - FEE));
    onChange();
    return { n, kind, bet, cost: costOf(n, bet), results, won: Math.round(won * 100) / 100, sent: sent ?? 0, received: (sent ?? 0) * (1 - FEE), held }; // kind, bet, cost: the share-a-win card
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
  const { build } = await import('./settings.js?v=2cca0899bc'); return build(r.settings);
}
async function recheck() {
  const p = shown; if (!p) return;
  const c = await check(p, await cfgForProof(p)), K = KINDS[p.kind];
  let what, map = '';
  if (p.kind === 'stocking') { // the turn's SEQUENCE from the two shuffles, laid out on the stockings the player tapped (stocking.js asTapped)
    const o = c.outcome, n = (s) => s + 1, seq = o.opened.map((s) => (o.gifts[s] ? 'gift' : 'coal')).join(', ');
    // tap to open (Cody 2026-10-02): the k-th stocking tapped held the k-th item; without taps (a turn from before), Santa's own order
    const taps = Array.isArray(p.taps) && p.taps.length === o.opened.length ? p.taps : o.opened, shown = taps === o.opened ? o.gifts : asTapped(o, taps);
    what = `the sequence ${seq}: ${o.found === 8 ? `${o.found} gifts in a row${o.jackpot ? ', the pool jackpot' : `, a ${o.mult}× result`}` : `${o.found} gift${o.found === 1 ? '' : 's'} before the coal, a ${o.mult}× result`} (${o.gifts.filter(Boolean).length} gifts on the mantel${o.board === 1 ? ', the layout before 2026-10-02' : ''}). You opened stockings ${taps.map(n).join(', ')}, in that order`;
    map = `<span class="stockmap" aria-label="The turn laid out on the stockings you opened: gifts gold, coal black; the ones you opened are outlined and numbered in the order you opened them">${shown.map((g, s) => { const at = taps.indexOf(s);
      return `<span class="${g ? 'g' : 'c'}${at >= 0 ? ' o' : ''}">${at >= 0 ? `<small>${at + 1}</small>` : ''}${n(s)}</span>`; }).join('')}</span>`;
  } else if (p.kind === 'drop') what = c.outcome.board === 1 ? `the bounces ${c.outcome.path.map((x) => (x ? 'R' : 'L')).join(' ')} (one per row of pegs), present ${c.outcome.bin + 1} of 9: a ${c.outcome.mult}× result`
    : `present ${c.outcome.bin + 1} of 17 from the published odds table (${c.outcome.jackpot ? 'the centre: the pool jackpot' : `a ${c.outcome.mult}× result`}${c.outcome.board === 2 ? ', on the board before 2026-10-02' : ''}), reached by the bounces ${c.outcome.path.map((x) => (x ? 'R' : 'L')).join(' ')}`;
  else if (c.outcome.jackpot) what = 'the pool jackpot (all 25 squares Santa Hats)';
  else what = `reel stops ${c.outcome.stops.join(', ')} (one per reel, each 0–75)`;
  // A pool jackpot's AMOUNT, re-worked (house.js jackpotCheck): the % from the settings the play ran on × the Game pool at that
  // moment (recorded with the result) × the play's size; and whether it is what was paid.
  const j = c.jackpot, pc = (x) => +(x * 100).toFixed(4) + '%';
  const jp = !j ? '' : !j.known ? ' <span class="dim">(This jackpot is from before 2026-10-02, when the pool amount wasn\'t recorded with the result; its amount can\'t be re-worked here.)</span>'
    : ` The pool jackpot: ${pc(j.pct)} of the ${money(j.pool)} Game pool at that moment${j.scale !== 1 ? ` × your ${cents(j.scale)} play` : ''} = <b>${money(j.expected)}</b>; you were paid ${money(j.paid)}${j.ok ? '' : ' <b class="bad">(that doesn\'t match)</b>'}.${j.pctFromSettings ? ` ${pc(j.pct)} is the published setting this play ran on.` : ` <b>Note:</b> the published setting was ${pc(j.settingsPct)}; ${pc(j.pct)} was Cody's pool setting on the admin screen at the time.`}`;
  $('#proofOut').innerHTML = c.matches
    ? `<b class="ok">Matches.</b> The revealed secret gives the fingerprint you were shown before the play, and with your number it gives ${what}. That's what you got.${jp}${map}`
    : '<b class="bad">Doesn\'t match.</b> The secret doesn\'t give the fingerprint shown before the play.';
}
