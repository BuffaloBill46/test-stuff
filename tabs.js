// Site tabs: Play / Store / Avatar / Ranks, wallet sign-in, avatar editor, leaderboard.
import { THREE, character, lights, toon, part, build, hatGeo, giftGeo, C } from './kit.js';
import { GEAR_SLOTS } from './catalog.js';
import { shopBuy, resumeShop } from './shopui.js';
import { forSale } from './shoprules.js';
import { GEAR, statOf, NO_STACK_NOTE, WEAR_DAYS } from './gear.js';
import { ITEMS, BY_ID, SLOTS, SB_SLOTS, SLOT_NAMES, DEFAULT_AVATAR, cleanAvatar, usable } from './catalog.js';
import { SPECIALS } from './specials.js';
import { settingsReady } from './gameserver.js';
import { levelInfo, progressLine, buyPrice, LEVELS } from './levels.js';
import { THEMES, THEME_IDS } from './themes.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const short = (w) => (w ? w.slice(0, 4) + '…' + w.slice(-4) : '');
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };

// ---------- item thumbnails: each item rendered once on the real model, cached as an image
let thumbR = null;
const thumbs = new Map();
function thumbnail(item) {
  if (thumbs.has(item.id)) return thumbs.get(item.id);
  if (!thumbR) { thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); thumbR.setSize(160, 160, false); }
  const scene = new THREE.Scene(); lights(scene, { hemi: 1.7, moonI: 1.6 });
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  if (item.slot === 'snow' || item.slot === 'sball') { // special snowballs: a ball in their own colour (an empty slot: faint grey)
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
  scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  thumbs.set(item.id, url); return url;
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
  return character({ keepSleeves: extra.shirt != null, shirt: extra.shirt ?? get('shirt').color, pants: get('pants').color, skin: get('skin').color, face: get('face').face, seed: 3,
    hat: hat.hat !== 'none' ? { shape: hat.hat, color: hat.color } : null, pack: pack.pack !== 'none' ? { shape: pack.pack, color: pack.color } : null, ...extra });
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
  const buy = el.querySelector('#pgBuy');
  buy.hidden = price === null; // levels above 5 are earned, not bought
  if (price !== null) { buy.textContent = `Buy level ${pl.level + 1} · $${price.toFixed(2)}`; buy.disabled = false; }
  // the free way to the same level, with the count so far (Auto match top-3 finishes; guests: sign in to count them)
  const or = el.querySelector('#pgOr'); or.hidden = price === null;
  if (price !== null) { or.firstChild.textContent = `or win ${pl.need} matches top 3 or better `; el.querySelector('#pgOrN').textContent = `${pl.xp} / ${pl.need}`; }
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
  const state = { tab: 'play', slot: 'shirt', sbSlot: 'sb1', gSlot: 'g1', draft: null, owned: new Set(), board: null };
  // The Avatar editor's tabs: the look slots, then Special Snowballs and Special Gear. Special Gear REPLACES Backpacks (Cody,
  // 2026-10-01: "it should also replace the backpack section"); a backpack already worn stays on (the pack slot is still saved).
  const AV_TABS = [...SLOTS.filter((s) => s !== 'pack'), 'sball', 'gear'];

  // ---------- tabs
  function show(tab) {
    if (!['play', 'games', 'store', 'avatar', 'ranks'].includes(tab)) tab = 'play';
    state.tab = tab;
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
  async function reloadMine() { try { const p = await app.accounts.profile(); if (p) await afterSignIn(p); } catch {} }
  async function afterSignIn(p) {
    app.profile = p; app.setIdentity(p.name, cleanAvatar(p.avatar)); renderProgress(p);
    try { state.owned = new Set(await app.accounts.inventory()); } catch { state.owned = new Set(); }
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
    $('#acct').hidden = false;
  }
  $('#signin').addEventListener('click', () => { linkBox = null; openAcct(); });
  $('#acctClose').addEventListener('click', () => { $('#acct').hidden = true; });
  $('#walletBtn').addEventListener('click', async () => {
    const btn = $('#walletBtn'); btn.disabled = true; acctMsg('Check your wallet to approve the sign-in…');
    try { await app.accounts.signIn(); await afterAuth(); if (!$('#acctMsg').textContent.startsWith('Linked') && !$('#acctMsg').textContent.startsWith("Couldn't")) $('#acct').hidden = true; }
    catch (e) {
      acctMsg(e.message === 'NO_WALLET'
        ? "No Solana wallet found. Install Phantom, or on a phone open this page inside the Phantom app's browser, then try again."
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
      else acctMsg(`Sent. Open the link in the email to ${email} on this device to finish signing in.`);
    } catch (e) { acctMsg(`Couldn't send the email: ${e.message}`); }
    finally { btn.disabled = false; }
  });

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
    return item.price != null ? `<span class="price">$${item.price.toFixed(2)}</span>` : `<span>Level ${item.level}</span>`;
  }
  let settingsIn = false;
  function renderStore(force) {
    if (!settingsIn) { settingsReady.then(() => { settingsIn = true; renderStore(force); }); return; } // server mode: published prices/items first
    if (storeDrawn && !force) return; storeDrawn = true;
    const box = $('#carousels'); box.innerHTML = '<p class="dim">Wrapping presents…</p>';
    requestAnimationFrame(() => {
      // Cody, 2026-10-01: the Store sells only 1. Special Snowballs and 2. Special Gear, each saying what it does, with the rules
      // (snowballs are kept forever; gear lasts 7 days). The look items (shirts, hats…) are still earned by level on the Avatar screen.
      const sbs = ITEMS.filter((i) => i.slot === 'sball' && i.id !== 'sb_none'), gear = ITEMS.filter((i) => i.slot === 'gear' && i.id !== 'gear_none');
      box.innerHTML = `<div class="shop"><div class="shophead"><h3>1. Special Snowballs</h3><p class="rule"><b>Yours forever</b> Buy one once and keep it. Put it in a special slot (SB1–SB3) on the Avatar screen; a throw uses that many snowballs from your counter.</p></div>
        <div class="shopgrid">${sbs.map((i) => { const S = SPECIALS[i.special];
          return `<div class="shopitem"><img alt="" src="${thumbnail(i)}"><div><b>${esc(i.name)}</b><span class="uses">${S.cost === 'all' ? 'uses all' : 'uses ' + S.cost}${S.minLevel ? ' · level ' + S.minLevel + '+' : ''}</span><p>${esc(S.note)}</p>${status(i)}</div><div class="shopbtns"><button class="sec" data-try="${i.id}">Try it</button>${buyBtn(i)}</div><p class="shopnote" aria-live="polite"></p></div>`; }).join('')}</div></div>
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
    $('#avgrid').innerHTML = ITEMS.filter((i) => i.slot === state.slot).map((i) => {
      const ok = usable(i, lvl, state.owned), on = sb ? d.a[state.sbSlot] === i.id : gr ? d.a[state.gSlot] === i.id : d.a[i.slot] === i.id, S = SPECIALS[i.special], G = GEAR[i.gear];
      if (gr) return `<button class="pick wide ${ok ? '' : 'locked'}" data-pick="${i.id}" aria-pressed="${on}">${G ? `<img alt="" src="${thumbnail(i)}">` : `<i class="chip" style="background:#${(i.color ?? 0x5a6688).toString(16).padStart(6, '0')}"></i>`}${esc(i.name)}<small>${G ? esc(G.note) : 'Leave this slot empty'}</small><small>${!ok ? '$' + i.price.toFixed(2) + ' in Store' : G?.minLevel && lvl < G.minLevel ? 'level ' + G.minLevel + '+' : G ? statName(i.gear) : ''}</small></button>`;
      if (sb) return `<button class="pick wide ${ok ? '' : 'locked'}" data-pick="${i.id}" aria-pressed="${on}"><img alt="" src="${thumbnail(i)}">${esc(i.name)}<small>${S ? esc(S.note) : 'Leave this slot empty'}</small><small>${!ok ? '$' + i.price.toFixed(2) + ' in Store' : S ? (S.cost === 'all' ? 'uses all' : 'uses ' + S.cost) + (S.minLevel && lvl < S.minLevel ? ' · level ' + S.minLevel : '') : 'empty slot'}</small></button>`;
      // look items are bought here on the Avatar screen, not in the Store (Cody, 2026-10-01)
      return `<button class="pick ${ok ? '' : 'locked'}" data-pick="${i.id}" aria-pressed="${on}"><img alt="" src="${thumbnail(i)}">${esc(i.name)}<small>${ok ? 'Unlocked' : i.price != null ? '$' + i.price.toFixed(2) : 'Level ' + i.level}</small></button>`;
    }).join('');
    $('#avgrid').classList.toggle('list', sb || gr); // special snowballs and gear: a list, so what each does can be read
    const blocked = [...SLOTS, ...SB_SLOTS, ...GEAR_SLOTS].map((s) => BY_ID.get(d.a[s] || (GEAR_SLOTS.includes(s) ? 'gear_none' : 'sb_none'))).filter((i) => !usable(i, lvl, state.owned));
    const pl = progressLine(app.profile || { level: 1, xp: 0 });
    $('#avlevel').innerHTML = `Level ${pl.level}<div class="bar"><div style="width:${pl.max ? 100 : Math.round((pl.xp / pl.need) * 100)}%"></div></div>${app.profile ? pl.text : 'Sign in to keep your level.'}`;
    const save = $('#avsave');
    save.disabled = blocked.length > 0;
    save.textContent = app.profile ? 'Save look' : 'Save on this device';
    if (blocked.length) $('#avmsg').textContent = `Previewing: ${blocked.map((i) => i.name).join(', ')} isn't unlocked yet.`;
    // buy what's being previewed, right here (looks are bought on the Avatar screen; Cody)
    const sale = blocked.find((i) => forSale(i)), ab = $('#avbuy'); ab.hidden = !sale;
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
  $('#avgrid').addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (!b) return; const it = BY_ID.get(b.dataset.pick);
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
    b.disabled = true; await shopBuy({ kind: 'tickets', n: +b.dataset.tix }, say); b.disabled = false; });
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
    const lb = $('#lb');
    try {
      const rows = await app.accounts.leaderboard();
      lb.innerHTML = rows.length
        ? `<table class="lb"><thead><tr><th>#</th><th>Player</th><th>Level</th><th style="text-align:right">Points</th></tr></thead><tbody>${
            rows.map((r, i) => `<tr class="${p && r.wallet === p.wallet ? 'me' : ''}"><td class="n">${i + 1}</td><td>${esc(r.name)}<small>${esc(short(r.wallet))}</small></td><td>${r.level}</td><td class="p">${r.rank_points}</td></tr>`).join('')}</tbody></table>`
        : '<p class="dim">No players yet. Sign in to be first on the board.</p>';
    } catch (e) { lb.innerHTML = `<p class="dim">Couldn't load the leaderboard right now. ${esc(e.message)}</p>`; }
  }

  // ---------- start
  (async () => {
    try { const s = await app.accounts.session(); if (s) await afterAuth(); } catch { /* signed out */ }
    renderWho();
    if (store.get('sq_link') && !app.profile) openAcct();
  })();
  renderWho();
  show((location.hash || '#play').slice(1));
  return { show, get tab() { return state.tab; } };
}

function safeJSON(s) { try { return JSON.parse(s); } catch { return null; } }
