// Room connections for Snowball Square Online.
// Supabase Realtime in production; a same-computer BroadcastChannel stand-in for testing (?net=local).
// Message plan (Supabase counts every delivery): the host sends snapshots on the room channel;
// each player sends their moves on their own channel, which only the host listens to.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';

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
    peers = Object.entries(st).map(([id, metas]) => ({ id, n: String(metas?.[0]?.n ?? '').slice(0, 14), j: Number(metas?.[0]?.j) || 0, a: metas?.[0]?.a }));
    L.fire('peers', peers); refreshHostChans();
  });
  main.on('broadcast', { event: 'snap' }, ({ payload }) => L.fire('snap', payload));
  main.on('broadcast', { event: 'emote' }, ({ payload }) => L.fire('emote', payload));
  const mine = c.channel(base + '-u-' + me.id, { config: { broadcast: { self: false } } });
  try {
    await subscribe(main);
    await main.track({ n: me.n, j: me.j, a: me.a });
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
    peers = [{ id: me.id, n: me.n, j: me.j, a: me.a }, ...[...seen.values()].map(({ id, n, j, a }) => ({ id, n, j, a }))];
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

export function openRoom(code, me, { local = false } = {}) {
  return local ? localRoom(code, me) : supabaseRoom(code, me);
}

// ---------- accounts: Solana wallet sign-in (Supabase Web3 auth) and profiles
const STATEMENT = 'Sign in to Snowball Square. This only proves you own this wallet: it sends no transaction and costs nothing.';
export const findWallet = () => window.phantom?.solana || window.solflare || window.backpack?.solana || window.solana || null;

function remoteAccounts() {
  const c = sb();
  const rpc = async (fn, args) => { const { data, error } = await c.rpc(fn, args); if (error) throw new Error(error.message); return data; };
  return {
    async session() { const { data } = await c.auth.getSession(); return data.session; },
    async signIn() {
      const wallet = findWallet(); if (!wallet) throw new Error('NO_WALLET');
      if (!wallet.isConnected && wallet.connect) await wallet.connect();
      const { error } = await c.auth.signInWithWeb3({ chain: 'solana', statement: STATEMENT, wallet });
      if (error) throw new Error(error.message);
      return rpc('ensure_profile');
    },
    async signInEmail(email) {
      const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } });
      if (error) throw new Error(error.message);
      return null; // finishes when they tap the link in their email and land back here
    },
    profile: () => rpc('ensure_profile'),
    save: (name, avatar) => rpc('save_profile', { p_name: name, p_avatar: avatar }),
    async inventory() { const { data, error } = await c.from('inventory').select('item_id'); if (error) throw new Error(error.message); return data.map((r) => r.item_id); },
    async leaderboard() {
      const { data, error } = await c.from('profiles').select('name, wallet, avatar, level, rank_points').order('rank_points', { ascending: false }).order('created_at').limit(50);
      if (error) throw new Error(error.message); return data;
    },
    async signOut() { await c.auth.signOut(); },
  };
}

// Same-computer stand-in for tests: a pretend wallet and a local "database" that applies the same save rules.
function localAccounts(rules) {
  const key = 'sq-local-accounts', get = () => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } };
  const put = (v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} };
  let me = null; try { me = sessionStorage.getItem('sq-local-me'); } catch {}
  return {
    async session() { return me ? { user: { id: me } } : null; },
    async signIn() {
      me = 'Loca1Wa11et' + Math.random().toString(36).slice(2, 10).replace(/[0lI]/g, 'x') + 'zzzzzzzzzzzzzzzz'.slice(0, 16);
      try { sessionStorage.setItem('sq-local-me', me); } catch {}
      return this.profile();
    },
    async signInEmail(email) {
      me = 'email:' + email; try { sessionStorage.setItem('sq-local-me', me); } catch {}
      return this.profile();
    },
    async profile() {
      if (!me) throw new Error('Sign in first');
      const isEmail = me.startsWith('email:');
      const db = get(); db[me] ||= { wallet: isEmail ? null : me, name: 'Player ' + (isEmail ? String(1000 + Object.keys(db).length) : me.slice(0, 4)), avatar: rules.DEFAULT_AVATAR, level: 1, xp: 0, rank_points: 0 }; put(db); return db[me];
    },
    async save(name, avatar) {
      const db = get(), p = db[me]; if (!p) throw new Error('No profile yet');
      const n = String(name || '').replace(/[\u0000-\u001f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 14);
      if (!n) throw new Error("Name can't be empty");
      const clean = {};
      for (const s of rules.SLOTS) { const it = rules.BY_ID.get(avatar?.[s]); if (!it || it.slot !== s || !rules.usable(it, p.level)) throw new Error(`Item "${avatar?.[s]}" isn't unlocked for ${s}`); clean[s] = it.id; }
      p.name = n; p.avatar = clean; put(db); return p;
    },
    async inventory() { return []; },
    async leaderboard() { return Object.values(get()).sort((a, b) => b.rank_points - a.rank_points); },
    async signOut() { me = null; try { sessionStorage.removeItem('sq-local-me'); } catch {} },
  };
}

export function accounts({ local = false, rules } = {}) { return local ? localAccounts(rules) : remoteAccounts(); }
