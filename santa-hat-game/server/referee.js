// SERVER REFEREE (the cheat-proof match server, TODO "Cheat-proof referee server"; Droplet, worker/referee.mjs is its web door).
// Every match runs HERE: players' pages only send their moves ("reports") and draw the snapshots this sends back. A page can't
// fake a score, a hit or a hat grab, because it never runs the rules. Same referee code as the page's (mockups/sim.js) with the
// same per-player lookups (mockups/refcore.js), so a server room plays exactly like today's rooms.
// Pure room logic, no sockets: the door hands it connections as { send(text), close() } and calls tick() on a timer.
// Message plan (JSON), page → server:
//   { t: 'join', code, me: { id, n, j, a, w, l, pid } }  first message; me as the page announces itself today (w = watching)
//   { t: 'rep', d }  my moves (the page's report())          { t: 'emote', d: { e } }
//   { t: 'start' } / { t: 'mode', mode }  private rooms: only the room's owner (the earliest player still in it)
//   { t: 'board' }  send me the live games list (lobby), now and every few seconds
// server → page: { t: 'peers', ps, own } · { t: 'snap', d } · { t: 'emote', d } · { t: 'board', games } · { t: 'err', why }
import { createSim, K } from '../mockups/sim.js';
import { snapMs, autoStartMs, isPublic, botName, refereeOpts } from '../mockups/refcore.js';
import { cleanAvatar } from '../mockups/catalog.js';
import { clampLevel } from '../mockups/levels.js';

export const MAX_WATCHERS = 4, MAX_ROOMS = 200, BOARD_MS = 3000;
const better = (a, b) => a.j < b.j || (a.j === b.j && a.id < b.id); // the page's order: who joined first
const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14);
const isId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{4,24}$/.test(s);

// now() in ms (tests pass a fake clock); rand for the matches (bots, spawn spots).
export function createReferee({ now = () => Date.now(), rand = Math.random } = {}) {
  const rooms = new Map(); // code → room
  const boardWatchers = new Set();
  let boardAt = 0;

  function makeRoom(code) {
    const room = { code, conns: new Map(), auto: isPublic(code), mode: code[1] === 'T' && isPublic(code) ? 'team' : 'ffa', cdEnd: null, lastSnap: 0, emoteAt: new Map() };
    room.info = (e) => room.conns.get(e.peer)?.me;
    room.sim = createSim(rand, refereeOpts(room.info));
    room.sim.S.mode = room.mode;
    rooms.set(code, room);
    return room;
  }
  const players = (room) => [...room.conns.values()].map((c) => c.me).filter((m) => !m.w).sort((a, b) => (better(a, b) ? -1 : 1));
  const owner = (room) => players(room)[0]?.id || null;
  const sendAll = (room, msg, skip) => { const s = JSON.stringify(msg); for (const [id, c] of room.conns) if (id !== skip) c.send(s); };
  const peersMsg = (room) => ({ t: 'peers', own: owner(room), ps: [...room.conns.values()].map(({ me }) => ({ id: me.id, n: me.n, j: me.j, a: me.a, w: me.w, l: me.l, pid: me.pid })) });

  // A new connection. Returns the handlers the door calls: message(text) and gone().
  function connect(conn) {
    let room = null, me = null;
    const err = (why) => { conn.send(JSON.stringify({ t: 'err', why })); };
    function join(m) {
      if (room) return err('already in a room');
      const code = cleanCode(m.code), p = m.me || {};
      if (!code) return err('no room code');
      if (!isId(p.id)) return err('bad player id');
      let r = rooms.get(code);
      if (!r) { if (rooms.size >= MAX_ROOMS) return err('the server is full right now; try again soon'); r = makeRoom(code); }
      if (r.conns.has(p.id)) return err('that player is already in this room');
      const w = !!p.w, ps = [...r.conns.values()].map((c) => c.me);
      if (w && ps.filter((x) => x.w).length >= MAX_WATCHERS) return err(`That game already has ${MAX_WATCHERS} watchers. Try another.`);
      if (!w && ps.filter((x) => !x.w).length >= K.MAX_HUMANS) return err(`Room ${code} is full (${K.MAX_HUMANS} players).`);
      // The joining time is the SERVER's clock (a page can't claim it joined first to take over the room's controls).
      me = { id: p.id, n: cleanName(p.n) || 'Player', j: now(), a: cleanAvatar(p.a), w, l: clampLevel(p.l), pid: /^[0-9a-f-]{36}$/.test(String(p.pid)) ? p.pid : null };
      room = r; room.conns.set(me.id, { send: conn.send, me });
      sendAll(room, peersMsg(room));
    }
    return {
      message(text) {
        let m; try { m = JSON.parse(text); } catch { return err('send JSON'); }
        if (!m || typeof m !== 'object') return;
        if (m.t === 'join') return join(m);
        if (m.t === 'board') { boardWatchers.add(conn); conn.send(JSON.stringify({ t: 'board', games: board() })); return; }
        if (!room) return err('join a room first');
        if (m.t === 'rep') { if (!me.w) room.sim.setReport(me.id, m.d); return; }
        if (m.t === 'emote') { // 1 per 1.2 s, players only (watchers have no emotes)
          const at = room.emoteAt.get(me.id) || 0, e = Math.floor(Number(m.d?.e));
          if (me.w || now() - at < 1200 || !(e >= 0 && e < 8)) return;
          room.emoteAt.set(me.id, now()); sendAll(room, { t: 'emote', d: { p: me.id, e } }, me.id); return;
        }
        if ((m.t === 'start' || m.t === 'mode') && !room.auto && owner(room) === me.id && room.sim.S.phase === 'lobby') {
          if (m.t === 'mode' && (m.mode === 'ffa' || m.mode === 'team')) { room.sim.S.mode = m.mode; room.sim.syncRoster(players(room).map((x) => x.id)); }
          if (m.t === 'start') room.sim.introMatch(room.sim.S.mode);
        }
      },
      gone() {
        boardWatchers.delete(conn);
        if (!room) return;
        room.conns.delete(me.id); room.emoteAt.delete(me.id);
        if (!room.conns.size) rooms.delete(room.code); else sendAll(room, peersMsg(room));
        room = null;
      },
    };
  }

  // One referee step for every room (the door calls this ~30 times a second), then snapshots on each room's own cadence.
  function tick(dt) {
    const t = now();
    for (const room of rooms.values()) {
      const sim = room.sim, ids = players(room).map((p) => p.id);
      if (room.auto && sim.S.phase === 'lobby' && sim.S.mode !== room.mode) sim.S.mode = room.mode;
      sim.syncRoster(ids);
      if (room.auto && sim.S.phase === 'lobby' && ids.length) {
        const want = autoStartMs(ids.length);
        if (room.cdEnd === null || room.cdEnd - t > want) room.cdEnd = t + want;
        if (t >= room.cdEnd) { sim.introMatch(sim.S.mode); room.cdEnd = null; }
      } else room.cdEnd = null;
      sim.step(dt);
      if (t - room.lastSnap >= snapMs(ids.length)) {
        room.lastSnap = t;
        const s = sim.snapshot(); s.hid = 'server'; s.hj = 0; s.pub = room.auto ? 1 : 0; s.cd = room.cdEnd ? Math.max(0, (room.cdEnd - t) / 1000) : 0;
        sendAll(room, { t: 'snap', d: s });
      }
    }
    if (boardWatchers.size && t - boardAt >= BOARD_MS) { boardAt = t; const s = JSON.stringify({ t: 'board', games: board() }); for (const c of boardWatchers) c.send(s); }
  }

  // The live games list (public rooms only, like today's lobby): honest now, because the server makes it, not a host page.
  function board() {
    // Same fields as the page's publishSummary() (online.js), which the lobby list reads.
    return [...rooms.values()].filter((r) => r.auto).map((r) => {
      const S = r.sim.S, top = [...S.ents].sort((a, b) => b.score - a.score)[0], ps = [...r.conns.values()].map((c) => c.me);
      const nameOf = (e) => (e.bot ? botName(e.id) : r.conns.get(e.peer)?.me.n || 'Player');
      return { code: r.code, mode: S.mode, ranked: 0, phase: S.phase, round: S.round, time: Math.ceil(S.time),
        humans: ps.filter((p) => !p.w).length, watchers: ps.filter((p) => p.w).length,
        leader: top && S.phase !== 'lobby' ? nameOf(top) : '', lscore: top ? top.score : 0 };
    });
  }

  return { connect, tick, rooms, board };
}
