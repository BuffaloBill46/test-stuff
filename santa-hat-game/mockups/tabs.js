// Site tabs: Play / Store / Avatar / Ranks, wallet sign-in, avatar editor, leaderboard.
import { THREE, character, lights, toon, part, build, hatGeo } from './kit.js';
import { ITEMS, BY_ID, SLOTS, SLOT_NAMES, DEFAULT_AVATAR, cleanAvatar, usable } from './catalog.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const short = (w) => (w ? w.slice(0, 4) + '…' + w.slice(-4) : '');
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

// ---------- item thumbnails: each item rendered once on the real model, cached as an image
let thumbR = null;
const thumbs = new Map();
function thumbnail(item) {
  if (thumbs.has(item.id)) return thumbs.get(item.id);
  if (!thumbR) { thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); thumbR.setSize(160, 160, false); }
  const scene = new THREE.Scene(); lights(scene, { hemi: 1.7, moonI: 1.6 });
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  if (item.slot === 'snow') {
    const ball = new THREE.Mesh(build([part(new THREE.IcosahedronGeometry(0.5, 1), item.color, { jit: 0.04 })]), new THREE.MeshToonMaterial({ vertexColors: true }));
    scene.add(ball); cam.position.set(0.4, 0.5, 2.4); cam.lookAt(0, 0, 0);
  } else {
    const a = { ...DEFAULT_AVATAR, [item.slot]: item.id };
    const ch = avatarCharacter(a); ch.rotation.y = -0.35; scene.add(ch);
    if (item.slot === 'face' || item.slot === 'skin') { const h = toon(hatGeo({ scale: 0.88 }), 0.03); h.position.y = 2.05; h.rotation.y = Math.PI / 2 - 0.35; scene.add(h); cam.position.set(0, 1.92, 1.75); cam.lookAt(0, 1.86, 0); }
    else if (item.slot === 'pants') { cam.position.set(0, 0.9, 3.4); cam.lookAt(0, 0.65, 0); }
    else { cam.position.set(0, 1.5, 3.6); cam.lookAt(0, 1.25, 0); }
  }
  thumbR.render(scene, cam);
  const url = thumbR.domElement.toDataURL('image/png');
  scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  thumbs.set(item.id, url); return url;
}

export function avatarCharacter(a, extra = {}) {
  const av = cleanAvatar(a), get = (s) => BY_ID.get(av[s]);
  return character({ shirt: extra.shirt ?? get('shirt').color, pants: get('pants').color, skin: get('skin').color, face: get('face').face, seed: 3, ...extra });
}

export function initTabs(app) {
  const state = { tab: 'play', slot: 'shirt', draft: null, owned: new Set(), board: null };

  // ---------- tabs
  function show(tab) {
    if (!['play', 'store', 'avatar', 'ranks'].includes(tab)) tab = 'play';
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
    app.profile = p; app.setIdentity(p.name, cleanAvatar(p.avatar));
    try { state.owned = new Set(await app.accounts.inventory()); } catch { state.owned = new Set(); }
    renderWho(); if (state.tab === 'avatar') { state.draft = { name: p.name, a: cleanAvatar(p.avatar) }; renderAvatar(); }
    if (state.tab === 'ranks') renderRanks();
    if (state.tab === 'store') renderStore(true);
  }
  // ---------- sign-in sheet: wallet (can buy) or email (plays and ranks, can't buy)
  const acctMsg = (t) => { $('#acctMsg').textContent = t; };
  function openAcct() {
    const p = app.profile;
    $('#acctOut').hidden = !!p; $('#acctIn').hidden = !p; acctMsg('');
    if (p) {
      $('#acctIn').innerHTML = `<div class="eyebrow">Signed in</div><h2>${esc(p.name)}</h2>
        <p>${p.wallet ? `Wallet <b>${esc(short(p.wallet))}</b>. Your avatar is bound to this wallet.` : 'Email account. Your avatar is bound to this email. Buying items needs a wallet sign-in.'}</p>
        <button class="sec" id="signOut">Sign out</button>`;
      $('#signOut').addEventListener('click', async () => {
        await app.accounts.signOut(); app.profile = null; state.owned = new Set();
        app.setIdentity(store.get('sq_name') || app.me.n, cleanAvatar(safeJSON(store.get('sq_avatar'))));
        renderWho(); $('#acct').hidden = true; show(state.tab);
      });
    }
    $('#acct').hidden = false;
  }
  $('#signin').addEventListener('click', openAcct);
  $('#acctClose').addEventListener('click', () => { $('#acct').hidden = true; });
  $('#walletBtn').addEventListener('click', async () => {
    const btn = $('#walletBtn'); btn.disabled = true; acctMsg('Check your wallet to approve the sign-in…');
    try { await afterSignIn(await app.accounts.signIn()); $('#acct').hidden = true; }
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
      const p = await app.accounts.signInEmail(email);
      if (p) { await afterSignIn(p); $('#acct').hidden = true; }
      else acctMsg(`Sent. Open the link in the email to ${email} on this device to finish signing in.`);
    } catch (e) { acctMsg(`Couldn't send the email: ${e.message}`); }
    finally { btn.disabled = false; }
  });
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
  function renderStore(force) {
    if (storeDrawn && !force) return; storeDrawn = true;
    const box = $('#carousels'); box.innerHTML = '<p class="dim">Wrapping presents…</p>';
    requestAnimationFrame(() => {
      box.innerHTML = SLOTS.filter((s) => s !== 'skin').map((s) => `<div class="carousel"><h4>${SLOT_NAMES[s]}</h4><div class="strip">${
        ITEMS.filter((i) => i.slot === s).map((i) => `<div class="item"><img alt="" src="${thumbnail(i)}"><b>${esc(i.name)}</b>${status(i)}<button data-try="${i.id}">Try on</button></div>`).join('')
      }</div></div>`).join('');
    });
  }
  $('#carousels').addEventListener('click', (e) => {
    const b = e.target.closest('[data-try]'); if (!b) return;
    const it = BY_ID.get(b.dataset.try); state.slot = it.slot;
    state.draft = { name: app.me.n, a: { ...app.me.a, [it.slot]: it.id } };
    show('avatar');
  });

  // ---------- avatar editor
  function renderAvatar() {
    const d = state.draft, lvl = app.profile ? app.profile.level : 1;
    $('#avwho').textContent = app.profile ? (app.profile.wallet ? `Bound to wallet ${short(app.profile.wallet)}` : 'Bound to your email account') : 'Guest · sign in to keep your look';
    const nm = $('#avname'); if (document.activeElement !== nm) nm.value = d.name;
    $('#avslots').innerHTML = SLOTS.map((s) => `<button role="tab" data-slot="${s}" aria-selected="${s === state.slot}">${SLOT_NAMES[s]}</button>`).join('');
    $('#avgrid').innerHTML = ITEMS.filter((i) => i.slot === state.slot).map((i) => {
      const ok = usable(i, lvl, state.owned);
      return `<button class="pick ${ok ? '' : 'locked'}" data-pick="${i.id}" aria-pressed="${d.a[i.slot] === i.id}"><img alt="" src="${thumbnail(i)}">${esc(i.name)}<small>${ok ? 'Unlocked' : i.price != null ? '$' + i.price.toFixed(2) + ' in Store' : 'Level ' + i.level}</small></button>`;
    }).join('');
    const blocked = SLOTS.map((s) => BY_ID.get(d.a[s])).filter((i) => !usable(i, lvl, state.owned));
    $('#avlevel').innerHTML = `Level ${lvl}<div class="bar"><div style="width:${app.profile ? Math.min(100, (app.profile.xp % 100)) : 0}%"></div></div>Match XP starts counting when ranked opens.`;
    const save = $('#avsave');
    save.disabled = blocked.length > 0;
    save.textContent = app.profile ? 'Save look' : 'Save on this device';
    if (blocked.length) $('#avmsg').textContent = `Previewing: ${blocked.map((i) => i.name).join(', ')} isn't unlocked yet.`;
    app.preview(d.a);
  }
  $('#avslots').addEventListener('click', (e) => { const b = e.target.closest('[data-slot]'); if (b) { state.slot = b.dataset.slot; $('#avmsg').textContent = ''; renderAvatar(); } });
  $('#avgrid').addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (!b) return; const it = BY_ID.get(b.dataset.pick); state.draft.a[it.slot] = it.id; $('#avmsg').textContent = ''; renderAvatar(); });
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
      app.profile = p; app.setIdentity(p.name, cleanAvatar(p.avatar)); renderWho();
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
    try { const s = await app.accounts.session(); if (s) await afterSignIn(await app.accounts.profile()); } catch { /* signed out */ }
    renderWho();
  })();
  renderWho();
  show((location.hash || '#play').slice(1));
  return { show, get tab() { return state.tab; } };
}

function safeJSON(s) { try { return JSON.parse(s); } catch { return null; } }
