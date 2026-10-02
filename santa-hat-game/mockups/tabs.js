// Site tabs: Play / Store / Avatar / Ranks, wallet sign-in, avatar editor, leaderboard.
import { THREE, character, lights, toon, part, build, hatGeo } from './kit.js';
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
    const ch = avatarCharacter(a); ch.rotation.y = -0.35; scene.add(ch);
    if (item.slot === 'face' || item.slot === 'skin') { const h = toon(hatGeo({ scale: 0.88 }), 0.03); h.position.y = 2.05; h.rotation.y = Math.PI / 2 - 0.35; scene.add(h); cam.position.set(0, 1.92, 1.75); cam.lookAt(0, 1.86, 0); }
    else if (item.slot === 'pants') { cam.position.set(0, 0.9, 3.4); cam.lookAt(0, 0.65, 0); }
    else if (item.slot === 'hat') { cam.position.set(0, 2.15, 1.9); cam.lookAt(0, 1.98, 0); }
    else if (item.slot === 'pack') { ch.rotation.y = Math.PI - 0.6; cam.position.set(0, 1.5, 2.9); cam.lookAt(0, 1.25, 0); } // from behind
    else { cam.position.set(0, 1.5, 3.6); cam.lookAt(0, 1.25, 0); }
  }
  thumbR.render(scene, cam);
  const url = thumbR.domElement.toDataURL('image/png');
  scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  thumbs.set(item.id, url); return url;
}

export function avatarCharacter(a, extra = {}) {
  const av = cleanAvatar(a), get = (s) => BY_ID.get(av[s]);
  const hat = get('hat'), pack = get('pack');
  return character({ shirt: extra.shirt ?? get('shirt').color, pants: get('pants').color, skin: get('skin').color, face: get('face').face, seed: 3,
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
  if (price !== null) buy.textContent = `Buy level ${pl.level + 1} · $${price.toFixed(2)} · payments open soon`;
  // the free way to the same level, with the count so far (Auto match top-3 finishes; guests: sign in to count them)
  const or = el.querySelector('#pgOr'); or.hidden = price === null;
  if (price !== null) { or.firstChild.textContent = `or win ${pl.need} matches top 3 or better `; el.querySelector('#pgOrN').textContent = `${pl.xp} / ${pl.need}`; }
}
// Put a special in a slot; if it was already in another slot it MOVES (the same special can't fill two slots; database 012).
function withSpecial(a, slot, id) { for (const s of SB_SLOTS) if (s !== slot && a[s] === id && id !== 'sb_none') a[s] = 'sb_none'; a[slot] = id; return a; }
export function initTabs(app) {
  const state = { tab: 'play', slot: 'shirt', sbSlot: 'sb1', draft: null, owned: new Set(), board: null };

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
  async function afterSignIn(p) {
    app.profile = p; app.setIdentity(p.name, cleanAvatar(p.avatar)); renderProgress(p);
    try { state.owned = new Set(await app.accounts.inventory()); } catch { state.owned = new Set(); }
    renderWho(); if (state.tab === 'avatar') { state.draft = { name: p.name, a: cleanAvatar(p.avatar) }; renderAvatar(); }
    if (state.tab === 'ranks') renderRanks();
    if (state.tab === 'store') renderStore(true);
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
      box.innerHTML = [...SLOTS.filter((s) => s !== 'skin'), 'sball'].map((s) => `<div class="carousel"><h4>${SLOT_NAMES[s]}</h4><div class="strip">${
        ITEMS.filter((i) => i.slot === s && i.id !== 'sb_none').map((i) => `<div class="item"><img alt="" src="${thumbnail(i)}"><b>${esc(i.name)}</b>${status(i)}<button data-try="${i.id}">Try on</button></div>`).join('')
      }</div></div>`).join('');
    });
  }
  $('#carousels').addEventListener('click', (e) => {
    const b = e.target.closest('[data-try]'); if (!b) return;
    const it = BY_ID.get(b.dataset.try); state.slot = it.slot;
    state.draft = { name: app.me.n, a: it.slot === 'sball' ? withSpecial({ ...app.me.a }, state.sbSlot, it.id) : { ...app.me.a, [it.slot]: it.id } };
    show('avatar');
  });

  // ---------- avatar editor
  function renderAvatar() {
    const d = state.draft, lvl = app.profile ? app.profile.level : 1;
    $('#avwho').textContent = app.profile ? (app.profile.wallet ? `Bound to wallet ${short(app.profile.wallet)}` : 'Bound to your email account') : 'Guest · sign in to keep your look';
    const nm = $('#avname'); if (document.activeElement !== nm) nm.value = d.name;
    $('#avslots').innerHTML = [...SLOTS, 'sball'].map((s) => `<button role="tab" data-slot="${s}" aria-selected="${s === state.slot}">${SLOT_NAMES[s]}</button>`).join('');
    const sb = state.slot === 'sball', open = levelInfo(lvl).sb, sbBox = $('#avsb'); sbBox.hidden = !sb;
    if (sb) { if (SB_SLOTS.indexOf(state.sbSlot) >= open) state.sbSlot = 'sb1';
      sbBox.innerHTML = SB_SLOTS.map((s, i) => { const it = BY_ID.get(d.a[s] || 'sb_none'), lockedAt = i < open ? 0 : Object.keys(LEVELS).find((L) => LEVELS[L].sb > i);
        return `<button type="button" data-sbslot="${s}" aria-pressed="${state.sbSlot === s}" ${lockedAt ? 'disabled' : ''}><b>SB${i + 1}</b>${lockedAt ? 'Opens at level ' + lockedAt : esc(it.id === 'sb_none' ? 'Empty' : it.name)}</button>`; }).join(''); }
    $('#avgrid').innerHTML = ITEMS.filter((i) => i.slot === state.slot).map((i) => {
      const ok = usable(i, lvl, state.owned), on = sb ? d.a[state.sbSlot] === i.id : d.a[i.slot] === i.id, S = SPECIALS[i.special];
      if (sb) return `<button class="pick ${ok ? '' : 'locked'}" data-pick="${i.id}" aria-pressed="${on}" title="${S ? esc(S.note) : 'Leave this slot empty'}"><img alt="" src="${thumbnail(i)}">${esc(i.name)}<small>${!ok ? '$' + i.price.toFixed(2) + ' in Store' : S ? (S.cost === 'all' ? 'uses all' : 'uses ' + S.cost) + (S.minLevel && lvl < S.minLevel ? ' · level ' + S.minLevel : '') : 'empty slot'}</small></button>`;
      return `<button class="pick ${ok ? '' : 'locked'}" data-pick="${i.id}" aria-pressed="${on}"><img alt="" src="${thumbnail(i)}">${esc(i.name)}<small>${ok ? 'Unlocked' : i.price != null ? '$' + i.price.toFixed(2) + ' in Store' : 'Level ' + i.level}</small></button>`;
    }).join('');
    const blocked = [...SLOTS, ...SB_SLOTS].map((s) => BY_ID.get(d.a[s] || 'sb_none')).filter((i) => !usable(i, lvl, state.owned));
    const pl = progressLine(app.profile || { level: 1, xp: 0 });
    $('#avlevel').innerHTML = `Level ${pl.level}<div class="bar"><div style="width:${pl.max ? 100 : Math.round((pl.xp / pl.need) * 100)}%"></div></div>${app.profile ? pl.text : 'Sign in to keep your level.'}`;
    const save = $('#avsave');
    save.disabled = blocked.length > 0;
    save.textContent = app.profile ? 'Save look' : 'Save on this device';
    if (blocked.length) $('#avmsg').textContent = `Previewing: ${blocked.map((i) => i.name).join(', ')} isn't unlocked yet.`;
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
    if (it.slot === 'sball') withSpecial(state.draft.a, state.sbSlot, it.id); else state.draft.a[it.slot] = it.id; $('#avmsg').textContent = ''; renderAvatar(); });
  $('#avsb').addEventListener('click', (e) => { const b = e.target.closest('[data-sbslot]'); if (!b || b.disabled) return; state.sbSlot = b.dataset.sbslot; renderAvatar(); });
  $('#avname').addEventListener('input', (e) => { state.draft.name = e.target.value; });
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
