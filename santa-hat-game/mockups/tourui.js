// TOURNAMENTS on the page (Cody 2026-10-05; the match server runs them: server/referee.js, server/tourney.js). Three pieces:
//   the BAR: on every screen during the 60 s countdown ("Tournament starts in 0:47 · tap to join"), and for a player still in
//     it while it runs; tapping it enters (signed in) and opens the page.
//   the PAGE: the waiting room and the bracket: your name among those in, the countdown, the rounds (who went through, who's
//     out, games on now with Watch), the final standings, Leave; the code box; and for the admin wallet, Create (picking the
//     rules), the code, Start tournament and Call off.
//   the ADMIN ROW under the lobby's Tournament button (Cody: "a start tournament button pops up under the tournament button").
// The page never decides anything: it sends what was tapped on the lobby line (net.js refereeBoard().tour) and draws what the
// server says. Moving into your game when the bracket gives you one is online.js's (enterGame).
const esc = (s) => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

const RULE_NAMES = { ffa: 'Free-for-all', team: 'Nice vs Naughty', normal: 'Normal play', gear: 'Special gear' };
const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;
export const rulesText = (r) => `${RULE_NAMES[r?.mode] || 'Free-for-all'} · ${RULE_NAMES[r?.style] || 'Special gear'}`;

// deps: line (net.js board().tour), signedIn(), openSignIn(), modeAllowed(m), enterGame(code), roomNow() (the room I'm in, or ''),
// changed() (the waiting list redraws its pinned row)
export function createTourUI({ line, openSignIn, modeAllowed = (m) => m === 'ffa', enterGame, roomNow, changed = () => {} }) {
  let last = null, at = 0, note = '', tried = { code: '', at: 0 }, isOpen = false, timer = null;
  const bar = document.createElement('div'); bar.id = 'tourBar'; bar.className = 'plaque'; bar.hidden = true; bar.setAttribute('role', 'status'); document.body.append(bar);
  const page = document.createElement('section'); page.id = 'tourPage'; page.className = 'plaque sheet'; page.hidden = true; page.setAttribute('aria-label', 'Tournament'); document.body.append(page);
  // seconds left on a server count, from when it was said (the server sends every 3 s; the page counts down in between)
  const left = (s) => (Number.isFinite(s) && s !== null ? Math.max(0, s - (performance.now() - at) / 1000) : null);
  const signedIn = () => !!last?.you?.signedIn; // the match server's word (it checked the sign-in)
  const live = (d) => !!d && (d.state === 'open' || d.state === 'countdown' || d.state === 'running');

  line.on((t, why) => {
    if (why) { note = why; draw(); return; }
    last = t; at = performance.now(); if (t?.you?.entered || !live(t?.d)) note = '';
    // the bracket gave me a game: go to it (once; again after 4 s if I'm still not in it)
    const next = t?.you?.next;
    if (next && roomNow() !== next && (tried.code !== next || performance.now() - tried.at > 4000)) { tried = { code: next, at: performance.now() }; close(); enterGame(next); }
    draw(); changed();
  });

  function title(d) {
    if (!d) return 'No tournament on';
    if (d.state === 'open') return 'Waiting for the host';
    if (d.state === 'countdown') return `Starts in ${mmss(Math.ceil(left(d.startsIn)))}`;
    if (d.state === 'off') return 'Called off';
    if (d.state === 'done') return d.standings?.[0] ? `${esc(d.standings[0].name)} wins!` : 'Finished';
    const nx = left(d.nextIn); if (nx !== null && nx > 0) return `Next round in ${Math.ceil(nx)}`;
    const r = d.rounds.at(-1); return r?.final ? 'The final' : `Round ${d.rounds.length} of ${d.total}`;
  }
  function you(t) {
    const y = t?.you || {}, d = t?.d; if (!d) return '';
    if (y.place) return `<p class="tyou won">You placed <b>${ord(y.place.place)}</b>${y.place.points ? ` · <b>+${y.place.points}</b> ranked points` : ''}</p>`;
    if (y.out) return '<p class="tyou out">You\'re out. Watch the rest below.</p>';
    if (y.playing) return '<p class="tyou">Your game is on.</p>';
    if (y.next) return '<p class="tyou">Your game is ready. Joining…</p>';
    if (y.entered) return `<p class="tyou in">You're in.${d.state === 'open' ? ' The host starts it soon: you\'ll get a 60 second countdown.' : d.state === 'countdown' ? ' Stay on this page: your first game starts when the countdown ends.' : ' Your next game starts by itself.'}</p>`;
    return '';
  }
  function entry(t) {
    const d = t?.d, y = t?.you || {};
    if (!d || y.entered || !(d.state === 'open' || d.state === 'countdown')) return '';
    if (!signedIn()) return '<div class="tentry"><button class="go" data-t="signin">Sign in to enter</button><p class="dim">Wallet or email, so your results count.</p></div>';
    return `<div class="tentry">${d.state === 'countdown' ? '<button class="go" data-t="joinnow">Join now</button>' : ''}
      <div class="row"><input id="tourCode" type="text" maxlength="5" placeholder="CODE" autocomplete="off" spellcheck="false" aria-label="Tournament code"><button class="sec" data-t="enter">Enter code</button></div></div>`;
  }
  function bracket(d) {
    if (!d) return '';
    if (d.state === 'open' || d.state === 'countdown') {
      const names = d.names || [];
      return `<h4 class="th">In the tournament <em>${d.n}/${d.max}</em></h4>${names.length ? `<ul class="tnames">${names.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '<p class="dim">Nobody yet. Enter the code to be first.</p>'}`;
    }
    const watching = roomNow();
    const cols = d.rounds.map((r, i) => `<section class="tround"><h4 class="th">${r.final ? 'Final' : `Round ${i + 1}`}</h4>${r.games.map((g) => {
      const state = g.startsIn !== null ? `starts in ${Math.ceil(g.startsIn)}s` : g.phase === 'play' ? `playing · ${g.time}s left` : g.phase === 'intro' || g.phase === 'count' ? 'starting' : g.phase === 'end' ? 'final scores' : 'finished';
      const on = g.phase !== 'over';
      // a played final: its finishing order (everyone in it is placed, nobody is "out")
      if (r.final && g.finish?.length) return `<div class="tgame"><ol>${g.finish.map((n, k) => `<li class="${k === 0 ? 'thru' : ''}">${esc(n)}</li>`).join('')}</ol><p><span>finished</span></p></div>`;
      return `<div class="tgame"><ol>${g.players.map((p) => `<li class="${p.st}">${esc(p.n)}${p.st === 'thru' ? ' <i>through</i>' : ''}</li>`).join('')}</ol>
        <p><span>${esc(state)}</span>${on && watching !== g.code ? `<button class="sec" data-watch="${esc(g.code)}">Watch</button>` : ''}</p></div>`; }).join('')}</section>`).join('');
    const stand = d.standings ? `<h4 class="th">Final standings</h4><ol class="tstand">${d.standings.map((s) => `<li><b>${s.place}</b><span>${esc(s.name)}</span>${s.points ? `<em>+${s.points}</em>` : ''}</li>`).join('')}</ol><p class="dim">Prizes are sent by the host.</p>` : '';
    return `${stand}<div class="tbracket">${cols}</div>`;
  }
  // the admin's controls (on the page and under the lobby's Tournament button)
  function admin(t, compact = false) {
    const d = t?.d, y = t?.you || {}; if (!y.admin) return '';
    if (!live(d)) {
      return `<div class="tadmin"><b>Make a tournament</b><div class="tpick" role="group" aria-label="Rules">
        ${modeAllowed('team') ? '<label><input type="radio" name="tmode" value="ffa" checked> Free-for-all</label><label><input type="radio" name="tmode" value="team"> Nice vs Naughty</label>' : ''}
        <label><input type="radio" name="tstyle" value="gear" checked> Special gear</label><label><input type="radio" name="tstyle" value="normal"> Normal play</label></div>
        <button class="go" data-t="create">Create tournament</button></div>`;
    }
    return `<div class="tadmin"><span>Code <b class="tcode">${esc(y.code || '')}</b> · ${d.n} in${compact && d.state === 'countdown' ? ` · starts in ${Math.ceil(left(d.startsIn))}s` : ''}</span>
      <div class="tbtns">${d.state === 'open' ? '<button class="go" data-t="start">Start tournament</button>' : ''}<button class="sec" data-t="cancel">Call off</button></div></div>`;
  }
  function pageHtml() {
    const d = last?.d, y = last?.you || {};
    const sub = d ? `<p class="trules">${rulesText(d.rules)} · 90 s matches · top 2 go through; the final's top 8 placed${d.state === 'off' && d.why ? `</p><p class="tnote">${esc(d.why)}` : ''}</p>` : '<p class="dim">When the host starts one, its countdown shows here and on every screen.</p>';
    const leave = d && y.entered && !y.out && live(d) ? '<button class="sec" data-t="leave">Leave tournament</button>' : '';
    return `<button class="x" data-t="close" aria-label="Close">×</button><div class="eyebrow">Tournament${d?.host ? ' · hosted by ' + esc(d.host) : ''}</div><h2>${title(d)}</h2>${sub}
      ${you(last)}${note ? `<p class="tnote" role="alert">${esc(note)}</p>` : ''}${entry(last)}${admin(last)}${bracket(d)}<div class="tacts">${leave}<button class="sec" data-t="close">Back</button></div>`;
  }
  function barHtml() {
    const d = last?.d, y = last?.you || {};
    if (d?.state === 'countdown') return `<b>Tournament</b><span>${y.entered ? "You're in · " : ''}starts in <em>${mmss(Math.ceil(left(d.startsIn)))}</em> · ${d.n} in · ${esc(rulesText(d.rules))}</span><button class="go" data-t="${y.entered ? 'open' : 'joinnow'}">${y.entered ? 'Open' : 'Join'}</button>`;
    if (d?.state === 'running' && y.entered && !y.out && !roomNow()) return `<b>Tournament</b><span>${esc(title(d))} · ${y.next ? 'your game is ready' : 'you\'re still in'}</span><button class="go" data-t="open">Bracket</button>`;
    return '';
  }
  function draw() {
    const b = isOpen ? '' : barHtml(); bar.hidden = !b; if (b && bar.innerHTML !== b) bar.innerHTML = b;
    bar.classList.toggle('low', !document.getElementById('jpbar')?.hidden); // under the pool jackpot bar when it shows
    if (isOpen) { const h = pageHtml(); if (page.innerHTML !== h) { const code = page.querySelector('#tourCode')?.value || ''; page.innerHTML = h; const c = page.querySelector('#tourCode'); if (c && code) c.value = code; } }
    const ad = document.getElementById('tourAdmin'); if (ad) { const h = admin(last, true); ad.hidden = !h; if (ad.innerHTML !== h) ad.innerHTML = h; }
    const tb = document.getElementById('tourney'); if (tb) tb.textContent = last?.d?.state === 'countdown' ? `Tournament · starts in ${mmss(Math.ceil(left(last.d.startsIn)))}` : live(last?.d) ? 'Tournament · open' : 'Tournament';
    const ticking = last?.d && (last.d.state === 'countdown' || left(last.d.nextIn) > 0);
    if (ticking && !timer) timer = setInterval(draw, 1000); else if (!ticking && timer) { clearInterval(timer); timer = null; }
  }
  function open() { isOpen = true; page.hidden = false; draw(); }
  function close() { isOpen = false; page.hidden = true; draw(); }
  function act(k, el) {
    const d = last?.d;
    if (k === 'close') return close();
    if (k === 'open') return open();
    if (k === 'signin') return openSignIn();
    if (k === 'joinnow') { if (!signedIn()) { open(); return; } note = ''; line.send({ t: 'tjoin', id: d?.id }); return open(); }
    if (k === 'enter') { const c = (page.querySelector('#tourCode')?.value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length < 5) { note = 'Type the 5-character tournament code.'; return draw(); } note = ''; return line.send({ t: 'tjoin', code: c }); }
    if (k === 'leave') { if (d?.state === 'running' && !confirm('Leave the tournament? You can\'t come back in.')) return; return line.send({ t: 'tleave' }); }
    if (k === 'create') { const box = el.closest('.tadmin'); return line.send({ t: 'tcreate', rules: { mode: box.querySelector('[name=tmode]:checked')?.value || 'ffa', style: box.querySelector('[name=tstyle]:checked')?.value || 'gear' } }); }
    if (k === 'start') return line.send({ t: 'tstart' });
    if (k === 'cancel') { if (!confirm('Call off the tournament for everyone?')) return; return line.send({ t: 'tcancel' }); }
  }
  const onClick = (e) => { const b = e.target.closest('[data-t]'); if (b) { e.preventDefault(); act(b.dataset.t, b); return; } const w = e.target.closest('[data-watch]'); if (w) { close(); enterGame(w.dataset.watch, true); } };
  bar.addEventListener('click', onClick); page.addEventListener('click', onClick);
  page.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'tourCode') act('enter'); });
  document.getElementById('tourAdmin')?.addEventListener('click', onClick);
  return {
    open, close, get isOpen() { return isOpen; }, get last() { return last; },
    // the games waiting list's pinned row (Cody: "the tournament will also go to the top of game waiting")
    pinHtml() {
      const d = last?.d; if (!d || !(d.state === 'open' || d.state === 'countdown')) return '';
      return `<div class="wg tourpin"><b>Tournament · ${esc(rulesText(d.rules))}</b><span><em class="seats">${d.n}/${d.max}</em> in · ${d.state === 'countdown' ? `starts in ${Math.ceil(left(d.startsIn))}s` : 'waiting for the host to start'}</span><button class="go" data-tour-open>${last.you?.entered ? 'Open' : 'Join'}</button></div>`;
    },
    pinClick() { const d = last?.d; if (d?.state === 'countdown' && !last.you?.entered && signedIn()) line.send({ t: 'tjoin', id: d.id }); open(); },
  };
}
