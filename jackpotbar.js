// POOL JACKPOT BANNER (Cody's list, 2026-10-03): when anyone hits a pool jackpot, everyone on the site sees a thin bar under the
// top menu: who won, how much, on which game, with a button to that game. From the public winners list ('winners', cached 10 s
// on the server), asked once a minute. Shows jackpots from the last hour this browser hasn't seen yet (remembered in
// localStorage 'santa.jpSeen'); closing it marks it seen. Never during a match.
import { call } from './gameserver.js?v=2002bb8cce';

const KEY = 'santa.jpSeen', FRESH_MS = 3600e3, EVERY_MS = 60_000;
const GAME = { slots: ['Big Hat', 'slots'], drop10: ['Snowball Drop', 'drop'], drop100: ['Snowball Drop', 'drop'], stock10: ['Stocking Stuffer', 'stocking'], stock100: ['Stocking Stuffer', 'stocking'] };
const seenAt = () => { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } };
const markSeen = (at) => { try { localStorage.setItem(KEY, String(at)); } catch {} };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The newest jackpot worth showing, or null. wins: the winners list rows ({ game, name, amount, at, note }).
export function freshJackpot(wins, now = Date.now(), seen = seenAt()) {
  const j = (wins || []).filter((w) => w.note === 'pool jackpot' && GAME[w.game] && now - w.at < FRESH_MS && w.at > seen).sort((a, b) => b.at - a.at)[0];
  return j || null;
}

export function initJackpotBar({ el, inMatch = () => false, go = () => {} }) {
  let shown = null;
  function show(j) {
    shown = j; if (!j) { el.hidden = true; return; }
    const [name, section] = GAME[j.game];
    el.innerHTML = `<b>Pool jackpot!</b><span>${esc(j.name)} won <em>$${(+j.amount).toFixed(2)}</em> on ${name}</span><button type="button" class="go" data-jp-go="${section}">Play ${name}</button><button type="button" class="x" data-jp-close aria-label="Close">×</button>`;
    el.hidden = inMatch();
  }
  el.addEventListener('click', (e) => {
    if (!shown) return;
    const g = e.target.closest('[data-jp-go]'); if (g) { markSeen(shown.at); el.hidden = true; go(g.dataset.jpGo); shown = null; return; }
    if (e.target.closest('[data-jp-close]')) { markSeen(shown.at); show(null); }
  });
  async function check() {
    const r = await call('winners').catch(() => null);
    if (Array.isArray(r?.winners)) { const j = freshJackpot(r.winners); if (j && j.at !== shown?.at) show(j); }
  }
  check(); setInterval(check, EVERY_MS);
  // hidden while a match is on, back after it
  setInterval(() => { if (shown) el.hidden = inMatch(); }, 1000);
  return { check, show };
}
