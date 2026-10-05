// Snowball Square match referee. Runs only on the host's browser; everyone else renders its snapshots.
// Pure game logic, no rendering, so it can be tested headless.
import { levelInfo } from './levels.js?v=1cebc9f32d';
import { VARIANTS, VARIANT_IDS } from './weekly.js?v=1cebc9f32d';
import { SPECIALS, SPECIAL_KINDS, DROP_HIT_RADIUS, cantThrow, costOf } from './specials.js?v=1cebc9f32d';
import { effectsOf, gearAllowed, resolvePresent, heldWith, gearMask, gearOfMask } from './gear.js?v=1cebc9f32d';
// Ball kinds in snapshots (B[9]): 0 normal, 1 ice, 2 split (before it splits), 3 giant, 4 fire, 5 a split piece.
const BALL_KIND = { '': 0, ice: 1, split: 2, giant: 3, fire: 4, piece: 5 }, DROP_KIND = { sky: 1, rain: 2 };
export const KIND_OF = ['', 'ice', 'split', 'giant', 'fire', 'piece'], DROP_OF = ['', 'sky', 'rain']; // the page reads snapshots with these
export const HAT_IMMUNE = 2; // seconds a player can't be hit after getting the Santa hat (Cody: fully untouchable)
export const K = {
  ARENA: 13.2, HEAD_Y: 2.05, BALL_G: 7, BALL_SPEED: 18, HAT_G: 16, PED_TOP: 1.71,
  // ROUND_TIME: seconds a round (Cody, 2026-10-02: was 90)
  // ROUNDS: rounds a match (Cody, 2026-10-03: one round; was 3)
  ROUND_TIME: 60, ROUNDS: 1, BREAK_TIME: 6, END_TIME: 12, INTRO_TIME: 5, COUNT_TIME: 5, MAX_HUMANS: 8, MIN_BODIES: 4,
  HUMAN_SPEED: 6.4, BOT_SPEED: 5.2, HOLD_SLOW: 0.86, MAX_BALLS: 18, HUMAN_COOL: 0.26,
  STUN: 0.9, // seconds a normal snowball hit knocks you down (special snowballs multiply it: catalog.js → rules.stun)
};
export const PTS = { hatSec: 10, header: 25, knock: 10, hit: 5 }; // knock the hat off 10, catch the flying hat 25 (Cody 2026-10-04; were 25 and 50)
export const PILES = [[-8, -5], [8, -6], [-7, 8], [8, 7]];
// intro: the match load screen (every player, their stats and loadout; also gives every phone time to load in); count: 5…1.
// Nobody moves, throws or grabs the hat in either (Cody, 2026-10-01). Added at the end so the older numbers keep their meaning.
export const PHASES = ['lobby', 'play', 'break', 'end', 'intro', 'count'];
const HAT = ['ped', 'head', 'air', 'ground'];

const hyp = Math.hypot;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const r2 = (v) => Math.round(v * 100) / 100;

// Keeps a body inside the ring and off the pedestal. Shared with client-side prediction.
export function constrain(p) {
  const r = hyp(p.x, p.z);
  if (r < 1.45) { const s = r > 1e-4 ? 1.45 / r : 1; p.x = r > 1e-4 ? p.x * s : 1.45; p.z *= s; }
  else if (r > K.ARENA) { p.x *= K.ARENA / r; p.z *= K.ARENA / r; }
}

// rulesOf(ent) → that player's snowball rules (catalog.js ballRules); none = normal snowballs.
// startOf(ent) → that player's starting snowballs, from their level (levels.js; Cody 2026-10-01). Default: level 1. Bots keep 4.
// specialsOf(ent) → the special snowballs that player has in their slots (specials.js kinds); levelOf(ent) → their level.
// Bots never throw specials (Cody: bots stay normal).
// gearOf(ent) → the special gear that player wears (gear.js kinds, e.g. catalog/gear.js gearIn); default none; bots never get
// gear. Read ONCE when a match starts (or when they join one): a Present Box is turned into its gear then, with this sim's
// rand, and the result (e.gear) travels in snapshots, so a new host keeps it instead of re-rolling.
// variant: a weekly mode id (weekly.js VARIANTS: 'hothat', 'gazebo', 'blizzard'), fixed for this sim's life (one room); none = plain rules.
export function createSim(rand = Math.random, { rulesOf = () => ({}), startOf = () => levelInfo(1).start, specialsOf = () => [], levelOf = () => 1, gearOf = () => [], variant = null } = {}) {
  // the level's count, times a held bonus (Santa Bag, Backpack; rounded up). e.fx must be set first (load() sets it before this).
  const startCount = (e) => (e.bot ? 4 : heldWith(Math.min(20, Math.max(1, Math.floor(Number(startOf(e))) || levelInfo(1).start)), e.fx));
  // Put on a player's gear for this match: what they wear that their level allows, Present Box resolved now. Extra hits full.
  const wearGear = (e) => { const lv = levelOf(e) || 1;
    e.gear = e.bot ? [] : resolvePresent((gearOf(e) || []).filter((k) => gearAllowed(k, lv)), lv, rand); e.fx = effectsOf(e.gear); e.xh = e.fx.extraHits; };
  const S = {
    phase: 'lobby', mode: 'ffa', round: 0, time: 0, seq: 0, ents: [], balls: [], drops: [], gh: {}, ev: [], evId: 0, mid: '',
    nextId: 1, nextBall: 1, team: [0, 0], result: null,
    hat: { st: 'ped', x: 0, y: K.PED_TOP, z: 0, vx: 0, vy: 0, vz: 0, holder: -1, last: -1, cool: 0, bounces: 0, rest: 0, acc: 0 },
    landing: { x: 0, z: 0 },
    variant: VARIANTS[variant] ? variant : null, zoneAcc: 0, // the weekly mode, and King of the Gazebo's 1-second clock
  };
  // HAT HUNT (weekly.js hathunt): more than one hat. S.hats[0] IS S.hat (the gazebo's hat, everything else keeps using it); the
  // extra hats start on the ground at EXTRA_SPOTS and never go back on the gazebo. A plain match has exactly one: S.hats = [S.hat].
  const hatCount = () => Math.max(1, Math.min(3, (VARIANTS[S.variant] || {}).hats || 1));
  const EXTRA_SPOTS = [[-7.5, 0], [7.5, 0]];
  const mkHat = (i) => (i === 0 ? S.hat : { st: 'ground', x: EXTRA_SPOTS[i - 1][0], y: 0.15, z: EXTRA_SPOTS[i - 1][1], vx: 0, vy: 0, vz: 0, holder: -1, last: -1, cool: 0, bounces: 3, rest: 0, acc: 0, melt: 0, lx: 0, lz: 0 });
  S.hats = Array.from({ length: hatCount() }, (_, i) => mkHat(i));
  const wearing = (e) => S.hats.find((h) => h.st === 'head' && h.holder === e.id) || null; // a player wears one hat at most
  const V = () => VARIANTS[S.variant] || {}; // this room's weekly mode rules ({} = plain)

  const byId = (id) => S.ents.find((e) => e.id === id);
  const ev = (...a) => { S.ev.push([++S.evId, ...a]); if (S.ev.length > 12) S.ev.shift(); };
  const scoring = () => S.phase === 'play';
  const moving = () => S.phase === 'play' || S.phase === 'lobby';
  const d2 = (a, b) => hyp(a.x - b.x, a.z - b.z);
  // How close a ball's path from (ox, oz) to where it is now came to a player (on the ground plane).
  const pathDist = (e, ox, oz, b) => { const dx = b.x - ox, dz = b.z - oz, L = dx * dx + dz * dz, t = L > 0 ? clamp(((e.x - ox) * dx + (e.z - oz) * dz) / L, 0, 1) : 1; return hyp(e.x - ox - dx * t, e.z - oz - dz * t); };

  function mkEnt(peer, bot, team) {
    return { id: S.nextId++, peer, bot, team, x: 0, z: 0, vx: 0, vz: 0, face: 0, stun: 0, cool: bot ? 1 : 0, ammo: bot ? 4 : levelInfo(1).start, max: bot ? 4 : levelInfo(1).start,
      regen: 0, score: 0, lastTh: null, wob: rand() * 9, throwT: 0, ep: 0, since: 9, rq: -1, gear: [], fx: effectsOf([]), xh: 0 }; // gear: none until wearGear
  }
  function spawn(e, i = Math.floor(rand() * 16), n = 16) {
    const a = Math.PI / 2 + (i / n) * Math.PI * 2; e.x = Math.cos(a) * 9; e.z = Math.sin(a) * 9; e.vx = e.vz = 0; e.stun = 0; e.face = a + Math.PI; e.ep++; e.since = 9;
  }
  // Per-player match counts for the daily tasks (seasons.js; Cody 2026-10-03): only during real play, like points. The match
  // server sends them with an Auto match's finish; they never leave the server in snapshots.
  function tally(e, key, n = 1) { if (!scoring() || !e || e.bot) return; (e.st ||= { hits: 0, hatSec: 0, steals: 0, catches: 0, specials: 0 })[key] += n; }
  function addScore(e, p) {
    if (!scoring() || !e) return;
    e.score += p; if (S.mode === 'team') S.team[e.team] += p;
  }

  function foes(e) { return S.ents.filter((o) => o !== e && (S.mode === 'team' ? o.team !== e.team : true)); }

  // ---------- roster: humans in, humans out, bots fill the gaps
  function balance(reassign) {
    const H = S.ents.filter((e) => !e.bot);
    if (S.mode === 'team') {
      if (reassign) H.forEach((e, i) => { e.team = i % 2; });
      else H.forEach((e) => { if (e.team < 0) { const n0 = H.filter((o) => o.team === 0).length, n1 = H.filter((o) => o.team === 1).length; e.team = n0 <= n1 ? 0 : 1; } });
      const n = [0, 1].map((t) => H.filter((e) => e.team === t).length);
      const target = Math.max(n[0], n[1], K.MIN_BODIES / 2);
      for (const t of [0, 1]) fitBots(t, target - n[t]);
    } else {
      H.forEach((e) => { e.team = 0; });
      S.ents.filter((e) => e.bot && e.team !== 1).forEach(removeEnt);
      fitBots(1, Math.max(0, K.MIN_BODIES - H.length));
    }
  }
  function fitBots(team, want) {
    const bots = S.ents.filter((e) => e.bot && e.team === team);
    for (let i = bots.length; i < want; i++) { const b = mkEnt(null, true, team); spawn(b); S.ents.push(b); }
    for (let i = bots.length - 1; i >= want; i--) removeEnt(bots[i]);
  }
  function removeEnt(e) {
    if (wearing(e)) knockHat(e, { x: 0, z: 1 });
    S.ents = S.ents.filter((x) => x !== e);
  }
  function syncRoster(peers) {
    const humans = peers.slice(0, K.MAX_HUMANS);
    S.ents.filter((e) => !e.bot && !humans.includes(e.peer)).forEach(removeEnt);
    let added = false;
    for (const p of humans) if (!S.ents.some((e) => e.peer === p)) { const e = mkEnt(p, false, -1); wearGear(e); e.max = e.ammo = startCount(e); spawn(e); S.ents.push(e); added = true; }
    balance(S.phase === 'lobby');
    return added;
  }

  // Each player's own browser moves them and reports here. The referee checks it:
  // no reports from an old spawn, none while knocked down, no faster-than-running jumps.
  function setReport(peer, r) {
    const e = S.ents.find((x) => x.peer === peer); if (!e || !r || typeof r !== 'object') return;
    const q = num(r.q, -1); if (q <= e.rq) return; e.rq = q;
    const th = Math.floor(num(r.t));
    if (e.lastTh === null || th < e.lastTh) e.lastTh = th;
    else if (th > e.lastTh) { e.lastTh = th; if (moving()) throwBall(e, clamp(num(r.ax), -20, 20), clamp(num(r.az), -20, 20), typeof r.sp === 'string' ? r.sp : ''); }
    if (num(r.ep) !== e.ep || e.stun > 0 || !moving()) return;
    // Elf Shoes: the referee allows that much more speed (the player's own page has to move them faster too).
    const run = K.HUMAN_SPEED * e.fx.speedMult;
    let vx = num(r.vx), vz = num(r.vz); const sp = hyp(vx, vz), top = run * 1.05;
    if (sp > top) { vx *= top / sp; vz *= top / sp; }
    const tx = clamp(num(r.x, e.x), -K.ARENA, K.ARENA), tz = clamp(num(r.z, e.z), -K.ARENA, K.ARENA);
    const dx = tx - e.x, dz = tz - e.z, d = hyp(dx, dz), max = run * 1.4 * Math.min(e.since, 1) + 0.6;
    if (d > max) { e.x += (dx / d) * max; e.z += (dz / d) * max; } else { e.x = tx; e.z = tz; }
    e.vx = vx; e.vz = vz; e.face = num(r.f, e.face); e.since = 0;
    constrain(e);
  }

  // ---------- flow
  function resetRound() {
    S.ents.forEach((e, i) => { spawn(e, i, S.ents.length); e.max = startCount(e); e.ammo = e.max; // a level-up shows from the next round
      e.cool = e.bot ? 0.8 + rand() : 0; e.regen = 0; e.xh = e.fx.extraHits; }); // every round starts with all extra hits
    Object.assign(S.hat, { st: 'ped', holder: -1, last: -1, x: 0, y: K.PED_TOP, z: 0, vx: 0, vy: 0, vz: 0, acc: 0, melt: 0 }); S.zoneAcc = 0;
    S.hats = Array.from({ length: hatCount() }, (_, i) => mkHat(i)); // Hat Hunt: the extra hats back on their spots
    S.balls = []; S.drops = []; S.gh = {};
  }
  // Set up a new match: mode, match id, teams, scores to 0, everyone on their spawn spot with a full counter.
  function prepMatch(mode) {
    S.mode = mode === 'team' ? 'team' : 'ffa';
    S.round = 1; S.team = [0, 0]; S.result = null;
    S.mid = Array.from({ length: 4 }, () => Math.floor(rand() * 2 ** 32).toString(16).padStart(8, '0')).join('');
    balance(true);
    S.ents.forEach((e) => { e.score = 0; e.st = { hits: 0, hatSec: 0, steals: 0, catches: 0, specials: 0 }; wearGear(e); }); // gear (and a Present Box's pick) is set for the whole match here
    resetRound();
  }
  const go = () => { S.phase = 'play'; S.time = K.ROUND_TIME; ev('round', 1); };
  // Straight to round 1 (the rules tests use this).
  function startMatch(mode) { prepMatch(mode); go(); }
  // How the page starts a match: the load screen (INTRO_TIME), then the countdown (COUNT_TIME), then round 1.
  function introMatch(mode) { prepMatch(mode); S.phase = 'intro'; S.time = K.INTRO_TIME; ev('intro'); }
  function computeResult() {
    const sorted = [...S.ents].sort((a, b) => b.score - a.score);
    if (S.mode === 'team') {
      const win = S.team[0] === S.team[1] ? -1 : S.team[0] > S.team[1] ? 0 : 1;
      const mvp = sorted.find((e) => win < 0 || e.team === win);
      return { team: win, mvp: mvp ? mvp.id : -1 };
    }
    const top = sorted[0], tie = sorted[1] && sorted[1].score === top.score;
    return { top: tie ? -1 : top.id, mvp: top ? top.id : -1 };
  }
  function endRound() {
    S.time = 0;
    if (S.round >= K.ROUNDS) { S.phase = 'end'; S.time = K.END_TIME; S.result = computeResult(); ev('end'); }
    else { S.phase = 'break'; S.time = K.BREAK_TIME; ev('break', S.round); }
  }

  // Bots sometimes use the same emotes players have, so they're harder to spot: 30% of the time on a moment worth
  // reacting to, at most once every 8 s per bot. Rides in the snapshot's events, so it costs no extra messages.
  // Emote numbers match online.js EMOTES: 0 Ho ho ho!, 1 Nice throw!, 2 Gimme the hat!, 3 Oops!
  function botChat(e, i) { if (!e || !e.bot || (e.chat || 0) > 0 || rand() > 0.3) return; e.chat = 8; ev('emote', e.id, i); }

  // ---------- hat + snowballs (same rules as the single-player mockup)
  function giveHat(e, caught, h = S.hat) {
    Object.assign(h, { st: 'head', holder: e.id, acc: 0 });
    e.immune = HAT_IMMUNE; // untouchable for 2 s, so a player can get out of a crowd with it (Cody)
    if (caught) { if (S.phase !== 'lobby') { addScore(e, PTS.header); tally(e, 'catches'); } ev('catch', e.id); botChat(e, 0); } else ev('grab', e.id);
  }
  function knockHat(e, dir, by) {
    const h = wearing(e) || S.hat; const l = hyp(dir.x, dir.z) || 1; // the hat THIS player wears (Hat Hunt: one of several)
    Object.assign(h, { st: 'air', holder: -1, last: e.id, cool: 0.5, bounces: 0, x: e.x, y: K.HEAD_Y + 0.2, z: e.z });
    h.vx = (dir.x / l) * 3.4 + (rand() - 0.5) * 2.5; h.vy = 10; h.vz = (dir.z / l) * 3.4 + (rand() - 0.5) * 2.5;
    if (by) { addScore(by, PTS.knock); tally(by, 'steals'); }
    ev('knock', e.id, by ? by.id : 0);
    botChat(e, 2);
  }
  // kind: '' a normal snowball, or a special (specials.js) the player has in a slot. A special uses its cost from the counter.
  function throwBall(e, tx, tz, kind = '') {
    const no = (why) => { e.refused = why; return false; }; // why the last throw was refused (diagnostics; not sent anywhere)
    if (e.ammo <= 0) return no('no snowballs'); if (e.cool > 0) return no('cooldown ' + e.cool.toFixed(2)); if (e.stun > 0) return no('knocked down');
    if (kind) {
      if (e.bot || !SPECIAL_KINDS.includes(kind) || !(specialsOf(e) || []).includes(kind)) return no('not in slots: ' + kind); // only what's in their slots
      const why = cantThrow(kind, { ammo: e.ammo, max: e.max, level: levelOf(e) }); if (why) return no(why);
    }
    let dx = tx - e.x, dz = tz - e.z; const dist = Math.max(1.5, hyp(dx, dz)); const l = hyp(dx, dz) || 1; dx /= l; dz /= l;
    if (kind) tally(e, 'specials');
    e.ammo -= kind ? costOf(kind, e.max) : 1; e.regen = 0; e.cool = e.bot ? 1.1 + rand() * 1.1 : K.HUMAN_COOL; e.throwT = 1; e.face = Math.atan2(dx, dz);
    if (kind === 'sky' || kind === 'rain') return dropsFrom(e, kind, tx, tz);
    const SP = SPECIALS[kind] || {};
    const speed = K.BALL_SPEED * (SP.speed || 1), tt = dist / speed;
    const R = rulesOf(e) || {}, sm = Number.isFinite(R.stun) && R.stun > 0 && R.stun <= 3 ? R.stun : 1; // a colour's stun ×, capped at 3
    const id = S.nextBall++;
    S.balls.push({ id, owner: e.id, sm, kind, r: SP.size || 1, stunSec: SP.stunSec || 0, g: kind === 'split' ? id : 0, age: 0,
      x: e.x + dx * 0.45, y: 1.6, z: e.z + dz * 0.45, vx: dx * speed, vy: (1.15 - 1.6) / tt + 0.5 * K.BALL_G * tt, vz: dz * speed, life: 2 });
    if (S.balls.length > K.MAX_BALLS) S.balls.shift();
    return true;
  }
  // Sky Ball: up, then 2 waves of snowballs landing around where it was aimed. Snowball Rain: drops all over the ring for 3 s.
  function dropsFrom(e, kind, tx, tz) {
    const SP = SPECIALS[kind], add = (x, z, t) => { const p = { x, z }; constrain(p); S.drops.push({ x: p.x, z: p.z, t, owner: e.id, kind }); };
    if (kind === 'sky') for (let w = 0; w < SP.waves; w++) for (let k = 0; k < SP.perWave; k++) { const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * SP.radius; add(tx + Math.cos(a) * r, tz + Math.sin(a) * r, SP.firstAt + w * SP.gap); }
    else for (let t = 0.4; t < 0.4 + SP.seconds; t += SP.every) { const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * K.ARENA; add(Math.cos(a) * r, Math.sin(a) * r, t); }
    if (S.drops.length > 60) S.drops.splice(0, S.drops.length - 60);
    ev(kind === 'sky' ? 'sky' : 'rain', e.id);
    return true;
  }
  // Can this snowball hit this player? (Not its thrower, not a teammate, not someone knocked down or holding the hat's immunity.)
  const hittable = (e, owner) => e.id !== owner && e.stun <= 0 && !(e.immune > 0) && !(S.mode === 'team' && byId(owner) && byId(owner).team === e.team);
  // Special gear: a hit first takes ONE extra hit (Pumpkin Costume etc.: "+1 hit (2 balls to stun)"), with or without an Elf Hat
  // (Cody, 2026-10-01: "it still takes 2 hits if they have gear on"); when none are left the hit knocks you down. Elf Hat only
  // makes the knock-down last twice as long.
  // A hit that only takes extra hits doesn't knock you down, shove you or knock the hat off; scoring is the SAME as any hit
  // (+5 thrower, −1 target, floor 0). Knocked down: Elf Hat doubles the stun, and every extra hit comes back (Cody: "Extra hits
  // come back after each stun, all game"; refilled at the knock-down, the same thing since nobody can be hit while down).
  function hit(e, b) {
    const fx = e.fx, kept = e.xh >= 1;
    if (kept) e.xh -= 1;
    else { e.stun = (b.stunSec || K.STUN * (b.sm || 1)) * fx.hitMult; e.xh = fx.extraHits; const l = hyp(b.vx, b.vz) || 1; e.vx = (b.vx / l) * 5; e.vz = (b.vz / l) * 5; }
    const thrower = byId(b.owner);
    if (thrower) { addScore(thrower, PTS.hit); tally(thrower, 'hits'); }
    // Getting hit costs 1 point (Cody); a score never goes below 0 (a team loses only what its player had).
    if (scoring()) { const lost = Math.min(1, e.score); e.score -= lost; if (S.mode === 'team') S.team[e.team] -= lost; }
    ev('hit', e.id, r2(b.x), r2(b.y), r2(b.z));
    if (rand() < 0.5) botChat(e, 3); else botChat(thrower, 1);
    if (!kept && wearing(e)) knockHat(e, { x: b.vx, z: b.vz }, thrower);
  }

  const nearestPile = (e) => PILES.reduce((b, p) => (hyp(p[0] - e.x, p[1] - e.z) < hyp(b[0] - e.x, b[1] - e.z) ? p : b));
  const nearest = (e, list) => list.reduce((b, o) => (!b || d2(o, e) < d2(b, e) ? o : b), null);
  const lead = (t, from, noise) => { const tt = d2(t, from) / K.BALL_SPEED; return [t.x + t.vx * tt * 0.8 + (rand() - 0.5) * noise, t.z + t.vz * tt * 0.8 + (rand() - 0.5) * noise]; };

  function ai(e) {
    const mine = wearing(e), h = mine || (S.hats.length > 1 ? nearest(e, S.hats.map((x) => ({ x: x.st === 'air' ? x.lx ?? S.landing.x : x.x, z: x.st === 'air' ? x.lz ?? S.landing.z : x.z, hat: x }))).hat : S.hat);
    const holder = h.st === 'head' ? byId(h.holder) : null, fs = foes(e);
    let gx, gz;
    if (holder === e) {
      const f = nearest(e, fs) || { x: 0, z: 0 };
      let ax = e.x - f.x, az = e.z - f.z; const l = hyp(ax, az) || 1; ax /= l; az /= l;
      const tl = hyp(e.x, e.z) || 1, sgn = Math.sin(e.wob) > 0 ? 1 : -1;
      gx = e.x + ax * 4 + (-e.z / tl) * 3 * sgn; gz = e.z + az * 4 + (e.x / tl) * 3 * sgn;
      const gl = hyp(gx, gz); if (gl > K.ARENA - 2) { gx *= (K.ARENA - 2) / gl; gz *= (K.ARENA - 2) / gl; }
      if (f && d2(f, e) < 8) throwBall(e, ...lead(f, e, 1.2));
    } else if (e.ammo === 0 && h.st === 'head') [gx, gz] = nearestPile(e);
    else if (h.st === 'ped') { gx = 0; gz = 0; }
    else if (h.st === 'air') { gx = h === S.hat ? S.landing.x : h.lx; gz = h === S.hat ? S.landing.z : h.lz; }
    else if (h.st === 'ground') { gx = h.x; gz = h.z; }
    else if (holder && fs.includes(holder)) {
      let ox = e.x - holder.x, oz = e.z - holder.z; const l = hyp(ox, oz) || 1, k = (5 + Math.sin(e.wob) * 1.5) / l;
      gx = holder.x + ox * k; gz = holder.z + oz * k;
      if (d2(holder, e) < 11) throwBall(e, ...lead(holder, e, 1.6));
    } else {
      const f = nearest(e, fs) || { x: 0, z: 0, vx: 0, vz: 0 };
      gx = holder ? (holder.x + f.x) / 2 : 0; gz = holder ? (holder.z + f.z) / 2 : 0;
      if (fs.length && d2(f, e) < 9) throwBall(e, ...lead(f, e, 2));
    }
    let wx = gx - e.x, wz = gz - e.z; const l = hyp(wx, wz);
    return l > 0.35 ? [wx / l, wz / l] : [0, 0];
  }

  function step(dt) {
    if (S.phase === 'play') { S.time -= dt; if (S.time <= 0) endRound(); }
    else if (S.phase === 'break') { S.time -= dt; if (S.time <= 0) { S.round++; S.phase = 'play'; S.time = K.ROUND_TIME; resetRound(); ev('round', S.round); } }
    else if (S.phase === 'end') { S.time -= dt; if (S.time <= 0) { S.phase = 'lobby'; S.time = 0; resetRound(); balance(true); } }
    if (S.phase === 'intro' || S.phase === 'count') { // everyone stands on their spawn spot until the countdown ends
      S.time -= dt;
      if (S.time <= 0) { if (S.phase === 'intro') { S.phase = 'count'; S.time = K.COUNT_TIME; ev('count'); } else go(); }
      for (const e of S.ents) e.wob += dt * 0.7;
      return;
    }
    const h = S.hat;

    for (const e of S.ents) {
      e.wob += dt * 0.7; e.cool -= dt; if (e.chat > 0) e.chat -= dt; e.throwT = Math.max(0, e.throwT - dt * 3.5);
      const pile = nearestPile(e);
      e.regen += dt * (hyp(pile[0] - e.x, pile[1] - e.z) < 1.6 ? 9 : 1) * e.fx.refillMult * (V().refillMult || 1); // Elf Satchel: 25% faster, piles too; Blizzard: 2×
      if (e.regen > (e.bot ? 3 : 2.2) && e.ammo < e.max) { e.ammo++; e.regen = 0; }
      if (e.immune > 0) e.immune -= dt;
      if (e.stun > 0) { e.stun -= dt; const f = 1 - Math.min(1, dt * 4); e.vx *= f; e.vz *= f; }
      else if (e.bot) {
        const want = moving() ? ai(e) : [0, 0], top = K.BOT_SPEED * (wearing(e) ? K.HOLD_SLOW : 1), k = Math.min(1, dt * 10);
        e.vx += (want[0] * top - e.vx) * k; e.vz += (want[1] * top - e.vz) * k;
      } else if (!moving() || e.since > 0.4) { e.vx = 0; e.vz = 0; }
      if (!e.bot) e.since += dt;
      e.x += e.vx * dt; e.z += e.vz * dt;
      const sp = hyp(e.vx, e.vz);
      if (sp > 0.5 && e.stun <= 0 && e.throwT <= 0) { let dd = Math.atan2(e.vx, e.vz) - e.face; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); e.face += dd * Math.min(1, dt * 12); }
    }
    for (const a of S.ents) {
      for (const b of S.ents) if (a !== b) { const d = d2(a, b); if (d < 0.8 && d > 0) { const k = (0.8 - d) / 2 / d; a.x += (a.x - b.x) * k; a.z += (a.z - b.z) * k; } }
      constrain(a);
    }

    for (let i = S.balls.length - 1; i >= 0; i--) {
      const b = S.balls[i], ox = b.x, oz = b.z; b.vy -= K.BALL_G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt; b.age = (b.age || 0) + dt;
      // Split Ball: 0.3 s after the throw it becomes 3 pieces fanning out along its path; a player can be hit by only one piece (Cody).
      if (b.kind === 'split' && b.age >= SPECIALS.split.splitAfter) {
        S.balls.splice(i, 1); const fan = (SPECIALS.split.fanDeg * Math.PI) / 180;
        for (const a of [-fan, 0, fan]) { const c = Math.cos(a), s = Math.sin(a);
          S.balls.push({ ...b, id: S.nextBall++, kind: 'piece', vx: b.vx * c - b.vz * s, vz: b.vx * s + b.vz * c }); }
        continue;
      }
      let done = b.life <= 0 || b.y < 0.08;
      if (b.y < 0.08) ev('splat', r2(b.x), r2(b.z));
      const r = b.r || 1;
      if (!done) for (const e of S.ents) {
        if (!hittable(e, b.owner) || (b.g && (S.gh[b.g] || []).includes(e.id))) continue;
        // Elf Hat: a half-size player is half as wide and half as tall above the 0.3 floor (so an aimed throw, ~1.15 high, still hits).
        // Measured to the PATH the ball took this step, not just where it ended: a slow host steps 1/20 s, the ball moves 0.9 a
        // step, and a half-size player is only 0.6 wide, so an end-point check let snowballs fly straight through an Elf Hat.
        const sz = e.fx.size;
        if (pathDist(e, ox, oz, b) < 0.6 * r * sz &&b.y > 0.3 - (r - 1) * 0.3 && b.y < 0.3 + (2.1 + (r - 1) * 0.3) * sz) { hit(e, b); if (b.g) (S.gh[b.g] ||= []).push(e.id); done = true; break; }
      }
      if (done) S.balls.splice(i, 1);
    }
    // Sky Ball and Snowball Rain: each falling snowball hits everyone hittable within reach of where it lands.
    for (let i = S.drops.length - 1; i >= 0; i--) {
      const p = S.drops[i]; p.t -= dt; if (p.t > 0) continue;
      S.drops.splice(i, 1); ev('splat', r2(p.x), r2(p.z));
      if (!moving()) continue;
      for (const e of S.ents) if (hittable(e, p.owner) && hyp(e.x - p.x, e.z - p.z) < DROP_HIT_RADIUS * e.fx.size) hit(e, { owner: p.owner, x: p.x, y: 1, z: p.z, vx: e.x - p.x || 0.01, vz: e.z - p.z, sm: 1 });
    }

    // King of the Gazebo: each second, the ONE player standing in the ring round the gazebo scores (shared = nobody does)
    if (V().zonePts && scoring()) {
      S.zoneAcc += dt;
      if (S.zoneAcc >= 1) { S.zoneAcc -= 1; const inZone = S.ents.filter((e) => e.stun <= 0 && hyp(e.x, e.z) <= V().zoneOut);
        if (inZone.length === 1) { addScore(inZone[0], V().zonePts); ev('zone', inZone[0].id, V().zonePts); } }
    }
    S.hats.forEach((hh, i) => stepHat(hh, i, dt)); // every hat (one, unless Hat Hunt)
  }
  // One hat's frame: on the gazebo (the main hat only), on a head (scores), in the air (caught by a free head), on the ground.
  function stepHat(h, i, dt) {
    if (h.st === 'ped' && i) { h.st = 'ground'; h.rest = 0; } // only the gazebo's own hat sits on the gazebo
    if (h.st === 'ped') {
      h.x = 0; h.y = K.PED_TOP; h.z = 0;
      if (moving()) for (const e of S.ents) if (e.stun <= 0 && !wearing(e) && hyp(e.x, e.z) < 2.05) { giveHat(e, false, h); break; }
    } else if (h.st === 'head') {
      const e = byId(h.holder);
      if (!e) { h.holder = -1; if (i) { h.st = 'ground'; h.rest = 0; } else h.st = 'ped'; } // its wearer left: an extra hat drops where it is
      else {
        h.x = e.x; h.y = K.HEAD_Y; h.z = e.z; h.acc += dt;
        // Hot Hat: the hat scores double (hatMult) and melts a snowball every meltEvery seconds worn
        if (h.acc >= 1) { h.acc -= 1; if (scoring()) { const p = PTS.hatSec * (V().hatMult || 1); addScore(e, p); tally(e, 'hatSec'); ev('pts', e.id, p); } }
        if (V().meltEvery && scoring()) { h.melt = (h.melt || 0) + dt; if (h.melt >= V().meltEvery) { h.melt -= V().meltEvery; e.ammo = Math.max(0, e.ammo - 1); } }
      }
    } else if (h.st === 'air') {
      h.cool -= dt; h.vy -= K.HAT_G * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.z += h.vz * dt;
      const r = hyp(h.x, h.z);
      if (r > K.ARENA) { h.x *= K.ARENA / r; h.z *= K.ARENA / r; h.vx *= -0.6; h.vz *= -0.6; }
      if (h.vy < 0 && h.y < K.HEAD_Y + 0.35 && h.y > K.HEAD_Y - 0.4) {
        for (const e of S.ents) {
          if ((e.id === h.last && h.cool > 0) || d2(e, h) > 0.8 || wearing(e)) continue; // one hat per head: it passes a wearer by
          if (e.stun > 0) { h.vx = (rand() - 0.5) * 6; h.vy = 8; h.vz = (rand() - 0.5) * 6; h.last = e.id; h.cool = 0.3; ev('boing', e.id); }
          else giveHat(e, true, h);
          break;
        }
      }
      if (h.st === 'air' && h.y <= 0.15) {
        h.y = 0.15; ev('splat', r2(h.x), r2(h.z));
        if (h.bounces++ < 2) { h.vy = Math.abs(h.vy) * 0.42; h.vx *= 0.6; h.vz *= 0.6; }
        else { h.st = 'ground'; h.rest = 0; }
      }
      if (h.st === 'air') {
        const dy = h.y - K.HEAD_Y, tt = (h.vy + Math.sqrt(Math.max(0, h.vy * h.vy + 2 * K.HAT_G * dy))) / K.HAT_G;
        const L = i ? h : S.landing, kx = i ? 'lx' : 'x', kz = i ? 'lz' : 'z'; // where it will come down (the main hat's: S.landing)
        L[kx] = h.x + h.vx * tt; L[kz] = h.z + h.vz * tt;
        const l = hyp(L[kx], L[kz]); if (l > K.ARENA) { L[kx] *= K.ARENA / l; L[kz] *= K.ARENA / l; }
      }
    } else if (h.st === 'ground') {
      h.rest += dt;
      if (moving()) for (const e of S.ents) if (e.stun <= 0 && !wearing(e) && d2(e, h) < 1.0) { giveHat(e, false, h); break; }
      if (h.st === 'ground' && h.rest > 5) { h.st = 'air'; h.last = -1; h.bounces = 3; h.vx = -h.x / 1.2; h.vy = 11; h.vz = -h.z / 1.2; }
    }
  }

  // ---------- snapshots: compact, sent ~30 times a second through presence (hard cap 4 KiB)
  function snapshot() {
    const h = S.hat;
    return {
      s: ++S.seq, ph: PHASES.indexOf(S.phase), md: S.mode === 'team' ? 1 : 0, vr: S.variant ? VARIANT_IDS.indexOf(S.variant) + 1 : 0, rd: S.round, tm: Math.round(S.time * 10) / 10, ts: S.team.slice(),
      E: S.ents.map((e) => [e.id, e.peer || 0, e.bot ? 1 : 0, e.team, r2(e.x), r2(e.z), r2(e.vx), r2(e.vz), r2(e.face), e.stun > 0 ? 1 : 0, e.ammo, e.score, e.throwT > 0.5 ? 1 : 0, e.ep, e.immune > 0 ? 1 : 0,
        // only a player wearing gear adds 2 numbers: their gear (gear.js gearMask, Present Box already resolved) and extra hits left
        ...(e.gear.length ? [gearMask(e.gear), e.xh] : [])]),
      H: [HAT.indexOf(h.st), r2(h.x), r2(h.y), r2(h.z), r2(h.vx), r2(h.vy), r2(h.vz), h.holder, r2(S.landing.x), r2(S.landing.z)],
      // Hat Hunt's extra hats, the same numbers each (a plain match sends nothing here: its snapshots don't change)
      X: S.hats.length > 1 ? S.hats.slice(1).map((x) => [HAT.indexOf(x.st), r2(x.x), r2(x.y), r2(x.z), r2(x.vx), r2(x.vy), r2(x.vz), x.holder, r2(x.lx || 0), r2(x.lz || 0)]) : undefined,
      // balls: … owner, stun ×, kind (BALL_KIND), size, split group: special balls keep their rule through a host handover
      B: S.balls.map((b) => [b.id, r2(b.x), r2(b.y), r2(b.z), r2(b.vx), r2(b.vy), r2(b.vz), b.owner, b.sm || 1, BALL_KIND[b.kind || ''] || 0, b.r || 1, b.g || 0, r2(b.age || 0)]),
      D: S.drops.map((p) => [r2(p.x), r2(p.z), r2(p.t), p.owner, DROP_KIND[p.kind] || 0]), // falling snowballs (Sky Ball, Rain)
      V: S.ev.slice(-10),
      R: S.result ? [S.result.team ?? -2, S.result.top ?? -2, S.result.mvp] : 0,
      c: [S.nextId, S.nextBall, S.evId],
      mid: S.mid,
    };
  }

  // A new host picks up where the old one left off.
  function load(snap) {
    if (!snap || !Array.isArray(snap.E)) return false;
    S.phase = PHASES[snap.ph] || 'lobby'; S.mode = snap.md ? 'team' : 'ffa'; S.variant = VARIANT_IDS[num(snap.vr) - 1] || S.variant; S.round = num(snap.rd); S.time = num(snap.tm);
    S.team = Array.isArray(snap.ts) ? [num(snap.ts[0]), num(snap.ts[1])] : [0, 0]; S.seq = num(snap.s); S.mid = /^[0-9a-f]{8,64}$/.test(String(snap.mid)) ? snap.mid : '';
    S.ents = snap.E.map((r) => ({ ...mkEnt(r[1] || null, !!r[2], num(r[3])), id: num(r[0]), x: num(r[4]), z: num(r[5]), vx: num(r[6]), vz: num(r[7]), face: num(r[8]), stun: r[9] ? 0.5 : 0, ammo: num(r[10]), score: num(r[11]), throwT: r[12] ? 0.6 : 0, ep: num(r[13]), immune: r[14] ? 1 : 0 }));
    // gear first (the old host's pick, never re-rolled), THEN the maximum: the level's count with the gear's held bonus
    snap.E.forEach((r, i) => { const e = S.ents[i]; e.gear = e.bot ? [] : gearOfMask(r[15]); e.fx = effectsOf(e.gear); e.xh = clamp(Math.floor(num(r[16])), 0, e.fx.extraHits); });
    S.ents.forEach((e) => { e.max = startCount(e); e.ammo = Math.min(e.ammo, e.max); }); // the level's maximum, not the default
    const H = snap.H || []; const h = S.hat;
    Object.assign(h, { st: HAT[H[0]] || 'ped', x: num(H[1]), y: num(H[2], K.PED_TOP), z: num(H[3]), vx: num(H[4]), vy: num(H[5]), vz: num(H[6]), holder: num(H[7], -1), acc: 0, cool: 0, bounces: 0, rest: 0 });
    if (h.st === 'head' && !byId(h.holder)) { h.st = 'ped'; h.holder = -1; }
    S.landing.x = num(H[8]); S.landing.z = num(H[9]);
    S.hats = [h, ...(Array.isArray(snap.X) ? snap.X.slice(0, 2) : []).map((X) => { const x = { st: HAT[X[0]] || 'ground', x: num(X[1]), y: num(X[2], 0.15), z: num(X[3]), vx: num(X[4]), vy: num(X[5]), vz: num(X[6]), holder: num(X[7], -1), lx: num(X[8]), lz: num(X[9]), last: -1, cool: 0, bounces: 3, rest: 0, acc: 0, melt: 0 };
      if (x.st === 'head' && !byId(x.holder)) { x.st = 'ground'; x.holder = -1; } if (x.st === 'ped') x.st = 'ground'; return x; })]; // Hat Hunt's extra hats
    S.balls = (snap.B || []).map((b) => { const kind = KIND_OF[num(b[9])] || '';
      return { id: b[0], x: b[1], y: b[2], z: b[3], vx: b[4], vy: b[5], vz: b[6], owner: b[7], sm: Number.isFinite(b[8]) ? b[8] : 1, life: 1, kind, r: num(b[10], 1) || 1,
        stunSec: SPECIALS[kind === 'piece' ? 'split' : kind]?.stunSec || 0, g: num(b[11]), age: num(b[12]) }; });
    S.drops = (Array.isArray(snap.D) ? snap.D : []).map((p) => ({ x: num(p[0]), z: num(p[1]), t: num(p[2]), owner: num(p[3]), kind: DROP_OF[num(p[4])] || 'rain' }));
    const c = snap.c || [];
    S.nextId = Math.max(num(c[0], 1), ...S.ents.map((e) => e.id + 1)); S.nextBall = num(c[1], 1); S.evId = num(c[2]);
    S.ev = Array.isArray(snap.V) ? snap.V.slice() : [];
    S.result = snap.R ? { team: snap.R[0] === -2 ? undefined : snap.R[0], top: snap.R[1] === -2 ? undefined : snap.R[1], mvp: snap.R[2] } : null;
    return true;
  }

  return { S, step, syncRoster, setReport, startMatch, introMatch, snapshot, load, byId };
}
