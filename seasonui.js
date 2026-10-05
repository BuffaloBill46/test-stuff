// The SEASON card on the Play page. SEASON POINTS (Cody, 2026-10-04): today's 5 tasks (+100 each) and today's points, the
// calendar of perfect days (kept: "keep both"), the TRACK of 30 doors (one every 300 points), every door showing its free prize
// and its pass prize, and the $5 pass. Rules from seasons.js; a signed-in player's progress from the game server (server/seasons.js
// 'season', which also ticks today's "Log in"); a guest sees the same tasks, calendar and doors with nothing earned yet. Match
// points only come from public Auto matches the match server runs, so the card says so and refreshes after each match.
import { seasonAt, dayKey, dayEnds, seasonDays, tasksFor, freeReward, goldReward, PASS_PRICE, STREAK_EVERY, DOORS, DOOR_POINTS, POINTS, PIECE_DOORS } from './seasons.js?v=2002bb8cce';
import { BY_ID } from './catalog.js?v=2002bb8cce';
import { call } from './gameserver.js?v=2002bb8cce';
import { shopBuy } from './shopui.js?v=2002bb8cce';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let opts = { thumbnail: null }, last = null, profileNow = null, timer = 0, busy = false;
const DAY_MAX = 5 * POINTS.task + POINTS.matchesPerDay * (POINTS.match + POINTS.top3);

// What a guest (or a failed read) sees: the real tasks, calendar and doors, nothing earned.
export function guestState(t = Date.now()) {
  const s = seasonAt(t); if (!s) return { off: true };
  const all = seasonDays(s), day = dayKey(t), doors = Array.from({ length: DOORS }, (_, i) => i + 1);
  return { guest: true, season: { id: s.id, name: s.name, costume: s.costume, passPrice: PASS_PRICE, endsAt: s.end, startsAt: s.start }, day, dayEndsAt: dayEnds(t),
    tasks: tasksFor(day).map((x) => ({ id: x.id, text: x.text, need: x.need, have: 0, done: false })), points: 0, doors: 0, nextAt: DOOR_POINTS,
    today: { points: 0, matches: 0, top3: 0, max: DAY_MAX }, days: all.map((d) => ({ day: d, perfect: false, points: 0 })),
    streak: 0, pass: false, granted: [], plan: { free: doors.map((d) => freeReward(s, d)), gold: doors.map((d) => goldReward(s, d)) } };
}

const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`; };
const daysLeft = (st) => Math.max(0, st.days.length - st.days.findIndex((d) => d.day === st.day));
const thumb = (id) => { const it = BY_ID.get(id); return it && opts.thumbnail ? `<img alt="" src="${opts.thumbnail(it)}">` : '<span class="ptag">?</span>'; };
const nameOf = (id) => BY_ID.get(id)?.name || 'a costume piece';
const n = (x) => Number(x || 0).toLocaleString('en-US');
// one prize, drawn in a door: a picture for an item, a short tag for a level step or a ranked ticket
// (Cody, 2026-10-04: "+1 level tick", so it's never mistaken for a whole level)
// an item (a look, gear, a costume piece) shows its picture AND its name (Cody, 2026-10-04: "label the avatar items")
const prizeHtml = (r) => (!r ? '' : r.kind === 'item' ? `${thumb(r.item)}<span class="pname">${esc(nameOf(r.item))}</span>` : r.kind === 'tickets' ? `<span class="ptag">${r.n > 1 ? r.n + ' ' : ''}ranked<br>ticket</span>` : '<span class="ptag">+1 level<br>tick</span>');
const prizeName = (r) => (!r ? 'nothing' : r.kind === 'item' ? nameOf(r.item) : r.kind === 'tickets' ? `${r.n} ranked ticket${r.n > 1 ? 's' : ''}` : '+1 level tick');

// The card can never break the page: any error is logged and the card is hidden (season-test 2026-10-03: one slip here stopped the whole game page loading).
function render(st) { try { draw(st); } catch (e) { console.error('season card:', e); const el = $('#season'); if (el) el.hidden = true; } }
function draw(st) {
  const el = $('#season'); if (!el) return;
  last = st; el.hidden = !!st.off; if (st.season) el.dataset.season = st.season.id;
  const side = $('#pgSeason'); // the Player Progress line
  if (st.off) { if (side) side.textContent = 'Next season soon'; return; }
  const S = st.season, done = st.tasks.every((x) => x.done), idx = st.days.findIndex((d) => d.day === st.day), today = st.days[idx];
  // a streak is alive only if its last perfect day is today or yesterday
  const alive = st.streak && (today?.perfect || st.days[idx - 1]?.perfect) ? st.streak : 0;
  if (side) side.textContent = st.guest ? `${S.name} · sign in` : `${S.name} · door ${st.doors} of ${DOORS}${st.pass ? ' · pass' : ''}`;
  $('#ssEyebrow').textContent = `${S.name} season · ${daysLeft(st)} day${daysLeft(st) === 1 ? '' : 's'} left`;
  $('#ssTitle').textContent = `The ${S.name} Pass`;
  // today: the 5 tasks (+100 each) and today's points (at most 700)
  $('#ssToday').textContent = st.guest ? `up to ${n(st.today.max)} pts a day` : `today ${n(st.today.points)} / ${n(st.today.max)} pts`;
  $('#ssTasks').innerHTML = st.tasks.map((x) => `<li class="${x.done ? 'done' : ''}"><span>${esc(x.text)}</span><em class="pts">+${POINTS.task}</em><b>${x.have}/${x.need}</b><i style="--p:${Math.round((x.have / x.need) * 100)}%"></i></li>`).join('');
  const m = st.today.matches;
  $('#ssNote').textContent = st.readFailed ? 'Couldn\'t load your progress just now (it\'s still being counted). Reload to see it.'
    : st.guest ? `Sign in to earn points. Each Auto match also gives +${POINTS.match}, and +${POINTS.top3} more for a top 3 (your first ${POINTS.matchesPerDay} a day).`
    : `Auto matches today: ${m} of ${POINTS.matchesPerDay} scored (+${POINTS.match} each, +${POINTS.top3} more for a top 3).${done ? ' All 5 tasks done: a perfect day!' : ''}`;
  // the calendar: real dates, weeks starting Sunday; a perfect day is one with all 5 tasks done
  const [y, mo, d] = st.days[0].day.split('-').map(Number), pad = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  $('#ssCal').innerHTML = '<li class="pad"></li>'.repeat(pad) + st.days.map((x, i) => {
    const cls = x.perfect ? 'open' : x.day === st.day ? 'today' : i < idx ? 'missed' : 'shut';
    const label = `${x.day}: ${x.perfect ? 'perfect day' : x.day === st.day ? 'today' : i < idx ? 'not perfect' : 'not yet'}${x.points ? ` · ${x.points} points` : ''}`;
    return `<li class="${cls}" title="${label}" aria-label="${label}">${+x.day.slice(8)}</li>`;
  }).join('');
  $('#ssStreak').innerHTML = `<b>${alive}</b> perfect day${alive === 1 ? '' : 's'} in a row <span>Bonus: +1 level tick every ${STREAK_EVERY} perfect days in a row</span>`;
  // the track: 30 doors, one every 300 points, each with everyone's prize; the 6 costume doors also show the pass's piece
  const got = new Set(st.granted.map((g) => g.track + ':' + g.door)), into = st.points - st.doors * DOOR_POINTS;
  $('#ssTrackHead').textContent = `Your doors · ${st.doors} of ${DOORS} open`;
  $('#ssPoints').textContent = st.doors >= DOORS ? `${n(st.points)} points · every door open!` : `${n(st.points)} points · next door at ${n(st.nextAt ?? (st.doors + 1) * DOOR_POINTS)}`;
  $('#ssBar').style.width = (st.doors >= DOORS ? 100 : Math.max(0, Math.min(100, (into / DOOR_POINTS) * 100))) + '%';
  $('#ssDoors').innerHTML = st.plan.free.map((f, i) => {
    const door = i + 1, g = st.plan.gold[i], open = door <= st.doors, cls = open ? 'open' : door === st.doors + 1 ? 'next' : 'future';
    const fGot = got.has('free:' + door), gGot = got.has('gold:' + door), gLocked = !st.pass;
    const label = `Door ${door} (${n(door * DOOR_POINTS)} points): ${prizeName(f)}${g ? `; with the pass: ${prizeName(g)}` : ''}${open ? ' · open' : ''}`;
    return `<li class="${cls}${g ? ' haspass' : ''}" title="${esc(label)}" aria-label="${esc(label)}"><span class="dn">${door}</span>`
      + `<span class="pz f${fGot ? ' got' : ''}">${prizeHtml(f)}</span>`
      + (g ? `<span class="pz g${gLocked ? ' locked' : gGot ? ' got' : ''}"><small>pass</small>${prizeHtml(g)}</span>` : '') + '</li>';
  }).join('');
  const nextLook = st.plan.free.map((r, i) => ({ r, door: i + 1 })).find((x) => x.r.kind === 'item' && x.door > st.doors);
  $('#ssFreeNote').textContent = nextLook ? `Next season look: ${nameOf(nextLook.r.item)} at door ${nextLook.door}.` : 'Every season look collected.';
  // the pass: the outfit picture, what it gives, and the pieces by door
  const pieceDoors = PIECE_DOORS.filter((dd) => st.plan.gold[dd - 1]?.kind === 'item'), pieces = pieceDoors.map((dd) => ({ door: dd, item: st.plan.gold[dd - 1].item }));
  const owned = pieces.filter((p) => got.has('gold:' + p.door)).length;
  $('#ssGold').innerHTML = pieces.map((p) => { const own = got.has('gold:' + p.door);
    return `<li class="${own ? 'own' : ''}">${thumb(p.item)}<span>${esc(nameOf(p.item))}</span><small>${own ? 'Yours' : 'Door ' + p.door}</small></li>`; }).join('');
  const set = pieces.length && BY_ID.get(pieces[0].item)?.set;
  $('#ssOutfit').innerHTML = set && opts.thumbnail ? `<img alt="The ${esc(S.costume)} outfit" src="${opts.thumbnail({ id: 'costume_' + set, slot: 'costume', set })}">` : '<span class="ptag">?</span>';
  $('#ssOutName').textContent = S.costume ? `The ${S.costume}` : 'The season costume';
  const gl = $('#ssGoldBox'); gl.classList.toggle('has', st.pass);
  $('#ssGoldHead').textContent = st.pass ? `Season pass · yours · ${owned} of ${pieces.length} pieces` : `Season pass · $${S.passPrice.toFixed(2)}`;
  $('#ssGoldLead').innerHTML = `The ${pieces.length}-piece ${esc(S.costume || 'season')} outfit, only in ${esc(S.name)}: <em>a piece on doors ${PIECE_DOORS.join(', ')}</em>, on top of `
    + `everyone's prize. Yours to keep.`;
  $('#ssGoldNote').textContent = st.pass ? (owned < pieces.length ? `Next piece: ${nameOf(pieces[owned].item)} at door ${pieces[owned].door}.` : 'The whole outfit is yours. Wear it from the Avatar tab.')
    : 'Buy it any time: the pieces of every door you\'ve already reached come at once.';
  const buy = $('#ssBuy'); buy.hidden = st.pass || !pieces.length; if (st.pass || !st.guest) { const nt = $('#ssBuyNote'); if (/^Sign in first/.test(nt.textContent)) nt.textContent = ''; }
  buy.textContent = `Get the pass · $${S.passPrice.toFixed(2)}`; buy.disabled = busy;
  tick();
}
function tick() {
  const r = $('#ssReset'); if (r && last && !last.off) r.textContent = clock(last.dayEndsAt - Date.now());
  if (last && !last.off && Date.now() >= last.dayEndsAt) refreshSeason(); // a new game day: new tasks, the calendar moves
}

// Read my season again (after a match, a sign-in, a purchase). Guests get the rules-only view.
export async function refreshSeason(profile = profileNow) {
  profileNow = profile;
  if (!$('#season')) return null;
  let st = null;
  if (profile) { st = await call('season').catch(() => null); if (!st || st.error) st = { ...guestState(), guest: false, readFailed: true }; }
  render(st || guestState());
  return last;
}

export function initSeason(o = {}) {
  opts = { ...opts, ...o };
  const buy = $('#ssBuy');
  buy?.addEventListener('click', async () => {
    if (!profileNow) { $('#ssBuyNote').textContent = 'Sign in first, then get the pass.'; return; }
    busy = true; buy.disabled = true;
    const b = await shopBuy({ kind: 'pass' }, (t) => { $('#ssBuyNote').textContent = t; });
    busy = false; buy.disabled = false;
    if (b && !b.refunded) { o.onBought?.(b); await refreshSeason(); }
  });
  if (!timer) timer = setInterval(tick, 30_000);
  render(guestState());
}
