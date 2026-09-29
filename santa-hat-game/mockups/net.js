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
const sb = () => client || (client = createClient(SB_URL, SB_KEY, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 30 } } }));

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
    peers = Object.entries(st).map(([id, metas]) => ({ id, n: String(metas?.[0]?.n ?? '').slice(0, 14), j: Number(metas?.[0]?.j) || 0 }));
    L.fire('peers', peers); refreshHostChans();
  });
  main.on('broadcast', { event: 'snap' }, ({ payload }) => L.fire('snap', payload));
  main.on('broadcast', { event: 'emote' }, ({ payload }) => L.fire('emote', payload));
  await subscribe(main);
  await main.track({ n: me.n, j: me.j });
  const mine = c.channel(base + '-u-' + me.id, { config: { broadcast: { self: false } } });
  await subscribe(mine);

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
    peers = [{ id: me.id, n: me.n, j: me.j }, ...[...seen.values()].map(({ id, n, j }) => ({ id, n, j }))];
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
