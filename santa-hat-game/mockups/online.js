// Santa Hat Legends (the Snowball Square game): lobby, rooms, referee hand-off, smoothing, HUD.
import './buildcheck.js'; // first: the page and this code come from the same publish (buildcheck.js)
import { THREE, C, animate, Snow, Burst, toon, part, build, glow, toScreen, TOON, hatGeo, Sparks, gearTick, GEAR_TINT, disposeTree } from './kit.js';
import { buildPlaza, makeHat, shadowBlob } from './plaza.js';
import { createSim, K, PHASES, constrain, KIND_OF, DROP_OF } from './sim.js';
import { openRoom, accounts, findWallet, gamesBoard } from './net.js';
import { SLOTS, SB_SLOTS, GEAR_SLOTS, BY_ID, DEFAULT_AVATAR, cleanAvatar, usable, ballRules, specialsIn } from './catalog.js';
import { initTabs, avatarCharacter, renderProgress, thumbnail, refreshTickets } from './tabs.js';
import { initSeason, refreshSeason } from './seasonui.js';
import { initMoneyStrips, refreshBurned } from './moneystrip.js';
import { initWalletLines, refreshWallet } from './walletline.js';
import { createCoach } from './coach.js';
import { createCallouts } from './callouts.js';
import { initJackpotBar } from './jackpotbar.js';
import { initShareWins } from './sharecard.js';
import { TICKET_MAX } from './ranked.js';
import { levelInfo, clampLevel } from './levels.js';
import { SERVER, call, token as signInToken } from './gameserver.js';
import { SPECIALS, cantThrow } from './specials.js';
import { gearIn, effectsOf, heldWith, gearOfMask, statOf, RETIRED } from './gear.js';
import { initLottery } from './lotteryui.js';
import { play as sfx, initSoundButtons } from './sfx.js';
import { THEMES, themeOf, savedTheme, saveTheme } from './themes.js';
import { BALL_COLOR, TR, SOLID, STAR, tracer, dropStreak } from './ballfx.js';
import { snapMs, autoStartMs, isPublic, styleOf, botAvatar, botName, refereeOpts, modeAllowed, TEAM_PAUSED } from './refcore.js';

const V3 = THREE.Vector3;
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const LOCAL = params.get('net') === 'local';
// The referee server (server/referee.js on the Droplet, wss://play.santahatgames.com) runs every room: matches can't be faked,
// signed-in players play with their saved level and items, finishes and ranked points are recorded by the server. THE DEFAULT
// since 2026-10-02 (Cody: "keep going down the list until we can launch"). ?ref=wss://… picks another (tests); ?ref=off and
// ?net=local (this computer's test rooms) use the old page-run rooms.
const REF_DEFAULT = 'wss://play.santahatgames.com', refParam = params.get('ref');
const REFEREE = refParam === 'off' || LOCAL ? null : /^wss:\/\/|^ws:\/\/localhost[:/]/.test(refParam || '') ? refParam : REF_DEFAULT;
// What a room's address keeps of this page's own address (so a reload or a shared link stays on the same network).
// (button audit 2026-10-02: it used to drop ?server=, so a reload after a match fell back to the demo)
// only a referee chosen in the address is passed on (the default needs nothing, so players' links stay short)
const REF_KEEP = refParam ? '&ref=' + encodeURIComponent(refParam) : '';
const KEEP = (LOCAL ? '&net=local' : '') + REF_KEEP + (SERVER ? '&server=' + encodeURIComponent(SERVER) : '');
const REP_MIN_MS = 160, REP_MOVING_MS = 350, REP_IDLE_MS = 1000; // the referee stops extrapolating after 400 ms
const EMOTES = ['Ho ho ho!', 'Nice throw!', 'Gimme the hat!', 'Oops!'];
const TEAM_SHIRT = [0xcf3128, C.elf], TEAM_RING = [0xffbe5c, 0x7fe0a0], TEAM_NAME = ['Nice', 'Naughty'];

const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const rid = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').trim().slice(0, 14);
const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

// ---------- scene
const canvas = $('#stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
// The plaza theme is this player's own view (themes.js): the referee, the network and every other player never see it.
let theme = savedTheme(), plaza = buildPlaza(scene, { theme });
const snow = new Snow(1400, [60, 24, 60]); scene.add(snow.points);
snow.points.geometry.setDrawRange(0, themeOf(theme).snowfall); // Halloween: a few stray flakes of the 1400
function setTheme(id) { // from the Avatar screen; swaps the plaza in place, mid-match too
  if (!THEMES[id]) return;
  saveTheme(id);
  if (id === theme) return;
  plaza.dispose(); theme = id; plaza = buildPlaza(scene, { theme });
  snow.points.geometry.setDrawRange(0, themeOf(theme).snowfall);
  fog0 = null; // the new plaza's own fog; the match camera re-reads it and pulls it back with the zoom
}
const burst = new Burst(320); scene.add(burst.mesh);
// special snowballs' tracers and shimmer: one draw call for all of them (drawn in draw(), after the balls)
const sparks = new Sparks(1600); scene.add(sparks.points);
const ballGeo = build([part(new THREE.IcosahedronGeometry(0.17, 0), C.brim, { jit: 0.02 })]);
const hatMesh = makeHat(0.88); scene.add(hatMesh);
const hatShadow = shadowBlob(); scene.add(hatShadow);
const hatGlow = glow(0xffd29a, 3.2, 0.3); scene.add(hatGlow);
const landRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.86, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
landRing.position.y = 0.06; scene.add(landRing);
const ringGeo = new THREE.RingGeometry(0.55, 0.72, 24).rotateX(-Math.PI / 2);

let W = innerWidth, H = innerHeight;
function resize() { W = innerWidth; H = innerHeight; renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); sparks.uH.value = (H * renderer.getPixelRatio()) / 2; }
addEventListener('resize', resize); resize();

// ---------- state
const me = { id: rid(10), n: cleanName(store.get('sq_name')) || 'Player ' + (100 + Math.floor(Math.random() * 900)), j: 0, a: cleanAvatar((() => { try { return JSON.parse(store.get('sq_avatar')); } catch { return null; } })()) };
let profile = null; // signed-in wallet profile, if any
let room = null, roomCode = '', practice = false, isHost = false, sim = null, joinedAt = 0;
let lastRaw = null, curHost = null, snaps = [], lastEv = 0, lastSnapSent = 0, lastSnapAt = 0;
// Auto match rooms have a fixed mode and start on their own; private rooms are started by their referee.
let rankNews = null; // ranked: { change, points } from the referee server after the match
let roomMode = null, autoStart = false, cdEnd = null, boardAt = 0, lobbyKind = 'unranked';
// Auto match game types (Cody, 2026-10-02: tick boxes under Auto match, 1 or both; remembered). lobbyMode: the first ticked
// (what Practice and a new private room start in).
let autoModes = (() => { try { const v = JSON.parse(store.get('sq_amodes') || '["ffa"]'); return Array.isArray(v) && v.length ? v.filter(modeAllowed) : ['ffa']; } catch { return ['ffa']; } })(); // team play paused: a saved TEAM tick is dropped
if (!autoModes.length) autoModes = ['ffa'];
let lobbyMode = autoModes[0];
// …and the style: normal play (plain snowballs) and/or special gear (Cody, 2026-10-02); both ticked at first
let autoStyles = (() => { try { const v = JSON.parse(store.get('sq_astyles') || '["normal","gear"]'); return Array.isArray(v) ? v.filter((x) => x === 'normal' || x === 'gear') : []; } catch { return []; } })();
if (!autoStyles.length) autoStyles = ['normal', 'gear'];
const MAX_WATCHERS = 4;
const board = gamesBoard({ local: LOCAL, referee: REFEREE });
let bg = createSim(); bg.syncRoster([]); // attract-mode plaza behind the home screen
const names = new Map(); // peer id -> display name
const ctl = { x: 0, z: 9, vx: 0, vz: 0, face: Math.PI, ep: -1, q: 0, t: 0, ax: 0, az: 0, cool: 0, throwT: 0, lastSent: 0, wasStun: false, dirty: true };
const localBalls = [];
const views = new Map(); // entity id -> { mesh, ring, label, bubble, key, rx, rz }

function decode(s) {
  const n = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const H = Array.isArray(s.H) ? s.H : [];
  return {
    seq: n(s.s), phase: PHASES[s.ph] || 'lobby', mode: s.md ? 'team' : 'ffa', round: n(s.rd), time: n(s.tm), ts: [n(s.ts?.[0]), n(s.ts?.[1])],
    ents: (Array.isArray(s.E) ? s.E : []).map((r) => ({ id: n(r[0]), peer: typeof r[1] === 'string' ? r[1] : null, bot: !!r[2], team: n(r[3]), x: n(r[4]), z: n(r[5]), vx: n(r[6]), vz: n(r[7]), face: n(r[8]), stun: !!r[9], ammo: n(r[10]), score: n(r[11]), thr: !!r[12], ep: n(r[13]),
      // untouchable for 2 s after grabbing the hat (E[14]): the gold ring. It was never read before, so the ring never showed.
      immune: !!r[14],
      // special gear, as the REFEREE resolved it (a Present Box already turned into its pick) and extra hits left; none = []
      gear: gearOfMask(r[15]), xh: n(r[16]) })),
    hat: { st: ['ped', 'head', 'air', 'ground'][H[0]] || 'ped', x: n(H[1]), y: n(H[2], K.PED_TOP), z: n(H[3]), vx: n(H[4]), vy: n(H[5]), vz: n(H[6]), holder: n(H[7], -1), lx: n(H[8]), lz: n(H[9]) },
    balls: (Array.isArray(s.B) ? s.B : []).map((b) => ({ id: n(b[0]), x: n(b[1]), y: n(b[2]), z: n(b[3]), vx: n(b[4]), vy: n(b[5]), vz: n(b[6]), owner: n(b[7]), kind: KIND_OF[n(b[9])] || '', r: n(b[10], 1) || 1 })),
    drops: (Array.isArray(s.D) ? s.D : []).map((p) => ({ x: n(p[0]), z: n(p[1]), t: n(p[2]), owner: n(p[3]), kind: DROP_OF[n(p[4])] || 'rain' })),
    ev: Array.isArray(s.V) ? s.V : [], res: Array.isArray(s.R) ? { team: s.R[0], top: s.R[1], mvp: s.R[2] } : null,
    cd: n(s.cd), pub: !!s.pub, mid: typeof s.mid === 'string' ? s.mid : '',
    rk: !!s.rk, wait: !!s.wait, // ranked (referee server); waiting for a 2nd real player
  };
}

const inRoom = () => !!room || practice;
// (on the referee server my own name is the one it checked, like everyone else's: a signed-in player's saved name)
const nameOf = (e) => (e.bot ? botName(e.id) : (e.peer === me.id && room?.kind !== 'server' ? me.n : names.get(e.peer) || (e.peer === me.id ? me.n : '')) || 'Player');

// ---------- referee hand-off
function becomeHost() {
  isHost = true; sim = createSim(Math.random, { rulesOf: (e) => ballRules(avatarOf(e)), startOf, specialsOf, levelOf, gearOf }); // snowball rules, starting snowballs (level), special snowballs, gear
  if (lastRaw) sim.load(lastRaw);
  room?.setHost(true);
  sim.S.ev.forEach((v) => { lastEv = Math.max(lastEv, v[0]); });
}
// Who may pick the mode and press Start: the page's own referee, or (referee server) the room's owner.
const canRun = () => isHost || (room?.kind === 'server' && room.owner() === me.id);
function stepDown() { isHost = false; sim = null; room?.setHost(false); board.unpublish(); }
const better = (a, b) => a.j < b.j || (a.j === b.j && a.id < b.id);

function onSnap(s) {
  if (!s || typeof s !== 'object' || typeof s.hid !== 'string') return;
  const from = { id: s.hid, j: Number(s.hj) || 0 };
  if (isHost) { if (better(from, me)) stepDown(); else return; }
  const now = performance.now();
  if (curHost && curHost.id !== from.id && now - curHost.at < 2500 && !better(from, curHost)) return;
  if (curHost && curHost.id === from.id && s.s <= curHost.seq) return;
  curHost = { ...from, at: now, seq: s.s };
  lastRaw = s; lastSnapAt = now;
  const v = decode(s);
  if (!snaps.length) v.ev.forEach((e) => { lastEv = Math.max(lastEv, e[0]); });
  snaps.push({ at: now, v }); if (snaps.length > 24) snaps.shift();
  handleEvents(v);
}

function election(now) {
  if (!room || room.kind === 'server' || isHost || me.w || now - joinedAt < 2000 || now - lastSnapAt < 2500) return;
  const ps = room.peers().filter((p) => !p.w); if (!ps.some((p) => p.id === me.id)) ps.push(me);
  ps.sort((a, b) => (better(a, b) ? -1 : 1));
  if (ps[0].id === me.id) becomeHost();
}

// ---------- rooms
async function enterRoom(code, quick, opts = {}) {
  endTrial(); // a tried-on ball never goes into a real room
  status(opts.watch ? 'Joining as a watcher…' : 'Connecting…');
  if (!profile) { me.n = cleanName($('#name')?.value) || me.n; store.set('sq_name', me.n); }
  me.w = !!opts.watch;
  // without the match server (tests: ?ref=off / ?net=local) Auto match tries the ticked types' rooms in turn
  const tries = quick ? autoModes.flatMap((md) => autoStyles.flatMap((st) => [1, 2, 3, 4, 5].map((n) => 'P' + (md === 'team' ? 'T' : 'F') + (st === 'normal' ? 'N' : 'G') + n))) : [code];
  const serverPicks = quick && !!REFEREE; // the match server picks the best room for the ticked types itself
  for (let attempt = 0; attempt < (serverPicks ? 1 : tries.length); attempt++) {
    const c = serverPicks ? '' : tries[attempt];
    me.j = Date.now();
    let r;
    try { r = await openRoom(c.toLowerCase(), me, { local: LOCAL, referee: REFEREE, token: REFEREE ? await signInToken() : null, ranked: !!opts.ranked, auto: serverPicks || opts.ranked ? { modes: autoModes, styles: autoStyles } : null }); }
    catch (e) {
      if (quick && !serverPicks && /full/.test(e.why || '')) continue; // this public room is full: try the next one
      status(e.why || "Couldn't reach the game server. Check your connection, or try Practice."); return;
    }
    await new Promise((res) => setTimeout(res, 1200));
    const players = r.peers().filter((p) => !p.w).length, watchers = r.peers().filter((p) => p.w && p.id !== me.id).length;
    if (me.w && watchers >= MAX_WATCHERS) { r.leave(); status(`That game already has ${MAX_WATCHERS} watchers. Try another.`); return; }
    if (!me.w && players > K.MAX_HUMANS) { r.leave(); if (quick) continue; status(`Room ${c} is full (8 players).`); return; }
    room = r; roomCode = opts.ranked || serverPicks ? r.code() : c; practice = false; break;
  }
  if (!room) { status('All public rooms are full right now. Try a private room.'); return; }
  roomMode = isPublic(roomCode) ? (roomCode[1] === 'T' && modeAllowed('team') ? 'team' : 'ffa') : null; autoStart = isPublic(roomCode); cdEnd = null;
  closeLobby();
  room.on('snap', onSnap);
  room.on('rep', (id, r) => { if (isHost && sim) sim.setReport(id, r); });
  room.on('emote', (e) => { if (e && typeof e.p === 'string') showEmote(e.p, Number(e.e)); });
  room.on('peers', (ps) => ps.forEach((p) => names.set(p.id, cleanName(p.n) || 'Player')));
  // Referee server: it recorded my Auto match finish itself (the page reports nothing there); show my new level.
  room.on('counted', (d) => { if (profile && d && Number.isInteger(d.level)) { profile.level = d.level; profile.xp = d.xp; me.l = d.level; renderProgress(profile); } });
  room.on('rank', (d) => { if (d && Number.isFinite(d.change)) { rankNews = d; if (profile && Number.isFinite(d.points)) profile.rank_points = d.points; } });
  room.on('closed', (why) => { leaveRoom(); openLobby('ranked'); status(String(why || 'Match over.')); }); // the server ended a ranked room
  // AUTO MATCH TOGETHER: the server held seats for this friends' room in a public room; everyone moves there (watchers keep watching)
  room.on('goto', (code) => { const watching = !!me.w; leaveRoom(); enterRoom(code, false, watching ? { watch: true } : {}); banner('Off to a public match together'); });
  room.on('err', (why) => { togetherNote = String(why || ''); ui.lastCard = ''; });
  room.on('gone', () => { leaveRoom(); status('Lost the connection to the game server. Try again.'); }); // referee server only
  room.peers().forEach((p) => names.set(p.id, cleanName(p.n) || 'Player'));
  rankNews = null;
  joinedAt = performance.now(); lastSnapAt = 0; snaps = []; curHost = null; lastRaw = null; isHost = false; sim = null; ctl.ep = -1;
  try { history.replaceState(null, '', '?room=' + roomCode + KEEP); } catch {}
  $('#home').hidden = true; status('');
  renderChrome();
}

// THE RESULTS CARD'S NEXT STEP (Cody, 2026-10-03), true to what each room does after a match: practice waits for Start, so
// "Play again" starts the next one at once; a public Auto match starts its next match by itself (no button needed, Leave
// offered); ranked closes the room, so "Play again" queues the next ranked match (1 ticket); a friends' room goes back to its
// warm-up. A guest who placed top 3 in a public match is told what signing in would have kept.
let againWanted = false, togetherNote = ''; // togetherNote: the last answer to Auto match together, shown in the warm-up card
function endActions(v, sorted) {
  const secs = Math.ceil(v.time), place = sorted.findIndex((e) => e.peer === me.id) + 1;
  const nudge = !profile && !me.w && !practice && autoStart && !v.rk && place >= 1 && place <= 3
    ? `<div class="nudge"><b>You finished ${['1st', '2nd', '3rd'][place - 1]}!</b> Sign in and finishes like this count: top 3 moves your level up and counts toward the daily tasks. <button class="sec" data-act="signin">Sign in</button></div>` : '';
  if (me.w) return `${nudge}<p class="dim">Next match in ${secs}s</p>`;
  if (practice) return `${nudge}<div class="endacts"><button class="go" data-act="again">Play again</button><button class="sec" data-act="leave">Leave</button></div>`;
  if (v.rk) return `${nudge}<div class="endacts"><button class="go" data-act="again-ranked">Play again · 1 ticket</button><button class="sec" data-act="leave">Leave</button></div>`;
  if (autoStart) return `${nudge}<div class="endacts"><p>Next match starts by itself in about ${secs}s. Stay to play again.</p><button class="sec" data-act="leave">Leave</button></div>`;
  return `${nudge}<div class="endacts"><p>Back to the warm-up in ${secs}s.</p><button class="sec" data-act="leave">Leave</button></div>`;
}
$('#panel').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
  if (act === 'again' && practice && sim) { againWanted = true; sim.S.time = 0; } // end → warm-up now, then straight into the next match
  else if (act === 'again-ranked') { leaveRoom(); enterRoom('', false, { ranked: true }); }
  else if (act === 'leave') leaveRoom();
  else if (act === 'together' && room?.together) { togetherNote = 'Finding a public game with room for all of you…'; ui.lastCard = ''; room.together(autoModes, autoStyles); }
  else if (act === 'signin') $('#signin')?.click();
});

function startPractice() {
  if (!profile) { me.n = cleanName($('#name')?.value) || me.n; store.set('sq_name', me.n); }
  practice = true; room = null; roomCode = ''; isHost = true; sim = createSim(Math.random, { rulesOf: (e) => ballRules(avatarOf(e)), startOf, specialsOf, levelOf, gearOf }); me.j = Date.now(); me.w = false; ctl.ep = -1; snaps = []; lastEv = 0;
  roomMode = null; autoStart = false; sim.S.mode = lobbyMode; closeLobby(); renderChrome();
}

// TRY IT IN PRACTICE (Cody, 2026-10-03): the Store's "Try it" on a special snowball opens a solo practice match with that ball in
// SB1, locked on, so the player throws it for real before buying. Practice runs only in this browser (no match server, no levels,
// no money). The borrowed ball and level are put back the moment practice ends, and before any real room: endTrial runs in
// enterRoom, leaveRoom and setIdentity, so a ball the player doesn't own can never reach a real match.
let trial = null; // { kind, a, l }: the real look and level to put back
function endTrial() { if (!trial) return; me.a = trial.a; me.l = trial.l; trial = null; locked = armed = ''; ui.lastHud = ''; }
function tryInPractice(kind) {
  if (!SPECIALS[kind]) return;
  if (inRoom()) leaveRoom(); else endTrial();
  trial = { kind, a: me.a, l: me.l };
  const a = { ...cleanAvatar(me.a) };
  for (const s of SB_SLOTS) if (a[s] === 'sb_' + kind) a[s] = 'sb_none';
  a.sb1 = 'sb_' + kind; me.a = a;
  if (SPECIALS[kind].minLevel && (me.l || 1) < SPECIALS[kind].minLevel) me.l = SPECIALS[kind].minLevel; // Rain needs level 5
  startPractice(); locked = armed = kind; ui.lastHud = '';
  banner(`Trying the ${SPECIALS[kind].name}: practice only`);
}

function leaveRoom(reason) {
  againWanted = false; togetherNote = ''; callouts.reset(false);
  endTrial();
  const was = roomCode;
  if (isHost) board.unpublish();
  room?.leave(); room = null; practice = false; isHost = false; sim = null; snaps = []; lastRaw = null; curHost = null; me.w = false; roomMode = null; autoStart = false;
  bg = createSim(); bg.syncRoster([]);
  try { history.replaceState(null, '', location.pathname + (KEEP ? '?' + KEEP.slice(1) : '')); } catch {}
  if (reason === 'idle' || reason === 'hidden') openLobby(lobbyKind); ui.lastBoard = ''; renderChrome();
  if ((reason === 'idle' || reason === 'hidden') && was) {
    $('#code').value = was; $('#joinBtn').textContent = 'Join room ' + was;
    status(reason === 'idle' ? `You left room ${was} after 3 minutes without playing. Tap Join to hop back in.` : `You left room ${was} while the game was in the background. Tap Join to hop back in.`);
  }
}

// Idle players still cost messages every second, so they're sent home.
const IDLE_MS = 180000, IDLE_WARN_MS = 20000, HIDDEN_MS = 180000;
let lastInput = performance.now(), hiddenTimer = 0;
const active = () => { lastInput = performance.now(); };
['keydown', 'pointerdown', 'pointermove', 'wheel'].forEach((ev) => addEventListener(ev, active, { passive: true }));
document.addEventListener('visibilitychange', () => {
  clearTimeout(hiddenTimer);
  if (document.hidden && room) hiddenTimer = setTimeout(() => { if (room) leaveRoom('hidden'); }, HIDDEN_MS);
  else active();
});
function idleCheck(now) {
  if (!room || me.w) return 0;
  const left = IDLE_MS - (now - lastInput);
  if (left <= 0) { leaveRoom(document.hidden ? 'hidden' : 'idle'); return 0; }
  return left <= IDLE_WARN_MS ? Math.ceil(left / 1000) : 0;
}
let idleLeft = 0;

// ---------- local player
function myEnt(v) { return v && v.ents.find((e) => e.peer === me.id); }

function controls(dt, v) {
  const e = myEnt(v); if (!e) return;
  if (e.ep !== ctl.ep) { ctl.x = e.x; ctl.z = e.z; ctl.vx = ctl.vz = 0; ctl.ep = e.ep; ctl.face = e.face; ctl.dirty = true; }
  ctl.cool -= dt; ctl.throwT = Math.max(0, ctl.throwT - dt * 3.5);
  const canMove = v.phase === 'lobby' || v.phase === 'play';
  if (e.stun) { ctl.x += (e.x - ctl.x) * Math.min(1, dt * 10); ctl.z += (e.z - ctl.z) * Math.min(1, dt * 10); ctl.vx = ctl.vz = 0; ctl.wasStun = true; return; }
  if (ctl.wasStun) { ctl.wasStun = false; ctl.dirty = true; }
  const k = input.keys, w = new V3(joy.x, 0, joy.y);
  if (k.has('KeyW') || k.has('ArrowUp')) w.z -= 1;
  if (k.has('KeyS') || k.has('ArrowDown')) w.z += 1;
  if (k.has('KeyA') || k.has('ArrowLeft')) w.x -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) w.x += 1;
  if (w.length() > 1) w.normalize();
  if (!canMove) w.set(0, 0, 0);
  // Elf Shoes (+25%): the referee allows the extra speed (sim.js setReport), so my own page has to move me that much faster too.
  const top = K.HUMAN_SPEED * fxOf(e).speedMult * (v.hat.st === 'head' && v.hat.holder === e.id ? K.HOLD_SLOW : 1), kk = Math.min(1, dt * 10);
  ctl.vx += (w.x * top - ctl.vx) * kk; ctl.vz += (w.z * top - ctl.vz) * kk;
  ctl.x += ctl.vx * dt; ctl.z += ctl.vz * dt; constrain(ctl);
  const sp = Math.hypot(ctl.vx, ctl.vz);
  if (sp > 0.5 && ctl.throwT <= 0) { let d = Math.atan2(ctl.vx, ctl.vz) - ctl.face; d = Math.atan2(Math.sin(d), Math.cos(d)); ctl.face += d * Math.min(1, dt * 12); }
}

function tryThrow(tx, tz) {
  const v = currentView, e = myEnt(v);
  if (!e || e.stun || ctl.cool > 0 || e.ammo <= 0 || !(v.phase === 'lobby' || v.phase === 'play')) return;
  if (armed && cantThrow(armed, { ammo: e.ammo, max: maxOf(e), level: me.l || 1 })) armed = ''; // not enough snowballs any more: a plain throw
  ctl.sp = armed; armed = locked; ui.lastHud = ''; // a locked special stays armed for the next throw
  ctl.t++; ctl.ax = tx; ctl.az = tz; ctl.cool = K.HUMAN_COOL; ctl.throwT = 1; ctl.dirty = true; sfx('throw'); coach.thrown(); // first-match tips (coach.js)
  const dx = tx - ctl.x, dz = tz - ctl.z, l = Math.hypot(dx, dz) || 1; ctl.face = Math.atan2(dx, dz);
  if (!isHost && !ctl.sp) { // show my own plain snowball instantly; the referee's copy of it is hidden on my screen (specials: the referee's)
    const dist = Math.max(1.5, l), tt = dist / K.BALL_SPEED, mesh = toon(ballGeo, 0.02); mesh.material = ballMat(BY_ID.get(me.a.snow).color); scene.add(mesh);
    localBalls.push({ mesh, x: ctl.x + (dx / l) * 0.45, y: 1.6, z: ctl.z + (dz / l) * 0.45, vx: (dx / l) * K.BALL_SPEED, vy: (1.15 - 1.6) / tt + 0.5 * K.BALL_G * tt, vz: (dz / l) * K.BALL_SPEED, life: 2 });
  }
}

function report() { return { q: ++ctl.q, ep: ctl.ep, x: +ctl.x.toFixed(2), z: +ctl.z.toFixed(2), vx: +ctl.vx.toFixed(2), vz: +ctl.vz.toFixed(2), f: +ctl.face.toFixed(2), t: ctl.t, ax: +ctl.ax.toFixed(2), az: +ctl.az.toFixed(2), sp: ctl.sp || '' }; }
// SB1–SB3 (Cody: buttons under the snowball counter; keys Q, E, R on a computer): arms a special for the next throw.
// LOCK (Cody, 2026-10-03: "it's hard to click special then throw over and over"): a DOUBLE tap (or a quick double press of
// Q/E/R) locks that special on, so every throw uses it; a double tap again goes back to the normal ball. A single tap is the
// one-throw arm, as before, and clears a lock. Not enough snowballs for the locked one: that throw is plain, the lock stays.
let armed = '', locked = '', lastTap = { i: -1, t: 0, lockedBefore: '' };
const DOUBLE_MS = 350;
function arm(i) {
  const kind = mySlots().find((x) => x.n === i + 1)?.kind; if (!kind) return; // i: 0 = SB1 (key Q), 1 = SB2 (E), 2 = SB3 (R)
  const now = performance.now();
  if (lastTap.i === i && now - lastTap.t < DOUBLE_MS) { // the second tap of a double: lock it, or unlock if it was locked
    if (lastTap.lockedBefore === kind) { locked = ''; armed = ''; } else { locked = kind; armed = kind; }
    lastTap = { i: -1, t: 0, lockedBefore: '' };
  } else {
    lastTap = { i, t: now, lockedBefore: locked };
    locked = ''; armed = armed === kind ? '' : kind;
  }
  ui.lastHud = '';
}

// ---------- what to draw this frame
let currentView = null;
function interpolated(now) {
  if (!snaps.length) return null;
  const last = snaps[snaps.length - 1], rt = now - (snapMs(last.v.ents.filter((e) => !e.bot).length) + 60);
  let a = null, b = null;
  for (let i = snaps.length - 1; i > 0; i--) if (snaps[i - 1].at <= rt && snaps[i].at >= rt) { a = snaps[i - 1]; b = snaps[i]; break; }
  const v = { ...last.v, ents: last.v.ents.map((e) => ({ ...e })), age: (now - last.at) / 1000 };
  if (a && b) {
    const t = (rt - a.at) / Math.max(1, b.at - a.at);
    for (const e of v.ents) {
      const ea = a.v.ents.find((q) => q.id === e.id), eb = b.v.ents.find((q) => q.id === e.id);
      if (ea && eb && ea.ep === eb.ep) { e.x = ea.x + (eb.x - ea.x) * t; e.z = ea.z + (eb.z - ea.z) * t; let d = eb.face - ea.face; d = Math.atan2(Math.sin(d), Math.cos(d)); e.face = ea.face + d * t; }
    }
  } else {
    const ex = Math.min(Math.max(0, rt - last.at), 250) / 1000;
    for (const e of v.ents) { e.x += e.vx * ex; e.z += e.vz * ex; constrain(e); }
  }
  return v;
}

// ---------- events -> effects
function entPos(id, v = currentView) {
  const view = views.get(id); if (view) return new V3(view.rx, 0, view.rz);
  const e = v?.ents.find((q) => q.id === id); return e ? new V3(e.x, 0, e.z) : null;
}
function handleEvents(v) {
  for (const e of v.ev) {
    if (!Array.isArray(e) || e[0] <= lastEv) continue;
    lastEv = e[0];
    const [, k, a, b, c, d] = e, mine = (id) => { const me2 = myEnt(v); return me2 && me2.id === id; };
    callouts.onEvent(k, a, b, v); // the call-out feed and the end highlights count every event
    if (k === 'hit') { sfx('splat'); const p = new V3(+b || 0, +c || 1.2, +d || 0); burst.spawn(p, 16, 0xffffff, 3.5, 3); const at = entPos(a, v); if (at) pop(at.setY(2.7), 'SPLAT', mine(a) ? 'bad' : 'white'); }
    else if (k === 'knock') { sfx('knock'); const at = entPos(a, v); if (at) pop(at.setY(3.1), 'KNOCKED OFF!', mine(a) ? 'bad' : 'white'); const by = entPos(b, v); if (by && b) pop(by.setY(3.1), '+25', mine(b) ? '' : 'green'); }
    else if (k === 'catch') { sfx('catch'); const at = entPos(a, v); if (at) { burst.spawn(at.clone().setY(2.2), 16, C.gold, 3, 3); pop(at.setY(3.1), 'HEADER +50', 'big'); } }
    else if (k === 'boing') { sfx('boing'); const at = entPos(a, v); if (at) pop(at.setY(2.9), 'BOING', 'white'); }
    else if (k === 'pts') { const at = entPos(a, v); if (at) pop(at.setY(2.9), '+' + (+b || 0), mine(a) ? '' : 'green'); }
    else if (k === 'emote') showEmote('b' + a, +b); // a bot's emote (bots have no player id, so key by entity)
    else if (k === 'splat') burst.spawn(new V3(+a || 0, 0.1, +b || 0), 6, 0xffffff, 2, 1.5);
    else if (k === 'round') { sfx('round'); banner(K.ROUNDS > 1 ? `Round ${+a || 1} of ${K.ROUNDS}` : 'Go!'); } // one round (Cody 2026-10-03): just "Go!"
    else if (k === 'break') banner(`Round ${+a || 1} done`);
    else if (k === 'end') { banner('Match over'); setTimeout(() => refreshSeason(), 4000); } // the match server records season tasks at the end
  }
}

// ---------- DOM helpers
function pop(v, text, cls = '') {
  const p = toScreen(v, camera, W, H); if (p.behind) return;
  const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text;
  el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; $('#pops').appendChild(el); setTimeout(() => el.remove(), 1000);
}
function banner(text) { const b = $('#banner'); b.textContent = text; b.hidden = false; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); clearTimeout(banner.t); banner.t = setTimeout(() => { b.hidden = true; }, 2200); }
function status(t) { const s = $('#status'); if (s) s.textContent = t; }
const bubbles = new Map();
function showEmote(peer, i) { if (!(i >= 0 && i < EMOTES.length)) return; bubbles.set(peer, { text: EMOTES[i], until: performance.now() + 2600 }); }
let lastEmote = 0;
function sendEmote(i) {
  const now = performance.now(); if (now - lastEmote < 1200 || !inRoom()) return; lastEmote = now;
  showEmote(me.id, i); room?.sendEmote({ p: me.id, e: i });
}

// ---------- entity meshes
// A player's level (their profile's, announced with their look; guests 1). Until the referee runs on our server, this is what
// each player's browser says (the same trust as today's unranked matches; server/levels.js).
// The lookups come from refcore.js, the same ones the server referee uses: level, starting snowballs, the special snowballs a
// player brings (what's in their slots that their level opens; bots none), and gear (below).
const REF = refereeOpts((e) => (e.peer === me.id ? me : room?.peers().find((q) => q.id === e.peer)));
const { levelOf, startOf, specialsOf } = REF;
const mySpecials = () => specialsIn(me.a, me.l || 1, levelInfo(me.l || 1).sb);
// The special gear a player brings (gear.js gearIn: the gear slots their level opens, worn by level rules, no stacking). The
// referee reads it once at match start (a Present Box is turned into its pick then). Bots: none (Cody: bots stay normal).
const { gearOf } = REF;
// What a player's gear does, read from the REFEREE's snapshot (e.gear), never guessed from an avatar: a Present Box's pick is
// only known there. maxOf: the snowball counter's size (Santa Bag/Toy Sack +50%, Backpack +25%, rounded up), as sim.js holds it.
const fxOf = (e) => effectsOf(e?.gear);
const maxOf = (e) => heldWith(startOf(e), fxOf(e));
// My slots as the Avatar screen numbers them: [{ n: 1..3, kind }] for each open slot holding a special I can use (SB2 stays SB2).
const mySlots = () => { if (room && autoStart && styleOf(roomCode) === 'normal') return []; const lvl = me.l || 1, ok = new Set(mySpecials()); return SB_SLOTS.slice(0, levelInfo(lvl).sb).map((s, i) => ({ n: i + 1, kind: BY_ID.get(cleanAvatar(me.a)[s])?.special })).filter((x) => x.kind && ok.has(x.kind)); };
// Levels: when an Auto match ends, the host reports every finishing place (bots and guests as empty places) to the game
// server, which counts top-3 finishes for players with accounts, once per match (the match id travels with handovers).
// Only in server mode, and only from a signed-in host (the server checks the host played in it). Practice/private: nothing.
const reportedMatches = new Set();
async function reportFinish(v) {
  if (!SERVER || practice || !isHost || !autoStart || !sim?.S.mid || reportedMatches.has(sim.S.mid) || !me.pid) return;
  reportedMatches.add(sim.S.mid);
  const order = [...v.ents].sort((a, b) => b.score - a.score || a.id - b.id);
  const pidOf = (e) => (e.bot ? null : e.peer === me.id ? me.pid : room?.peers().find((q) => q.id === e.peer)?.pid || null);
  try {
    const r = await call('finish', { match: { id: sim.S.mid, auto: true, places: order.map(pidOf) } });
    const mine = r?.counted?.find((c) => c.you);
    if (mine && profile) { profile.level = mine.level; profile.xp = mine.xp; me.l = mine.level; renderProgress(profile); }
  } catch { /* the next match counts; nothing is lost but this one finish */ }
}
// The match load screen (Cody, 2026-10-01): each player's level, games played, top-3 %, rank points, special snowballs and
// special gear. The numbers come from the game server's public 'stats' action, once per match; without the server (or for a
// guest) they show as a dash. Level and loadout come from each player's presence (what their own browser announces).
const statsOf = new Map(); let statsFor = '';
const infoOf = (e) => (e.peer === me.id ? { a: me.a, l: me.l, pid: me.pid } : room?.peers().find((q) => q.id === e.peer) || {});
function loadStats(v) {
  if (!SERVER || !v.mid || statsFor === v.mid) return; statsFor = v.mid;
  const ids = v.ents.filter((e) => !e.bot).map((e) => infoOf(e).pid).filter(Boolean);
  if (ids.length) call('stats', { profiles: ids }).then((r) => { for (const p of r?.players || []) statsOf.set(p.id, p); }).catch(() => { statsFor = ''; });
}
// A player's gear for the load screen, by the item names players bought (Cody: Toy Sack, Gift Box keep their names): the slots
// their level opens, as the match wears them (gearIn). A Gift Box shows what it turned into, from the referee's snapshot.
const gearItemName = (kind) => [...BY_ID.values()].find((it) => it.gear === kind)?.name || kind;
function gearNames(a, lvl, e) {
  const c = cleanAvatar(a), kinds = gearIn(a, lvl), pick = (e.gear || []).find((k) => !kinds.includes(k));
  return GEAR_SLOTS.slice(0, levelInfo(lvl).gear).map((s) => BY_ID.get(c[s])).filter((it) => it?.gear && kinds.includes(it.gear))
    .map((it) => it.name + (it.gear === 'present' && pick ? ' (' + gearItemName(pick) + ')' : ''));
}
function lineupRow(e, v) {
  const team = v.mode === 'team' ? ` <u class="t${e.team}">${TEAM_NAME[e.team]}</u>` : '';
  if (e.bot) return `<li class="bot"><span class="who">${esc(nameOf(e))} <i>elf bot</i>${team}</span></li>`;
  const p = infoOf(e), st = p.pid ? statsOf.get(p.pid) : null, lvl = clampLevel(st?.level ?? p.l), dash = (x) => (st ? x : '–');
  const sbs = specialsIn(p.a || {}, lvl, levelInfo(lvl).sb).map((k) => SPECIALS[k].name), gear = gearNames(p.a || {}, lvl, e);
  return `<li class="${e.peer === me.id ? 'me' : ''}"><span class="who">${esc(nameOf(e))}${e.peer === me.id ? ' <em>you</em>' : ''}${team}</span><b class="lv">LV ${lvl}</b>
    <dl><div><dt>Games</dt><dd>${dash(st?.games)}</dd></div><div><dt>Top 3</dt><dd>${dash(st?.top3Pct + '%')}</dd></div><div><dt>Rank pts</dt><dd>${dash(st?.rankPoints)}</dd></div></dl>
    <p class="kit"><span>Snowballs</span>${sbs.length ? sbs.map(esc).join(' · ') : 'plain only'}</p><p class="kit"><span>Gear</span>${gear.length ? gear.map(esc).join(' · ') : 'none'}</p></li>`;
}
// The SB buttons under the counter: one per open slot with a special in it (name and how many snowballs it uses). A button is
// off when it can't be thrown now (not enough snowballs; Rain: a full counter and level 5). Pressed = armed for the next throw.
function sbRow(m) {
  const list = mySlots(); if (!list.length) return '';
  const level = me.l || 1, max = maxOf(m);
  return `<div class="sbrow">${list.map(({ n, kind: k }) => { const S = SPECIALS[k], why = cantThrow(k, { ammo: m.ammo, max, level });
    // a locked one stays tappable even when it can't be thrown right now (a disabled button ignores taps: no way to unlock it)
    const lock = locked === k, off = why ? (lock ? 'aria-disabled="true"' : 'disabled') : '';
    return `<button type="button" data-sb="${n - 1}" aria-pressed="${armed === k}" ${lock ? 'data-locked="true"' : ''} ${off} title="${S.note}${why ? ' (' + why + ')' : ''}. Tap: next throw. Double-tap: lock it on${lock ? ' (double-tap again for normal snowballs)' : ''}."><img class="sbpic" alt="SB${n}" src="${thumbnail(BY_ID.get('sb_' + k))}"> ${S.name} <small>${S.cost === 'all' ? 'all' : S.cost}</small>${lock ? '<em class="sblock">Locked</em>' : ''}</button>`; }).join('')}</div>`;
}
const { avatarOf } = REF;
const ballMats = new Map();
function ballMat(color) { let m = ballMats.get(color); if (!m) { m = TOON.clone(); m.color = new THREE.Color(color); ballMats.set(color, m); } return m; }
const snowColor = (ent) => (!ent ? 0xf5f1e8 : BY_ID.get(avatarOf(ent).snow).color);
function syncViews(v) {
  const seen = new Set();
  for (const e of v.ents) {
    seen.add(e.id);
    // the gear is the REFEREE's (e.gear: a Present Box already turned into its gear), so every screen dresses them the same
    const key = `${v.mode === 'team' ? e.team : ''}|${e.peer === me.id}|${JSON.stringify(avatarOf(e))}|${(e.gear || []).join()}`;
    let w = views.get(e.id);
    if (w && w.key !== key) { scene.remove(w.mesh, w.ring); disposeTree(w.mesh); w.label.remove(); views.delete(e.id); w = null; }
    if (!w) {
      const mesh = avatarCharacter(avatarOf(e), v.mode === 'team' ? { shirt: TEAM_SHIRT[e.team] ?? C.elf, gear: e.gear } : { gear: e.gear });
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
      ring.position.y = 0.05; scene.add(mesh, ring);
      const label = document.createElement('div'); label.className = 'tag'; $('#tags').appendChild(label);
      w = { mesh, ring, label, key, rx: e.x, rz: e.z, face: e.face, speed: 0, xh: e.xh }; views.set(e.id, w);
    }
  }
  for (const [id, w] of views) if (!seen.has(id)) { scene.remove(w.mesh, w.ring); disposeTree(w.mesh); w.label.remove(); views.delete(id); }
}

// ---------- input
const input = { keys: new Set() };
// Joystick (Cody, 2026-10-01): on touch screens it sits on screen during a match and is the ONLY way to move; any other tap,
// anywhere (the left side too), throws there. LOCKED in place (Cody, 2026-10-02: "it slides around when I play"): pulling past
// its edge only pushes the knob to full speed. To move it: TRIPLE-TAP AND HOLD it (3 touches within JOY_TAPS_MS, the third held
// JOY_HOLD_MS): it lights up and follows the finger; let go and it stays there (remembered). ox/oy: its centre on screen.
const joy = { x: 0, y: 0, id: null, ox: 0, oy: 0, taps: [], moving: false, holdTimer: 0 };
const JOY_TAPS_MS = 700, JOY_HOLD_MS = 350;
const JOY_MAX = 42, JOY_GRAB = 72; // knob travel; how near its centre a touch must start to steer
const touchUI = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const coach = createCoach({ touch: touchUI, el: $('#coach') }); // first-match tips (coach.js)
// match call-outs and end highlights (callouts.js): names from the view, 'You' for me
const callouts = createCallouts({ el: $('#feed'), banner, nameOf: (id, v) => { const e = v?.ents.find((q) => q.id === id); return !e ? 'Someone' : e.peer === me.id && !e.bot ? 'You' : nameOf(e); } });
function joyHome() { // remembered as a share of the screen, so it survives turning the phone
  let p = null; try { p = JSON.parse(store.get('sh_joy') || 'null'); } catch {}
  const x = p ? p.fx * W : 84, y = p ? p.fy * H : H - (H < 480 ? 84 : 176); // default: bottom left (above the emotes when they span the bottom)
  joy.ox = Math.min(W - 60, Math.max(60, x)); joy.oy = Math.min(H - 60, Math.max(110, y));
  const j = $('#joy'); j.style.left = joy.ox + 'px'; j.style.top = joy.oy + 'px';
}
// Zoom (Cody): ＋/− during a match, and the mouse wheel. Remembered. No pinch: a finger landing throws in this game.
// Zoom steps (Cody: "let them pick in sections until they get what they want"): each − press pulls back 15%, as far as anyone
// likes; ZOOM_MAX only stops where the scene would stop drawing. The fog pulls back with the camera, so a far view isn't fogged.
const ZOOM_MIN = 0.6, ZOOM_MAX = 4;
let fog0 = null; // the plaza fog as built (plaza.js); the camera code scales it with the zoom
let zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(store.get('sh_zoom')) || 1));
const setZoom = (z) => { zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)); store.set('sh_zoom', String(Math.round(zoom * 100) / 100)); };
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  input.keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Space') { const v = currentView, m = myEnt(v); if (m) { const foes = v.ents.filter((o) => o.id !== m.id && (v.mode === 'team' ? o.team !== m.team : true)); const f = foes.reduce((b, o) => (!b || Math.hypot(o.x - ctl.x, o.z - ctl.z) < Math.hypot(b.x - ctl.x, b.z - ctl.z) ? o : b), null); if (f) tryThrow(f.x, f.z); } }
  const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code); if (n >= 0) sendEmote(n);
});
addEventListener('keyup', (e) => input.keys.delete(e.code));
addEventListener('keydown', (e) => { if (e.target instanceof HTMLInputElement || e.repeat) return; const i = ['KeyQ', 'KeyE', 'KeyR'].indexOf(e.code); if (i >= 0 && inRoom()) arm(i); });
document.querySelector('#hud').addEventListener('pointerdown', (e) => { const b = e.target.closest('[data-sb]'); if (!b) return; e.stopPropagation(); arm(+b.dataset.sb); });
addEventListener('blur', () => input.keys.clear());
const ray = new THREE.Raycaster(), ground = new THREE.Plane(new V3(0, 1, 0), 0);
const groundAt = (cx, cy) => { ray.setFromCamera({ x: (cx / W) * 2 - 1, y: -(cy / H) * 2 + 1 }, camera); return ray.ray.intersectPlane(ground, new V3()); };
canvas.addEventListener('pointerdown', (e) => {
  if (!inRoom()) return;
  if (e.pointerType === 'touch' && !$('#joy').hidden && joy.id === null && Math.hypot(e.clientX - joy.ox, e.clientY - joy.oy) <= JOY_GRAB) {
    joy.id = e.pointerId; $('#joy').classList.add('on');
    // triple-tap and hold: the third touch inside the time window, still held a moment later, picks the joystick up
    // timed by when the finger touched (e.timeStamp), not when the page got to it: on a slow or busy phone touches are handled
    // late, which made three quick taps look slow (found by the controls test at ~3 frames a second)
    const now = e.timeStamp || performance.now(); joy.taps = [...joy.taps.filter((t) => now - t < JOY_TAPS_MS), now];
    clearTimeout(joy.holdTimer);
    if (joy.taps.length >= 3) { joy.taps = []; const id = e.pointerId; joy.holdTimer = setTimeout(() => { if (joy.id === id) startMoving(); }, JOY_HOLD_MS); }
    steer(e.clientX, e.clientY); return;
  }
  const p = groundAt(e.clientX, e.clientY); if (p) tryThrow(p.x, p.z);
});
function startMoving() { joy.moving = true; joy.x = joy.y = 0; const j = $('#joy'); j.classList.add('moving'); j.style.setProperty('--jx', '0px'); j.style.setProperty('--jy', '0px'); }
function steer(cx, cy) {
  if (joy.moving) { // picked up (triple-tap and hold): the whole joystick follows the finger
    joy.ox = Math.min(W - 60, Math.max(60, cx)); joy.oy = Math.min(H - 60, Math.max(110, cy));
    const j = $('#joy'); j.style.left = joy.ox + 'px'; j.style.top = joy.oy + 'px'; return;
  }
  let x = cx - joy.ox, y = cy - joy.oy; const l = Math.hypot(x, y);
  if (l > JOY_MAX) { x *= JOY_MAX / l; y *= JOY_MAX / l; } // locked: past the edge is just full speed
  joy.x = x / JOY_MAX; joy.y = y / JOY_MAX; const j = $('#joy');
  j.style.left = joy.ox + 'px'; j.style.top = joy.oy + 'px'; j.style.setProperty('--jx', x + 'px'); j.style.setProperty('--jy', y + 'px');
}
addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) steer(e.clientX, e.clientY); });
const endJoy = (e) => {
  if (e.pointerId !== joy.id) return;
  clearTimeout(joy.holdTimer);
  joy.id = null; joy.x = joy.y = 0; const j = $('#joy'); j.classList.remove('on', 'moving'); j.style.setProperty('--jx', '0px'); j.style.setProperty('--jy', '0px');
  if (joy.moving) { joy.moving = false; store.set('sh_joy', JSON.stringify({ fx: joy.ox / W, fy: joy.oy / H })); } // moved: it stays there
};
canvas.addEventListener('wheel', (e) => { if (inRoom()) setZoom(zoom * (e.deltaY > 0 ? 1.1 : 1 / 1.1)); }, { passive: true });
$('#zoomIn').addEventListener('click', () => setZoom(zoom / 1.15));
$('#zoomOut').addEventListener('click', () => setZoom(zoom * 1.15));
addEventListener('pointerup', endJoy); addEventListener('pointercancel', endJoy);

// ---------- chrome: home, lobby, HUD, board
const ui = { lastHud: '', lastBoard: '', lastCard: '', lastCount: 0 };
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function renderChrome() {
  const v = currentView;
  $('#roomchip').hidden = !inRoom(); $('#emotes').hidden = !inRoom() || !!me.w; $('#leave').hidden = !inRoom();
  const joyOn = inRoom() && touchUI && !me.w; // players on touch screens; never watchers
  if (joyOn && $('#joy').hidden) joyHome();
  $('#joy').hidden = !joyOn; $('#zoom').hidden = !inRoom();
  $('#nav').hidden = inRoom(); $('#pages').hidden = inRoom(); $('#gamebar').hidden = !inRoom(); $('#tags').hidden = !inRoom();
  preview.visible = !inRoom() && tabs?.tab === 'avatar';
  if (inRoom()) {
    const count = practice ? 1 : room.peers().filter((p) => !p.w).length, watchers = practice ? 0 : room.peers().filter((p) => p.w).length;
    $('#roomchip').innerHTML = practice ? (trial ? `<i>Trying</i><b>${esc(SPECIALS[trial.kind].name)}</b>` : '<i>Practice</i><b>vs bots</b>')
      : `<i>${me.w ? 'Watching' : autoStart ? 'Auto match' : 'Room'}</i><b>${esc(autoStart ? (roomMode === 'team' ? 'TEAM' : 'FFA') : roomCode)}</b><span>${idleLeft ? `<em class="idle">Still there? Leaving in ${idleLeft}s</em>` : `${count} playing${watchers ? ` · ${watchers} watching` : ''}${isHost ? ' · you referee' : ''}`}</span>`;
  }
  const cnt = inRoom() && v && v.phase === 'count' ? Math.max(1, Math.ceil(v.time)) : 0;
  if (cnt !== ui.lastCount) { ui.lastCount = cnt; const c = $('#count'); c.hidden = !cnt; if (cnt) { c.textContent = cnt; c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); sfx('tick'); } }
  // Out of a match: clear the scoreboard too (it used to linger after Leave, showing over the Avatar tab on Cody's phone).
  if (!inRoom() || !v) { coach.update(null); if (ui.lastCard) { $('#panel').hidden = true; ui.lastCard = ''; } setHud(''); ui.lastBoard = ''; $('#board').hidden = true; return; }
  const m = myEnt(v);
  coach.update(v, me.w ? null : m); // first-match tips: move, throw, get the hat (coach.js)
  callouts.tick(v); // who takes the lead, 10 seconds left
  const humans = v.ents.filter((e) => !e.bot);
  // lobby / results panel
  let card = '';
  if (v.phase === 'lobby' && (v.pub || autoStart)) {
    const roster = humans.map((e) => `<li>${esc(nameOf(e))}${e.peer === me.id ? ' <em>you</em>' : ''}${v.mode === 'team' ? ` <u class="t${e.team}">${TEAM_NAME[e.team]}</u>` : ''}</li>`).join('');
    card = `<div class="eyebrow">${v.rk ? 'Ranked' : 'Auto match'} · ${v.mode === 'team' ? 'TEAM' : 'FFA'}${styleOf(roomCode) === 'normal' ? ' · Normal play' : ' · Special gear'}${me.w ? ' · watching' : ''}</div><h2>${v.wait ? 'Looking for another real player…' : v.cd ? `Starting in ${Math.ceil(v.cd)}` : 'Finding players…'}</h2>
      <ul class="roster">${roster}</ul><p class="dim">${v.rk ? 'Ranked needs 2 real players. Leave before it starts and your ticket comes back. ' : 'More players can still join. '}Bots fill any empty spots when it starts.</p>`;
  } else if (v.phase === 'lobby') {
    const share = practice ? '' : `<p class="share">Friends join with code <b>${esc(roomCode)}</b> or this link:<br><span class="link">${esc(location.origin + location.pathname + '?room=' + roomCode + REF_KEEP)}</span></p>`;
    const roster = humans.map((e) => `<li>${esc(nameOf(e))}${e.peer === me.id ? ' <em>you</em>' : ''}${v.mode === 'team' ? ` <u class="t${e.team}">${TEAM_NAME[e.team]}</u>` : ''}</li>`).join('');
    const bots = v.ents.length - humans.length;
    card = `<div class="eyebrow">Warm-up · run around, throw, grab the hat</div><h2>Snowball Square</h2>${share}
      <ul class="roster">${roster}</ul><p class="dim">${bots ? `${bots} elf bot${bots > 1 ? 's' : ''} fill empty spots.` : ''} Up to 8 players.</p>
      ${canRun() && !me.w ? `<div class="modes" role="radiogroup" aria-label="Match mode"><button data-mode="ffa" aria-checked="${v.mode === 'ffa'}" role="radio">Everyone vs the hat</button>${TEAM_PAUSED ? '' : `<button data-mode="team" aria-checked="${v.mode === 'team'}" role="radio">Nice vs Naughty</button>`}</div>
      ${room?.kind === 'server' ? `<div class="together"><button class="sec" data-act="together">Auto match together</button><p class="dim">Take everyone here into a public match (bots and other players fill it up). Public matches count for levels and daily tasks; this room's matches don't.</p>${togetherNote ? `<p class="note">${esc(togetherNote)}</p>` : ''}</div>` : ''}
      <button class="go" id="start">Start match</button>` : `<p class="wait">Mode: <b>${v.mode === 'team' ? 'Nice vs Naughty' : 'Everyone vs the hat'}</b>. Waiting for the referee to start…</p>`}`;
  } else if (v.phase === 'intro') {
    loadStats(v);
    card = `<div class="eyebrow">${practice ? 'Practice' : autoStart ? 'Auto match' : 'Room'} · ${v.mode === 'team' ? 'Nice vs Naughty' : 'Everyone vs the hat'}</div><h2>Starting in ${Math.ceil(v.time + K.COUNT_TIME)}</h2>
      <ul class="lineup">${[...v.ents].sort((a, b) => (b.peer === me.id) - (a.peer === me.id) || a.bot - b.bot).map((e) => lineupRow(e, v)).join('')}</ul>${SERVER ? '' : '<p class="dim">Games played, top-3 % and rank points show once the game server is live.</p>'}`;
  } else if (v.phase === 'end' && v.res) {
    reportFinish(v); // levels: once per Auto match, from the host (server mode)
    const sorted = [...v.ents].sort((a, b) => b.score - a.score);
    const mvp = v.ents.find((e) => e.id === v.res.mvp);
    const headline = v.mode === 'team' ? (v.res.team < 0 ? "It's a tie!" : `${TEAM_NAME[v.res.team]} team wins!`) : v.res.top < 0 ? "It's a tie!" : `${esc(nameOf(v.ents.find((e) => e.id === v.res.top) || {}))} wins!`;
    card = `<div class="eyebrow">Match over</div><h2>${headline}</h2>
      ${v.mode === 'team' ? `<div class="result"><div class="stat nice"><i>Nice</i><b>${v.ts[0]}</b></div><div class="stat naughty"><i>Naughty</i><b>${v.ts[1]}</b></div></div>` : ''}
      ${mvp ? `<div class="verdict">MVP: ${esc(nameOf(mvp))} with ${mvp.score}</div>` : ''}
      ${(callouts.last || []).length ? `<ul class="highs">${callouts.last.map((h) => `<li><i>${h.label}</i><b>${esc(h.who)}</b><span>${h.text}</span></li>`).join('')}</ul>` : ''}
      ${v.rk && rankNews ? `<div class="verdict">Rank points ${rankNews.change >= 0 ? '+' : '−'}${Math.abs(rankNews.change)}${Number.isFinite(rankNews.points) ? ` · now ${rankNews.points}` : ''}</div>` : ''}
      <ol class="final">${sorted.map((e) => `<li><span>${esc(nameOf(e))}${e.peer === me.id ? ' <em>you</em>' : ''}</span><b>${e.score}</b></li>`).join('')}</ol>
      ${endActions(v, sorted)}`;
  }
  if (card !== ui.lastCard) {
    ui.lastCard = card; const p = $('#panel'); p.hidden = !card; p.innerHTML = card; p.classList.toggle('intro', v.phase === 'intro');
    p.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { if (!modeAllowed(b.dataset.mode)) return; if (room?.kind === 'server') room.mode(b.dataset.mode); else if (isHost && sim) { sim.S.mode = b.dataset.mode; sim.syncRoster(sim.S.ents.filter((e) => !e.bot).map((e) => e.peer)); } }));
    p.querySelector('#start')?.addEventListener('click', () => { if (room?.kind === 'server') room.start(); else if (isHost && sim) sim.introMatch(sim.S.mode); });
  }
  // HUD
  if (v.phase === 'play' || v.phase === 'break') {
    if (armed && !mySpecials().includes(armed)) armed = '';
    if (locked && !mySpecials().includes(locked)) locked = '';
    setHud(`${K.ROUNDS > 1 ? `<div class="stat plaque"><i>Round</i><b>${v.round}/${K.ROUNDS}</b></div>` : ''}
      <div class="stat plaque ${v.time < 10 && v.phase === 'play' ? 'warn' : ''}"><i>${v.phase === 'break' ? 'Next round' : 'Time'}</i><b>${Math.ceil(v.time)}</b></div>
      ${m ? `<div class="stat plaque nice"><i>You${hitsLeft(m)}</i><b>${m.score}</b></div>` : ''}
      ${m ? `<div class="stat plaque"><i>Snowballs</i><div class="pips">${Array.from({ length: maxOf(m) }, (_, i) => `<u class="${i < m.ammo ? '' : 'off'}"></u>`).join('')}</div>${sbRow(m)}</div>` : ''}`);
  } else setHud('');
  // scoreboard
  let board = '';
  if (v.phase === 'play' || v.phase === 'break') {
    if (v.mode === 'team') board = `<div class="teams"><span class="t0">Nice <b>${v.ts[0]}</b></span><span class="t1">Naughty <b>${v.ts[1]}</b></span></div>`;
    board += [...v.ents].sort((a, b) => b.score - a.score).slice(0, 5).map((e) => `<li class="${e.peer === me.id ? 'me' : ''}"><span>${esc(nameOf(e))}</span><b>${e.score}</b></li>`).join('');
    board = `<ol>${board}</ol>`;
  }
  if (board !== ui.lastBoard) { ui.lastBoard = board; const b = $('#board'); b.hidden = !board; b.innerHTML = board; }
}
// Extra-hit gear (Pumpkin Costume etc.): a quiet note on my score plaque, how many extra hits I have left (the referee's count).
const hitsLeft = (m) => (fxOf(m).extraHits ? ` · +${m.xh} hit${m.xh === 1 ? '' : 's'}` : '');
function setHud(s) { if (s !== ui.lastHud) { ui.lastHud = s; $('#hud').innerHTML = s; } }

// ---------- per-frame drawing
const tmp = new V3(), camTarget = new V3(), camPos = new V3(0, 16, 22);
let viewShifted = false;
// The free area for the Avatar preview, in screen pixels: its centre and height.
function avatarBand() {
  const top = ($('#nav')?.getBoundingClientRect().bottom || 0) + 20, panel = document.querySelector('.avatar-panel')?.getBoundingClientRect();
  const tabbar = document.querySelector('#nav .tabs')?.getBoundingClientRect(), floor = tabbar && tabbar.top > H / 2 ? tabbar.top : H;
  if (panel && panel.width && panel.left > W * 0.35) { const bottom = floor - 8; return { cx: panel.left / 2, cy: (top + bottom) / 2, h: Math.max(120, bottom - top) }; } // panel beside
  const bottom = Math.min(floor, panel && panel.width ? panel.top : floor) - 8;
  return { cx: W / 2, cy: (top + bottom) / 2, h: Math.max(120, bottom - top) };                                                   // panel below
}
function draw(v, dt, t) {
  syncViews(v); gearTick(t); sparks.begin();
  const mine = myEnt(v);
  for (const e of v.ents) {
    const w = views.get(e.id); if (!w) continue;
    const isMe = mine && e.id === mine.id;
    const x = isMe ? ctl.x : e.x, z = isMe ? ctl.z : e.z, face = isMe ? ctl.face : e.face;
    const sp = Math.hypot(x - w.rx, z - w.rz) / Math.max(dt, 1e-3);
    w.speed += (Math.min(sp, 8) - w.speed) * Math.min(1, dt * 8);
    w.rx = x; w.rz = z;
    animate(w.mesh, dt, e.stun ? 0 : w.speed, isMe ? ctl.throwT : e.thr ? 0.8 : 0);
    // Elf Hat: that player is drawn at half size on every screen (the referee's gear, so everyone sees the same; sim.js hits it so)
    const sz = fxOf(e).size; w.mesh.scale.setScalar(sz);
    w.mesh.position.set(x, 0, z); w.mesh.rotation.y = face; w.mesh.rotation.z = e.stun ? Math.sin(t * 28) * 0.18 : 0;
    w.ring.position.set(x, 0.05, z);
    w.ring.material.color.set(e.immune ? 0xffd060 : isMe ? C.lantern : v.mode === 'team' ? TEAM_RING[e.team] : 0xdfe6f5); // gold = untouchable (just got the hat)
    w.ring.material.opacity = e.immune ? 0.6 + Math.sin(t * 14) * 0.35 : 0.8;
    w.ring.scale.setScalar((isMe ? 1.15 : 0.9) * sz);
    // Extra-hit gear took a hit (the referee's count went down): a few chips of the costume fly off
    if (e.xh < w.xh) { const k = (e.gear || []).find((g) => GEAR_TINT[g]); burst.spawn(tmp.set(x, 1.3 * sz, z), 8, GEAR_TINT[k] ?? 0xffffff, 3, 2.5); }
    w.xh = e.xh;
    // Special gear twinkles (Cody: "I just want the special stuff to pop out"): gold glints circling a wearer, so gear reads as special
    if (e.gear?.length) for (let j = 0; j < 4; j++) { const g = t * 1.7 + j * 1.571 + e.id, tw = Math.max(0, Math.sin(t * 5.5 + j * 2.1 + e.id));
      sparks.add(x + Math.cos(g) * 0.55 * sz, (0.75 + j * 0.38) * sz, z + Math.sin(g) * 0.55 * sz, (0.16 + 0.34 * tw) * sz, TR.goldStar, tw, STAR | SOLID); }
    // a jack-o'-lantern throws a warm candle glow in front of its carved face
    if (e.gear?.includes('pumpkin')) sparks.add(x + Math.sin(face) * 0.42 * sz, (1.76 + w.mesh.userData.body.position.y) * sz, z + Math.cos(face) * 0.42 * sz, 0.85 * sz, TR.fire[1], 0.35 + 0.08 * Math.sin(t * 9.1));
    const p = toScreen(tmp.set(x, 2.85 * sz, z), camera, W, H), b = bubbles.get(e.peer || 'b' + e.id);
    const say = b && b.until > performance.now() ? b.text : '';
    w.label.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    const text = say || nameOf(e); if (w.label.dataset.t !== text) { w.label.dataset.t = text; w.label.textContent = text; }
    w.label.classList.toggle('say', !!say); w.label.classList.toggle('me', !!isMe); w.label.hidden = p.behind;
  }
  // hat
  const h = v.hat; let hx = h.x, hy = h.y, hz = h.z, rot = null;
  hatShadow.visible = landRing.visible = false;
  for (const [id, w] of views) { const c = w.mesh.userData.hatMesh; if (c) c.visible = !(h.st === 'head' && h.holder === id); } // a worn cosmetic hat steps aside for the Santa hat
  // hs: the wearer's drawn size (Elf Hat: half), so the Santa hat sits on a half-size head at half size
  let hs = 1;
  if (h.st === 'head') { const w = views.get(h.holder); if (w) { hs = w.mesh.scale.x; hx = w.rx; hz = w.rz; hy = (K.HEAD_Y + w.mesh.userData.body.position.y) * hs; rot = [0, w.mesh.rotation.y + Math.PI / 2, w.mesh.rotation.z]; } }
  else if (h.st === 'air') {
    const a = Math.min(v.age || 0, 1.2); hx = h.x + h.vx * a; hz = h.z + h.vz * a; hy = Math.max(0.15, h.y + h.vy * a - 0.5 * K.HAT_G * a * a);
    hatMesh.rotation.x += dt * 7; hatMesh.rotation.z += dt * 5;
    landRing.visible = true; landRing.position.set(h.lx, 0.06, h.lz); landRing.scale.setScalar(1 + Math.sin(t * 14) * 0.12);
    hatShadow.visible = true; hatShadow.position.set(hx, 0.04, hz); hatShadow.scale.setScalar(Math.max(0.3, 1.3 - hy * 0.12));
  } else if (h.st === 'ped') { hy = K.PED_TOP + 0.05 + Math.sin(t * 2) * 0.06; rot = [0, t * 0.8, 0]; }
  else rot = [0, hatMesh.rotation.y, 0.4];
  if (rot) hatMesh.rotation.set(...rot);
  hatMesh.position.set(hx, hy, hz);
  hatMesh.scale.setScalar(THREE.MathUtils.lerp(hatMesh.scale.x, h.st === 'ped' ? 2.2 : hs, Math.min(1, dt * 8)));
  hatGlow.position.set(hx, hy + 0.5, hz); hatGlow.material.opacity = 0.22 + Math.sin(t * 4) * 0.08;
  // snowballs: the referee's (extrapolated), except my own, which I drew instantly
  const a = Math.min(v.age || 0, 1);
  drawBalls.forEach((m) => { m.visible = false; }); drawTrail.forEach((m) => { m.visible = false; }); drawDrops.forEach((m) => { m.visible = false; }); drawMarks.forEach((m) => { m.visible = false; });
  let n = 0, nt = 0, nd = 0;
  // Sky Ball / Snowball Rain: each falling snowball comes down from above onto a marked spot (so it can be dodged)
  for (const p of v.drops || []) { const tl = p.t - a; if (tl < 0 || tl > 1.6) continue;
    if (!drawDrops[nd]) { drawDrops[nd] = toon(ballGeo, 0.02); scene.add(drawDrops[nd]); drawMarks[nd] = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.6, depthWrite: false })); drawMarks[nd].position.y = 0.06; scene.add(drawMarks[nd]); }
    const dm = drawDrops[nd], mk = drawMarks[nd++]; dm.material = ballMat(p.kind === 'sky' ? 0x9fd8ff : 0xf5f1e8); dm.visible = true; dm.position.set(p.x, 0.2 + tl * 9, p.z);
    mk.visible = true; mk.position.x = p.x; mk.position.z = p.z; mk.scale.setScalar(0.5 + (1.6 - tl) * 0.3);
    dropStreak(sparks, p, 0.2 + tl * 9, nd, t); }
  for (const b of v.balls) {
    if (!isHost && mine && b.owner === mine.id && !b.kind) continue;
    const y = b.y + b.vy * a - 0.5 * K.BALL_G * a * a; if (y < 0.05) continue;
    if (!drawBalls[n]) { drawBalls[n] = toon(ballGeo, 0.02); scene.add(drawBalls[n]); }
    const m = drawBalls[n++], px = b.x + b.vx * a, pz = b.z + b.vz * a;
    m.material = ballMat(BALL_COLOR[b.kind]?.(b) ?? snowColor(v.ents.find((q) => q.id === b.owner)));
    m.visible = true; m.position.set(px, y, pz); m.scale.setScalar(b.r || 1);
    if (b.kind === 'fire') for (let k = 1; k <= 3; k++) { // a short fire tail behind it
      if (!drawTrail[nt]) { drawTrail[nt] = toon(ballGeo, 0); scene.add(drawTrail[nt]); }
      const f = drawTrail[nt++], back = 0.022 * k; f.material = ballMat([0xffb347, 0xff7a3a, 0xcf3128][k - 1]); f.visible = true; f.scale.setScalar(1 - k * 0.22);
      f.position.set(px - b.vx * back, y - (b.vy - K.BALL_G * a) * back, pz - b.vz * back); }
    if (b.kind) tracer(sparks, b, px, y, pz, b.vy - K.BALL_G * a, t);
  }
  sparks.end();
  for (let i = localBalls.length - 1; i >= 0; i--) {
    const b = localBalls[i]; b.vy -= K.BALL_G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
    b.mesh.position.set(b.x, b.y, b.z);
    if (b.y < 0.08 || b.life <= 0) { scene.remove(b.mesh); localBalls.splice(i, 1); }
  }
  // camera
  if (!inRoom() && fog0 && scene.fog) { scene.fog.near = fog0.near; scene.fog.far = fog0.far; } // outside a match: the normal fog
  if (viewShifted && !(tabs?.tab === 'avatar' && !inRoom())) { camera.clearViewOffset(); viewShifted = false; }
  if (inRoom()) {
    // Players follow themselves; watchers follow the hat. The zoom scales how far back the camera sits.
    const portrait = H > W * 1.1, watch = !mine, rate = Math.min(1, dt * (watch ? 1.5 : 3));
    const fov = watch ? (portrait ? 66 : 52) : (portrait ? 62 : 50);
    const base = watch ? (portrait ? new V3(0, 26, 19) : new V3(0, 18, 16)) : (portrait ? new V3(0, 21, 15) : new V3(0, 14, 12.5));
    const lookY = watch ? 0.5 : 0.6, lookBack = watch ? 1 : 1.2;
    camTarget.lerp(watch ? tmp.set(hatMesh.position.x * 0.5, 0, hatMesh.position.z * 0.5) : tmp.set(ctl.x * 0.55, 0, ctl.z * 0.55), rate);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const pos = camTarget.clone().add(base.clone().multiplyScalar(zoom)), look = new V3(camTarget.x, lookY, camTarget.z - lookBack);
    camPos.lerp(pos, rate); camera.position.copy(camPos); camera.lookAt(look);
    if (scene.fog) { fog0 ||= { near: scene.fog.near, far: scene.fog.far }; const k = Math.max(1, zoom); scene.fog.near = fog0.near * k; scene.fog.far = fog0.far * k; } // the plaza's own fog, pulled back with the camera
  } else if (tabs?.tab === 'avatar') {
    // Frame the whole character, hat included, in the space the page actually leaves free: below the top bar and above
    // (phones upright) or beside (wide or sideways screens) the editor panel. Fixed camera spots cut the head off on
    // Cody's Galaxy S22+ (2026-09-30), so the camera distance and the picture's offset follow the free area every frame.
    const band = avatarBand(), fov = 30, tall = 2.5; // the character with its hat is about 2.4 units tall
    camera.fov = fov; camera.updateProjectionMatrix();
    const fill = band.h > 480 ? 0.72 : 0.86, d = (tall * H) / (fill * band.h * 2 * Math.tan((fov * Math.PI) / 360)); // big screens: a little room around
    camTarget.set(0, 0, 6.5);
    camera.position.set(0, 1.35, 6.5 + d); camera.lookAt(0, 1.15, 6.5);
    camera.setViewOffset(W, H, W / 2 - band.cx, H / 2 - band.cy, W, H); viewShifted = true;
    preview.rotation.y = Math.sin(t * 0.5) * 0.5; animate(preview.userData.ch, dt, 0);
  } else {
    if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
    const ang = t * 0.07; camTarget.set(0, 0, 0); camPos.set(Math.sin(ang) * 23, 13, Math.cos(ang) * 23);
    camera.position.copy(camPos); camera.lookAt(0, 1, 0);
  }
}
const drawBalls = [], drawTrail = [], drawDrops = [], drawMarks = [];
// (tests) a fingerprint of a drawn character: vertex count + a weighted sum of positions and colours, unlit pieces counted apart
function lookSig(m) { if (!m) return null; let n = 0, sum = 0, glow = 0;
  m.traverse((o) => { const g = o.geometry; if (!g || o.material?.side === THREE.BackSide) return; const p = g.attributes.position.array, c = g.attributes.color?.array || [];
    n += p.length / 3; if (o.material?.isMeshBasicMaterial) glow += p.length / 3; for (let i = 0; i < p.length; i++) sum += p[i] * ((i % 5) + 1) + (c[i] || 0) * 3; });
  return { n, glow, sum: Math.round(sum * 100) / 100 }; }
// How special snowballs look in flight (colours, tracers, glow): mockups/ballfx.js, shared with the Store and Avatar pictures.

// ---------- main loop
let last = performance.now(), T = 0, chromeAt = 0;
function frame() {
  const now = performance.now(), dt = Math.min((now - last) / 1000, 1 / 20); last = now; T += dt;
  plaza.update(T); snow.update(dt, T, camTarget); burst.update(dt);
  let v;
  if (!inRoom()) { bg.step(dt); v = decode(bg.snapshot()); v.age = 0; }
  else {
    election(now);
    if (isHost) {
      const ids = practice ? [me.id] : room.peers().filter((p) => !p.w).sort((a, b) => (better(a, b) ? -1 : 1)).map((p) => p.id);
      if (!ids.includes(me.id)) ids.unshift(me.id);
      if (roomMode && sim.S.phase === 'lobby' && sim.S.mode !== roomMode) sim.S.mode = roomMode;
      sim.syncRoster(ids);
      if (autoStart && sim.S.phase === 'lobby') {
        const humans = sim.S.ents.filter((e) => !e.bot).length, want = autoStartMs(humans);
        if (cdEnd === null || cdEnd - now > want) cdEnd = now + want;
        if (now >= cdEnd) { sim.introMatch(sim.S.mode); cdEnd = null; }
      } else cdEnd = null;
      if (practice && againWanted && sim.S.phase === 'lobby') { againWanted = false; sim.introMatch(sim.S.mode); } // results card: Play again
      if (ctl.ep >= 0) sim.setReport(me.id, report());
      sim.step(dt);
      const s = sim.snapshot(); s.hid = me.id; s.hj = me.j; s.pub = autoStart ? 1 : 0; s.cd = cdEnd ? Math.max(0, (cdEnd - now) / 1000) : 0;
      if (room && autoStart && now - boardAt > 3000) { boardAt = now; publishSummary(); }
      lastRaw = s;
      if (room && now - lastSnapSent >= snapMs(sim.S.ents.filter((e) => !e.bot).length)) { room.sendSnap(s); lastSnapSent = now; }
      v = decode(s); v.age = 0; handleEvents(v);
    } else {
      v = interpolated(now);
      // Only report when the referee's guess (last report + velocity) would be off, plus a heartbeat.
      const ls = ctl.lastRep, since = Math.min((now - ctl.lastSent) / 1000, 0.4);
      if (ls && (Math.hypot(ls.x + ls.vx * since - ctl.x, ls.z + ls.vz * since - ctl.z) > 0.35 || Math.hypot(ls.vx - ctl.vx, ls.vz - ctl.vz) > 1.2)) ctl.dirty = true;
      if (v && Math.hypot(ctl.vx, ctl.vz) > 0.2 && now - ctl.lastSent > REP_MOVING_MS) ctl.dirty = true;
      if (v && ctl.ep >= 0 && room && (ctl.dirty || now - ctl.lastSent > REP_IDLE_MS) && now - ctl.lastSent > REP_MIN_MS) { const r = report(); room.sendRep(r); ctl.lastRep = r; ctl.lastSent = now; ctl.dirty = false; }
    }
  }
  currentView = v;
  if (v) { if (inRoom()) controls(dt, v); draw(v, dt, T); }
  if (inRoom() && !isHost && !v) status('Waiting for the referee…');
  idleLeft = idleCheck(now);
  if (now - chromeAt > 150) { chromeAt = now; renderChrome(); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------- home screen wiring
$('#name').value = me.n;
const preset = cleanCode(params.get('room'));
if (preset) { $('#code').value = preset; $('#joinBtn').textContent = 'Join room ' + preset; queueMicrotask(() => openLobby('unranked')); }
function publishSummary() {
  const v = currentView; if (!v) return;
  const top = [...v.ents].sort((a, b) => b.score - a.score)[0];
  board.publish({ code: roomCode, mode: v.mode, ranked: 0, phase: v.phase, round: v.round, time: Math.ceil(v.time),
    humans: room.peers().filter((p) => !p.w).length, watchers: room.peers().filter((p) => p.w).length,
    leader: top && v.phase !== 'lobby' ? nameOf(top) : '', lscore: top ? top.score : 0 }).catch(() => {});
}

// Server mode: the "Test version" notes tell the truth for this mode (button audit 2026-10-02: they said nothing could be bought
// while buying worked). Devnet: real steps with test SANTA; mainnet: no note. The network comes from the server's 'market'.
if (SERVER) call('market').then((m) => {
  const notes = document.querySelectorAll('.testnote');
  if (m?.cluster === 'devnet') notes.forEach((n) => { n.innerHTML = '<b>Test network</b> Purchases and prizes use test SANTA on Solana devnet: the real steps, with no real value.'; });
  else if (m?.cluster) notes.forEach((n) => { n.hidden = true; });
}).catch(() => {});
// The ranked lobby's ticket line (game server 'tickets'): free ones left today, bought ones, when the free ones refill.
async function showTickets(ranked) {
  const el = $('#tixLine'); el.hidden = true;
  if (!ranked) return;
  const r = await refreshTickets(app.profile); // also updates Player Progress
  if (lobbyKind !== 'ranked') return; // the player switched lobbies meanwhile
  if (r?.error === 'sign in first') { el.textContent = 'Sign in to play ranked.'; el.hidden = false; return; }
  if (!r || r.error || !Number.isFinite(r.free)) return;
  const h = Math.max(0, Math.ceil((r.resetsAt - Date.now()) / 3600000));
  el.innerHTML = `Your tickets <b>${r.free + r.extra} / ${TICKET_MAX}</b> · 10 free a day${r.free < 10 ? ` · refill in ${h} h` : ''}`;
  el.hidden = false;
}
// ---------- lobbies: Unranked (FFA / TEAM) and FFA RANKED, each with a live games list and Watch now
let stopBoard = null;
// GAMES WAITING FOR PLAYERS (Cody, 2026-10-03) on the Play page: public Auto match rooms (not ranked) still in their waiting
// room, with someone in them and a free seat (seats held for a friends' group count as taken). Live while the Play page shows.
let stopWait = null;
function renderWaiting(list = []) {
  const el = $('#waitList'); if (!el) return;
  const wait = list.filter((g) => !g.ranked && g.phase === 'lobby' && isPublic(cleanCode(g.code)) && (Number(g.humans) || 0) > 0 && (g.free ?? K.MAX_HUMANS - (Number(g.humans) || 0)) > 0)
    .sort((a, b) => (Number(b.humans) || 0) - (Number(a.humans) || 0));
  el.innerHTML = wait.length ? wait.map((g) => `<div class="wg"><b>${g.mode === 'team' ? 'Nice vs Naughty' : 'Free-for-all'} · ${(g.style || 'gear') === 'normal' ? 'Normal play' : 'Special gear'}</b>
      <span><em class="seats">${Number(g.humans) || 0}/${K.MAX_HUMANS}</em> players · ${Number.isFinite(g.starts) && g.starts !== null ? `starts in ${g.starts}s` : 'waiting for more'}</span>
      <button class="go" data-join="${esc(cleanCode(g.code))}">Join</button></div>`).join('')
    : '<p class="dim">Nobody is waiting right now. <button class="sec" data-act-start>Start one</button> and others will join you.</p>';
}
function watchWaiting(on) {
  if (on && !stopWait) board.watch(renderWaiting).then((stop) => { if (stopWait === 'pending') stopWait = stop; else stop(); }).catch(() => { $('#waitList').innerHTML = '<p class="dim">Could not load the waiting games right now.</p>'; });
  if (on && !stopWait) stopWait = 'pending';
  if (!on && stopWait) { if (typeof stopWait === 'function') stopWait(); stopWait = null; }
}
$('#waitList').addEventListener('click', (e) => {
  const j = e.target.closest('[data-join]'); if (j) return enterRoom(j.dataset.join);
  if (e.target.closest('[data-act-start]')) { openLobby('unranked'); $('#quick').click(); }
});
function openLobby(kind) {
  lobbyKind = kind; const ranked = kind === 'ranked';
  $('#lobbyEyebrow').textContent = ranked ? 'Ranked · 1 ticket · sign-in needed' : 'Unranked · free';
  $('#lobbyTitle').textContent = ranked ? 'FFA RANKED' : 'Unranked';
  $('#tourney').hidden = !ranked;
  document.querySelectorAll('#home .unr').forEach((el) => { el.hidden = ranked; });
  // ranked opens with the referee server (it holds the ticket and picks the room); without it, still 'opening soon'
  showTickets(ranked);
  $('#quick').disabled = ranked && !REFEREE; $('#quick').textContent = ranked ? (REFEREE ? 'Auto match · 1 ticket' : 'Auto match · opening soon') : 'Auto match';
  document.querySelectorAll('[data-amode]').forEach((b) => { b.checked = autoModes.includes(b.dataset.amode); });
  document.querySelectorAll('[data-astyle]').forEach((b) => { b.checked = autoStyles.includes(b.dataset.astyle); });
  $('#home').hidden = false; status('');
  if (!stopBoard) board.watch(renderGames).then((stop) => { stopBoard = stop; }).catch(() => { $('#gamesList').innerHTML = '<p class="dim">Couldn\'t load the games list right now.</p>'; });
}
function closeLobby() { $('#home').hidden = true; if (stopBoard) { stopBoard(); stopBoard = null; } }
let lastGames = [];
function renderGames(list = lastGames) {
  lastGames = list;
  const ranked = lobbyKind === 'ranked';
  const games = list.filter((g) => (ranked ? g.ranked : !g.ranked && autoModes.includes(g.mode)) && autoStyles.includes(g.style || 'gear') && isPublic(cleanCode(g.code)))
    .sort((a, b) => (b.watchers - a.watchers) || (b.humans - a.humans));
  const label = ranked ? 'ranked' : autoModes.length > 1 ? 'FFA or TEAM' : autoModes[0] === 'team' ? 'TEAM' : 'FFA';
  $('#gamesList').innerHTML = games.length ? games.map((g) => {
    const full = (Number(g.watchers) || 0) >= MAX_WATCHERS;
    const state = g.phase === 'lobby' || g.phase === 'intro' || g.phase === 'count' ? 'Starting soon' : g.phase === 'end' ? 'Final scores' : `${K.ROUNDS > 1 ? `Round ${Number(g.round) || 1}/${K.ROUNDS} · ` : 'Playing · '}${Number(g.time) || 0}s`;
    return `<div class="game"><div><b>${g.mode === 'team' ? 'TEAM' : 'FFA'}${(g.style || 'gear') === 'normal' ? ' · Normal' : ' · Gear'}</b><span>${Number(g.humans) || 0}/8 players${g.watchers ? ` · ${Number(g.watchers)} watching` : ''}</span></div>
      <div><span>${esc(state)}</span>${g.leader ? `<span>Leader: ${esc(String(g.leader).slice(0, 14))} · ${Number(g.lscore) || 0}</span>` : ''}</div>
      <button class="sec" data-watch="${esc(cleanCode(g.code))}" ${full ? 'disabled' : ''}>${full ? 'Watchers full' : 'Watch now'}</button></div>`;
  }).join('') : `<p class="dim">No ${label} games right now.${ranked && !REFEREE ? ' Ranked opens soon.' : ' Start one with Auto match.'}</p>`;
}
$('#gamesList').addEventListener('click', (e) => { const b = e.target.closest('[data-watch]'); if (b) enterRoom(b.dataset.watch, false, { watch: true }); });
// the tick boxes: at least one stays ticked (unticking the last one is undone); remembered
if (TEAM_PAUSED) document.querySelector('[data-amode="team"]')?.closest('label')?.setAttribute('hidden', ''); // team play paused (Cody 2026-10-03)
document.querySelectorAll('[data-amode]').forEach((b) => b.addEventListener('change', () => {
  const next = [...document.querySelectorAll('[data-amode]')].filter((x) => x.checked).map((x) => x.dataset.amode);
  if (!next.length) { b.checked = true; return; }
  autoModes = next.filter(modeAllowed); if (!autoModes.length) autoModes = ['ffa']; lobbyMode = autoModes[0]; store.set('sq_amodes', JSON.stringify(autoModes)); renderGames();
}));
document.querySelectorAll('[data-astyle]').forEach((b) => b.addEventListener('change', () => {
  const next = [...document.querySelectorAll('[data-astyle]')].filter((x) => x.checked).map((x) => x.dataset.astyle);
  if (!next.length) { b.checked = true; return; }
  autoStyles = next; store.set('sq_astyles', JSON.stringify(autoStyles)); renderGames();
}));
$('#playRanked').addEventListener('click', () => openLobby('ranked'));
$('#quick').addEventListener('click', () => (lobbyKind === 'ranked' ? enterRoom('', false, { ranked: true }) : enterRoom('', true)));
$('#create').addEventListener('click', () => enterRoom(rid(4).toUpperCase().replace(/[^A-Z0-9]/g, 'X'), false));
$('#joinBtn').addEventListener('click', () => { const c = cleanCode($('#code').value); if (c.length < 3) { status('Type the room code your friend shared.'); return; } enterRoom(c, false); });
$('#practice').addEventListener('click', startPractice);
$('#playUnranked').addEventListener('click', () => openLobby('unranked'));
$('#playBig').addEventListener('click', () => { tabs.show('play'); scrollTo(0, 0); }); // Home's Play now: the Play page and its match types (Cody 2026-10-03)
// the Games tab's jump buttons: scroll to that game (just under the sticky top bar)
document.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => document.getElementById(b.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
$('#homeClose').addEventListener('click', closeLobby);
$('#leave').addEventListener('click', () => leaveRoom());
initSoundButtons();
$('#emotes').innerHTML = EMOTES.map((e, i) => `<button data-e="${i}" title="Key ${i + 1}">${esc(e)}</button>`).join('');
$('#emotes').addEventListener('click', (e) => { const b = e.target.closest('[data-e]'); if (b) sendEmote(+b.dataset.e); });
addEventListener('pagehide', () => { if (isHost) board.unpublish(); room?.leave(); });

// ---------- site tabs
const preview = new THREE.Group(); preview.position.set(0, 0, 6.5); preview.visible = false; scene.add(preview);
const previewHat = toon(hatGeo({ scale: 0.88 }), 0.03);
function setPreview(a) {
  if (preview.userData.ch) { preview.remove(preview.userData.ch); disposeTree(preview.userData.ch); }
  // the preview wears what is in the gear slots (a Gift Box: a wrapped present); an Elf Hat or a Santa cap takes the hat's place
  // (retired gear, gear.js RETIRED, isn't worn: an old saved Pumpkin Costume doesn't draw, as in a match)
  const gear = GEAR_SLOTS.map((s) => BY_ID.get(cleanAvatar(a)[s])?.gear).filter((k) => k && !RETIRED.has(k));
  const ch = avatarCharacter(a, { gear }); preview.userData.ch = ch; preview.add(ch);
  // a costume hat (the Nutcracker's shako, the Ice Crown) is shown instead of the Santa hat: they're tall and the Santa hat hid them
  const costumeHat = !!BY_ID.get(cleanAvatar(a).hat)?.set;
  previewHat.position.set(0, K.HEAD_Y, 0); previewHat.rotation.y = Math.PI / 2; preview.add(previewHat); previewHat.visible = !costumeHat && !gear.some((k) => k === 'elfhat' || k === 'santa');
}
setPreview(me.a);
const acct = accounts({ local: LOCAL, rules: { SLOTS, SB_SLOTS, GEAR_SLOTS, statOf, BY_ID, usable, DEFAULT_AVATAR } });
const app = {
  me, accounts: acct,
  hasWallet: () => LOCAL || !!findWallet(),
  get profile() { return profile; }, set profile(p) { profile = p; },
  setIdentity(name, a) { trial = null; locked = armed = ''; me.n = cleanName(name) || me.n; me.a = cleanAvatar(a); me.l = clampLevel(profile?.level); me.pid = profile?.id || null; $('#name').value = me.n; $('#name').readOnly = !!profile; setPreview(me.a); },
  preview: (a) => setPreview(a),
  tryInPractice, // the Store's Try it on a special snowball (tabs.js)
  get theme() { return theme; }, setTheme,
  onTab: (tab) => {
    ui.lastBoard = '';
    watchWaiting(tab === 'play'); // the Play page's waiting games, live only while it shows
    if (tab === 'store' || tab === 'games') refreshBurned(); // the money strip's burned-so-far (kept a minute)
    if (tab === 'games') refreshWallet(true); // my wallet under the games
    if (tab === 'games' || gamesMod) (gamesMod ||= import('./games.js')).then((g) => g.showGames(tab === 'games', { name: () => me.n || 'You' }));
  },
};
let gamesMod = null; // Games tab code loads the first time it's opened
const tabs = initTabs(app);
initSeason({ thumbnail, onBought: () => tabs.reloadMine() }); // the Season card (seasonui.js); a bought pass reloads what I own
initMoneyStrips(); // the Store and Games pages' money strip (moneystrip.js): burn, treasury, pool, burned so far
initWalletLines(); // my wallet's SANTA under each game's play buttons (walletline.js)
// the pool jackpot banner for everyone (jackpotbar.js); its button opens Games at that game
initShareWins(); // Share this win buttons after a winning run (sharecard.js)
initJackpotBar({ el: $('#jpbar'), inMatch: () => inRoom(), go: (id) => { tabs.show('games'); setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 700); } });
renderProgress(app.profile); // the Play page's Player Progress box (guests: level 1; updated on sign-in)
initLottery(); // the Store's Santa Lottery (lotteryui.js)
$('#loading')?.remove();
frame();

window.__sq = { get armed() { return armed; }, get locked() { return locked; }, get trial() { return trial && trial.kind; }, get myLook() { return { ...me.a }; }, throwAt: (x, z) => tryThrow(x, z), drawn: () => ({ drops: drawDrops.filter((m) => m.visible).length }), camDist: () => camera.position.distanceTo(camTarget), setZoom, get zoom() { return zoom; },
  // tests: where the ring's outer wall lands on screen (-1..1 = inside the view), all the way round, at the ground and wall top
  ringFit: (r = 15.0) => { let x0 = 9, x1 = -9, y0 = 9, y1 = -9; for (let i = 0; i < 72; i++) for (const y of [0, 1]) { const a = (i / 72) * Math.PI * 2, p = new V3(Math.cos(a) * r, y, Math.sin(a) * r).project(camera); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } return { x0, x1, y0, y1 }; }, get room() { return room; }, get isHost() { return isHost; }, get sim() { return sim; }, get view() { return currentView; }, me, ctl, enterRoom, leaveRoom, startPractice, idleFor: (ms) => { lastInput = performance.now() - ms; },
  // tests: the plaza theme, and what's on the GPU / in the scene (a theme swap must not leave the old plaza behind)
  // tests: the size a player is drawn at (Elf Hat: 0.5)
  drawnScale: (id) => views.get(id)?.mesh.scale.x,
  // tests: a fingerprint of how a player is drawn (vertices, shapes, colours), the same for a gear list on the default look,
  // and how many tracer/shimmer points were drawn last frame (plain snowballs and no gear: none); whether a player's cosmetic
  // hat is showing (it steps aside while they wear the Santa hat)
  look: (id) => lookSig(views.get(id)?.mesh), hatShown: (id) => views.get(id)?.mesh.userData.hatMesh?.visible ?? null, lookOf: (gear) => { const m = avatarCharacter(DEFAULT_AVATAR, { gear }), r = lookSig(m); disposeTree(m); return r; }, sparks: () => sparks.n,
  get theme() { return theme; }, setTheme, gpu: () => ({ ...renderer.info.memory, kids: scene.children.length, fog: scene.fog && [scene.fog.color.getHex(), scene.fog.near, scene.fog.far] }) };
