// WINNINGS THAT HAVEN'T GONE OUT (Cody, 2026-10-05: "if a player hits and the pool can't cover it tell them to send a ticket and
// they will get their funds sent to them. Only have that pop up if it happens"). Signed in on a real game server, the page asks
// quietly ('my-payouts', server/games.js waiting: my Arcade winnings unsent after 3 minutes, or whose send failed twice) when it
// loads and every 3 minutes while it's open. Nothing shows unless one is waiting; then a pop-up says so, once per payout, with a
// "Send a ticket" button that opens Support already filled in. The winnings keep retrying on the server either way.
import { call, SERVER } from './gameserver.js?v=6272e38358';

const CHECK_MS = 180_000, SEEN = 'santa.payoutsSeen';
const NAMES = { drop: 'Snowball Drop', big: 'Big Hat', stocking: 'Stocking Stuffer', spin: 'Big Hat' };
const $ = (s) => document.querySelector(s);
const seen = () => { try { const v = JSON.parse(localStorage.getItem(SEEN) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const remember = (ids) => { try { localStorage.setItem(SEEN, JSON.stringify([...new Set([...seen(), ...ids])].slice(-100))); } catch {} };
const usd = (v) => '$' + Number(v).toFixed(2);

let dlg = null;
function dialog() {
  if (dlg) return dlg;
  dlg = document.createElement('dialog');
  dlg.id = 'payoutDlg'; dlg.className = 'plaque howdlg'; dlg.setAttribute('aria-labelledby', 'payoutTitle');
  dlg.innerHTML = `<div class="howhead"><div><div class="eyebrow">Your winnings</div><h2 id="payoutTitle">Your winnings are safe</h2></div>
    <button class="sec" type="button" data-pw-close>Close</button></div>
    <p data-pw-what></p>
    <p>The prize pool is being refilled, so they couldn't be sent right away. <b>Send us a ticket</b> and they'll be sent to your wallet.
      You'll see the answer under Support.</p>
    <div class="row"><button class="go" type="button" data-pw-ticket>Send a ticket</button></div>`;
  const close = () => (dlg.close ? dlg.close() : dlg.removeAttribute('open'));
  dlg.querySelector('[data-pw-close]').addEventListener('click', close);
  dlg.querySelector('[data-pw-ticket]').addEventListener('click', () => {
    const text = dlg.dataset.ticket || '';
    close();
    $('#signin')?.click(); // the sign-in sheet holds Support (supportui.js)
    setTimeout(() => { if ($('#supportForm')?.hidden) $('#supportBtn')?.click(); const m = $('#supportMsg'); if (m) { m.value = text; m.focus(); } }, 60);
  });
  document.body.append(dlg);
  return dlg;
}

export function showWaiting(list) {
  const fresh = list.filter((p) => !seen().includes(p.id));
  if (!fresh.length) return false;
  const total = fresh.reduce((a, p) => a + p.usd, 0), d = dialog();
  d.querySelector('[data-pw-what]').innerHTML = fresh.length === 1
    ? `You won <b>${usd(fresh[0].usd)}</b> on ${NAMES[fresh[0].kind] || 'the Arcade'}, and it hasn't reached your wallet yet.`
    : `You won <b>${usd(total)}</b> in ${fresh.length} runs, and it hasn't reached your wallet yet.`;
  d.dataset.ticket = `My Arcade winnings haven't arrived: ${fresh.map((p) => `payout #${p.id} (${usd(p.usd)}, ${NAMES[p.kind] || p.kind})`).join(', ')}. Please send them to my wallet.`;
  if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
  remember(fresh.map((p) => p.id));
  return true;
}

export async function checkPayouts() {
  if (!SERVER) return null; // the demo has no real winnings
  const r = await call('my-payouts').catch(() => null);
  if (r?.ok && Array.isArray(r.waiting) && r.waiting.length) showWaiting(r.waiting);
  return r;
}

let timer = 0;
export function initPayoutWatch() {
  if (!SERVER || timer) return;
  setTimeout(checkPayouts, 4000); // after the page and its sign-in have settled
  timer = setInterval(() => { if (!document.hidden) checkPayouts(); }, CHECK_MS);
}
