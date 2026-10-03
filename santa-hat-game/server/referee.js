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
//   { t: 'auto', modes: ['ffa'|'team', …], styles: ['normal'|'gear', …], me, token? }  Auto match: the server picks the room
//     (pickAuto), then as join
//   join may carry token: the player's Supabase sign-in token (checked with identify; see createReferee)
// server → page: { t: 'peers', ps, own } · { t: 'snap', d } · { t: 'emote', d } · { t: 'board', games } · { t: 'err', why }
//   · { t: 'counted', d: { place, level, xp, up } } my Auto match finish counted toward levels (server-recorded)
import { createSim, K } from '../mockups/sim.js';
import { snapMs, autoStartMs, isPublic, isWeekly, styleOf, botName, refereeOpts, modeAllowed } from '../mockups/refcore.js';
import { weeklyAt } from '../mockups/weekly.js';
import { settleRanked, RULES } from '../mockups/ranked.js';
import { cleanAvatar, BY_ID, DEFAULT_AVATAR, SB_SLOTS, GEAR_SLOTS } from '../mockups/catalog.js';
import { clampLevel } from '../mockups/levels.js';

export const MAX_WATCHERS = 4, MAX_ROOMS = 200, BOARD_MS = 3000;
const better = (a, b) => a.j < b.j || (a.j === b.j && a.id < b.id); // the page's order: who joined first
const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14);
const isId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{4,24}$/.test(s);
const RID = 'ref-'; // ranked rooms' ticket-hold ids start with this (supabase/018 release_room_holds)
export const NO_TICKETS = 'No ranked tickets left. 10 free ones come back every day at 9 PM Indiana time (Eastern), or buy more in the Store.';

// A player who isn't signed in (or whose sign-in didn't check out) keeps their look, but nothing that changes play: plain
// snowballs, no special snowballs, no gear, level 1. Their page's word is all there is, and it can't be trusted for those.
export function guestLook(a) {
  const c = { ...cleanAvatar(a) };
  if (BY_ID.get(c.snow)?.rules) c.snow = DEFAULT_AVATAR.snow;
  for (const s of [...SB_SLOTS, ...GEAR_SLOTS]) c[s] = DEFAULT_AVATAR[s];
  return c;
}

// now() in ms (tests pass a fake clock); rand for the matches (bots, spawn spots).
// identify(token) → { pid, l, a, n } of a signed-in player from the DATABASE (their saved level and saved look, which the
//   database only accepts with items they own; supabase/015 save_profile), or null. When given, unverified players play
//   as guests (guestLook); without it (no database yet), the page's word is used, as in the page-run rooms.
// finish(match) → { counted: [{ place, level, xp, up }] } records an Auto match's places (server/levels.js finishByReferee).
// ranked: { hold(pid, rid) → 'free'|'extra'|'already'|'none', start(rid), release(pid, rid), result(mid, pid, change) → points,
//   cleanup(prefix) } (supabase/006 + 018). Without it (or without identify) ranked stays closed. rankedSpecials: whether
//   special snowballs count in ranked (Cody's open question; on = as they're sold today).
export const RANKED_PAUSED = 'Ranked is paused right now. Try Unranked.';
// rankedPaused() → true while Cody has ranked paused (worker/referee.mjs: the file /etc/santa/ranked-paused exists).
export function createReferee({ now = () => Date.now(), rand = Math.random, identify = null, finish = null, ranked = null, rankedSpecials = true, rankedPaused = () => false, weeklyOn = () => [], log = console, modeAllowed: allowMode = modeAllowed } = {}) { // allowMode: team play paused (refcore TEAM_PAUSED) unless a test says otherwise
  const rooms = new Map(); // code → room
  let rankedSeq = 0;
  // A restart: tickets still held for rooms of an earlier run come back (those rooms are gone).
  if (ranked?.cleanup) Promise.resolve(ranked.cleanup(RID)).then((n) => { if (n) log.log('referee: gave back', n, 'held ranked tickets from before a restart'); }, (e) => log.error('referee: ticket cleanup failed', e.message));
  const boardWatchers = new Set();
  let boardAt = 0;

  // a weekly room (PW…) keeps the week's mode it was made in while it lives (weekly.js)
  function makeRoom(code) {
    const room = { code, conns: new Map(), auto: isPublic(code), mode: code[1] === 'T' && isPublic(code) && allowMode('team') ? 'team' : 'ffa', cdEnd: null, lastSnap: 0, emoteAt: new Map(),
      ranked: isPublic(code) && code[1] === 'R', style: styleOf(code), variant: isWeekly(code) ? weeklyAt(now(), weeklyOn()) : null, rid: RID + Math.floor(rand() * 2 ** 48).toString(36) + now().toString(36), started: false, lastPhase: 'lobby' };
    room.info = (e) => room.conns.get(e.peer)?.me;
    room.sim = createSim(rand, { ...refereeOpts(room.info), variant: room.variant });
    room.sim.S.mode = room.mode;
    rooms.set(code, room);
    return room;
  }
  const players = (room) => [...room.conns.values()].map((c) => c.me).filter((m) => !m.w).sort((a, b) => (better(a, b) ? -1 : 1));
  // AUTO MATCH TOGETHER (Cody 2026-10-03: friends play public matches as a group): seats held in a public room for a friends'
  // group while its players move over (code → Map(player id → until)), so strangers can't take them in between. Held 20 s.
  const holds = new Map(), HOLD_MS = 20_000;
  const heldFor = (code, except = null) => { const h = holds.get(code); if (!h) return 0; const r = rooms.get(code); let n = 0;
    for (const [id, until] of h) { if (until <= now() || r?.conns.has(id)) h.delete(id); else if (id !== except) n++; }
    if (!h.size) holds.delete(code); return n; };
  // seats a public room has left: players in it plus seats held for a group on its way
  const seatsLeft = (code, except = null) => K.MAX_HUMANS - (rooms.get(code) ? players(rooms.get(code)).length : 0) - heldFor(code, except);
  const owner = (room) => players(room)[0]?.id || null;
  const sendAll = (room, msg, skip) => { const s = JSON.stringify(msg); for (const [id, c] of room.conns) if (id !== skip) c.send(s); };
  const peersMsg = (room) => ({ t: 'peers', code: room.code, own: owner(room), ps: [...room.conns.values()].map(({ me }) => ({ id: me.id, n: me.n, j: me.j, a: me.a, w: me.w, l: me.l, pid: me.pid })) });

  // A new connection. Returns the handlers the door calls: message(text) and gone().
  function connect(conn) {
    let room = null, me = null;
    const err = (why) => { conn.send(JSON.stringify({ t: 'err', why })); };
    // the server closing a room (a ranked match is over): this connection is out of it, still open for the next search
    const kick = () => { room = null; me = null; };
    const seat = (r) => { room = r; room.conns.set(me.id, { send: conn.send, me, kick }); sendAll(room, peersMsg(room)); };
    let joining = false, closed = false;
    async function join(m) {
      if (room || joining) return err('already in a room');
      const code = cleanCode(m.code), p = m.me || {};
      if (!code) return err('no room code');
      if (!isId(p.id)) return err('bad player id');
      // Who this is, checked BEFORE any room is touched (a slow check can't leave an empty room behind)
      let who = null;
      if (identify && typeof m.token === 'string' && m.token) {
        joining = true;
        try { who = await identify(m.token); } catch (e) { log.error('referee: sign-in check failed', e.message); }
        joining = false;
        if (closed) return;
      }
      let r = rooms.get(code);
      if (!r) { if (rooms.size >= MAX_ROOMS) return err('the server is full right now; try again soon'); r = makeRoom(code); }
      if (r.conns.has(p.id)) return err('that player is already in this room');
      // ranked games: players only through Auto match (a ticket, and the server's pick); watching is fine
      if (r.ranked && !p.w) { if (!r.conns.size) rooms.delete(code); return err('Ranked games are joined with Auto match.'); }
      const w = !!p.w, ps = [...r.conns.values()].map((c) => c.me);
      if (w && ps.filter((x) => x.w).length >= MAX_WATCHERS) return err(`That game already has ${MAX_WATCHERS} watchers. Try another.`);
      if (!w && seatsLeft(code, p.id) <= 0) { if (!r.conns.size) rooms.delete(code); return err(`Room ${code} is full (${K.MAX_HUMANS} players).`); } // held seats count
      // The joining time is the SERVER's clock (a page can't claim it joined first to take over the room's controls).
      me = who ? { id: p.id, n: cleanName(who.n) || 'Player', j: now(), a: cleanAvatar(who.a), w, l: clampLevel(who.l), pid: who.pid }
        : identify ? { id: p.id, n: cleanName(p.n) || 'Player', j: now(), a: guestLook(p.a), w, l: 1, pid: null }
        : { id: p.id, n: cleanName(p.n) || 'Player', j: now(), a: cleanAvatar(p.a), w, l: clampLevel(p.l), pid: /^[0-9a-f-]{36}$/.test(String(p.pid)) ? p.pid : null };
      // a normal-play room: plain snowballs for everyone, whatever they own (the look stays; specials and gear don't count)
      if (r.style === 'normal') me.a = guestLook(me.a);
      // the same account twice in one room (two tabs) would count its finishes twice: one seat per account
      if (me.pid && [...r.conns.values()].some((c) => c.me.pid === me.pid)) { me = null; if (!r.conns.size) rooms.delete(code); return err('you are already in this room in another tab'); }
      seat(r);
    }
    // Ranked Auto match: the SERVER picks the room (similar rank points first), holds one ticket, and seats the player.
    async function findRanked(m) {
      if (room || joining) return err('already in a room');
      if (!ranked || !identify) return err('Ranked opens soon.');
      // Cody can pause ranked (2026-10-02: no testers in ranked): new searches are refused; games already running finish
      if (rankedPaused()) return err(RANKED_PAUSED);
      const p = m.me || {};
      if (!isId(p.id)) return err('bad player id');
      if (typeof m.token !== 'string' || !m.token) return err('Ranked needs you signed in.');
      joining = true;
      try {
        let who = null;
        try { who = await identify(m.token); } catch (e) { log.error('referee: sign-in check failed', e.message); }
        if (closed) return;
        if (!who) return err('Ranked needs you signed in.');
        if ([...rooms.values()].some((r) => r.ranked && [...r.conns.values()].some((c) => c.me.pid === who.pid))) return err('you are already in a ranked game in another tab');
        const rp = Number(who.rp) || 0, avg = (r) => { const ps = players(r); return ps.reduce((a, x) => a + (x.rp || 0), 0) / (ps.length || 1); };
        // the play styles the player ticked (Cody 2026-10-02: ranked has the same Normal / Special gear choice as Auto match)
        const kinds = (Array.isArray(m.styles) ? m.styles : []).filter((x) => x === 'normal' || x === 'gear');
        if (!kinds.length) kinds.push('gear');
        const open = [...rooms.values()].filter((r) => r.ranked && kinds.includes(r.style) && !r.started && r.sim.S.phase === 'lobby' && players(r).length < K.MAX_HUMANS)
          .sort((a, b) => Math.abs(avg(a) - rp) - Math.abs(avg(b) - rp));
        let r = open[0];
        if (!r) {
          if (rooms.size >= MAX_ROOMS) return err('the server is full right now; try again soon');
          const letter = kinds.includes('gear') ? 'G' : 'N';
          let code; do code = 'PR' + letter + ((rankedSeq++ % 99) + 1); while (rooms.has(code));
          r = makeRoom(code);
        }
        let held;
        try { held = await ranked.hold(who.pid, r.rid); } catch (e) { log.error('referee: ticket hold failed', e.message); held = 'error'; }
        const drop = () => { if (!r.conns.size) rooms.delete(r.code); };
        if (closed || r.started || !rooms.has(r.code)) { // the room moved on while the ticket was being held: give it back
          if (held === 'free' || held === 'extra') Promise.resolve(ranked.release(who.pid, r.rid)).catch(() => {});
          drop(); return closed ? undefined : err('That game just started. Press Auto match again.');
        }
        if (held === 'none') { drop(); return err(NO_TICKETS); }
        if (held !== 'free' && held !== 'extra') { drop(); return err('Something went wrong holding your ticket. Try again.'); }
        const a = cleanAvatar(who.a);
        if (!rankedSpecials) for (const s of SB_SLOTS) a[s] = DEFAULT_AVATAR[s];
        me = { id: p.id, n: cleanName(who.n) || 'Player', j: now(), a: r.style === 'normal' ? guestLook(a) : a, w: false, l: clampLevel(who.l), pid: who.pid, rp };
        seat(r);
      } finally { joining = false; }
    }
    return {
      message(text) {
        let m; try { m = JSON.parse(text); } catch { return err('send JSON'); }
        if (!m || typeof m !== 'object') return;
        if (m.t === 'join') return join(m);
        if (m.t === 'ranked') return findRanked(m);
        if (m.t === 'auto') { // Auto match: the server picks the best public room for the game types the player ticked
          if (room || joining) return err('already in a room');
          const code = pickAuto(m.modes, m.styles);
          return code ? join({ ...m, t: 'join', code }) : err('All public rooms are full right now. Try a private room.');
        }
        if (m.t === 'board') { boardWatchers.add(conn); conn.send(JSON.stringify({ t: 'board', games: board() })); return; }
        if (!room) return err('join a room first');
        if (m.t === 'rep') { if (!me.w) room.sim.setReport(me.id, m.d); return; }
        if (m.t === 'emote') { // 1 per 1.2 s, players only (watchers have no emotes)
          const at = room.emoteAt.get(me.id) || 0, e = Math.floor(Number(m.d?.e));
          if (me.w || now() - at < 1200 || !(e >= 0 && e < 8)) return;
          room.emoteAt.set(me.id, now()); sendAll(room, { t: 'emote', d: { p: me.id, e } }, me.id); return;
        }
        // a friends' room's owner takes the whole group into a public Auto match: seats held there, then everyone is sent over
        if (m.t === 'together') {
          if (room.auto || owner(room) !== me.id || room.sim.S.phase !== 'lobby') return err('Only the room host can do that, before a match starts.');
          const group = players(room), code = pickAuto(m.modes, m.styles, group.length);
          if (!code) return err('No public game has room for your whole group right now. Try again in a moment.');
          const h = holds.get(code) || new Map(); for (const x of group) h.set(x.id, now() + HOLD_MS); holds.set(code, h);
          sendAll(room, { t: 'goto', code }); return;
        }
        if ((m.t === 'start' || m.t === 'mode') && !room.auto && owner(room) === me.id && room.sim.S.phase === 'lobby') {
          if (m.t === 'mode' && allowMode(m.mode)) { room.sim.S.mode = m.mode; room.sim.syncRoster(players(room).map((x) => x.id)); }
          if (m.t === 'start') room.sim.introMatch(room.sim.S.mode);
        }
      },
      gone() {
        closed = true;
        boardWatchers.delete(conn);
        if (!room) return;
        // left a ranked room before its match started: the ticket comes back (after the start it's spent)
        if (room.ranked && !room.started && me.pid && !me.w) Promise.resolve(ranked?.release(me.pid, room.rid)).catch((e) => log.error('referee: ticket release failed', e.message));
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
      const enough = room.ranked ? ids.length >= 2 : ids.length > 0; // ranked: at least 2 real players (decided)
      if (room.auto && sim.S.phase === 'lobby' && enough) {
        const want = autoStartMs(ids.length);
        if (room.cdEnd === null || room.cdEnd - t > want) room.cdEnd = t + want;
        if (t >= room.cdEnd) {
          sim.introMatch(sim.S.mode); room.cdEnd = null;
          if (room.ranked) { // tickets spent now; who started is remembered (leaving mid-match still counts as not placing)
            room.started = true; room.startedWith = new Set(players(room).map((x) => x.pid).filter(Boolean));
            Promise.resolve(ranked.start(room.rid)).catch((e) => log.error('referee: spending tickets failed for', room.rid, e.message));
          }
        }
      } else room.cdEnd = null;
      sim.step(dt);
      if (room.auto && (finish || room.ranked) && sim.S.phase === 'end' && sim.S.mid && room.reported !== sim.S.mid) report(room);
      if (room.ranked && room.lastPhase === 'end' && sim.S.phase === 'lobby') { closeRoom(room, 'Match over. Press Auto match for the next ranked game.'); continue; }
      room.lastPhase = sim.S.phase;
      if (t - room.lastSnap >= snapMs(ids.length)) {
        room.lastSnap = t;
        const s = sim.snapshot(); s.hid = 'server'; s.hj = 0; s.pub = room.auto ? 1 : 0; s.cd = room.cdEnd ? Math.max(0, (room.cdEnd - t) / 1000) : 0;
        if (room.ranked) { s.rk = 1; if (sim.S.phase === 'lobby' && !enough) s.wait = 1; } // ranked; waiting for a 2nd real player
        sendAll(room, { t: 'snap', d: s });
      }
    }
    if (boardWatchers.size && t - boardAt >= BOARD_MS) { boardAt = t; const s = JSON.stringify({ t: 'board', games: board() }); for (const c of boardWatchers) c.send(s); }
  }

  // Auto match (Cody, 2026-10-02: tick FFA, TEAM or both, "get paired to best game"): among the WAITING public rooms of the
  // ticked types with a free seat, the one with the most players already in it (ties: the one starting soonest). None waiting:
  // a new room of a ticked type (FFA first when both are ticked). Never a match already being played. Null when all are full.
  // styles: 'normal' (plain play) and/or 'gear' (special snowballs and gear count), ticked the same way.
  function pickAuto(modes, styles, n = 1) { // n: seats needed (a friends' group moving together)
    const weeklyNow = !!weeklyAt(now(), weeklyOn()); // no weekly mode switched on: the 'weekly' tick falls back like a paused TEAM tick
    const want = (Array.isArray(modes) ? modes : []).filter((m) => (m === 'weekly' ? weeklyNow : allowMode(m))); // team play paused: TEAM boxes fall back to FFA; 'weekly': this week's mode
    if (!want.length) want.push('ffa');
    const kinds = (Array.isArray(styles) ? styles : []).filter((x) => x === 'normal' || x === 'gear');
    if (!kinds.length) kinds.push('gear');
    const kindOf = (r) => (r.variant ? 'weekly' : r.mode); // a weekly room only for players who ticked this week's mode
    const open = [...rooms.values()].filter((r) => r.auto && !r.ranked && want.includes(kindOf(r)) && kinds.includes(r.style) && r.sim.S.phase === 'lobby' && seatsLeft(r.code) >= n);
    open.sort((a, b) => players(b).length - players(a).length || (a.cdEnd ?? Infinity) - (b.cdEnd ?? Infinity));
    if (open.length && players(open[0]).length) return open[0].code;
    for (const mode of ['ffa', 'weekly', 'team'].filter((x) => want.includes(x))) for (const style of ['gear', 'normal'].filter((x) => kinds.includes(x))) {
      for (let k = 1; k <= 5; k++) { const code = 'P' + (mode === 'team' ? 'T' : mode === 'weekly' ? 'W' : 'F') + (style === 'normal' ? 'N' : 'G') + k; if (!rooms.has(code) && seatsLeft(code) >= n) return code; }
    }
    return open[0]?.code || null; // every room of these types exists: an empty waiting one, if any
  }

  // An Auto match ended: its places, in the page's order (score, then entity id), each a profile id or null (a bot or a
  // guest), go to the levels code, and each counted player is told their new level ({ t: 'counted' }).
  function report(room) {
    const S = room.sim.S, mid = S.mid; room.reported = mid;
    const order = [...S.ents].sort((a, b) => b.score - a.score || a.id - b.id);
    const places = order.map((e) => (e.bot ? null : room.conns.get(e.peer)?.me.pid || null));
    if (room.ranked && ranked) rankedPoints(room, order);
    if (!places.some(Boolean) || !finish) return; // nobody signed in: nothing to record
    // each player's match counts (sim.js tally: hits, hat seconds, steals, catches, specials) for the season's daily tasks
    const stats = order.map((e) => (e.bot ? null : { ...(e.st || {}) }));
    Promise.resolve(finish({ id: mid, auto: true, places, stats })).then((r) => {
      for (const c of r?.counted || []) {
        const pid = places[c.place - 1], conn = [...room.conns.values()].find((x) => x.me.pid === pid);
        if (conn) conn.send(JSON.stringify({ t: 'counted', d: { place: c.place, level: c.level, xp: c.xp, up: c.up } }));
      }
    }).catch((e) => log.error('referee: recording match', mid, 'failed:', e.message));
  }

  // Ranked points (mockups/ranked.js settleRanked; bots in the pot and able to win): each real player's change, once per match.
  // Someone who left during the match isn't in it any more but started it: not placing, so quitting a loss doesn't dodge it.
  function rankedPoints(room, order) {
    const mid = room.sim.S.mid, seen = new Set();
    const ps = order.map((e) => { const pid = e.bot ? null : room.conns.get(e.peer)?.me.pid || null; if (pid) seen.add(pid); return { id: pid || 'x' + e.id, bot: !pid, score: e.score }; });
    const { points } = settleRanked(ps);
    for (const pid of room.startedWith || []) if (!seen.has(pid)) points[pid] = RULES.notPlacing;
    for (const [pid, change] of Object.entries(points)) {
      Promise.resolve(ranked.result(mid, pid, change)).then((total) => {
        const c = [...room.conns.values()].find((x) => x.me.pid === pid);
        if (c) c.send(JSON.stringify({ t: 'rank', d: { change, points: total } }));
      }).catch((e) => log.error('referee: ranked result failed', mid, e.message));
    }
  }
  // The server closes a room (a ranked match is over): everyone is told and taken out; their lines stay open.
  function closeRoom(room, why) {
    sendAll(room, { t: 'closed', why });
    for (const c of room.conns.values()) c.kick();
    rooms.delete(room.code);
  }

  // The live games list (public rooms only, like today's lobby): honest now, because the server makes it, not a host page.
  function board() {
    // Same fields as the page's publishSummary() (online.js), which the lobby list reads.
    return [...rooms.values()].filter((r) => r.auto).map((r) => {
      const S = r.sim.S, top = [...S.ents].sort((a, b) => b.score - a.score)[0], ps = [...r.conns.values()].map((c) => c.me);
      const nameOf = (e) => (e.bot ? botName(e.id) : r.conns.get(e.peer)?.me.n || 'Player');
      return { code: r.code, mode: S.mode, variant: r.variant, style: r.style, ranked: r.ranked ? 1 : 0, phase: S.phase, round: S.round, time: Math.ceil(S.time),
        humans: ps.filter((p) => !p.w).length, watchers: ps.filter((p) => p.w).length, free: Math.max(0, seatsLeft(r.code)),
        starts: S.phase === 'lobby' && r.cdEnd ? Math.max(0, Math.ceil((r.cdEnd - now()) / 1000)) : null, // seconds to the start (waiting games)
        leader: top && S.phase !== 'lobby' ? nameOf(top) : '', lscore: top ? top.score : 0 };
    });
  }

  return { connect, tick, rooms, board };
}
