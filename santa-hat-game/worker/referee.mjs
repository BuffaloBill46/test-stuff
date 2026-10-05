// The SERVER REFEREE's web door on the Droplet (rooms and rules: server/referee.js). Players' pages connect here with a
// WebSocket (a live two-way line) instead of Supabase Realtime; Caddy in front gives it https (wss://) and passes the visitor's
// address in x-forwarded-for. Settings (environment): PORT (default 8081), HOST, ORIGINS (extra allowed websites, comma-separated),
// DATABASE_URL: the referee's own limited database login (supabase/017_referee_role.sql). With it, players are who their
//   Supabase sign-in says (their SAVED level and look), and Auto match finishes are recorded here. Without it: phase-1 rooms
//   (the page's word, nothing recorded). SUPABASE_URL / SUPABASE_KEY: where sign-ins are checked (default: the game's project
//   and its publishable key, the public one already in the website).
// Run: node referee.mjs        Health check: GET /health → { rooms, players }
import http from 'node:http';
import { JSONB } from './pgjson.mjs';
import { existsSync } from 'node:fs';
import { WebSocketServer } from 'ws';
import { createReferee } from '../server/referee.js';
import { ALLOWED_ORIGINS } from '../server/http.js';
import { createLevels } from '../server/levels.js';

const PORT = Number(process.env.PORT) || 8081, TICK_MS = 1000 / 30;
const MAX_MSG = 4096, MAX_PER_SEC = 40, MAX_PER_ADDRESS = 16; // a page sends ~6 reports a second; a full lobby tab is 1 line
const origins = new Set([...ALLOWED_ORIGINS, ...(process.env.ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)]);
const okOrigin = (o) => origins.has(o) || /^http:\/\/localhost(:\d+)?$/.test(o || '');
// Only Caddy on this machine may tell us the visitor's address; anyone else is who they connected as.
const addressOf = (req) => { const direct = req.socket.remoteAddress || ''; return /^(::ffff:)?127\.0\.0\.1$|^::1$/.test(direct) ? String(req.headers['x-forwarded-for'] || direct).split(',')[0].trim() : direct; };

const SB_URL = process.env.SUPABASE_URL || 'https://olganobdypnxfpmsxibe.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY || 'sb_publishable_eLn_YYzLDOTuUAOTZLeyKQ_PLGT8B6N'; // publishable: meant to be public
let identify = null, finish = null, ranked = null, houseBots = null, tourneyDone = null;
// ADMIN_WALLETS (comma-separated, as in games.env): a signed-in player whose profile has one of these wallets is the admin, the
// only one who can make, start or call off a TOURNAMENT (Cody 2026-10-05; server/referee.js).
const ADMIN = new Set((process.env.ADMIN_WALLETS || '').split(',').map((x) => x.trim()).filter(Boolean));
// WEEKLY MODES Cody has switched on (supabase/034; the admin screen), read once a minute. Unreadable (no database, 034 not yet
// applied, a network hiccup): kept as last read, and [] at the start = every weekly mode OFF (never on by accident).
let weeklyOnList = [], readWeekly = null;
// Whether special snowballs count in RANKED (Cody's open question, HANDOFF): RANKED_SPECIALS=0 turns them off there.
const rankedSpecials = process.env.RANKED_SPECIALS !== '0';
if (process.env.DATABASE_URL) {
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.DATABASE_URL, { max: 3, prepare: false, ...JSONB });
  const db = { query: (q, p = []) => sql.unsafe(q, p) };
  // The sign-in token → the Supabase user (Supabase checks it) → the profile it's linked to → that profile's SAVED level/look.
  identify = async (token) => {
    const r = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: SB_KEY, authorization: 'Bearer ' + token } });
    if (!r.ok) return null;
    const user = await r.json(); if (!user?.id) return null;
    const p = (await db.query('select * from public.referee_profile($1)', [user.id]))[0]; // 017: the referee login's one lookup
    if (!p) return null;
    // 054 lets this login read the wallet column; if that ever fails, the player is simply not the admin (sign-in still works)
    let admin = false;
    if (ADMIN.size) try { admin = ADMIN.has((await db.query('select wallet from public.profiles where id = $1', [p.id]))[0]?.wallet); } catch (e) { console.error('referee: admin check failed:', e.message); }
    return { pid: p.id, l: p.level, a: p.avatar, n: p.name, rp: p.rank_points, admin };
  };
  finish = createLevels({ db }).finishByReferee;
  readWeekly = async () => { try { weeklyOnList = (await db.query('select id from public.weekly_modes where "on"')).map((r) => r.id); } catch (e) { console.error('referee: weekly modes read failed:', e.message); } };
  readWeekly(); setInterval(readWeekly, 60_000);
  // Ranked (supabase/006 tickets + 018 results), through the same limited login.
  const one = async (q, p) => Object.values((await db.query(q, p))[0] || {})[0];
  ranked = {
    hold: (pid, rid) => one('select public.hold_ticket($1, $2)', [pid, rid]),
    start: (rid) => one('select public.start_ranked_match($1)', [rid]),
    release: (pid, rid) => one('select public.release_ticket($1, $2)', [pid, rid]),
    result: (mid, pid, change) => one('select public.record_ranked_result($1, $2, $3)', [mid, pid, change]),
    cleanup: (prefix) => one('select public.release_room_holds($1)', [prefix]),
  };
  // the house bots (supabase/050; Cody 2026-10-05): who the bots in matches play as
  houseBots = async () => (await db.query('select * from public.house_bots()')).map((r) => ({ id: r.id, name: r.name, avatar: r.avatar, level: r.level }));
  // a finished or called-off tournament (supabase/054): its rules, entrants and standings
  tourneyDone = (r) => db.query('select public.record_tournament($1::jsonb)', [JSON.stringify(r)]);
  console.log('referee: sign-ins checked, finishes recorded' + (ADMIN.size ? `, ${ADMIN.size} admin wallet(s) for tournaments` : ', no admin wallets (tournaments cannot be made)'));
} else console.log('referee: no DATABASE_URL: phase-1 rooms (the page word is used, nothing recorded)');
// Ranked paused while this file exists (Cody, 2026-10-02): touch it to pause, delete it to reopen; no restart needed.
const PAUSE_FILE = process.env.RANKED_PAUSE_FILE || '/etc/santa/ranked-paused';
const ref = createReferee({ identify, finish, ranked, rankedSpecials, rankedPaused: () => existsSync(PAUSE_FILE), weeklyOn: () => weeklyOnList, houseBots, tourneyDone });
const perAddress = new Map();
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    const rooms = [...ref.rooms.values()];
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: rooms.length, players: rooms.reduce((n, r) => n + r.conns.size, 0) })); return;
  }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({ server, maxPayload: MAX_MSG, perMessageDeflate: false });
wss.on('connection', (ws, req) => {
  const addr = addressOf(req);
  if (!okOrigin(req.headers.origin)) { ws.close(1008, 'not from the game\'s website'); return; }
  const n = (perAddress.get(addr) || 0) + 1;
  if (n > MAX_PER_ADDRESS) { ws.close(1008, 'too many connections from your address'); return; }
  perAddress.set(addr, n);
  let sec = 0, count = 0;
  ws.alive = true; ws.on('pong', () => { ws.alive = true; });
  const h = ref.connect({ send: (s) => { if (ws.readyState === 1) ws.send(s); }, close: () => ws.close() });
  ws.on('message', (data, binary) => {
    const now = Math.floor(Date.now() / 1000); if (now !== sec) { sec = now; count = 0; }
    if (++count > MAX_PER_SEC) { ws.close(1008, 'slow down'); return; }
    if (!binary) h.message(String(data));
  });
  ws.on('close', () => { h.gone(); const left = (perAddress.get(addr) || 1) - 1; if (left) perAddress.set(addr, left); else perAddress.delete(addr); });
});
// Every 20 s: a line that stopped answering (closed laptop, lost network) is closed, so its player leaves the room.
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); } }, 20000);
let last = performance.now();
setInterval(() => { const now = performance.now(), dt = Math.min((now - last) / 1000, 1 / 20); last = now; ref.tick(dt); }, TICK_MS);
// HOST: on the Droplet 127.0.0.1, so only Caddy (https) can reach it; tests leave it open on every address of this machine.
server.listen(PORT, process.env.HOST || undefined, () => console.log(`referee listening on ${PORT}`));
