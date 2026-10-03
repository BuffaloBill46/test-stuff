// MATCH CALL-OUTS AND HIGHLIGHTS (Cody's list, 2026-10-03: Snowball Square). During a match, a short feed of what just
// happened (who knocked the hat off whom, who caught it, who takes the lead) and a "10 seconds left!" banner; at the end, the
// match's highlights (most hats knocked off, most catches, longest wearing the hat). Everything is counted from the match's own
// events, which every screen receives (sim.js ev: knock, catch, grab, pts per hat second), so a player and a watcher see the
// same thing. Highlights are only shown when this screen saw the match from its start (joined late = partial counts = left out).
const LINE_MS = 4500, MAX_LINES = 3;

// el: the feed's element; nameOf(id, v): a display name for an entity id ('You' for this player); banner(text): the big banner.
export function createCallouts({ el, nameOf, banner }) {
  let counts = null, sawStart = false, leader = null, warned = false, last = null;
  function reset(fromStart) {
    counts = { knocks: new Map(), catches: new Map(), hatSec: new Map() }; sawStart = fromStart; leader = null; warned = false; last = null;
    el.innerHTML = '';
  }
  const add = (map, id, n = 1) => map.set(id, (map.get(id) || 0) + n);
  function line(html) {
    const d = document.createElement('div'); d.className = 'co'; d.innerHTML = html; el.prepend(d);
    while (el.children.length > MAX_LINES) el.lastElementChild.remove();
    setTimeout(() => d.remove(), LINE_MS);
  }
  const b = (id, v) => `<b>${esc(nameOf(id, v))}</b>`;
  // One match event (online.js handleEvents passes them all).
  function onEvent(k, a, by, v) {
    if (k === 'intro' || k === 'round') { if (!counts || k === 'intro' || +a === 1) reset(true); return; }
    if (!counts) reset(false);
    if (k !== 'end' && v && v.phase !== 'play') return; // the warm-up's goings-on aren't the match: no lines, no counts
    if (k === 'knock') { if (by) { add(counts.knocks, by); line(`${b(by, v)} knocked the hat off ${b(a, v)}`); } }
    else if (k === 'catch') { add(counts.catches, a); line(`${b(a, v)} caught the hat!`); }
    else if (k === 'grab') line(`${b(a, v)} grabbed the hat`);
    else if (k === 'pts') add(counts.hatSec, a);
    else if (k === 'end') last = highlights(v);
  }
  // Every frame during a match: the lead and the last 10 seconds.
  function tick(v) {
    if (!v || v.phase !== 'play') return;
    const top = [...v.ents].sort((x, y) => y.score - x.score);
    if (top[0] && top[0].score > 0 && (!top[1] || top[0].score > top[1].score) && top[0].id !== leader) {
      if (leader !== null) line(`${b(top[0].id, v)} ${nameOf(top[0].id, v) === 'You' ? 'take' : 'takes'} the lead`);
      leader = top[0].id;
    }
    if (!warned && v.time <= 10 && v.time > 0) { warned = true; banner('10 seconds left!'); }
  }
  // The end card's highlights: [{ label, who, text }], best first; [] when this screen didn't see the whole match.
  function highlights(v) {
    if (!counts || !sawStart) return [];
    const best = (map) => { let id = null, n = 0, tie = false; for (const [k, x] of map) { if (x > n) { id = k; n = x; tie = false; } else if (x === n) tie = true; } return n > 0 && !tie ? { id, n } : null; };
    return [['Hat thief', best(counts.knocks), (n) => `${n} knocked off`], ['Best catcher', best(counts.catches), (n) => `${n} catch${n === 1 ? '' : 'es'}`],
      ['Hat keeper', best(counts.hatSec), (n) => `${n}s wearing it`]]
      .filter(([, x]) => x).map(([label, x, txt]) => ({ label, who: nameOf(x.id, v), text: txt(x.n) }));
  }
  return { onEvent, tick, reset, get last() { return last; } };
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
