// The SEASON card on the Play page (Cody, 2026-10-03): today's 3 tasks (the free pass), the season's calendar of doors, the
// rewards each track gives, and the $5 pass. Rules from seasons.js; a signed-in player's progress from the game server
// (server/seasons.js 'season'), a guest sees the same tasks and calendar with nothing opened yet. Progress only moves in public
// Auto matches the match server runs, so the card says so and refreshes after each match.
import { seasonAt, dayKey, dayEnds, seasonDays, tasksFor, freeReward, goldReward, PASS_PRICE, PIECE_EVERY, STREAK_EVERY } from './seasons.js';
import { BY_ID } from './catalog.js';
import { call } from './gameserver.js';
import { shopBuy } from './shopui.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let opts = { thumbnail: null }, last = null, profileNow = null, timer = 0, busy = false;

// What a guest (or a failed read) sees: the real tasks and calendar, nothing done.
export function guestState(t = Date.now()) {
  const s = seasonAt(t); if (!s) return { off: true };
  const all = seasonDays(s), day = dayKey(t);
  return { guest: true, season: { id: s.id, name: s.name, costume: s.costume, passPrice: PASS_PRICE, endsAt: s.end, startsAt: s.start }, day, dayEndsAt: dayEnds(t),
    tasks: tasksFor(day).map((x) => ({ id: x.id, text: x.text, need: x.need, have: 0, done: false })), doors: 0, days: all.map((d) => ({ day: d, door: false })),
    streak: 0, pass: false, granted: [], plan: { free: all.map((_, i) => freeReward(s, i + 1)), gold: all.map((_, i) => goldReward(s, i + 1)) } };
}

const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`; };
const daysLeft = (st) => Math.max(0, st.days.length - st.days.findIndex((d) => d.day === st.day));
const thumb = (id) => { const it = BY_ID.get(id); return it && opts.thumbnail ? `<img alt="" src="${opts.thumbnail(it)}">` : '<span class="ssq">?</span>'; };
const nameOf = (id) => BY_ID.get(id)?.name || 'a costume piece';

// The card can never break the page: any error is logged and the card is hidden (season-test 2026-10-03: one slip here stopped the whole game page loading).
function render(st) { try { draw(st); } catch (e) { console.error('season card:', e); const el = $('#season'); if (el) el.hidden = true; } }
function draw(st) {
  const el = $('#season'); if (!el) return;
  last = st; el.hidden = !!st.off; if (st.season) el.dataset.season = st.season.id;
  const side = $('#pgSeason'); // the Player Progress line
  if (st.off) { if (side) side.textContent = 'Next season soon'; return; }
  const S = st.season, done = st.tasks.every((x) => x.done), today = st.days.find((d) => d.day === st.day);
  // a streak is alive only if its last door is today or yesterday
  const idx = st.days.findIndex((d) => d.day === st.day);
  const alive = st.streak && (today?.door || st.days[idx - 1]?.door) ? st.streak : 0;
  if (side) side.textContent = st.guest ? `${S.name} · sign in` : `${S.name} · ${st.doors} door${st.doors === 1 ? '' : 's'}${st.pass ? ' · pass' : ''}`;
  $('#ssEyebrow').textContent = `${S.name} season · ${daysLeft(st)} day${daysLeft(st) === 1 ? '' : 's'} left`;
  $('#ssTitle').textContent = `The ${S.name} Calendar`;
  $('#ssTasks').innerHTML = st.tasks.map((x) => `<li class="${x.done ? 'done' : ''}"><span>${esc(x.text)}</span><b>${x.have}/${x.need}</b><i style="--p:${Math.round((x.have / x.need) * 100)}%"></i></li>`).join('');
  $('#ssNote').textContent = st.readFailed ? 'Couldn\'t load your progress just now (it\'s still being counted). Reload to see it.' : st.guest ?'Sign in to open doors. Tasks count in public Auto matches.'
    : done ? 'Today\'s door is open! 3 new tasks at 9 PM Indiana time.' : 'Finish all 3 to open today\'s door. Tasks count in public Auto matches.';
  // the calendar: real dates, weeks starting Sunday
  const [y, m, d] = st.days[0].day.split('-').map(Number), pad = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  $('#ssCal').innerHTML = '<li class="pad"></li>'.repeat(pad) + st.days.map((x, i) => {
    const cls = x.door ? 'open' : x.day === st.day ? 'today' : i < idx ? 'missed' : 'shut';
    const label = `${x.day}: ${x.door ? 'door opened' : x.day === st.day ? 'today' : i < idx ? 'missed' : 'not yet'}`;
    return `<li class="${cls}" title="${label}" aria-label="${label}">${+x.day.slice(8)}</li>`;
  }).join('');
  $('#ssStreak').innerHTML = `<b>${st.doors}</b> door${st.doors === 1 ? '' : 's'} opened · <b>${alive}</b> day${alive === 1 ? '' : 's'} in a row <span>Bonus: +1 level step every ${STREAK_EVERY} days in a row</span>`;
  // the rewards: the free looks by door, then the pass's costume by door
  const got = new Set(st.granted.map((g) => g.track + ':' + g.door));
  const freeLooks = st.plan.free.map((r, i) => (r.kind === 'item' ? { door: i + 1, item: r.item } : null)).filter(Boolean);
  const gold = st.plan.gold.map((r, i) => (r ? { door: i + 1, item: r.item } : null)).filter(Boolean);
  const cell = (r, track) => { const own = got.has(track + ':' + r.door); return `<li class="${own ? 'own' : ''}" title="Door ${r.door}: ${esc(nameOf(r.item))}${own ? ' (yours)' : ''}">${thumb(r.item)}<small>${own ? 'Yours' : 'Door ' + r.door}</small></li>`; };
  $('#ssFree').innerHTML = freeLooks.map((r) => cell(r, 'free')).join('');
  // the pass: the whole outfit as a picture, then each piece by name and the door that unlocks it
  $('#ssGold').innerHTML = gold.map((r) => { const own = got.has('gold:' + r.door);
    return `<li class="${own ? 'own' : ''}">${thumb(r.item)}<span>${esc(nameOf(r.item))}</span><small>${own ? 'Yours' : 'Door ' + r.door}</small></li>`; }).join('');
  const set = gold.length && BY_ID.get(gold[0].item)?.set;
  $('#ssOutfit').innerHTML = set && opts.thumbnail ? `<img alt="The ${esc(S.costume)} outfit" src="${opts.thumbnail({ id: 'costume_' + set, slot: 'costume', set })}">` : '<span class="ssq">?</span>';
  $('#ssOutName').textContent = S.costume ? `The ${S.costume}` : 'The season costume';
  const nextFree = freeLooks.find((r) => r.door > st.doors);
  $('#ssFreeNote').textContent = nextFree ? `Next free look: ${nameOf(nextFree.item)} at door ${nextFree.door}.` : 'Every free look collected.';
  const pieces = gold.filter((r) => got.has('gold:' + r.door)).length, gl = $('#ssGoldBox');
  gl.classList.toggle('has', st.pass);
  $('#ssGoldHead').textContent = st.pass ? `Season pass · yours · ${pieces} of ${gold.length} pieces` : `Season pass · $${S.passPrice.toFixed(2)}`;
  $('#ssGoldLead').innerHTML = gold.length ? `A ${gold.length}-piece outfit, only in ${esc(S.name)}. <em>1 piece every ${PIECE_EVERY} doors</em> you open. Yours to keep forever.` : '';
  $('#ssGoldNote').textContent = !gold.length ? 'This season\'s pass opens soon.' : st.pass
    ? (pieces < gold.length ? `Next piece: ${nameOf(gold[pieces].item)} at door ${gold[pieces].door}.` : 'The whole outfit is yours. Wear it from the Avatar tab.')
    : 'Buy it any time: doors you already opened count.';
  const buy = $('#ssBuy'); buy.hidden = st.pass || !gold.length; if (st.pass || !st.guest) { const n = $('#ssBuyNote'); if (/^Sign in first/.test(n.textContent)) n.textContent = ''; }
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
