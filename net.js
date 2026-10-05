// Room connections for Santa Hat Legends (Snowball Square).
// Supabase Realtime in production; a same-computer BroadcastChannel stand-in for testing (?net=local).
// Message plan (Supabase counts every delivery): the host sends snapshots on the room channel;
// each player sends their moves on their own channel, which only the host listens to.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { humanToken, resetHumanCheck } from './human.js?v=555bd3a989';

const SB_URL = 'https://olganobdypnxfpmsxibe.supabase.co';
const SB_KEY = 'sb_publishable_eLn_YYzLDOTuUAOTZLeyKQ_PLGT8B6N'; // publishable key: meant to be public

function listeners() {
  const m = new Map();
  return {
    on(ev, fn) { if (!m.has(ev)) m.set(ev, new Set()); m.get(ev).add(fn); return () => m.get(ev).delete(fn); },
    fire(ev, ...a) { for (const fn of m.get(ev) || []) { try { fn(...a); } catch (e) { console.error(e); } } },
  };
}

let client = null;
const sb = () => client || (client = createClient(SB_URL, SB_KEY, { auth: { persistSession: true, storageKey: 'sq-auth', flowType: 'pkce', detectSessionInUrl: true }, realtime: { params: { eventsPerSecond: 30 } } }));

function subscribe(ch) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timed out')), 12000);
    ch.subscribe((st, err) => {
      if (st === 'SUBSCRIBED') { clearTimeout(t); res(); }
      else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { clearTimeout(t); rej(err || new Error(st)); }
    });
  });
}

async function supabaseRoom(code, me) {
  const c = sb(), base = 'sq-' + code, L = listeners();
  let peers = [], hosting = false;
  const hostChans = new Map();
  const main = c.channel(base, { config: { broadcast: { self: false }, presence: { key: me.id } } });
  main.on('presence', { event: 'sync' }, () => {
    const st = main.presenceState();
    peers = Object.entries(st).map(([id, metas]) => ({ id, n: String(metas?.[0]?.n ?? '').slice(0, 14), j: Number(metas?.[0]?.j) || 0, a: metas?.[0]?.a, w: !!metas?.[0]?.w, l: Number(metas?.[0]?.l) || 1, pid: /^[0-9a-f-]{36}$/.test(String(metas?.[0]?.pid)) ? metas[0].pid : null }));
    L.fire('peers', peers); refreshHostChans();
  });
  main.on('broadcast', { event: 'snap' }, ({ payload }) => L.fire('snap', payload));
  main.on('broadcast', { event: 'emote' }, ({ payload }) => L.fire('emote', payload));
  const mine = c.channel(base + '-u-' + me.id, { config: { broadcast: { self: false } } });
  try {
    await subscribe(main);
    await main.track({ n: me.n, j: me.j, a: me.a, w: me.w ? 1 : 0, l: me.l || 1, pid: me.pid || null });
    await subscribe(mine);
  } catch (e) { // don't leave the client retrying in the background
    c.removeChannel(main); c.removeChannel(mine); throw e;
  }

  function refreshHostChans() {
    const want = hosting ? new Set(peers.map((p) => p.id).filter((id) => id !== me.id)) : new Set();
    for (const [id, ch] of hostChans) if (!want.has(id)) { c.removeChannel(ch); hostChans.delete(id); }
    for (const id of want) {
      if (hostChans.has(id)) continue;
      const ch = c.channel(base + '-u-' + id, { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'rep' }, ({ payload }) => L.fire('rep', id, payload));
      ch.subscribe(); hostChans.set(id, ch);
    }
  }
  const send = (ch, event, payload) => ch.send({ type: 'broadcast', event, payload }).catch(() => {});
  return {
    kind: 'online',
    peers: () => peers, on: L.on,
    sendSnap: (s) => send(main, 'snap', s),
    sendRep: (r) => send(mine, 'rep', r),
    sendEmote: (e) => send(main, 'emote', e),
    setHost(v) { hosting = v; refreshHostChans(); },
    leave() { hosting = false; refreshHostChans(); c.removeChannel(main); c.removeChannel(mine); },
  };
}

// Same-computer stand-in: every tab of this page on this browser shares the room.
async function localRoom(code, me) {
  const bc = new BroadcastChannel('sq-local-' + code), L = listeners(), seen = new Map();
  let hosting = false, peers = [{ ...me }];
  const post = (m) => bc.postMessage(m);
  const recompute = () => {
    const now = Date.now();
    for (const [id, p] of seen) if (now - p.at > 3500) seen.delete(id);
    peers = [{ id: me.id, n: me.n, j: me.j, a: me.a, w: !!me.w, l: me.l || 1, pid: me.pid || null }, ...[...seen.values()].map(({ id, n, j, a, w, l, pid }) => ({ id, n, j, a, w: !!w, l: Number(l) || 1, pid: pid || null }))];
    L.fire('peers', peers);
  };
  bc.onmessage = ({ data: m }) => {
    if (m.k === 'hi') { const had = seen.has(m.p.id); seen.set(m.p.id, { ...m.p, at: Date.now() }); if (!had) { post({ k: 'hi', p: me }); recompute(); } }
    else if (m.k === 'bye') { seen.delete(m.id); recompute(); }
    else if (m.k === 'snap') L.fire('snap', m.d);
    else if (m.k === 'emote') L.fire('emote', m.d);
    else if (m.k === 'rep' && hosting) L.fire('rep', m.from, m.d);
  };
  const beat = setInterval(() => { post({ k: 'hi', p: me }); recompute(); }, 1000);
  post({ k: 'hi', p: me });
  await new Promise((r) => setTimeout(r, 300)); recompute();
  return {
    kind: 'local',
    peers: () => peers, on: L.on,
    sendSnap: (s) => post({ k: 'snap', d: s }),
    sendRep: (r) => post({ k: 'rep', from: me.id, d: r }),
    sendEmote: (e) => post({ k: 'emote', d: e }),
    setHost(v) { hosting = v; },
    leave() { clearInterval(beat); post({ k: 'bye', id: me.id }); bc.close(); },
  };
}

// Our own referee server (server/referee.js on the Droplet): it runs the match; this page only sends moves and draws its
// snapshots, so it never becomes the referee (kind 'server': online.js skips the hand-off election). Resolves once the
// server has let us in; rejects with the server's reason (room full, too many watchers…). 'gone' fires if the line drops.
// token: the player's Supabase sign-in, so the server uses their SAVED level and look (and records their finishes).
// ranked: search for a ranked game instead of joining a code (the server picks the room and holds a ticket).
// auto: what's ticked for Auto match ({ modes: ['ffa', 'team'], styles: ['normal', 'gear'] }): the server picks the best room.
function refereeRoom(url, code, me, token, ranked = false, auto = null) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url), L = listeners();
    let peers = [], own = null, joined = false, left = false, at = code;
    const send = (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
    const t = setTimeout(() => { if (!joined) { left = true; ws.close(); reject(new Error('timed out')); } }, 12000);
    ws.onopen = () => send({ t: ranked ? 'ranked' : auto ? 'auto' : 'join', code, ...(auto ? { modes: auto.modes, styles: auto.styles } : {}), ...(token ? { token } : {}), me: { id: me.id, n: me.n, j: me.j, a: me.a, w: !!me.w, l: me.l || 1, pid: me.pid || null } });
    ws.onmessage = ({ data }) => {
      let m; try { m = JSON.parse(data); } catch { return; }
      if (m.t === 'peers') {
        peers = (m.ps || []).map((p) => ({ id: p.id, n: String(p.n ?? '').slice(0, 14), j: Number(p.j) || 0, a: p.a, w: !!p.w, l: Number(p.l) || 1, pid: p.pid || null }));
        own = m.own || null; if (typeof m.code === 'string') at = m.code; L.fire('peers', peers);
        if (!joined) { joined = true; clearTimeout(t); resolve(api); }
      } else if (m.t === 'snap') L.fire('snap', m.d);
      else if (m.t === 'emote') L.fire('emote', m.d);
      else if (m.t === 'counted') L.fire('counted', m.d); // my Auto match finish, recorded by the server
      else if (m.t === 'rank') L.fire('rank', m.d); // my ranked points change
      else if (m.t === 'closed') { left = true; L.fire('closed', m.why); } // the server closed the room (a ranked match is over)
      else if (m.t === 'goto') L.fire('goto', m.code); // Auto match together: the group's seats are held in this public room
      else if (m.t === 'err' && joined) L.fire('err', m.why); // a refusal while in the room (e.g. Auto match together)
      else if (m.t === 'err' && !joined) { left = true; clearTimeout(t); ws.close(); const e = new Error(m.why); e.why = m.why; reject(e); }
    };
    ws.onclose = () => { if (!joined) { clearTimeout(t); if (!left) reject(new Error('closed')); } else if (!left) L.fire('gone'); };
    const api = {
      kind: 'server',
      peers: () => peers, on: L.on,
      owner: () => own, code: () => at, // the room the server put us in (ranked: its pick) // the room's controls (mode, Start) belong to the earliest player still in it, by the server's clock
      start: () => send({ t: 'start' }), mode: (mode) => send({ t: 'mode', mode }),
      together: (modes, styles) => send({ t: 'together', modes, styles }), // the host takes the friends' room into a public Auto match
      sendSnap() {}, setHost() {}, // the server is the referee
      sendRep: (r) => send({ t: 'rep', d: r }),
      sendEmote: (e) => send({ t: 'emote', d: e }),
      leave() { left = true; ws.close(); },
    };
  });
}
function refereeBoard(url) {
  const fns = new Set(); let ws = null, list = [];
  function open() {
    if (ws) return;
    ws = new WebSocket(url);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'board' }));
    ws.onmessage = ({ data }) => { try { const m = JSON.parse(data); if (m.t === 'board' && Array.isArray(m.games)) { list = m.games; fns.forEach((f) => f(list)); } } catch {} };
    ws.onclose = () => { ws = null; if (fns.size) setTimeout(open, 3000); }; // keep the lobby list alive while someone looks at it
  }
  return {
    async watch(fn) { fns.add(fn); open(); fn(list); return () => { fns.delete(fn); if (!fns.size && ws) { const w = ws; ws = null; w.onclose = null; w.close(); } }; },
    async publish() {}, async unpublish() {}, // the server makes the list itself
  };
}

// ---------- live games board: each running room's referee posts a short summary here
// (players, round, time, leader) so lobbies can list games and offer Watch now.
function supabaseBoard() {
  const c = sb(), fns = new Set();
  let ch = null, ready = null, publishing = false;
  const list = () => (ch ? Object.values(ch.presenceState()).map((m) => m?.[0]).filter((g) => g && typeof g.code === 'string') : []);
  function open() {
    if (ready) return ready;
    ch = c.channel('sq-games', { config: { presence: { key: 'g' + Math.random().toString(36).slice(2, 12) } } });
    ch.on('presence', { event: 'sync' }, () => { const l = list(); fns.forEach((f) => f(l)); });
    ready = subscribe(ch).catch((e) => { c.removeChannel(ch); ch = null; ready = null; throw e; });
    return ready;
  }
  function maybeClose() { if (ch && !fns.size && !publishing) { c.removeChannel(ch); ch = null; ready = null; } }
  return {
    async watch(fn) { fns.add(fn); await open(); fn(list()); return () => { fns.delete(fn); maybeClose(); }; },
    async publish(summary) { publishing = true; await open(); await ch.track(summary); },
    async unpublish() { publishing = false; if (ch) { try { await ch.untrack(); } catch {} } maybeClose(); },
  };
}

function localBoard() {
  const bc = new BroadcastChannel('sq-local-games'), seen = new Map(), fns = new Set();
  let mine = null;
  const list = () => { const now = Date.now(); for (const [k, g] of seen) if (now - g.at > 8000) seen.delete(k); return [...seen.values()].map(({ at, ...g }) => g); };
  const emit = () => { const l = list(); fns.forEach((f) => f(l)); };
  bc.onmessage = ({ data: m }) => { if (m.k === 'game') { seen.set(m.g.code, { ...m.g, at: Date.now() }); emit(); } else if (m.k === 'gone') { seen.delete(m.code); emit(); } else if (m.k === 'ask' && mine) bc.postMessage({ k: 'game', g: mine }); };
  setInterval(() => { if (mine) bc.postMessage({ k: 'game', g: mine }); emit(); }, 2000);
  return {
    async watch(fn) { fns.add(fn); bc.postMessage({ k: 'ask' }); fn(list()); return () => fns.delete(fn); },
    async publish(summary) { mine = summary; seen.set(summary.code, { ...summary, at: Date.now() }); bc.postMessage({ k: 'game', g: summary }); },
    async unpublish() { if (mine) bc.postMessage({ k: 'gone', code: mine.code }); if (mine) seen.delete(mine.code); mine = null; },
  };
}

let board = null;
export function gamesBoard({ local = false, referee = null } = {}) { return board || (board = referee ? refereeBoard(referee) : local ? localBoard() : supabaseBoard()); }

// referee: the referee server's address (wss://…); when set, every room runs there instead of in a player's page.
export function openRoom(code, me, { local = false, referee = null, token = null, ranked = false, auto = null } = {}) {
  return referee ? refereeRoom(referee, code, me, token, ranked, auto) : local ? localRoom(code, me) : supabaseRoom(code, me);
}

// ---------- accounts: Solana wallet sign-in (Supabase Web3 auth) and profiles
const STATEMENT = 'Sign in to Santa Hat Legends. This only proves you own this wallet: it sends no transaction and costs nothing.';
export const findWallet = () => window.phantom?.solana || window.solflare || window.backpack?.solana || window.solana || null;

function remoteAccounts() {
  const c = sb();
  const rpc = async (fn, args) => { const { data, error } = await c.rpc(fn, args); if (error) throw new Error(error.message); return data; };
  return {
    async session() { const { data } = await c.auth.getSession(); return data.session; },
    async signIn() {
      const wallet = findWallet(); if (!wallet) throw new Error('NO_WALLET');
      if (!wallet.isConnected && wallet.connect) await wallet.connect();
      // the "are you human?" token (human.js; none while it's off), used once
      const captchaToken = await humanToken();
      const { error } = await c.auth.signInWithWeb3({ chain: 'solana', statement: STATEMENT, wallet, ...(captchaToken ? { options: { captchaToken } } : {}) }).finally(resetHumanCheck);
      if (error) throw new Error(error.message);
      return true; // the caller loads the profile, or redeems a pending link code instead
    },
    logins: () => rpc('my_logins'),
    createLinkCode: (want) => rpc('create_link_code', { p_want: want }),
    redeem: (code) => rpc('redeem_link_code', { p_code: code }),
    async signInEmail(email) {
      const captchaToken = await humanToken();
      const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true, ...(captchaToken ? { captchaToken } : {}) } }).finally(resetHumanCheck);
      if (error) throw new Error(error.message);
      return null; // finishes when they tap the link in their email and land back here (or type its code: verifyEmailCode)
    },
    // The 8-digit code from the same email (Cody, 2026-10-02): a phone's mail app opens links in its own browser, which signs the
    // player in THERE, not where they play; typing the code signs them in right here instead.
    async verifyEmailCode(email, code) {
      const { error } = await c.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error) throw new Error(/expired|invalid/i.test(error.message) ? 'That code is wrong or has expired. Ask for a new email.' : error.message);
      return true;
    },
    profile: () => rpc('ensure_profile'),
    save: (name, avatar) => rpc('save_profile', { p_name: name, p_avatar: avatar }),
    async inventory() { const { data, error } = await c.from('inventory').select('item_id'); if (error) throw new Error(error.message); return data.map((r) => r.item_id); },
    // since (a time): the Today / This week boards, points GAINED since then (supabase/019 ranked_board); none: all time.
    async leaderboard(since) {
      if (since) {
        const { data, error } = await c.rpc('ranked_board', { p_since: new Date(since).toISOString() });
        if (error) throw new Error(error.message); return data.map((r) => ({ name: r.name, wallet: r.wallet, level: r.level, rank_points: r.points, matches: r.matches }));
      }
      const { data, error } = await c.from('profiles').select('name, wallet, avatar, level, rank_points').order('rank_points', { ascending: false }).order('created_at').limit(50);
      if (error) throw new Error(error.message); return data;
    },
    async signOut() { await c.auth.signOut(); },
  };
}

// Same-computer stand-in for tests: pretend wallet/email logins and a local "database"
// that applies the same save and linking rules as the real one.
function localAccounts(rules) {
  const key = 'sq-local-db';
  const get = () => { try { return JSON.parse(localStorage.getItem(key)) || { profiles: {}, logins: {}, codes: {}, inv: {} }; } catch { return { profiles: {}, logins: {}, codes: {}, inv: {} }; } };
  const put = (v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} };
  let me = null; try { me = sessionStorage.getItem('sq-local-me'); } catch {}
  const setMe = (v) => { me = v; try { v ? sessionStorage.setItem('sq-local-me', v) : sessionStorage.removeItem('sq-local-me'); } catch {} };
  const kind = () => (me && me.startsWith('email:') ? 'email' : 'wallet');
  const walletOf = () => (kind() === 'wallet' ? me.slice(7) : null);
  const kindsOf = (db, pid) => Object.values(db.logins).filter((l) => l.pid === pid).map((l) => l.kind).sort();
  return {
    async session() { return me ? { user: { id: me } } : null; },
    async signIn() { setMe('wallet:' + (window.__testWallet || 'LocaLWa11et' + Math.random().toString(36).slice(2, 10).replace(/[0lIO]/g, 'x') + 'zzzzzzzzzzzzzz')); return true; },
    async signInEmail(email) { setMe('email:' + email.toLowerCase()); return true; },
    async verifyEmailCode(email) { setMe('email:' + email.toLowerCase()); return true; }, // this computer's stand-in: any code works
    async profile() {
      if (!me) throw new Error('Sign in first');
      const db = get(); const l = db.logins[me];
      if (l) return db.profiles[l.pid];
      const pid = 'p' + Math.random().toString(36).slice(2, 10), w = walletOf();
      db.profiles[pid] = { id: pid, wallet: w, name: 'Player ' + (w ? w.slice(0, 4) : String(1000 + Object.keys(db.profiles).length)), avatar: rules.DEFAULT_AVATAR, level: 1, xp: 0, rank_points: 0 };
      db.logins[me] = { pid, kind: kind() }; put(db); return db.profiles[pid];
    },
    async save(name, avatar) {
      const db = get(), l = db.logins[me], p = l && db.profiles[l.pid]; if (!p) throw new Error('No profile yet');
      const n = String(name || '').replace(/[\u0000-\u001f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 14);
      if (!n) throw new Error("Name can't be empty");
      const owned = new Set(db.inv[l.pid] || []), clean = {};
      for (const s of rules.SLOTS) { const it = rules.BY_ID.get(avatar?.[s]); if (!it || it.slot !== s || !rules.usable(it, p.level, owned)) throw new Error(`Item "${avatar?.[s]}" isn't unlocked for ${s}`); clean[s] = it.id; }
      // special snowball slots, same rules as the database (012): owned specials only, no special in two slots, empty = sb_none
      for (const s of rules.SB_SLOTS || []) { const id = avatar?.[s] ?? 'sb_none', it = rules.BY_ID.get(id);
        if (!it || it.slot !== 'sball' || !rules.usable(it, p.level, owned)) throw new Error(`Special snowball "${id}" isn't unlocked`);
        if (id !== 'sb_none' && Object.values(clean).includes(id)) throw new Error('The same special snowball can\x27t fill two slots'); clean[s] = id; }
      // gear slots, same rules as the database (015 save_profile): owned gear only, the same gear not in both, the 2nd slot from
      // level 8, the Santa Costume from level 3, and no two gear boosting the same stat (Cody: "Can't stack same stat"; gear.js
      // statOf). Not mirrored: the 7-day wear clock (the database takes worn-out gear off; this stand-in has no clock).
      const stats = [];
      for (const s of rules.GEAR_SLOTS || []) { const id = avatar?.[s] ?? 'gear_none', it = rules.BY_ID.get(id);
        if (!it || it.slot !== 'gear' || !rules.usable(it, p.level, owned)) throw new Error(`Gear "${id}" isn't unlocked`);
        if (id !== 'gear_none') {
          if (s === 'g2' && p.level < 8) throw new Error('The second gear slot opens at level 8');
          if (it.gear === 'santa' && p.level < 3) throw new Error('The Santa Costume is worn from level 3');
          if (Object.values(clean).includes(id)) throw new Error('The same gear can\x27t fill two slots');
          const st = rules.statOf(it.gear); if (st && stats.includes(st)) throw new Error('Two gear can\x27t boost the same stat');
          if (st) stats.push(st);
        }
        clean[s] = id; }
      p.name = n; p.avatar = clean; put(db); return p;
    },
    async logins() { const db = get(), l = db.logins[me]; return l ? kindsOf(db, l.pid) : []; },
    async createLinkCode(want) {
      const db = get(), l = db.logins[me]; if (!l) throw new Error('Sign in first');
      if (kindsOf(db, l.pid).includes(want)) throw new Error('This account already has a linked ' + want);
      const code = Math.random().toString(16).slice(2, 12).toUpperCase().padEnd(10, '0');
      db.codes[code] = { pid: l.pid, want, exp: Date.now() + 15 * 60e3, used: false }; put(db); return code;
    },
    async redeem(raw) {
      const db = get(), code = String(raw || '').trim().toUpperCase(), c = db.codes[code];
      if (!me) throw new Error('Sign in first');
      if (!c || c.used || c.exp < Date.now()) throw new Error('That link code is wrong or has expired. Make a new one.');
      if (kind() !== c.want) throw new Error(`This code links a ${c.want}: sign in with a ${c.want} to use it`);
      const mine = db.logins[me]?.pid;
      if (mine === c.pid) return db.profiles[mine];
      if (kindsOf(db, c.pid).includes(kind())) throw new Error('That account already has a linked ' + kind());
      if (mine) {
        const old = db.profiles[mine];
        if (old.rank_points || old.xp || old.level > 1 || (db.inv[mine] || []).length) throw new Error(`This ${kind()} already has its own account with progress, so linking would erase it.`);
        delete db.profiles[mine];
      }
      db.logins[me] = { pid: c.pid, kind: kind() };
      if (kind() === 'wallet') db.profiles[c.pid].wallet = walletOf();
      c.used = true; put(db); return db.profiles[c.pid];
    },
    async inventory() { const db = get(), l = db.logins[me]; return l ? db.inv[l.pid] || [] : []; },
    async leaderboard(since) { return since ? [] : Object.values(get().profiles).sort((a, b) => b.rank_points - a.rank_points); }, // no ranked matches on this computer
    async signOut() { setMe(null); },
  };
}

export function accounts({ local = false, rules } = {}) { return local ? localAccounts(rules) : remoteAccounts(); }
