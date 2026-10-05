// THE GAME POOL IN SANTA TOO (Cody, 2026-10-05: "the total prize pool in santa also"): under each game's Game pool dollar total
// (Slots, Snowball Drop, Stocking Stuffer) and in the money strip, the same amount in SANTA at the live price. It watches the
// dollar readouts the games already write (so it can never disagree with them) and redraws when they or the price change.
// Without a live price it shows nothing rather than a guess.
import { fmtSanta } from './market.js?v=2d2d4b29af';

const IDS = ['slotPool', 'dropPool', 'stockPool', 'msPool'];
let price = null;
const dollars = (text) => { const m = /\$\s*([\d,]+(?:\.\d+)?)/.exec(text || ''); return m ? Number(m[1].replace(/,/g, '')) : null; };

function line(el) {
  let s = el.parentElement.querySelector(`[data-pool-santa="${el.id}"]`);
  if (!s) { s = document.createElement('small'); s.className = 'poolsanta'; s.dataset.poolSanta = el.id; el.insertAdjacentElement('afterend', s); }
  return s;
}
function paint(el) {
  const usd = dollars(el.textContent), s = line(el);
  s.textContent = price?.usd > 0 && usd !== null ? `≈ ${fmtSanta(usd / price.usd)} SANTA` : '';
  s.hidden = !s.textContent;
}
export function paintAll() { for (const id of IDS) { const el = document.getElementById(id); if (el) paint(el); } }
export function setPoolPrice(p) { price = p?.usd > 0 ? p : null; paintAll(); }

export function initPoolSanta() {
  if (typeof document === 'undefined') return;
  const css = document.createElement('style');
  css.textContent = `.poolsanta { display: block; margin-top: 2px; font: 700 15px/1.3 var(--body, sans-serif); color: var(--frost, #b9cdf2); letter-spacing: .3px; }
#msPool + .poolsanta { display: inline; margin: 0 0 0 6px; font-size: 12px; }`;
  document.head.append(css);
  const watch = new MutationObserver((list) => { for (const m of list) { const el = m.target.nodeType === 1 ? m.target : m.target.parentElement; if (el && IDS.includes(el.id)) paint(el); } });
  for (const id of IDS) { const el = document.getElementById(id); if (el) { watch.observe(el, { childList: true, characterData: true, subtree: true }); paint(el); } }
}
