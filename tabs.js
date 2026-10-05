// Site tabs: Play / Store / Avatar / Ranks, wallet sign-in, avatar editor, leaderboard.
import { THREE, character, lights, toon, part, build, hatGeo, giftGeo, C, Sparks, TOON } from './kit.js?v=6b06fd46df';
import { costumeShareButton, usePortraits } from './sharecard.js?v=6b06fd46df'; // share a costume (Cody 2026-10-04)
import { BALL_COLOR, tracer, dropStreak } from './ballfx.js?v=6b06fd46df';
import { mountHumanCheck } from './human.js?v=6b06fd46df';
import { GEAR_SLOTS } from './catalog.js?v=6b06fd46df';
import { shopBuy, resumeShop } from './shopui.js?v=6b06fd46df';
import { forSale } from './shoprules.js?v=6b06fd46df';
import { GEAR, statOf, NO_STACK_NOTE, WEAR_DAYS, RETIRED } from './gear.js?v=6b06fd46df';
import { ITEMS, BY_ID, SLOTS, SB_SLOTS, SLOT_NAMES, DEFAULT_AVATAR, cleanAvatar, usable, COSTUMES, costumeItems, costumeWord, SEASONS } from './catalog.js?v=6b06fd46df';
import { SPECIALS } from './specials.js?v=6b06fd46df';
import { settingsReady, call } from './gameserver.js?v=6b06fd46df';
import { TICKET_MAX } from './ranked.js?v=6b06fd46df';
import { dayStart, weekStart } from './gameclock.js?v=6b06fd46df';
import { levelInfo, progressLine, buyPrice, LEVELS } from './levels.js?v=6b06fd46df';
import { refreshSeason } from './seasonui.js?v=6b06fd46df';
import { THEMES, THEME_IDS } from './themes.js?v=6b06fd46df';

const $ = (s) => document.querySelector(s);
const esc = (s) => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const short = (w) => (w ? w.slice(0, 4) + '…' + w.slice(-4) : '');
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };

// What a special snowball costs to throw, in snowballs from the counter (Cody 2026-10-02: "cost x snowballs", not "uses 2")
const costWords = (S) => (S.cost === 'all' ? 'Costs all your snowballs' : `Costs ${S.cost} snowball${S.cost === 1 ? '' : 's'}`);

// ---------- item thumbnails: each item rendered once on the real model, cached as an image
let thumbR = null;
const thumbs = new Map();
// A costume on the model, bigger than a Store thumbnail (480 px), for the "New costume" share card (Cody 2026-10-04)
let portraitR = null;
export function costumePortrait(set) {
  if (!portraitR) { portraitR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); portraitR.setSize(480, 480, false); }
  const scene = new THREE.Scene(); lights(scene, { hemi: 1.7, moonI: 1.6 });
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50), a = { ...DEFAULT_AVATAR };
  for (const i of costumeItems(set)) a[i.slot] = i.id;
  const ch = avatarCharacter(a); ch.rotation.y = -0.55; scene.add(ch); cam.position.set(0, 1.55, 5.4); cam.lookAt(0, 1.5, 0);
  portraitR.render(scene, cam); const url = portraitR.domElement.toDataURL('image/png');
  scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); return url;
}
// The costumes I have (every piece mine, or unlocked by my level) — for the share row and the one-time "New costume" banner
const ownedCostumes = (lvl, owned) => Object.entries(COSTUMES).filter(([set]) => costumeItems(set).every((i) => usable(i, lvl, owned))).map(([set, c]) => ({ set, name: c.name, season: !!c.season }));
export function thumbnail(item) {
  if (thumbs.has(item.id)) return thumbs.get(item.id);
  if (!thumbR) { thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); thumbR.setSize(160, 160, false); }
  const scene = new THREE.Scene(); lights(scene, { hemi: 1.7, moonI: 1.6 });
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  if (item.slot === 'costume') { // a whole costume (the Costumes tab): every piece on the model, turned so the back piece shows
    const a = { ...DEFAULT_AVATAR }; for (const i of costumeItems(item.set)) a[i.slot] = i.id;
    const ch = avatarCharacter(a); ch.rotation.y = -0.55; scene.add(ch); cam.position.set(0, 1.55, 5.4); cam.lookAt(0, 1.5, 0);
  } else if (item.slot === 'sball' && item.special) ballShot(scene, cam, item);
  else if (item.slot === 'snow' || item.slot === 'sball') { // a snowball colour (and the empty special slot: faint grey)
    const ball = new THREE.Mesh(build([part(new THREE.IcosahedronGeometry(0.5, 1), item.color ?? 0x5a6688, { jit: 0.04 })]), new THREE.MeshToonMaterial({ vertexColors: true, transparent: item.id === 'sb_none', opacity: item.id === 'sb_none' ? 0.35 : 1 }));
    scene.add(ball); cam.position.set(0.4, 0.5, 2.4); cam.lookAt(0, 0, 0);
  } else {
    const a = { ...DEFAULT_AVATAR, [item.slot]: item.id };
    const ch = avatarCharacter(a, item.slot === 'gear' ? { gear: [item.gear] } : {}); ch.rotation.y = -0.35; scene.add(ch);
    if (item.slot === 'face' || item.slot === 'skin') { const h = toon(hatGeo({ scale: 0.88 }), 0.03); h.position.y = 2.05; h.rotation.y = Math.PI / 2 - 0.35; scene.add(h); cam.position.set(0, 1.92, 1.75); cam.lookAt(0, 1.86, 0); }
    else if (item.slot === 'pants') { cam.position.set(0, 0.9, 3.4); cam.lookAt(0, 0.65, 0); }
    else if (item.slot === 'hat') { cam.position.set(0, 2.15, 1.9); cam.lookAt(0, 1.98, 0); }
    else if (item.slot === 'pack') { ch.rotation.y = Math.PI - 0.6; cam.position.set(0, 1.5, 2.9); cam.lookAt(0, 1.25, 0); } // from behind
    else if (item.slot === 'gear') gearShot(scene, ch, cam, item.gear);
    else { cam.position.set(0, 1.5, 3.6); cam.lookAt(0, 1.25, 0); }
  }
  thumbR.render(scene, cam);
  const url = thumbR.domElement.toDataURL('image/png');
  scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.isPoints) o.material.dispose(); });
  thumbs.set(item.id, url); return url;
}

// Special snowball thumbnails (Cody 2026-10-02: "match what they look like in the game not just colors"): the ball caught in
// flight with the game's OWN tracer and glow (ballfx.js, the code the match draws with), at the game's ball size. Thrown
// slower than in a match so the whole trail fits the little picture (same shapes, shorter). Drawn on the tiles' own colour
// (#141b36): a glow adds light, so on a see-through picture it would vanish. Sky Ball / Snowball Rain: balls falling with
// their streaks (Sky's are ice-blue, a few; Rain's are white, many).
function ballShot(scene, cam, item) {
  const kind = item.special, sp = new Sparks(400), T = 1.37; // T: a moment where the twinkles are mid-sparkle
  scene.background = new THREE.Color(0x141b36); sp.uH.value = 80; sp.begin(); scene.add(sp.points);
  const ball = (x, y, color, r = 1) => { const m = toon(build([part(new THREE.IcosahedronGeometry(0.17, 0), C.brim, { jit: 0.02 })]), 0.02);
    m.material = TOON.clone(); m.material.color = new THREE.Color(color); m.scale.setScalar(r); m.position.set(x, y, 0); scene.add(m); };
  if (kind === 'sky' || kind === 'rain') {
    const spots = kind === 'sky' ? [[0, 0.5], [-0.55, 0.1], [0.55, 0.0]] : [[-0.65, 0.85], [0.05, 0.45], [0.65, 0.8], [-0.3, -0.05], [0.4, -0.15]];
    spots.forEach(([x, y], i) => { ball(x, y, kind === 'sky' ? 0x9fd8ff : 0xf5f1e8); dropStreak(sp, { kind, x, z: 0 }, y, i, T); });
    cam.position.set(0, 0.55, 3.6); cam.lookAt(0, 0.5, 0);
  } else {
    const giant = kind === 'giant', b = { id: 7, kind, vx: giant ? 6 : kind === 'fire' ? 9 : 8, vz: 0, r: giant ? 3 : 1 }, x = giant ? 0.55 : 0.6;
    ball(x, 0, BALL_COLOR[kind]?.(b) ?? item.color, b.r);
    tracer(sp, b, x, 0, 0, 1.2, T);
    cam.position.set(0, 0.05, giant ? 4.6 : 2.7); cam.lookAt(giant ? 0.05 : 0.22, 0.08, 0);
  }
  sp.end();
}

// Special gear thumbnails: the gear worn on the real model, framed on the part it changes (a Gift Box: just the wrapped present)
function gearShot(scene, ch, cam, kind) {
  const at = (p, l) => { cam.position.set(...p); cam.lookAt(...l); };
  if (kind === 'present') { scene.remove(ch); scene.add(toon(giftGeo(0x7a4fa3, C.gold, 0.7), 0.03)); at([0.9, 1.0, 1.6], [0, 0.32, 0]); }
  else if (kind === 'pumpkin') at([0, 1.9, 1.75], [0, 1.76, 0]);
  else if (kind === 'elfhat') { ch.rotation.y = 0.6; at([0, 2.2, 2.9], [0, 2.15, 0]); }
  else if (kind === 'shoes') { ch.rotation.y = 0.8; at([0, 0.6, 1.4], [0, 0.12, 0]); }
  else if (kind === 'bag' || kind === 'backpack') { ch.rotation.y = Math.PI - 0.6; at([0, 1.6, 3.0], [0, 1.4, 0]); }
  else if (kind === 'satchel') { ch.rotation.y = -2.0; at([0, 1.3, 2.6], [0, 1.1, 0]); }
  else at([0, 1.5, 2.7], [0, 1.25, 0]);
}

export function avatarCharacter(a, extra = {}) {
  const av = cleanAvatar(a), get = (s) => BY_ID.get(av[s]);
  const hat = get('hat'), pack = get('pack');
  // extra.gear: the special gear to dress them in (gear.js kinds); a team shirt (extra.shirt) keeps the team colour on the arms
  // and drops a costume coat's trim (the team colour must read at a glance); costume trousers keep theirs
  return character({ keepSleeves: extra.shirt != null, shirt: extra.shirt ?? get('shirt').color, pants: get('pants').color, skin: get('skin').color, face: get('face').face, seed: 3,
    shirtTrim: extra.shirt != null ? null : get('shirt').trim, pantsTrim: get('pants').trim,
    hat: hat.hat !== 'none' ? { shape: hat.hat, color: hat.color } : null, pack: pack.pack !== 'none' ? { shape: pack.pack, color: pack.color } : null, ...extra });
}

// Ranked tickets (Cody 2026-10-02: on Player Progress and in the ranked lobby, seen without scrolling): free left today +
// bought, out of TICKET_MAX. Read from the game server (ranked.js; supabase/006 ticket_status). Returns its answer.
export async function refreshTickets(profile) {
  const el = document.querySelector('#pgTix');
  // asked whenever there's a sign-in, even before the profile has loaded (server-mode-test caught a "—/25" chip); a guest's
  // call is refused in the page itself (gameserver.js call: no sign-in, no request), so it costs no server call
  const r = await call('tickets').catch(() => null);
  if (r?.error === 'sign in first') { if (el) el.textContent = 'Sign in'; return r; }
  // season tickets (the season pass track) come on top of the 25 free + bought (Cody, 2026-10-04: their own bank, no cap)
  const sz = +r?.season || 0;
  if (el) el.textContent = r && Number.isFinite(r.free) ? `${r.free + r.extra} / ${TICKET_MAX}${sz ? ` + ${sz} season` : ''}` : '—';
  const chip = document.querySelector('#tixchip'); // the top bar's chip (computers)
  if (chip && r && Number.isFinite(r.free)) { chip.classList.remove('soon'); chip.querySelector('b').textContent = `${r.free + r.extra}/${TICKET_MAX}${sz ? ` +${sz}` : ''}`;
    chip.title = `Ranked tickets: ${r.free} free left today${r.extra ? `, ${r.extra} bought` : ''}${sz ? `, ${sz} from the season` : ''}. 1 per ranked match.`; }
  return r;
}

// CAREER STATS (Cody 2026-10-04 to-do #6; supabase/049 career_stats): snowballs thrown / hit / hit %, SANTA spent / won.
// careerOf(ids) is set by initTabs (the accounts' public lookup, so it works on the demo site too).
let careerOf = null;
const short1 = (raw) => { const n = (raw || 0) / 1e6; return n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(Math.round(n)); };
export const aimText = (c) => (c ? `${c.thrown} thrown · ${c.hits} hit · ${c.thrown ? Math.min(100, Math.round((100 * c.hits) / c.thrown)) : 0}%` : '—');
export const santaText = (c) => (c ? `${short1(c.spentRaw)} spent · ${short1(c.wonRaw)} won` : '—');
async function fillCareer(el, profile) {
  const aim = el.querySelector('#pgAim'), money = el.querySelector('#pgMoney'); if (!aim || !money) return;
  if (!profile?.id || !careerOf) { aim.textContent = money.textContent = profile ? '—' : 'Sign in'; return; }
  const c = (await careerOf([profile.id]).catch(() => ({})))[profile.id] || null;
  aim.textContent = aimText(c); money.textContent = santaText(c);
}

// The Player Progress box on the Play page (Cody, 2026-10-01). Guests see level 1; a signed-in player sees their own.
export function renderProgress(profile) {
  const el = document.querySelector('#progress'); if (!el) return;
  const p = profile || { level: 1, xp: 0 }, pl = progressLine(p), g = levelInfo(pl.level), price = buyPrice(pl.level);
  el.querySelector('#pgLevel').textContent = pl.level;
  el.querySelector('#pgText').textContent = profile ? pl.text : 'Sign in to keep your level. Guests play at level 1.';
  el.querySelector('#pgBar').style.width = (pl.max ? 100 : Math.round((pl.xp / pl.need) * 100)) + '%';
  el.querySelector('#pgGives').innerHTML = [['Starting snowballs', g.start], ['Special ball slots', g.sb], ['Gear slots', g.gear]]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  el.querySelector('#pgPts').textContent = profile ? String(profile.rank_points ?? 0) : '—';
  refreshTickets(profile); fillCareer(el, profile);
  const buy = el.querySelector('#pgBuy');
  buy.hidden = price === null; // levels above 5 are earned, not bought
  const cap = el.querySelector('#pgMax'); if (cap) cap.hidden = price === null; // "Max paid to level 5" under the button (Cody 2026-10-04)
  if (price !== null) { buy.textContent = `Buy level ${pl.level + 1} · $${price.toFixed(2)}`; buy.disabled = false; }
  // the free way to the same level, with the count so far (Auto match top-3 finishes; guests: sign in to count them)
  const or = el.querySelector('#pgOr'); or.hidden = price === null;
  if (price !== null) { or.firstChild.textContent = `or win ${pl.need} matches top 3 or better `; el.querySelector('#pgOrN').textContent = `${pl.xp} / ${pl.need}`; }
  refreshSeason(profile); // the Season card below (seasonui.js): my tasks and doors, or the guest view
}
// Put a special in a slot; if it was already in another slot it MOVES (the same special can't fill two slots; database 012).
function withSpecial(a, slot, id) { for (const s of SB_SLOTS) if (s !== slot && a[s] === id && id !== 'sb_none') a[s] = 'sb_none'; a[slot] = id; return a; }
// Put a gear in a slot: the same gear in the other slot MOVES; a gear boosting the same stat as the other slot's is refused
// (Cody, 2026-10-01: "Can't stack same stat"; the database refuses it too). Returns false when refused (nothing changed).
function withGear(a, slot, id) {
  const other = GEAR_SLOTS.find((s) => s !== slot), it = BY_ID.get(id), o = BY_ID.get(a[other]);
  if (id !== 'gear_none' && a[other] !== id && o?.gear && it?.gear && statOf(o.gear) && statOf(o.gear) === statOf(it.gear)) return false;
  if (a[other] === id && id !== 'gear_none') a[other] = 'gear_none';
  a[slot] = id; return true;
}
// What a gear boosts, in a word or two (for the Store and the Avatar grid)
const STAT_NAMES = { hits: 'extra hits', held: 'snowballs held', refill: 'refill speed', speed: 'move speed', size: 'size' };
const statName = (kind) => (kind === 'present' ? 'a random gear' : STAT_NAMES[statOf(kind)] || '');
export function initTabs(app) {
  usePortraits(costumePortrait); // the share cards draw costumes with this page's 3D renderer
  careerOf = (ids) => app.accounts.career ? app.accounts.career(ids) : Promise.resolve({});
  const state = { tab: 'home', slot: 'shirt', sbSlot: 'sb1', gSlot: 'g1', draft: null, owned: new Set(), board: null };
  // The Avatar editor's tabs: the look slots, then Special Snowballs and Special Gear. Special Gear REPLACES Backpacks (Cody,
  // 2026-10-01: "it should also replace the backpack section"); a backpack already worn stays on (the pack slot is still saved).
  // Costumes (Cody, 2026-10-02: the level 5 and 10 rewards) get their own tab: wear a whole costume in one tap, and put on or
  // take off a costume's back piece (the Toy Drum, the Ice Wings), since there's no Backpacks tab any more.
  const AV_TABS = [...SLOTS.filter((s) => s !== 'pack'), 'costume', 'sball', 'gear'];

  // ---------- tabs
  function show(tab) {
    if (!['home', 'play', 'games', 'store', 'avatar', 'ranks'].includes(tab)) tab = 'home';
    state.tab = tab;
    // Player Progress is ONE box (its ids are used everywhere): it sits at the top of Home or Play, whichever is open (Cody 2026-10-03)
    const pg = $('#progress'), page = $('#tab-' + tab);
    if (pg && page && (tab === 'home' || tab === 'play')) page.insertBefore(pg, tab === 'home' ? page.querySelector('.hero')?.nextElementSibling || null : page.firstElementChild);
    document.querySelectorAll('#nav .tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    document.querySelectorAll('#pages .page').forEach((p) => { p.hidden = p.id !== 'tab-' + tab; });
    try { history.replaceState(null, '', location.pathname + location.search + '#' + tab); } catch {}
    if (tab === 'store') renderStore();
    if (tab === 'avatar') { state.draft = state.draft || { name: app.me.n, a: { ...app.me.a } }; renderAvatar(); }
    else if (state.draft) { state.draft = null; app.preview(app.me.a); }
    if (tab === 'ranks') renderRanks();
    app.onTab(tab);
  }
  document.querySelectorAll('#nav .tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));

  // ---------- account
  function renderWho() {
    const p = app.profile;
    $('#rankchip b').textContent = p ? String(p.rank_points) : '—';
    const btn = $('#signin');
    btn.textContent = p ? p.name : 'Sign in'; btn.classList.toggle('in', !!p);
    btn.title = p ? (p.wallet ? `Signed in with wallet ${p.wallet}` : 'Signed in with email') : 'Sign in with a wallet or email';
  }
  // NEW COSTUME (Cody 2026-10-04: share "when they acquire a costume"): once per costume per browser, a banner with Share it / Wear it
  function announceCostumes(lvl) {
    const box = $('#costumeNews'); if (!box) return;
    let seen; try { seen = new Set(JSON.parse(localStorage.getItem('santa.costumesSeen') || '[]')); } catch { seen = new Set(); }
    const have = ownedCostumes(lvl, state.owned), first = !localStorage.getItem('santa.costumesSeen');
    const fresh = have.filter((c) => !seen.has(c.set));
    try { localStorage.setItem('santa.costumesSeen', JSON.stringify(have.map((c) => c.set))); } catch {}
    // the first time this browser looks, only costumes earned by a season count as news (the level costumes a player grew into
    // long ago would all pop up at once otherwise)
    const news = first ? fresh.filter((c) => c.season) : fresh; if (!news.length) return;
    const c = news[0];
    box.innerHTML = `<button class="close" data-x aria-label="Close">×</button><div class="eyebrow">New costume</div><h3>You got the ${esc(c.name)} costume!</h3>
      <p class="row">${costumeShareButton({ name: c.name, set: c.set, how: c.season ? 'Earned on the season pass' : 'Unlocked by levelling up' })}<button type="button" class="go" data-wear="${esc(c.set)}">Wear it</button></p>`;
    box.hidden = false;
    box.onclick = (e) => { if (e.target.closest('[data-x]')) box.hidden = true;
      const w = e.target.closest('[data-wear]'); if (w) { box.hidden = true; show('avatar'); state.draft ||= { name: app.profile?.name || '', a: cleanAvatar(app.profile?.avatar) };
        const ps = costumeItems(w.dataset.wear); for (const i of ps) state.draft.a[i.slot] = i.id; renderAvatar(); } };
  }
  async function reloadMine() { try { const p = await app.accounts.profile(); if (p) await afterSignIn(p); } catch {} }
  async function afterSignIn(p) {
    app.profile = p; app.setIdentity(p.name, cleanAvatar(p.avatar)); renderProgress(p);
    try { state.owned = new Set(await app.accounts.inventory()); } catch { state.owned = new Set(); }
    announceCostumes(p.level || 1);
    renderWho(); if (state.tab === 'avatar') { state.draft = { name: p.name, a: cleanAvatar(p.avatar) }; renderAvatar(); }
    if (state.tab === 'ranks') renderRanks();
    if (state.tab === 'store') renderStore(true);
    // a purchase paid but not yet accepted (tab closed, network dropped) finishes now
    resumeShop().then((r) => { if (r && !r.error) reloadMine(); }).catch(() => {});
  }
  // ---------- sign-in sheet: wallet (can buy) or email (plays and ranks, can't buy); link both to one account
  const acctMsg = (t) => { $('#acctMsg').textContent = t; };
  let linkBox = null; // { want, code } while showing a fresh link code

  // Every sign-in lands here. A pending link code (from a link made on another login) is redeemed
  // instead of creating a new account, so both logins open the same one.
  async function afterAuth() {
    const pending = store.get('sq_link');
    let p, note = '';
    if (pending) {
      store.del('sq_link');
      try { p = await app.accounts.redeem(pending); note = 'Linked! Your email and wallet now open this same account.'; }
      catch (e) { note = `Couldn't link: ${e.message}`; p = await app.accounts.profile(); }
    } else p = await app.accounts.profile();
    await afterSignIn(p);
    if (note) { openAcct(); acctMsg(note); }
  }

  async function openAcct() {
    const p = app.profile;
    $('#acctOut').hidden = !!p; $('#acctIn').hidden = !p; acctMsg('');
    if (store.get('sq_link') && !p) acctMsg('Sign in with the wallet or email you want to add to your account to finish linking.');
    if (p) {
      let kinds = [];
      try { kinds = await app.accounts.logins(); } catch { kinds = [p.wallet ? 'wallet' : 'email']; }
      const has = (k) => kinds.includes(k);
      const code = linkBox ? `${linkBox.code.slice(0, 5)}-${linkBox.code.slice(5)}` : '';
      const url = linkBox ? `${location.origin}${location.pathname}?link=${linkBox.code}` : '';
      $('#acctIn').innerHTML = `<div class="eyebrow">Signed in · your avatar is bound to this account</div><h2>${esc(p.name)}</h2>
        <ul class="logins">
          <li class="${has('email') ? 'on' : ''}"><b>Email</b><span>${has('email') ? 'Linked' : 'Not linked'}</span></li>
          <li class="${has('wallet') ? 'on' : ''}"><b>Wallet</b><span>${has('wallet') ? esc(short(p.wallet)) : 'Not linked · needed to buy'}</span></li>
        </ul>
        ${linkBox ? `<div class="linkbox">
            <p>${linkBox.want === 'wallet'
              ? 'Open this link wherever your wallet is (Phantom\'s browser on a phone, or a browser with the Phantom extension), then connect the wallet. Works for 15 minutes.'
              : 'Sign in with the email you want to add. Use this browser, or open this link on the device where you read that email. Works for 15 minutes.'}</p>
            <div class="code">${esc(code)}</div>
            <div class="row"><span class="link">${esc(url)}</span><button class="sec" id="copyLink">Copy link</button></div>
            ${linkBox.want === 'wallet' && app.hasWallet() ? '<button class="go" id="linkHere">Connect wallet here</button>' : ''}
            ${linkBox.want === 'email' ? '<div class="row"><input id="linkEmail" type="text" inputmode="email" autocomplete="email" placeholder="you@example.com" aria-label="Email to link"><button class="sec" id="linkEmailBtn">Email me a link</button></div>' : ''}
          </div>`
          : `<div class="row">${!has('wallet') ? '<button class="go" id="mkWallet">Link a wallet</button>' : ''}${!has('email') ? '<button class="sec" id="mkEmail">Link an email</button>' : ''}</div>`}
        <p class="dim">Linked logins all open this same account: same look, points and items.</p>
        <button class="sec" id="signOut">Sign out</button>`;
      const make = async (want) => {
        try { linkBox = { want, code: await app.accounts.createLinkCode(want) }; await openAcct(); }
        catch (e) { acctMsg(e.message); }
      };
      $('#mkWallet')?.addEventListener('click', () => make('wallet'));
      $('#mkEmail')?.addEventListener('click', () => make('email'));
      $('#copyLink')?.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(url); acctMsg('Link copied.'); }
        catch { acctMsg('Copy didn\'t work here; press and hold the link to copy it.'); }
      });
      $('#linkHere')?.addEventListener('click', async () => {
        store.set('sq_link', linkBox.code); linkBox = null; acctMsg('Check your wallet to approve…');
        try { await app.accounts.signIn(); await afterAuth(); }
        catch (e) { store.del('sq_link'); acctMsg(e.message === 'NO_WALLET' ? 'No Solana wallet found in this browser.' : `Didn't finish: ${e.message}`); }
      });
      $('#linkEmailBtn')?.addEventListener('click', async () => {
        const email = $('#linkEmail').value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { acctMsg('That email doesn\'t look right.'); return; }
        store.set('sq_link', linkBox.code);
        try {
          const now = await app.accounts.signInEmail(email);
          if (now) { linkBox = null; await afterAuth(); }
          else acctMsg(`Sent. Open the link in the email to ${email} in this browser to finish linking.`);
        } catch (e) { store.del('sq_link'); acctMsg(`Couldn't send the email: ${e.message}`); }
      });
      $('#signOut').addEventListener('click', async () => {
        await app.accounts.signOut(); app.profile = null; state.owned = new Set(); linkBox = null; renderProgress(null);
        app.setIdentity(store.get('sq_name') || app.me.n, cleanAvatar(safeJSON(store.get('sq_avatar'))));
        renderWho(); $('#acct').hidden = true; show(state.tab);
      });
    }
    $('#acct').hidden = false; mountHumanCheck($('#humanCheck')); // "are you human?" (human.js; off until it has a site key)
  }
  $('#signin').addEventListener('click', () => { linkBox = null; openAcct(); });
  $('#acctClose').addEventListener('click', () => { $('#acct').hidden = true; });
  // OPEN IN A WALLET APP (TEST_PLAN finding, 2026-10-02): a phone's normal browser (Chrome, Safari) has no Solana wallet, and
  // most players are on phones. The wallet apps' own "browse" links open THIS page (with its ?server= etc.) inside their app,
  // where the wallet is: Phantom (docs.phantom.com, browse deeplink) and Solflare. Shown on touch screens with no wallet found,
  // and after any "no wallet" sign-in.
  const walletApps = (always) => {
    const box = $('#walletBtn')?.parentElement; if (!box || box.querySelector('.walletapps')) return;
    if (!always && (app.hasWallet?.() || !matchMedia('(pointer: coarse)').matches)) return;
    const here = encodeURIComponent(location.href), ref = encodeURIComponent(location.origin), div = document.createElement('div');
    div.className = 'row walletapps';
    div.innerHTML = `<a class="sec" style="text-decoration:none" href="https://phantom.com/ul/browse/${here}?ref=${ref}">Open in Phantom</a><a class="sec" style="text-decoration:none" href="https://solflare.com/ul/v1/browse/${here}?ref=${ref}">Open in Solflare</a>`;
    box.append(div);
  };
  setTimeout(() => walletApps(false), 1500); // wallets announce themselves a moment after the page loads
  $('#walletBtn').addEventListener('click', async () => {
    const btn = $('#walletBtn'); btn.disabled = true; acctMsg('Check your wallet to approve the sign-in…');
    try { await app.accounts.signIn(); await afterAuth(); if (!$('#acctMsg').textContent.startsWith('Linked') && !$('#acctMsg').textContent.startsWith("Couldn't")) $('#acct').hidden = true; }
    catch (e) {
      if (e.message === 'NO_WALLET') walletApps(true);
      acctMsg(e.message === 'NO_WALLET'
        ? "No Solana wallet found in this browser. On a phone, tap Open in Phantom (or Solflare) below to play inside the wallet app; on a computer, install Phantom and try again."
        : `Sign-in didn't finish: ${e.message}`);
    } finally { btn.disabled = false; }
  });
  $('#emailBtn').addEventListener('click', async () => {
    const email = $('#email').value.trim(), btn = $('#emailBtn');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { acctMsg('That email doesn\'t look right.'); return; }
    btn.disabled = true; acctMsg('Sending…');
    try {
      const now = await app.accounts.signInEmail(email);
      if (now) { await afterAuth(); if (!$('#acctMsg').textContent.startsWith('Linked') && !$('#acctMsg').textContent.startsWith("Couldn't")) $('#acct').hidden = true; }
      else { acctMsg(`Sent to ${email}. Tap the button in the email, or type the code from it here.`); $('#codeRow').hidden = false; $('#emailCode').value = ''; $('#emailCode').focus(); }
    } catch (e) { acctMsg(`Couldn't send the email: ${e.message}`); }
    finally { btn.disabled = false; }
  });

  // The 8-digit code from the sign-in email (Supabase Auth: MAILER_OTP_LENGTH 8, valid 1 hour; works from any device: the email can be read on a phone, the game played on a PC)
  async function signInWithCode() {
    const email = $('#email').value.trim(), code = $('#emailCode').value.replace(/\D/g, ''), btn = $('#codeBtn');
    if (!/^\d{6,10}$/.test(code)) { acctMsg('Type the code from the email (8 digits).'); return; }
    btn.disabled = true; acctMsg('Signing in…');
    try {
      await app.accounts.verifyEmailCode(email, code);
      $('#codeRow').hidden = true; await afterAuth();
      if (!$('#acctMsg').textContent.startsWith('Linked') && !$('#acctMsg').textContent.startsWith("Couldn't")) $('#acct').hidden = true;
    } catch (e) { acctMsg(e.message); }
    finally { btn.disabled = false; }
  }
  $('#codeBtn').addEventListener('click', signInWithCode);
  $('#emailCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); signInWithCode(); } });

  // Arriving from a "link a wallet/email" link: remember the code until the player signs in here.
  const incoming = new URLSearchParams(location.search).get('link');
  if (incoming && /^[0-9A-Fa-f]{10}$/.test(incoming)) {
    store.set('sq_link', incoming.toUpperCase());
    try { const u = new URL(location.href); u.searchParams.delete('link'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch {}
  }
  function toast(t) { const s = $('#avmsg'); if (state.tab === 'avatar' && s) s.textContent = t; else alertBar(t); }
  function alertBar(t) {
    let el = $('#toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'plaque'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = t; el.hidden = false; clearTimeout(alertBar.t); alertBar.t = setTimeout(() => { el.hidden = true; }, 6000);
  }

  // ---------- store
  let storeDrawn = false;
  const buyBtn = (i) => (state.owned.has(i.id) ? `<span class="ok" data-owned="${i.id}">Owned</span>` : forSale(i) ? `<button class="go" data-buyitem="${i.id}">Buy</button>` : '');
  function status(item) {
    const lvl = app.profile ? app.profile.level : 1;
    if (usable(item, lvl, state.owned)) return '<span class="ok">Unlocked</span>';
    return `<span${item.price != null ? ' class="price"' : ''}>${lockWord(item)}</span>`;
  }
  // How a locked item is had, in words: its price, its season pass ("Halloween pass": given, never sold) or its level
  const lockWord = (i) => (i.price != null ? '$' + i.price.toFixed(2) : i.season ? (i.set ? esc(SEASONS[i.season]?.name || i.season) : esc(i.season[0].toUpperCase() + i.season.slice(1)) + ' calendar') : 'Level ' + i.level);
  // Gear the Store and the Avatar screen list: retired gear (gear.js RETIRED: Heated Coat, Pumpkin Costume) left out
  const listedGear = () => ITEMS.filter((i) => i.slot === 'gear' && !RETIRED.has(i.gear));
  let settingsIn = false;
  function renderStore(force) {
    if (!settingsIn) { settingsReady.then(() => { settingsIn = true; renderStore(force); }); return; } // server mode: published prices/items first
    if (storeDrawn && !force) return; storeDrawn = true;
    const box = $('#carousels'); box.innerHTML = '<p class="dim">Wrapping presents…</p>';
    requestAnimationFrame(() => {
      // Cody, 2026-10-01: the Store sells only 1. Special Snowballs and 2. Special Gear, each saying what it does, with the rules
      // (snowballs are kept forever; gear lasts 7 days). The look items (shirts, hats…) are still earned by level on the Avatar screen.
      const sbs = ITEMS.filter((i) => i.slot === 'sball' && i.id !== 'sb_none'), gear = listedGear().filter((i) => i.id !== 'gear_none');
      box.innerHTML = `<div class="shop"><div class="shophead"><h3>1. Special Snowballs</h3><p class="rule"><b>Yours forever</b> Buy one once and keep it. Put it in a special slot (SB1–SB3) on the Avatar screen; a throw uses that many snowballs from your counter.</p></div>
        <div class="shopgrid">${sbs.map((i) => { const S = SPECIALS[i.special];
          return `<div class="shopitem"><img alt="" src="${thumbnail(i)}"><div><b>${esc(i.name)}</b><span class="uses">${costWords(S)}${S.minLevel ? ' · level ' + S.minLevel + '+' : ''}</span><p>${esc(S.note)}</p>${status(i)}</div><div class="shopbtns"><button class="sec" data-try="${i.id}">Try it</button>${buyBtn(i)}</div><p class="shopnote" aria-live="polite"></p></div>`; }).join('')}</div></div>
        <div class="shop"><div class="shophead"><h3>2. Special Gear</h3><p class="rule"><b>Lasts ${WEAR_DAYS} days</b> The clock starts at your first match wearing it and keeps running; then it wears out. You can take it off and put it back on until then.</p>
          <p class="rule"><b>No stacking</b> ${esc(NO_STACK_NOTE)} One gear slot, two from level 8.</p></div>
        <div class="shopgrid">${gear.map((i) => { const G = GEAR[i.gear];
          return `<div class="shopitem"><img alt="" src="${thumbnail(i)}"><div><b>${esc(i.name)}</b><span class="uses">${G.minLevel ? 'level ' + G.minLevel + '+' : statName(i.gear)}</span><p>${esc(G.note)}</p>${status(i)}</div><div class="shopbtns"><button class="sec" data-try="${i.id}">Try it</button>${buyBtn(i)}</div><p class="shopnote" aria-live="polite"></p></div>`; }).join('')}</div></div>`;
    });
  }
  // Buy (Cody, 2026-10-02: every button reaches its end): the one shop path (shopui.js), then what the player owns is reloaded.
  $('#carousels').addEventListener('click', async (e) => {
    const bb = e.target.closest('[data-buyitem]'); if (!bb) return;
    const note = bb.closest('.shopitem').querySelector('.shopnote'), say = (t) => { note.textContent = t; };
    if (!app.profile) return say('Sign in with your wallet first: purchases are paid from it.');
    bb.disabled = true; const r = await shopBuy({ kind: 'item', id: bb.dataset.buyitem }, say); bb.disabled = false;
    if (r) { await reloadMine(); const t = note.textContent; renderStore(true); requestAnimationFrame(() => { const n = document.querySelector(`[data-buyitem="${bb.dataset.buyitem}"], [data-owned="${bb.dataset.buyitem}"]`)?.closest('.shopitem')?.querySelector('.shopnote'); if (n) n.textContent = t; }); }
  });
  $('#carousels').addEventListener('click', (e) => {
    const b = e.target.closest('[data-try]'); if (!b) return;
    const it = BY_ID.get(b.dataset.try); state.slot = it.slot;
    // a special snowball: throw it for real in a free practice match (Cody, 2026-10-03); gear is still tried on in the Avatar screen
    if (it.slot === 'sball' && it.special && app.tryInPractice) { show('play'); app.tryInPractice(it.special); return; }
    const a = { ...app.me.a };
    if (it.slot === 'sball') withSpecial(a, state.sbSlot, it.id); else if (it.slot === 'gear') { if (!withGear(a, state.gSlot, it.id)) withGear(a, state.gSlot === 'g1' ? 'g2' : 'g1', it.id); } else a[it.slot] = it.id;
    state.draft = { name: app.me.n, a };
    show('avatar');
  });

  // ---------- avatar editor
  function renderAvatar() {
    const d = state.draft, lvl = app.profile ? app.profile.level : 1;
    $('#avwho').textContent = app.profile ? (app.profile.wallet ? `Bound to wallet ${short(app.profile.wallet)}` : 'Bound to your email account') : 'Guest · sign in to keep your look';
    const nm = $('#avname'); if (document.activeElement !== nm) nm.value = d.name;
    $('#avslots').innerHTML = AV_TABS.map((s) => `<button role="tab" data-slot="${s}" aria-selected="${s === state.slot}">${SLOT_NAMES[s]}</button>`).join('');
    const sb = state.slot === 'sball', open = levelInfo(lvl).sb, sbBox = $('#avsb'); sbBox.hidden = !sb;
    if (sb) { if (SB_SLOTS.indexOf(state.sbSlot) >= open) state.sbSlot = 'sb1';
      sbBox.innerHTML = SB_SLOTS.map((s, i) => { const it = BY_ID.get(d.a[s] || 'sb_none'), lockedAt = i < open ? 0 : Object.keys(LEVELS).find((L) => LEVELS[L].sb > i);
        return `<button type="button" data-sbslot="${s}" aria-pressed="${state.sbSlot === s}" ${lockedAt ? 'disabled' : ''}><b>SB${i + 1}</b>${lockedAt ? 'Opens at level ' + lockedAt : esc(it.id === 'sb_none' ? 'Empty' : it.name)}</button>`; }).join('')
        + '<p class="avrule"><b>Yours forever</b> Special snowballs never wear out.</p>'; }
    // Special Gear: slots G1 (G2 from level 8), the same way, with the 7-day and no-stacking rules shown
    const gr = state.slot === 'gear', gOpen = levelInfo(lvl).gear;
    if (gr) { if (GEAR_SLOTS.indexOf(state.gSlot) >= gOpen) state.gSlot = 'g1'; sbBox.hidden = false;
      sbBox.innerHTML = GEAR_SLOTS.map((s, i) => { const it = BY_ID.get(d.a[s] || 'gear_none'), lockedAt = i < gOpen ? 0 : Object.keys(LEVELS).find((L) => LEVELS[L].gear > i);
        return `<button type="button" data-gslot="${s}" aria-pressed="${state.gSlot === s}" ${lockedAt ? 'disabled' : ''}><b>G${i + 1}</b>${lockedAt ? 'Opens at level ' + lockedAt : esc(it.id === 'gear_none' ? 'Empty' : it.name)}</button>`; }).join('')
        + `<p class="avrule"><b>Lasts ${WEAR_DAYS} days</b> from your first match wearing it. <b>No stacking</b> ${esc(NO_STACK_NOTE)}</p>`; }
    // Costumes: one card per costume (tap = wear every piece), then the back pieces (a costume's pack, or none)
    const co = state.slot === 'costume';
    // (a season costume, the Halloween pass's Pumpkin King, says which pass gives it; locked, it can be tried on but not saved)
    // the Costumes list: a "Share" for every costume I have (Cody 2026-10-04)
    const avs = $('#avshare'); if (avs) { const mine = co && app.profile ? ownedCostumes(lvl, state.owned) : []; avs.hidden = !mine.length;
      avs.innerHTML = mine.length ? '<span>Share a costume you have:</span>' + mine.map((c) => costumeShareButton({ name: c.name, set: c.set, how: c.season ? 'Earned on the season pass' : 'Unlocked by levelling up' }, 'Share ' + esc(c.name))).join('') : ''; }
    if (co) { const byLvl = Object.values(COSTUMES).filter((c) => !c.season), bySeason = Object.values(COSTUMES).filter((c) => c.season);
      sbBox.hidden = false; sbBox.innerHTML = `<p class="avrule"><b>Free</b> ${byLvl.map((c) => `level ${c.level}: ${esc(c.name)}`).join(', ')}.${bySeason.map((c) => ` <b>${esc(costumeWord(c))}</b> ${esc(c.name)}.`).join('')} Each piece is also in its own tab, to mix and match.</p>`;
      $('#avgrid').innerHTML = Object.entries(COSTUMES).map(([set, c]) => { const ps = costumeItems(set), ok = ps.every((i) => usable(i, lvl, state.owned)), on = ps.every((i) => d.a[i.slot] === i.id);
        return `<button class="pick wide costume ${ok ? '' : 'locked'}" data-costume="${set}" aria-pressed="${on}"><img alt="" src="${thumbnail({ id: 'costume_' + set, slot: 'costume', set })}">${esc(c.name)}<small>${esc(ps.map((i) => i.name).join(' · '))}</small><small>${on ? 'Wearing the whole costume' : ok ? 'Tap to wear the whole costume' : `${esc(costumeWord(c))} · tap to try it on`}</small></button>`; }).join('')
        + ['pack_none', ...ITEMS.filter((i) => i.slot === 'pack' && i.set).map((i) => i.id)].map((id) => { const i = BY_ID.get(id), ok = usable(i, lvl, state.owned);
          return `<button class="pick wide ${ok ? '' : 'locked'}" data-pick="${id}" aria-pressed="${d.a.pack === id}"><img alt="" src="${thumbnail(i)}">${esc(i.name)}<small>${i.set ? (/^The /.test(COSTUMES[i.set].name) ? '' : 'The ') + esc(COSTUMES[i.set].name) + '\'s back piece' : 'Nothing on your back'}</small><small>${ok ? 'Unlocked' : lockWord(i)}</small></button>`; }).join('');
    } else
    $('#avgrid').innerHTML = (gr ? listedGear() : ITEMS.filter((i) => i.slot === state.slot)).map((i) => {
      const ok = usable(i, lvl, state.owned), on = sb ? d.a[state.sbSlot] === i.id : gr ? d.a[state.gSlot] === i.id : d.a[i.slot] === i.id, S = SPECIALS[i.special], G = GEAR[i.gear];
      if (gr) return `<button class="pick wide ${ok ? '' : 'locked'}" data-pick="${i.id}" aria-pressed="${on}">${G ? `<img alt="" src="${thumbnail(i)}">` : `<i class="chip" style="background:#${(i.color ?? 0x5a6688).toString(16).padStart(6, '0')}"></i>`}${esc(i.name)}<small>${G ? esc(G.note) : 'Leave this slot empty'}</small><small>${!ok ? '$' + i.price.toFixed(2) + ' in Store' : G?.minLevel && lvl < G.minLevel ? 'level ' + G.minLevel + '+' : G ? statName(i.gear) : ''}</small></button>`;
      if (sb) return `<button class="pick wide ${ok ? '' : 'locked'}" data-pick="${i.id}" aria-pressed="${on}"><img alt="" src="${thumbnail(i)}">${esc(i.name)}<small>${S ? esc(S.note) : 'Leave this slot empty'}</small><small>${!ok ? '$' + i.price.toFixed(2) + ' in Store' : S ? costWords(S) + (S.minLevel && lvl < S.minLevel ? ' · level ' + S.minLevel : '') : 'empty slot'}</small></button>`;
      // look items are bought here on the Avatar screen, not in the Store (Cody, 2026-10-01)
      // a costume piece wears a small tag saying which costume it belongs to (e.g. "Level 5 costume", "Halloween pass")
      const tag = i.set && COSTUMES[i.set] ? `<em class="settag" data-set="${i.set}" title="${esc(COSTUMES[i.set].name)}">${esc(costumeWord(COSTUMES[i.set]))}</em>` : '';
      return `<button class="pick ${ok ? '' : 'locked'}" data-pick="${i.id}" aria-pressed="${on}"><img alt="" src="${thumbnail(i)}">${tag}${esc(i.name)}<small>${ok ? 'Unlocked' : lockWord(i)}</small></button>`;
    }).join('');
    $('#avgrid').classList.toggle('list', sb || gr || co); // special snowballs, gear and costumes: a list, so what each is can be read
    const blocked = [...SLOTS, ...SB_SLOTS, ...GEAR_SLOTS].map((s) => BY_ID.get(d.a[s] || (GEAR_SLOTS.includes(s) ? 'gear_none' : 'sb_none'))).filter((i) => !usable(i, lvl, state.owned));
    const pl = progressLine(app.profile || { level: 1, xp: 0 });
    $('#avlevel').innerHTML = `Level ${pl.level}<div class="bar"><div style="width:${pl.max ? 100 : Math.round((pl.xp / pl.need) * 100)}%"></div></div>${app.profile ? pl.text : 'Sign in to keep your level.'}`;
    const save = $('#avsave');
    save.disabled = blocked.length > 0;
    save.textContent = app.profile ? 'Save look' : 'Save on this device';
    if (blocked.length) $('#avmsg').textContent = `Previewing: ${blocked.map((i) => i.name).join(', ')} isn't unlocked yet.`;
    // buy what's being previewed, right here (looks are bought on the Avatar screen; Cody)
    // the item just tapped first (button audit 2026-10-02: it offered the first locked item in the outfit, maybe not the one tapped)
    const sale = blocked.find((i) => i.id === state.lastPick && forSale(i)) || blocked.find((i) => forSale(i)), ab = $('#avbuy'); ab.hidden = !sale;
    if (sale) { ab.dataset.item = sale.id; ab.textContent = `Buy ${sale.name} · $${sale.price.toFixed(2)}`; }
    renderThemes();
    app.preview(d.a);
  }
  // Plaza theme: applies straight away (no Save needed) and only on this player's screen.
  function renderThemes() {
    $('#avtheme').innerHTML = THEME_IDS.map((id) => `<button type="button" data-theme="${id}" aria-pressed="${id === app.theme}"><i style="background: linear-gradient(${THEMES[id].sky.join(', ')})"></i>${esc(THEMES[id].name)}</button>`).join('');
  }
  $('#avtheme').addEventListener('click', (e) => { const b = e.target.closest('[data-theme]'); if (!b) return; app.setTheme(b.dataset.theme); renderThemes(); });
  $('#avslots').addEventListener('click', (e) => { const b = e.target.closest('[data-slot]'); if (b) { state.slot = b.dataset.slot; $('#avmsg').textContent = ''; renderAvatar(); } });
  $('#avgrid').addEventListener('click', (e) => {
    // a costume card: put on every piece at once (a locked costume is previewed, like any locked item; Save waits for the level)
    const c = e.target.closest('[data-costume]');
    if (c) { const ps = costumeItems(c.dataset.costume); for (const i of ps) state.draft.a[i.slot] = i.id; state.lastPick = ps[0]?.id; $('#avmsg').textContent = ''; renderAvatar(); return; }
    const b = e.target.closest('[data-pick]'); if (!b) return; const it = BY_ID.get(b.dataset.pick); state.lastPick = b.dataset.pick;
    $('#avmsg').textContent = '';
    if (it.slot === 'sball') withSpecial(state.draft.a, state.sbSlot, it.id);
    else if (it.slot === 'gear') { if (!withGear(state.draft.a, state.gSlot, it.id)) { $('#avmsg').textContent = `Can't stack: ${NO_STACK_NOTE}`; return; } }
    else state.draft.a[it.slot] = it.id;
    renderAvatar(); });
  $('#avsb').addEventListener('click', (e) => { const b = e.target.closest('[data-sbslot], [data-gslot]'); if (!b || b.disabled) return;
    if (b.dataset.gslot) state.gSlot = b.dataset.gslot; else state.sbSlot = b.dataset.sbslot; renderAvatar(); });
  $('#avname').addEventListener('input', (e) => { state.draft.name = e.target.value; });
  $('#avbuy').addEventListener('click', async (e) => { const b = e.currentTarget, say = (t) => { $('#avmsg').textContent = t; };
    if (!app.profile) return say('Sign in with your wallet first: purchases are paid from it.');
    b.disabled = true; const r = await shopBuy({ kind: 'item', id: b.dataset.item }, say); b.disabled = false;
    if (r) { const t = $('#avmsg').textContent; await reloadMine(); renderAvatar(); $('#avmsg').textContent = t; } });
  // Buy level (the Progress box) and extra ranked tickets (the Store)
  $('#pgBuy').addEventListener('click', async (e) => { const b = e.currentTarget, say = (t) => { $('#pgNote').textContent = t; };
    if (!app.profile) return say('Sign in with your wallet first: levels are paid from it.');
    b.disabled = true; const r = await shopBuy({ kind: 'level' }, say); b.disabled = false; if (r) { const t = $('#pgNote').textContent; await reloadMine(); $('#pgNote').textContent = t; } });
  document.querySelector('.packs')?.addEventListener('click', async (e) => { const b = e.target.closest('[data-tix]'); if (!b) return;
    const say = (t) => { $('#tixNote').textContent = t; };
    if (!app.profile) return say('Sign in with your wallet first: tickets are paid from it.');
    // the counters (top bar, Player Progress) show the new total right away (live QA 2026-10-03: they stayed at 10/25 after a buy)
    b.disabled = true; const r = await shopBuy({ kind: 'tickets', n: +b.dataset.tix }, say); b.disabled = false; if (r) refreshTickets(app.profile); });
  $('#avsave').addEventListener('click', async () => {
    const d = state.draft, msg = $('#avmsg'), btn = $('#avsave');
    const name = d.name.trim().slice(0, 14) || app.me.n;
    if (!app.profile) {
      store.set('sq_name', name); store.set('sq_avatar', JSON.stringify(d.a)); app.setIdentity(name, cleanAvatar(d.a));
      msg.textContent = 'Saved on this device. Sign in to keep it everywhere.'; return;
    }
    btn.disabled = true; msg.textContent = 'Saving…';
    try {
      const p = await app.accounts.save(name, d.a);
      app.profile = p; app.setIdentity(p.name, cleanAvatar(p.avatar)); renderWho(); renderProgress(p);
      msg.textContent = app.profile.wallet ? 'Saved to your wallet.' : 'Saved to your account.';
    } catch (e) { msg.textContent = e.message; }
    finally { btn.disabled = false; }
  });

  // ---------- ranks
  async function renderRanks() {
    const p = app.profile;
    $('#mycard').innerHTML = p
      ? `<div class="eyebrow">You</div><h2>${esc(p.name)}</h2><p class="dim">${p.wallet ? esc(short(p.wallet)) : 'Email account'} · Level ${p.level}</p>
         <div class="stats"><div><i>Rank points</i><b>${p.rank_points}</b></div><div><i>Level</i><b>${p.level}</b></div>
         <div><i>Ranked matches</i><b>0</b></div><div><i>Podiums</i><b>0</b></div></div>
         <p class="dim">Match history and podiums start counting when ranked opens.</p>`
      : `<div class="eyebrow">You</div><h2>Not signed in</h2><p>Sign in with a wallet or email to get a rank, keep your look, and appear on the leaderboard.</p><button class="go" id="rankSign">Sign in</button>`;
    $('#rankSign')?.addEventListener('click', () => $('#signin').click());
    document.querySelectorAll('.lbtabs [data-lb]').forEach((b) => { b.onclick = () => { state.lb = b.dataset.lb; renderRanks(); }; });
    const lb = $('#lb'), which = state.lb || 'all';
    document.querySelectorAll('.lbtabs [data-lb]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lb === which)));
    // Today = since the last 9 PM Indiana time; This week = since Sunday 9 PM (Cody 2026-10-02: every reset at 9 PM Indiana
    // time; gameclock.js): points GAINED in ranked matches since then, the same day and week for every player
    const since = which === 'today' ? new Date(dayStart()) : which === 'week' ? new Date(weekStart()) : null;
    try {
      const rows = await app.accounts.leaderboard(since);
      lb.innerHTML = rows.length
        ? `<table class="lb"><thead><tr><th>#</th><th>Player</th><th>Level</th><th style="text-align:right">${since ? (which === 'today' ? 'Points today' : 'Points this week') : 'Points'}</th></tr></thead><tbody>${
            rows.map((r, i) => `<tr class="${p && r.wallet === p.wallet ? 'me' : ''}"><td class="n">${i + 1}</td><td>${esc(r.name)}<small>${esc(short(r.wallet))}</small>${r.career ? `<small class="career">${aimText(r.career)}</small><small class="career">SANTA ${santaText(r.career)}</small>` : ''}</td><td>${r.level}</td><td class="p">${r.rank_points}</td></tr>`).join('')}</tbody></table>`
        : since ? `<p class="dim">No ranked matches ${which === 'today' ? 'today' : 'this week'} yet. Play ranked to be first on this board.</p>` : '<p class="dim">No players yet. Sign in to be first on the board.</p>';
    } catch (e) { lb.innerHTML = `<p class="dim">Couldn't load the leaderboard right now. ${esc(e.message)}</p>`; }
  }

  // ---------- start
  (async () => {
    try { const s = await app.accounts.session(); if (s) await afterAuth(); } catch { /* signed out */ }
    renderWho();
    if (store.get('sq_link') && !app.profile) openAcct();
  })();
  renderWho();
  show((location.hash || '#home').slice(1));
  return { show, reloadMine, get tab() { return state.tab; } };
}

function safeJSON(s) { try { return JSON.parse(s); } catch { return null; } }
