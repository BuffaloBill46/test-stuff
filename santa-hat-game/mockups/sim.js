// Snowball Square match referee. Runs only on the host's browser; everyone else renders its snapshots.
// Pure game logic, no rendering, so it can be tested headless.
export const K = {
  ARENA: 13.2, HEAD_Y: 2.05, BALL_G: 7, BALL_SPEED: 18, HAT_G: 16, PED_TOP: 1.71,
  ROUND_TIME: 90, ROUNDS: 3, BREAK_TIME: 6, END_TIME: 12, MAX_HUMANS: 8, MIN_BODIES: 4,
  HUMAN_SPEED: 6.4, BOT_SPEED: 5.2, HOLD_SLOW: 0.86, MAX_BALLS: 18, HUMAN_COOL: 0.26,
};
export const PTS = { hatSec: 10, header: 50, knock: 25, hit: 5 };
export const PILES = [[-8, -5], [8, -6], [-7, 8], [8, 7]];
export const PHASES = ['lobby', 'play', 'break', 'end'];
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

export function createSim(rand = Math.random) {
  const S = {
    phase: 'lobby', mode: 'ffa', round: 0, time: 0, seq: 0, ents: [], balls: [], ev: [], evId: 0,
    nextId: 1, nextBall: 1, team: [0, 0], result: null,
    hat: { st: 'ped', x: 0, y: K.PED_TOP, z: 0, vx: 0, vy: 0, vz: 0, holder: -1, last: -1, cool: 0, bounces: 0, rest: 0, acc: 0 },
    landing: { x: 0, z: 0 },
  };

  const byId = (id) => S.ents.find((e) => e.id === id);
  const ev = (...a) => { S.ev.push([++S.evId, ...a]); if (S.ev.length > 12) S.ev.shift(); };
  const scoring = () => S.phase === 'play';
  const moving = () => S.phase === 'play' || S.phase === 'lobby';
  const d2 = (a, b) => hyp(a.x - b.x, a.z - b.z);

  function mkEnt(peer, bot, team) {
    return { id: S.nextId++, peer, bot, team, x: 0, z: 0, vx: 0, vz: 0, face: 0, stun: 0, cool: bot ? 1 : 0, ammo: bot ? 4 : 6, max: bot ? 4 : 6,
      regen: 0, score: 0, lastTh: null, wob: rand() * 9, throwT: 0, ep: 0, since: 9, rq: -1 };
  }
  function spawn(e, i = Math.floor(rand() * 16), n = 16) {
    const a = Math.PI / 2 + (i / n) * Math.PI * 2; e.x = Math.cos(a) * 9; e.z = Math.sin(a) * 9; e.vx = e.vz = 0; e.stun = 0; e.face = a + Math.PI; e.ep++; e.since = 9;
  }
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
    if (S.hat.holder === e.id) knockHat(e, { x: 0, z: 1 });
    S.ents = S.ents.filter((x) => x !== e);
  }
  function syncRoster(peers) {
    const humans = peers.slice(0, K.MAX_HUMANS);
    S.ents.filter((e) => !e.bot && !humans.includes(e.peer)).forEach(removeEnt);
    let added = false;
    for (const p of humans) if (!S.ents.some((e) => e.peer === p)) { const e = mkEnt(p, false, -1); spawn(e); S.ents.push(e); added = true; }
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
    else if (th > e.lastTh) { e.lastTh = th; if (moving()) throwBall(e, clamp(num(r.ax), -20, 20), clamp(num(r.az), -20, 20)); }
    if (num(r.ep) !== e.ep || e.stun > 0 || !moving()) return;
    let vx = num(r.vx), vz = num(r.vz); const sp = hyp(vx, vz), top = K.HUMAN_SPEED * 1.05;
    if (sp > top) { vx *= top / sp; vz *= top / sp; }
    const tx = clamp(num(r.x, e.x), -K.ARENA, K.ARENA), tz = clamp(num(r.z, e.z), -K.ARENA, K.ARENA);
    const dx = tx - e.x, dz = tz - e.z, d = hyp(dx, dz), max = K.HUMAN_SPEED * 1.4 * Math.min(e.since, 1) + 0.6;
    if (d > max) { e.x += (dx / d) * max; e.z += (dz / d) * max; } else { e.x = tx; e.z = tz; }
    e.vx = vx; e.vz = vz; e.face = num(r.f, e.face); e.since = 0;
    constrain(e);
  }

  // ---------- flow
  function resetRound() {
    S.ents.forEach((e, i) => { spawn(e, i, S.ents.length); e.ammo = e.max; e.cool = e.bot ? 0.8 + rand() : 0; e.regen = 0; });
    Object.assign(S.hat, { st: 'ped', holder: -1, last: -1, x: 0, y: K.PED_TOP, z: 0, vx: 0, vy: 0, vz: 0, acc: 0 });
    S.balls = [];
  }
  function startMatch(mode) {
    S.mode = mode === 'team' ? 'team' : 'ffa';
    S.phase = 'play'; S.round = 1; S.time = K.ROUND_TIME; S.team = [0, 0]; S.result = null;
    balance(true);
    S.ents.forEach((e) => { e.score = 0; });
    resetRound(); ev('round', 1);
  }
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

  // ---------- hat + snowballs (same rules as the single-player mockup)
  function giveHat(e, caught) {
    Object.assign(S.hat, { st: 'head', holder: e.id, acc: 0 });
    if (caught) { if (S.phase !== 'lobby') addScore(e, PTS.header); ev('catch', e.id); } else ev('grab', e.id);
  }
  function knockHat(e, dir, by) {
    const h = S.hat; const l = hyp(dir.x, dir.z) || 1;
    Object.assign(h, { st: 'air', holder: -1, last: e.id, cool: 0.5, bounces: 0, x: e.x, y: K.HEAD_Y + 0.2, z: e.z });
    h.vx = (dir.x / l) * 3.4 + (rand() - 0.5) * 2.5; h.vy = 10; h.vz = (dir.z / l) * 3.4 + (rand() - 0.5) * 2.5;
    if (by) addScore(by, PTS.knock);
    ev('knock', e.id, by ? by.id : 0);
  }
  function throwBall(e, tx, tz) {
    if (e.ammo <= 0 || e.cool > 0 || e.stun > 0) return false;
    let dx = tx - e.x, dz = tz - e.z; const dist = Math.max(1.5, hyp(dx, dz)); const l = hyp(dx, dz) || 1; dx /= l; dz /= l;
    e.ammo--; e.cool = e.bot ? 1.1 + rand() * 1.1 : K.HUMAN_COOL; e.throwT = 1; e.face = Math.atan2(dx, dz);
    const tt = dist / K.BALL_SPEED;
    S.balls.push({ id: S.nextBall++, owner: e.id, x: e.x + dx * 0.45, y: 1.6, z: e.z + dz * 0.45, vx: dx * K.BALL_SPEED, vy: (1.15 - 1.6) / tt + 0.5 * K.BALL_G * tt, vz: dz * K.BALL_SPEED, life: 2 });
    if (S.balls.length > K.MAX_BALLS) S.balls.shift();
    return true;
  }
  function hit(e, b) {
    e.stun = 0.9; const l = hyp(b.vx, b.vz) || 1; e.vx = (b.vx / l) * 5; e.vz = (b.vz / l) * 5;
    const thrower = byId(b.owner);
    if (thrower) addScore(thrower, PTS.hit);
    ev('hit', e.id, r2(b.x), r2(b.y), r2(b.z));
    if (S.hat.holder === e.id) knockHat(e, { x: b.vx, z: b.vz }, thrower);
  }

  const nearestPile = (e) => PILES.reduce((b, p) => (hyp(p[0] - e.x, p[1] - e.z) < hyp(b[0] - e.x, b[1] - e.z) ? p : b));
  const nearest = (e, list) => list.reduce((b, o) => (!b || d2(o, e) < d2(b, e) ? o : b), null);
  const lead = (t, from, noise) => { const tt = d2(t, from) / K.BALL_SPEED; return [t.x + t.vx * tt * 0.8 + (rand() - 0.5) * noise, t.z + t.vz * tt * 0.8 + (rand() - 0.5) * noise]; };

  function ai(e) {
    const h = S.hat, holder = h.st === 'head' ? byId(h.holder) : null, fs = foes(e);
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
    else if (h.st === 'air') { gx = S.landing.x; gz = S.landing.z; }
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
    const h = S.hat;

    for (const e of S.ents) {
      e.wob += dt * 0.7; e.cool -= dt; e.throwT = Math.max(0, e.throwT - dt * 3.5);
      const pile = nearestPile(e);
      e.regen += dt * (hyp(pile[0] - e.x, pile[1] - e.z) < 1.6 ? 9 : 1);
      if (e.regen > (e.bot ? 3 : 2.2) && e.ammo < e.max) { e.ammo++; e.regen = 0; }
      if (e.stun > 0) { e.stun -= dt; const f = 1 - Math.min(1, dt * 4); e.vx *= f; e.vz *= f; }
      else if (e.bot) {
        const want = moving() ? ai(e) : [0, 0], top = K.BOT_SPEED * (h.holder === e.id ? K.HOLD_SLOW : 1), k = Math.min(1, dt * 10);
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
      const b = S.balls[i]; b.vy -= K.BALL_G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
      let done = b.life <= 0 || b.y < 0.08;
      if (b.y < 0.08) ev('splat', r2(b.x), r2(b.z));
      const owner = byId(b.owner);
      if (!done) for (const e of S.ents) {
        if (e.id === b.owner || e.stun > 0 || (S.mode === 'team' && owner && owner.team === e.team)) continue;
        if (d2(e, b) < 0.6 && b.y > 0.3 && b.y < 2.4) { hit(e, b); done = true; break; }
      }
      if (done) S.balls.splice(i, 1);
    }

    if (h.st === 'ped') {
      h.x = 0; h.y = K.PED_TOP; h.z = 0;
      if (moving()) for (const e of S.ents) if (e.stun <= 0 && hyp(e.x, e.z) < 2.05) { giveHat(e, false); break; }
    } else if (h.st === 'head') {
      const e = byId(h.holder);
      if (!e) { h.st = 'ped'; h.holder = -1; }
      else {
        h.x = e.x; h.y = K.HEAD_Y; h.z = e.z; h.acc += dt;
        if (h.acc >= 1) { h.acc -= 1; if (scoring()) { addScore(e, PTS.hatSec); ev('pts', e.id, PTS.hatSec); } }
      }
    } else if (h.st === 'air') {
      h.cool -= dt; h.vy -= K.HAT_G * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.z += h.vz * dt;
      const r = hyp(h.x, h.z);
      if (r > K.ARENA) { h.x *= K.ARENA / r; h.z *= K.ARENA / r; h.vx *= -0.6; h.vz *= -0.6; }
      if (h.vy < 0 && h.y < K.HEAD_Y + 0.35 && h.y > K.HEAD_Y - 0.4) {
        for (const e of S.ents) {
          if ((e.id === h.last && h.cool > 0) || d2(e, h) > 0.8) continue;
          if (e.stun > 0) { h.vx = (rand() - 0.5) * 6; h.vy = 8; h.vz = (rand() - 0.5) * 6; h.last = e.id; h.cool = 0.3; ev('boing', e.id); }
          else giveHat(e, true);
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
        S.landing.x = h.x + h.vx * tt; S.landing.z = h.z + h.vz * tt;
        const l = hyp(S.landing.x, S.landing.z); if (l > K.ARENA) { S.landing.x *= K.ARENA / l; S.landing.z *= K.ARENA / l; }
      }
    } else if (h.st === 'ground') {
      h.rest += dt;
      if (moving()) for (const e of S.ents) if (e.stun <= 0 && d2(e, h) < 1.0) { giveHat(e, false); break; }
      if (h.st === 'ground' && h.rest > 5) { h.st = 'air'; h.last = -1; h.bounces = 3; h.vx = -h.x / 1.2; h.vy = 11; h.vz = -h.z / 1.2; }
    }
  }

  // ---------- snapshots: compact, sent ~30 times a second through presence (hard cap 4 KiB)
  function snapshot() {
    const h = S.hat;
    return {
      s: ++S.seq, ph: PHASES.indexOf(S.phase), md: S.mode === 'team' ? 1 : 0, rd: S.round, tm: Math.round(S.time * 10) / 10, ts: S.team.slice(),
      E: S.ents.map((e) => [e.id, e.peer || 0, e.bot ? 1 : 0, e.team, r2(e.x), r2(e.z), r2(e.vx), r2(e.vz), r2(e.face), e.stun > 0 ? 1 : 0, e.ammo, e.score, e.throwT > 0.5 ? 1 : 0, e.ep]),
      H: [HAT.indexOf(h.st), r2(h.x), r2(h.y), r2(h.z), r2(h.vx), r2(h.vy), r2(h.vz), h.holder, r2(S.landing.x), r2(S.landing.z)],
      B: S.balls.map((b) => [b.id, r2(b.x), r2(b.y), r2(b.z), r2(b.vx), r2(b.vy), r2(b.vz), b.owner]),
      V: S.ev.slice(-10),
      R: S.result ? [S.result.team ?? -2, S.result.top ?? -2, S.result.mvp] : 0,
      c: [S.nextId, S.nextBall, S.evId],
    };
  }

  // A new host picks up where the old one left off.
  function load(snap) {
    if (!snap || !Array.isArray(snap.E)) return false;
    S.phase = PHASES[snap.ph] || 'lobby'; S.mode = snap.md ? 'team' : 'ffa'; S.round = num(snap.rd); S.time = num(snap.tm);
    S.team = Array.isArray(snap.ts) ? [num(snap.ts[0]), num(snap.ts[1])] : [0, 0]; S.seq = num(snap.s);
    S.ents = snap.E.map((r) => ({ ...mkEnt(r[1] || null, !!r[2], num(r[3])), id: num(r[0]), x: num(r[4]), z: num(r[5]), vx: num(r[6]), vz: num(r[7]), face: num(r[8]), stun: r[9] ? 0.5 : 0, ammo: num(r[10]), score: num(r[11]), throwT: r[12] ? 0.6 : 0, ep: num(r[13]) }));
    const H = snap.H || []; const h = S.hat;
    Object.assign(h, { st: HAT[H[0]] || 'ped', x: num(H[1]), y: num(H[2], K.PED_TOP), z: num(H[3]), vx: num(H[4]), vy: num(H[5]), vz: num(H[6]), holder: num(H[7], -1), acc: 0, cool: 0, bounces: 0, rest: 0 });
    if (h.st === 'head' && !byId(h.holder)) { h.st = 'ped'; h.holder = -1; }
    S.landing.x = num(H[8]); S.landing.z = num(H[9]);
    S.balls = (snap.B || []).map((b) => ({ id: b[0], x: b[1], y: b[2], z: b[3], vx: b[4], vy: b[5], vz: b[6], owner: b[7], life: 1 }));
    const c = snap.c || [];
    S.nextId = Math.max(num(c[0], 1), ...S.ents.map((e) => e.id + 1)); S.nextBall = num(c[1], 1); S.evId = num(c[2]);
    S.ev = Array.isArray(snap.V) ? snap.V.slice() : [];
    S.result = snap.R ? { team: snap.R[0] === -2 ? undefined : snap.R[0], top: snap.R[1] === -2 ? undefined : snap.R[1], mvp: snap.R[2] } : null;
    return true;
  }

  return { S, step, syncRoster, setReport, startMatch, snapshot, load, byId };
}
