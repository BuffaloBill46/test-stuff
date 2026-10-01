// Santa Hat Legends (the Snowball Square game): lobby, rooms, referee hand-off, smoothing, HUD.
import { THREE, C, animate, Snow, Burst, toon, part, build, glow, toScreen, TOON, hatGeo } from './kit.js';
import { buildPlaza, makeHat, shadowBlob } from './plaza.js';
import { createSim, K, PHASES, constrain } from './sim.js';
import { openRoom, accounts, findWallet, gamesBoard } from './net.js';
import { SLOTS, BY_ID, DEFAULT_AVATAR, cleanAvatar, usable, ballRules } from './catalog.js';
import { initTabs, avatarCharacter, renderProgress } from './tabs.js';
import { levelInfo, clampLevel } from './levels.js';
import { SERVER, call } from './gameserver.js';
import { play as sfx, initSoundButtons } from './sfx.js';

const V3 = THREE.Vector3;
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const LOCAL = params.get('net') === 'local';
// Free-plan budget is 100 messages/second and every receiver counts, so fuller rooms send snapshots less often.
const snapMs = (humans) => (humans <= 4 ? 125 : humans <= 6 ? 170 : 220);
const REP_MIN_MS = 160, REP_MOVING_MS = 350, REP_IDLE_MS = 1000; // the referee stops extrapolating after 400 ms
const EMOTES = ['Ho ho ho!', 'Nice throw!', 'Gimme the hat!', 'Oops!'];
// Bots look and sound like players so nobody can pick them out and farm them.
const BOT_NAMES = ['frostbyte', 'Kaylee_x', 'mikey2012', 'NoScopeNate', 'ghostpepper', 'jollyroger7', 'TannerB', 'lil_snowcone',
  'Ricky.D', 'sn0wday', 'Brooke_22', 'pinecone_pete', 'Icicle', 'BigTay', 'zoe.plays', 'Marcus_77', 'hat_hunter', 'tobiasz',
  'coco.bean', 'SleighDrip', 'justjess', 'DannyDoes', 'yeti_mode', 'Bexxie', 'owen_s', 'crumbsy', 'LunaLux', 'Mr_Mittens',
  'jayjay41', 'nikki.k', 'Frosty_Fin', 'ThatGuyAl', 'kringle', 'Wiggs', 'ellie_b', 'soup_dog', 'TreyTheGreat', 'maple_mo',
  'Gus_G', 'aurora.b', 'Sam_Plays', 'dustin_t', 'mochi', 'Rae', 'krispy_k', 'BenjiBoo', 'noodle_arms', 'Quinn.Z'];
const botHash = (id) => { let h = (id * 2654435761) >>> 0; h ^= h >>> 15; return Math.imul(h, 2246822519) >>> 0; };
const botAvatars = new Map();
function botAvatar(id) {
  if (!botAvatars.has(id)) {
    let h = botHash(id + 7); const a = {};
    for (const s of SLOTS) { const opts = [...BY_ID.values()].filter((i) => i.slot === s && !(s === 'face' && i.face === 'beard')); a[s] = opts[h % opts.length].id; h = Math.imul(h ^ (h >>> 13), 1103515245) >>> 0; }
    botAvatars.set(id, a);
  }
  return botAvatars.get(id);
}
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
const plaza = buildPlaza(scene);
const snow = new Snow(1400, [60, 24, 60]); scene.add(snow.points);
const burst = new Burst(320); scene.add(burst.mesh);
const ballGeo = build([part(new THREE.IcosahedronGeometry(0.17, 0), C.brim, { jit: 0.02 })]);
const hatMesh = makeHat(0.88); scene.add(hatMesh);
const hatShadow = shadowBlob(); scene.add(hatShadow);
const hatGlow = glow(0xffd29a, 3.2, 0.3); scene.add(hatGlow);
const landRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.86, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
landRing.position.y = 0.06; scene.add(landRing);
const ringGeo = new THREE.RingGeometry(0.55, 0.72, 24).rotateX(-Math.PI / 2);

let W = innerWidth, H = innerHeight;
function resize() { W = innerWidth; H = innerHeight; renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- state
const me = { id: rid(10), n: cleanName(store.get('sq_name')) || 'Player ' + (100 + Math.floor(Math.random() * 900)), j: 0, a: cleanAvatar((() => { try { return JSON.parse(store.get('sq_avatar')); } catch { return null; } })()) };
let profile = null; // signed-in wallet profile, if any
let room = null, roomCode = '', practice = false, isHost = false, sim = null, joinedAt = 0;
let lastRaw = null, curHost = null, snaps = [], lastEv = 0, lastSnapSent = 0, lastSnapAt = 0;
// Auto match rooms have a fixed mode and start on their own; private rooms are started by their referee.
let roomMode = null, autoStart = false, cdEnd = null, boardAt = 0, lobbyKind = 'unranked', lobbyMode = 'ffa';
const MAX_WATCHERS = 4, isPublic = (c) => /^P[FT][1-5]$/.test(c);
const board = gamesBoard({ local: LOCAL });
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
    ents: (Array.isArray(s.E) ? s.E : []).map((r) => ({ id: n(r[0]), peer: typeof r[1] === 'string' ? r[1] : null, bot: !!r[2], team: n(r[3]), x: n(r[4]), z: n(r[5]), vx: n(r[6]), vz: n(r[7]), face: n(r[8]), stun: !!r[9], ammo: n(r[10]), score: n(r[11]), thr: !!r[12], ep: n(r[13]) })),
    hat: { st: ['ped', 'head', 'air', 'ground'][H[0]] || 'ped', x: n(H[1]), y: n(H[2], K.PED_TOP), z: n(H[3]), vx: n(H[4]), vy: n(H[5]), vz: n(H[6]), holder: n(H[7], -1), lx: n(H[8]), lz: n(H[9]) },
    balls: (Array.isArray(s.B) ? s.B : []).map((b) => ({ id: n(b[0]), x: n(b[1]), y: n(b[2]), z: n(b[3]), vx: n(b[4]), vy: n(b[5]), vz: n(b[6]), owner: n(b[7]) })),
    ev: Array.isArray(s.V) ? s.V : [], res: Array.isArray(s.R) ? { team: s.R[0], top: s.R[1], mvp: s.R[2] } : null,
    cd: n(s.cd), pub: !!s.pub,
  };
}

const inRoom = () => !!room || practice;
const nameOf = (e) => (e.bot ? BOT_NAMES[botHash(e.id) % BOT_NAMES.length] : (e.peer === me.id ? me.n : names.get(e.peer)) || 'Player');

// ---------- referee hand-off
function becomeHost() {
  isHost = true; sim = createSim(Math.random, { rulesOf: (e) => ballRules(avatarOf(e)), startOf }); // each player's snowball rules (Ice Ball etc.) and starting snowballs (level)
  if (lastRaw) sim.load(lastRaw);
  room?.setHost(true);
  sim.S.ev.forEach((v) => { lastEv = Math.max(lastEv, v[0]); });
}
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
  if (!room || isHost || me.w || now - joinedAt < 2000 || now - lastSnapAt < 2500) return;
  const ps = room.peers().filter((p) => !p.w); if (!ps.some((p) => p.id === me.id)) ps.push(me);
  ps.sort((a, b) => (better(a, b) ? -1 : 1));
  if (ps[0].id === me.id) becomeHost();
}

// ---------- rooms
async function enterRoom(code, quick, opts = {}) {
  status(opts.watch ? 'Joining as a watcher…' : 'Connecting…');
  if (!profile) { me.n = cleanName($('#name')?.value) || me.n; store.set('sq_name', me.n); }
  me.w = !!opts.watch;
  const mode = opts.mode || lobbyMode;
  for (let attempt = 0; attempt < (quick ? 5 : 1); attempt++) {
    const c = quick ? 'P' + (mode === 'team' ? 'T' : 'F') + (attempt + 1) : code;
    me.j = Date.now();
    let r;
    try { r = await openRoom(c.toLowerCase(), me, { local: LOCAL }); }
    catch (e) { status("Couldn't reach the game server. Check your connection, or try Practice."); return; }
    await new Promise((res) => setTimeout(res, 1200));
    const players = r.peers().filter((p) => !p.w).length, watchers = r.peers().filter((p) => p.w && p.id !== me.id).length;
    if (me.w && watchers >= MAX_WATCHERS) { r.leave(); status(`That game already has ${MAX_WATCHERS} watchers. Try another.`); return; }
    if (!me.w && players > K.MAX_HUMANS) { r.leave(); if (quick) continue; status(`Room ${c} is full (8 players).`); return; }
    room = r; roomCode = c; practice = false; break;
  }
  if (!room) { status('All public rooms are full right now. Try a private room.'); return; }
  roomMode = isPublic(roomCode) ? (roomCode[1] === 'T' ? 'team' : 'ffa') : null; autoStart = isPublic(roomCode); cdEnd = null;
  closeLobby();
  room.on('snap', onSnap);
  room.on('rep', (id, r) => { if (isHost && sim) sim.setReport(id, r); });
  room.on('emote', (e) => { if (e && typeof e.p === 'string') showEmote(e.p, Number(e.e)); });
  room.on('peers', (ps) => ps.forEach((p) => names.set(p.id, cleanName(p.n) || 'Player')));
  room.peers().forEach((p) => names.set(p.id, cleanName(p.n) || 'Player'));
  joinedAt = performance.now(); lastSnapAt = 0; snaps = []; curHost = null; lastRaw = null; isHost = false; sim = null; ctl.ep = -1;
  try { history.replaceState(null, '', '?room=' + roomCode + (LOCAL ? '&net=local' : '')); } catch {}
  $('#home').hidden = true; status('');
  renderChrome();
}

function startPractice() {
  if (!profile) { me.n = cleanName($('#name')?.value) || me.n; store.set('sq_name', me.n); }
  practice = true; room = null; roomCode = ''; isHost = true; sim = createSim(Math.random, { rulesOf: (e) => ballRules(avatarOf(e)), startOf }); me.j = Date.now(); me.w = false; ctl.ep = -1; snaps = []; lastEv = 0;
  roomMode = null; autoStart = false; sim.S.mode = lobbyMode; closeLobby(); renderChrome();
}

function leaveRoom(reason) {
  const was = roomCode;
  if (isHost) board.unpublish();
  room?.leave(); room = null; practice = false; isHost = false; sim = null; snaps = []; lastRaw = null; curHost = null; me.w = false; roomMode = null; autoStart = false;
  bg = createSim(); bg.syncRoster([]);
  try { history.replaceState(null, '', location.pathname + (LOCAL ? '?net=local' : '')); } catch {}
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
  const top = K.HUMAN_SPEED * (v.hat.st === 'head' && v.hat.holder === e.id ? K.HOLD_SLOW : 1), kk = Math.min(1, dt * 10);
  ctl.vx += (w.x * top - ctl.vx) * kk; ctl.vz += (w.z * top - ctl.vz) * kk;
  ctl.x += ctl.vx * dt; ctl.z += ctl.vz * dt; constrain(ctl);
  const sp = Math.hypot(ctl.vx, ctl.vz);
  if (sp > 0.5 && ctl.throwT <= 0) { let d = Math.atan2(ctl.vx, ctl.vz) - ctl.face; d = Math.atan2(Math.sin(d), Math.cos(d)); ctl.face += d * Math.min(1, dt * 12); }
}

function tryThrow(tx, tz) {
  const v = currentView, e = myEnt(v);
  if (!e || e.stun || ctl.cool > 0 || e.ammo <= 0 || !(v.phase === 'lobby' || v.phase === 'play')) return;
  ctl.t++; ctl.ax = tx; ctl.az = tz; ctl.cool = K.HUMAN_COOL; ctl.throwT = 1; ctl.dirty = true; sfx('throw');
  const dx = tx - ctl.x, dz = tz - ctl.z, l = Math.hypot(dx, dz) || 1; ctl.face = Math.atan2(dx, dz);
  if (!isHost) { // show my own snowball instantly; the referee's copy of it is hidden on my screen
    const dist = Math.max(1.5, l), tt = dist / K.BALL_SPEED, mesh = toon(ballGeo, 0.02); mesh.material = ballMat(BY_ID.get(me.a.snow).color); scene.add(mesh);
    localBalls.push({ mesh, x: ctl.x + (dx / l) * 0.45, y: 1.6, z: ctl.z + (dz / l) * 0.45, vx: (dx / l) * K.BALL_SPEED, vy: (1.15 - 1.6) / tt + 0.5 * K.BALL_G * tt, vz: (dz / l) * K.BALL_SPEED, life: 2 });
  }
}

function report() { return { q: ++ctl.q, ep: ctl.ep, x: +ctl.x.toFixed(2), z: +ctl.z.toFixed(2), vx: +ctl.vx.toFixed(2), vz: +ctl.vz.toFixed(2), f: +ctl.face.toFixed(2), t: ctl.t, ax: +ctl.ax.toFixed(2), az: +ctl.az.toFixed(2) }; }

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
    if (k === 'hit') { sfx('splat'); const p = new V3(+b || 0, +c || 1.2, +d || 0); burst.spawn(p, 16, 0xffffff, 3.5, 3); const at = entPos(a, v); if (at) pop(at.setY(2.7), 'SPLAT', mine(a) ? 'bad' : 'white'); }
    else if (k === 'knock') { sfx('knock'); const at = entPos(a, v); if (at) pop(at.setY(3.1), 'KNOCKED OFF!', mine(a) ? 'bad' : 'white'); const by = entPos(b, v); if (by && b) pop(by.setY(3.1), '+25', mine(b) ? '' : 'green'); }
    else if (k === 'catch') { sfx('catch'); const at = entPos(a, v); if (at) { burst.spawn(at.clone().setY(2.2), 16, C.gold, 3, 3); pop(at.setY(3.1), 'HEADER +50', 'big'); } }
    else if (k === 'boing') { sfx('boing'); const at = entPos(a, v); if (at) pop(at.setY(2.9), 'BOING', 'white'); }
    else if (k === 'pts') { const at = entPos(a, v); if (at) pop(at.setY(2.9), '+' + (+b || 0), mine(a) ? '' : 'green'); }
    else if (k === 'emote') showEmote('b' + a, +b); // a bot's emote (bots have no player id, so key by entity)
    else if (k === 'splat') burst.spawn(new V3(+a || 0, 0.1, +b || 0), 6, 0xffffff, 2, 1.5);
    else if (k === 'round') { sfx('round'); banner(`Round ${+a || 1} of ${K.ROUNDS}`); }
    else if (k === 'break') banner(`Round ${+a || 1} done`);
    else if (k === 'end') banner('Match over');
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
function levelOf(e) {
  if (e.bot) return 1;
  if (e.peer === me.id) return me.l || 1;
  return clampLevel(room?.peers().find((q) => q.id === e.peer)?.l);
}
const startOf = (e) => levelInfo(levelOf(e)).start;
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
function avatarOf(e) {
  if (e.bot) return botAvatar(e.id);
  if (e.peer === me.id) return me.a;
  const p = room?.peers().find((q) => q.id === e.peer);
  return cleanAvatar(p && p.a);
}
const ballMats = new Map();
function ballMat(color) { let m = ballMats.get(color); if (!m) { m = TOON.clone(); m.color = new THREE.Color(color); ballMats.set(color, m); } return m; }
const snowColor = (ent) => (!ent ? 0xf5f1e8 : BY_ID.get(avatarOf(ent).snow).color);
function syncViews(v) {
  const seen = new Set();
  for (const e of v.ents) {
    seen.add(e.id);
    const key = `${v.mode === 'team' ? e.team : ''}|${e.peer === me.id}|${JSON.stringify(avatarOf(e))}`;
    let w = views.get(e.id);
    if (w && w.key !== key) { scene.remove(w.mesh, w.ring); w.label.remove(); views.delete(e.id); w = null; }
    if (!w) {
      const mesh = avatarCharacter(avatarOf(e), v.mode === 'team' ? { shirt: TEAM_SHIRT[e.team] ?? C.elf } : {});
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
      ring.position.y = 0.05; scene.add(mesh, ring);
      const label = document.createElement('div'); label.className = 'tag'; $('#tags').appendChild(label);
      w = { mesh, ring, label, key, rx: e.x, rz: e.z, face: e.face, speed: 0 }; views.set(e.id, w);
    }
  }
  for (const [id, w] of views) if (!seen.has(id)) { scene.remove(w.mesh, w.ring); w.label.remove(); views.delete(id); }
}

// ---------- input
const input = { keys: new Set() };
// Floating joystick (Cody, 2026-10-01): on touch screens it sits on screen during a match and is the ONLY way to move; any
// other tap, anywhere (the left side too), throws there. Pull past its edge and it follows your thumb; it stays where you
// let go (remembered), which is how players move it. ox/oy: its centre on screen.
const joy = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
const JOY_MAX = 42, JOY_GRAB = 72; // knob travel; how near its centre a touch must start to steer
const touchUI = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
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
addEventListener('blur', () => input.keys.clear());
const ray = new THREE.Raycaster(), ground = new THREE.Plane(new V3(0, 1, 0), 0);
const groundAt = (cx, cy) => { ray.setFromCamera({ x: (cx / W) * 2 - 1, y: -(cy / H) * 2 + 1 }, camera); return ray.ray.intersectPlane(ground, new V3()); };
canvas.addEventListener('pointerdown', (e) => {
  if (!inRoom()) return;
  if (e.pointerType === 'touch' && !$('#joy').hidden && joy.id === null && Math.hypot(e.clientX - joy.ox, e.clientY - joy.oy) <= JOY_GRAB) {
    joy.id = e.pointerId; $('#joy').classList.add('on'); steer(e.clientX, e.clientY); return;
  }
  const p = groundAt(e.clientX, e.clientY); if (p) tryThrow(p.x, p.z);
});
function steer(cx, cy) {
  let x = cx - joy.ox, y = cy - joy.oy; const l = Math.hypot(x, y);
  if (l > JOY_MAX) { // pulled past the edge: the joystick follows the thumb
    joy.ox = Math.min(W - 60, Math.max(60, cx - (x / l) * JOY_MAX)); joy.oy = Math.min(H - 60, Math.max(110, cy - (y / l) * JOY_MAX));
    x = cx - joy.ox; y = cy - joy.oy; const l2 = Math.hypot(x, y); if (l2 > JOY_MAX) { x *= JOY_MAX / l2; y *= JOY_MAX / l2; }
  }
  joy.x = x / JOY_MAX; joy.y = y / JOY_MAX; const j = $('#joy');
  j.style.left = joy.ox + 'px'; j.style.top = joy.oy + 'px'; j.style.setProperty('--jx', x + 'px'); j.style.setProperty('--jy', y + 'px');
}
addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) steer(e.clientX, e.clientY); });
const endJoy = (e) => {
  if (e.pointerId !== joy.id) return;
  joy.id = null; joy.x = joy.y = 0; const j = $('#joy'); j.classList.remove('on'); j.style.setProperty('--jx', '0px'); j.style.setProperty('--jy', '0px');
  store.set('sh_joy', JSON.stringify({ fx: joy.ox / W, fy: joy.oy / H })); // it stays where it was let go
};
canvas.addEventListener('wheel', (e) => { if (inRoom()) setZoom(zoom * (e.deltaY > 0 ? 1.1 : 1 / 1.1)); }, { passive: true });
$('#zoomIn').addEventListener('click', () => setZoom(zoom / 1.15));
$('#zoomOut').addEventListener('click', () => setZoom(zoom * 1.15));
addEventListener('pointerup', endJoy); addEventListener('pointercancel', endJoy);

// ---------- chrome: home, lobby, HUD, board
const ui = { lastHud: '', lastBoard: '', lastCard: '' };
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
    $('#roomchip').innerHTML = practice ? '<i>Practice</i><b>vs bots</b>'
      : `<i>${me.w ? 'Watching' : autoStart ? 'Auto match' : 'Room'}</i><b>${esc(autoStart ? (roomMode === 'team' ? 'TEAM' : 'FFA') : roomCode)}</b><span>${idleLeft ? `<em class="idle">Still there? Leaving in ${idleLeft}s</em>` : `${count} playing${watchers ? ` · ${watchers} watching` : ''}${isHost ? ' · you referee' : ''}`}</span>`;
  }
  // Out of a match: clear the scoreboard too (it used to linger after Leave, showing over the Avatar tab on Cody's phone).
  if (!inRoom() || !v) { if (ui.lastCard) { $('#panel').hidden = true; ui.lastCard = ''; } setHud(''); ui.lastBoard = ''; $('#board').hidden = true; return; }
  const m = myEnt(v);
  const humans = v.ents.filter((e) => !e.bot);
  // lobby / results panel
  let card = '';
  if (v.phase === 'lobby' && (v.pub || autoStart)) {
    const roster = humans.map((e) => `<li>${esc(nameOf(e))}${e.peer === me.id ? ' <em>you</em>' : ''}${v.mode === 'team' ? ` <u class="t${e.team}">${TEAM_NAME[e.team]}</u>` : ''}</li>`).join('');
    card = `<div class="eyebrow">Auto match · ${v.mode === 'team' ? 'TEAM' : 'FFA'}${me.w ? ' · watching' : ''}</div><h2>${v.cd ? `Starting in ${Math.ceil(v.cd)}` : 'Finding players…'}</h2>
      <ul class="roster">${roster}</ul><p class="dim">More players can still join. Bots fill any empty spots when it starts.</p>`;
  } else if (v.phase === 'lobby') {
    const share = practice ? '' : `<p class="share">Friends join with code <b>${esc(roomCode)}</b> or this link:<br><span class="link">${esc(location.origin + location.pathname + '?room=' + roomCode)}</span></p>`;
    const roster = humans.map((e) => `<li>${esc(nameOf(e))}${e.peer === me.id ? ' <em>you</em>' : ''}${v.mode === 'team' ? ` <u class="t${e.team}">${TEAM_NAME[e.team]}</u>` : ''}</li>`).join('');
    const bots = v.ents.length - humans.length;
    card = `<div class="eyebrow">Warm-up · run around, throw, grab the hat</div><h2>Snowball Square</h2>${share}
      <ul class="roster">${roster}</ul><p class="dim">${bots ? `${bots} elf bot${bots > 1 ? 's' : ''} fill empty spots.` : ''} Up to 8 players.</p>
      ${isHost && !me.w ? `<div class="modes" role="radiogroup" aria-label="Match mode"><button data-mode="ffa" aria-checked="${v.mode === 'ffa'}" role="radio">Everyone vs the hat</button><button data-mode="team" aria-checked="${v.mode === 'team'}" role="radio">Nice vs Naughty</button></div>
      <button class="go" id="start">Start match</button>` : `<p class="wait">Mode: <b>${v.mode === 'team' ? 'Nice vs Naughty' : 'Everyone vs the hat'}</b>. Waiting for the referee to start…</p>`}`;
  } else if (v.phase === 'end' && v.res) {
    reportFinish(v); // levels: once per Auto match, from the host (server mode)
    const sorted = [...v.ents].sort((a, b) => b.score - a.score);
    const mvp = v.ents.find((e) => e.id === v.res.mvp);
    const headline = v.mode === 'team' ? (v.res.team < 0 ? "It's a tie!" : `${TEAM_NAME[v.res.team]} team wins!`) : v.res.top < 0 ? "It's a tie!" : `${esc(nameOf(v.ents.find((e) => e.id === v.res.top) || {}))} wins!`;
    card = `<div class="eyebrow">Match over</div><h2>${headline}</h2>
      ${v.mode === 'team' ? `<div class="result"><div class="stat nice"><i>Nice</i><b>${v.ts[0]}</b></div><div class="stat naughty"><i>Naughty</i><b>${v.ts[1]}</b></div></div>` : ''}
      ${mvp ? `<div class="verdict">MVP: ${esc(nameOf(mvp))} with ${mvp.score}</div>` : ''}
      <ol class="final">${sorted.map((e) => `<li><span>${esc(nameOf(e))}${e.peer === me.id ? ' <em>you</em>' : ''}</span><b>${e.score}</b></li>`).join('')}</ol>
      <p class="dim">Back to the lobby in ${Math.ceil(v.time)}s</p>`;
  }
  if (card !== ui.lastCard) {
    ui.lastCard = card; const p = $('#panel'); p.hidden = !card; p.innerHTML = card;
    p.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { if (isHost && sim) { sim.S.mode = b.dataset.mode; sim.syncRoster(sim.S.ents.filter((e) => !e.bot).map((e) => e.peer)); } }));
    p.querySelector('#start')?.addEventListener('click', () => { if (isHost && sim) sim.startMatch(sim.S.mode); });
  }
  // HUD
  if (v.phase === 'play' || v.phase === 'break') {
    setHud(`<div class="stat plaque"><i>Round</i><b>${v.round}/${K.ROUNDS}</b></div>
      <div class="stat plaque ${v.time < 10 && v.phase === 'play' ? 'warn' : ''}"><i>${v.phase === 'break' ? 'Next round' : 'Time'}</i><b>${Math.ceil(v.time)}</b></div>
      ${m ? `<div class="stat plaque nice"><i>You</i><b>${m.score}</b></div>` : ''}
      ${m ? `<div class="stat plaque"><i>Snowballs</i><div class="pips">${Array.from({ length: startOf(m) }, (_, i) => `<u class="${i < m.ammo ? '' : 'off'}"></u>`).join('')}</div></div>` : ''}`);
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
  syncViews(v);
  const mine = myEnt(v);
  for (const e of v.ents) {
    const w = views.get(e.id); if (!w) continue;
    const isMe = mine && e.id === mine.id;
    const x = isMe ? ctl.x : e.x, z = isMe ? ctl.z : e.z, face = isMe ? ctl.face : e.face;
    const sp = Math.hypot(x - w.rx, z - w.rz) / Math.max(dt, 1e-3);
    w.speed += (Math.min(sp, 8) - w.speed) * Math.min(1, dt * 8);
    w.rx = x; w.rz = z;
    animate(w.mesh, dt, e.stun ? 0 : w.speed, isMe ? ctl.throwT : e.thr ? 0.8 : 0);
    w.mesh.position.set(x, 0, z); w.mesh.rotation.y = face; w.mesh.rotation.z = e.stun ? Math.sin(t * 28) * 0.18 : 0;
    w.ring.position.set(x, 0.05, z);
    w.ring.material.color.set(isMe ? C.lantern : v.mode === 'team' ? TEAM_RING[e.team] : 0xdfe6f5);
    w.ring.scale.setScalar(isMe ? 1.15 : 0.9);
    const p = toScreen(tmp.set(x, 2.85, z), camera, W, H), b = bubbles.get(e.peer || 'b' + e.id);
    const say = b && b.until > performance.now() ? b.text : '';
    w.label.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    const text = say || nameOf(e); if (w.label.dataset.t !== text) { w.label.dataset.t = text; w.label.textContent = text; }
    w.label.classList.toggle('say', !!say); w.label.classList.toggle('me', !!isMe); w.label.hidden = p.behind;
  }
  // hat
  const h = v.hat; let hx = h.x, hy = h.y, hz = h.z, rot = null;
  hatShadow.visible = landRing.visible = false;
  for (const [id, w] of views) { const c = w.mesh.userData.hatMesh; if (c) c.visible = !(h.st === 'head' && h.holder === id); } // a worn cosmetic hat steps aside for the Santa hat
  if (h.st === 'head') { const w = views.get(h.holder); if (w) { hx = w.rx; hz = w.rz; hy = K.HEAD_Y + w.mesh.userData.body.position.y; rot = [0, w.mesh.rotation.y + Math.PI / 2, w.mesh.rotation.z]; } }
  else if (h.st === 'air') {
    const a = Math.min(v.age || 0, 1.2); hx = h.x + h.vx * a; hz = h.z + h.vz * a; hy = Math.max(0.15, h.y + h.vy * a - 0.5 * K.HAT_G * a * a);
    hatMesh.rotation.x += dt * 7; hatMesh.rotation.z += dt * 5;
    landRing.visible = true; landRing.position.set(h.lx, 0.06, h.lz); landRing.scale.setScalar(1 + Math.sin(t * 14) * 0.12);
    hatShadow.visible = true; hatShadow.position.set(hx, 0.04, hz); hatShadow.scale.setScalar(Math.max(0.3, 1.3 - hy * 0.12));
  } else if (h.st === 'ped') { hy = K.PED_TOP + 0.05 + Math.sin(t * 2) * 0.06; rot = [0, t * 0.8, 0]; }
  else rot = [0, hatMesh.rotation.y, 0.4];
  if (rot) hatMesh.rotation.set(...rot);
  hatMesh.position.set(hx, hy, hz);
  hatMesh.scale.setScalar(THREE.MathUtils.lerp(hatMesh.scale.x, h.st === 'ped' ? 2.2 : 1, Math.min(1, dt * 8)));
  hatGlow.position.set(hx, hy + 0.5, hz); hatGlow.material.opacity = 0.22 + Math.sin(t * 4) * 0.08;
  // snowballs: the referee's (extrapolated), except my own, which I drew instantly
  const a = Math.min(v.age || 0, 1);
  drawBalls.forEach((m) => { m.visible = false; });
  let n = 0;
  for (const b of v.balls) {
    if (!isHost && mine && b.owner === mine.id) continue;
    const y = b.y + b.vy * a - 0.5 * K.BALL_G * a * a; if (y < 0.05) continue;
    if (!drawBalls[n]) { drawBalls[n] = toon(ballGeo, 0.02); scene.add(drawBalls[n]); }
    const m = drawBalls[n++]; m.material = ballMat(snowColor(v.ents.find((q) => q.id === b.owner)));
    m.visible = true; m.position.set(b.x + b.vx * a, y, b.z + b.vz * a);
  }
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
const drawBalls = [];

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
        const humans = sim.S.ents.filter((e) => !e.bot).length, want = humans >= 2 ? 15000 : 25000;
        if (cdEnd === null || cdEnd - now > want) cdEnd = now + want;
        if (now >= cdEnd) { sim.startMatch(sim.S.mode); cdEnd = null; }
      } else cdEnd = null;
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

// ---------- lobbies: Unranked (FFA / TEAM) and FFA RANKED, each with a live games list and Watch now
let stopBoard = null;
function openLobby(kind) {
  lobbyKind = kind; const ranked = kind === 'ranked';
  $('#lobbyEyebrow').textContent = ranked ? 'Ranked · 1 ticket · sign-in needed' : 'Unranked · free';
  $('#lobbyTitle').textContent = ranked ? 'FFA RANKED' : 'Unranked';
  $('#lobbyModes').hidden = ranked; $('#tourney').hidden = !ranked;
  document.querySelectorAll('#home .unr').forEach((el) => { el.hidden = ranked; });
  $('#quick').disabled = ranked; $('#quick').textContent = ranked ? 'Auto match · opening soon' : 'Auto match';
  document.querySelectorAll('[data-lmode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.lmode === lobbyMode)));
  $('#home').hidden = false; status('');
  if (!stopBoard) board.watch(renderGames).then((stop) => { stopBoard = stop; }).catch(() => { $('#gamesList').innerHTML = '<p class="dim">Couldn\'t load the games list right now.</p>'; });
}
function closeLobby() { $('#home').hidden = true; if (stopBoard) { stopBoard(); stopBoard = null; } }
let lastGames = [];
function renderGames(list = lastGames) {
  lastGames = list;
  const ranked = lobbyKind === 'ranked';
  const games = list.filter((g) => (ranked ? g.ranked : !g.ranked && g.mode === lobbyMode) && isPublic(cleanCode(g.code)))
    .sort((a, b) => (b.watchers - a.watchers) || (b.humans - a.humans));
  const label = ranked ? 'ranked' : lobbyMode === 'team' ? 'TEAM' : 'FFA';
  $('#gamesList').innerHTML = games.length ? games.map((g) => {
    const full = (Number(g.watchers) || 0) >= MAX_WATCHERS;
    const state = g.phase === 'lobby' ? 'Starting soon' : g.phase === 'end' ? 'Final scores' : `Round ${Number(g.round) || 1}/3 · ${Number(g.time) || 0}s`;
    return `<div class="game"><div><b>${g.mode === 'team' ? 'TEAM' : 'FFA'}</b><span>${Number(g.humans) || 0}/8 players${g.watchers ? ` · ${Number(g.watchers)} watching` : ''}</span></div>
      <div><span>${esc(state)}</span>${g.leader ? `<span>Leader: ${esc(String(g.leader).slice(0, 14))} · ${Number(g.lscore) || 0}</span>` : ''}</div>
      <button class="sec" data-watch="${esc(cleanCode(g.code))}" ${full ? 'disabled' : ''}>${full ? 'Watchers full' : 'Watch now'}</button></div>`;
  }).join('') : `<p class="dim">No ${label} games right now.${ranked ? ' Ranked opens soon.' : ' Start one with Auto match.'}</p>`;
}
$('#gamesList').addEventListener('click', (e) => { const b = e.target.closest('[data-watch]'); if (b) enterRoom(b.dataset.watch, false, { watch: true }); });
document.querySelectorAll('[data-lmode]').forEach((b) => b.addEventListener('click', () => { lobbyMode = b.dataset.lmode; document.querySelectorAll('[data-lmode]').forEach((x) => x.setAttribute('aria-checked', String(x === b))); renderGames(); }));
$('#playRanked').addEventListener('click', () => openLobby('ranked'));
$('#quick').addEventListener('click', () => enterRoom('', true));
$('#create').addEventListener('click', () => enterRoom(rid(4).toUpperCase().replace(/[^A-Z0-9]/g, 'X'), false));
$('#joinBtn').addEventListener('click', () => { const c = cleanCode($('#code').value); if (c.length < 3) { status('Type the room code your friend shared.'); return; } enterRoom(c, false); });
$('#practice').addEventListener('click', startPractice);
$('#playUnranked').addEventListener('click', () => openLobby('unranked'));
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
  if (preview.userData.ch) preview.remove(preview.userData.ch);
  const ch = avatarCharacter(a); preview.userData.ch = ch; preview.add(ch);
  previewHat.position.set(0, K.HEAD_Y, 0); previewHat.rotation.y = Math.PI / 2; preview.add(previewHat);
}
setPreview(me.a);
const acct = accounts({ local: LOCAL, rules: { SLOTS, BY_ID, usable, DEFAULT_AVATAR } });
const app = {
  me, accounts: acct,
  hasWallet: () => LOCAL || !!findWallet(),
  get profile() { return profile; }, set profile(p) { profile = p; },
  setIdentity(name, a) { me.n = cleanName(name) || me.n; me.a = cleanAvatar(a); me.l = clampLevel(profile?.level); me.pid = profile?.id || null; $('#name').value = me.n; $('#name').readOnly = !!profile; setPreview(me.a); },
  preview: (a) => setPreview(a),
  onTab: (tab) => {
    ui.lastBoard = '';
    if (tab === 'games' || gamesMod) (gamesMod ||= import('./games.js')).then((g) => g.showGames(tab === 'games', { name: () => me.n || 'You' }));
  },
};
let gamesMod = null; // Games tab code loads the first time it's opened
const tabs = initTabs(app);
renderProgress(app.profile); // the Play page's Player Progress box (guests: level 1; updated on sign-in)
$('#loading')?.remove();
frame();

window.__sq = { camDist: () => camera.position.distanceTo(camTarget), setZoom, get zoom() { return zoom; },
  // tests: where the ring's outer wall lands on screen (-1..1 = inside the view), all the way round, at the ground and wall top
  ringFit: (r = 15.0) => { let x0 = 9, x1 = -9, y0 = 9, y1 = -9; for (let i = 0; i < 72; i++) for (const y of [0, 1]) { const a = (i / 72) * Math.PI * 2, p = new V3(Math.cos(a) * r, y, Math.sin(a) * r).project(camera); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } return { x0, x1, y0, y1 }; }, get room() { return room; }, get isHost() { return isHost; }, get sim() { return sim; }, get view() { return currentView; }, me, ctl, enterRoom, leaveRoom, startPractice, idleFor: (ms) => { lastInput = performance.now() - ms; } };
