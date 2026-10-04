import { createSim, K, PTS, PHASES, constrain } from '../mockups/sim.js';
// Match points (Cody 2026-10-04): knocking the hat off someone 10, catching the flying hat on your head 25 (were 25 and 50); wearing it 10 a second, a hit 5.
import assert from 'node:assert/strict';
assert.deepEqual(PTS, { hatSec: 10, header: 25, knock: 10, hit: 5 }, 'the match points are as Cody set them');

let seed = 1;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const fail = (m, extra) => { console.error('FAIL:', m, extra ? JSON.stringify(extra).slice(0, 400) : ''); process.exit(1); };
let maxBytes = 0, matches = 0, botEmotes = 0;

function checkInvariants(sim, tag) {
  const S = sim.S;
  const h = S.hat;
  if (!['ped', 'head', 'air', 'ground'].includes(h.st)) fail(tag + ' bad hat state', h);
  if (h.st === 'head' && !sim.byId(h.holder)) fail(tag + ' hat on missing head', h);
  if (h.st !== 'head' && h.holder !== -1) fail(tag + ' holder set while not on head', h);
  for (const e of S.ents) {
    if (!Number.isInteger(e.score) || e.score < 0) fail(tag + ' bad score', e);
    if (![e.x, e.z, e.vx, e.vz].every(Number.isFinite)) fail(tag + ' non-finite position', e);
    if (Math.hypot(e.x, e.z) > K.ARENA + 1e-6) fail(tag + ' outside arena', e);
  }
  const humans = S.ents.filter((e) => !e.bot).length;
  if (humans < K.MIN_BODIES && S.ents.length < K.MIN_BODIES) fail(tag + ' bots not filling', { n: S.ents.length });
  if (S.mode === 'team') {
    const n = [0, 1].map((t) => S.ents.filter((e) => e.team === t).length);
    if (n[0] !== n[1]) fail(tag + ' unbalanced teams', n);
  }
  const bytes = JSON.stringify(sim.snapshot()).length;
  maxBytes = Math.max(maxBytes, bytes);
  if (bytes > 3800) fail(tag + ' snapshot too big: ' + bytes);
}

function runMatch(mode, humansStart, churn) {
  const sim = createSim(rand);
  let peers = Array.from({ length: humansStart }, (_, i) => 'p' + i), next = humansStart;
  sim.syncRoster(peers);
  const clients = {};
  const dt = 1 / 30;
  // warm-up in lobby
  for (let i = 0; i < 90; i++) { sim.step(dt); checkInvariants(sim, 'lobby'); }
  sim.startMatch(mode);
  sim.__lastEmote = Math.max(0, ...sim.S.ev.map((v) => v[0])); // emotes from the lobby warm-up have no timestamp here; skip them
  const phases = [];
  let t = 0, lastPhase = null, teamSnapshotsChecked = 0;
  const holdTime = {};
  while (true) {
    // each human behaves like a real browser: moves itself, reports, follows respawns
    for (const p of peers) {
      const e = sim.S.ents.find((q) => q.peer === p); if (!e) continue;
      const c = (clients[p] = clients[p] || { x: e.x, z: e.z, ep: e.ep, q: 0, t: 0, dx: 0, dz: 0 });
      if (c.ep !== e.ep || e.stun > 0) { c.x = e.x; c.z = e.z; c.ep = e.ep; }
      if (rand() < 0.05) { const a = rand() * 6.28; c.dx = Math.cos(a); c.dz = Math.sin(a); }
      c.x += c.dx * K.HUMAN_SPEED * dt; c.z += c.dz * K.HUMAN_SPEED * dt; constrain(c);
      if (rand() < 0.15) c.t++;
      const tgt = sim.S.ents[Math.floor(rand() * sim.S.ents.length)];
      sim.setReport(p, { q: ++c.q, ep: c.ep, x: c.x, z: c.z, vx: c.dx * K.HUMAN_SPEED, vz: c.dz * K.HUMAN_SPEED, f: 0, t: c.t, ax: tgt ? tgt.x : 0, az: tgt ? tgt.z : 0 });
    }
    if (churn && rand() < 0.01) {
      if (rand() < 0.5 && peers.length > 1) peers.splice(Math.floor(rand() * peers.length), 1);
      else if (peers.length < 10) peers.push('p' + next++);
      sim.syncRoster(peers);
    }
    // host migration now and then: a fresh sim picks up from the snapshot
    let simNow = sim;
    if (rand() < 0.003) {
      const snap = JSON.parse(JSON.stringify(sim.snapshot()));
      const s2 = createSim(rand); if (!s2.load(snap)) fail('load failed');
      const a = JSON.stringify({ ...s2.snapshot(), s: 0, c: 0 }), b = JSON.stringify({ ...snap, s: 0, c: 0 });
      if (a !== b) { const A=JSON.parse(a),B=JSON.parse(b); for (const k in B) if (JSON.stringify(A[k])!==JSON.stringify(B[k])) { if (Array.isArray(B[k])) B[k].forEach((row,i)=>{ if (JSON.stringify(row)!==JSON.stringify(A[k][i])) console.log(k,i,'orig',JSON.stringify(row),'loaded',JSON.stringify(A[k][i])); }); else console.log(k,'orig',JSON.stringify(B[k]),'loaded',JSON.stringify(A[k])); } fail('snapshot round-trip differs'); }
      Object.assign(sim, {}); // keep using the original; round trip equality is the check
    }
    const before = Object.fromEntries(simNow.S.ents.map((e) => [e.id, e.score]));
    simNow.step(dt); t += dt;
    // bot emotes: only bots, one of the 4 emotes, at most one per bot every 8 s
    for (const [id, k, who, i] of simNow.S.ev) {
      if (k !== 'emote' || id <= (simNow.__lastEmote || 0)) continue; simNow.__lastEmote = id;
      const e = simNow.byId(who); if (e && !e.bot) fail('emote from a real player\'s character', { who }); // not found = a bot that has since left its seat
      if (!(i >= 0 && i <= 3)) fail('unknown emote', { i });
      const seen = (simNow.__chat ||= new Map()); if (seen.has(who) && t - seen.get(who) < 8 - 1e-6) fail('bot emoted too often', { who, gap: t - seen.get(who) });
      seen.set(who, t); botEmotes++;
    }
    if (simNow.S.phase !== lastPhase) { phases.push(simNow.S.phase); lastPhase = simNow.S.phase; }
    checkInvariants(simNow, mode);
    // point-rate sanity: nobody gains more than one big event + hat second in a single frame
    for (const e of simNow.S.ents) { const g = e.score - (before[e.id] ?? e.score); if (g > PTS.header + PTS.knock + PTS.hit * 3 + PTS.hatSec) fail('score jump ' + g, e); }
    if (mode === 'team' && !churn && simNow.S.phase === 'play') {
      const sum = [0, 1].map((tm) => simNow.S.ents.filter((e) => e.team === tm).reduce((a, e) => a + e.score, 0));
      if (sum[0] !== simNow.S.team[0] || sum[1] !== simNow.S.team[1]) fail('team total != sum of players', { sum, team: simNow.S.team });
      teamSnapshotsChecked++;
    }
    if (simNow.S.phase === 'lobby' && phases.includes('end')) break;
    if (t > K.ROUNDS * K.ROUND_TIME + (K.ROUNDS - 1) * K.BREAK_TIME + K.END_TIME + 5) fail('match never ended', { phases, t });
  }
  const want = [...Array.from({ length: K.ROUNDS }, (_, i) => (i ? ['break', 'play'] : ['play'])).flat(), 'end', 'lobby']; // K.ROUNDS rounds (1 since 2026-10-03)
  if (JSON.stringify(phases) !== JSON.stringify(want)) fail('phase order', phases);
  matches++;
  return sim;
}

for (let i = 0; i < 40; i++) runMatch('ffa', 1 + (i % 8), false);
for (let i = 0; i < 40; i++) runMatch('team', 1 + (i % 8), false);
for (let i = 0; i < 40; i++) runMatch(i % 2 ? 'team' : 'ffa', 2 + (i % 7), true);

// worst case size: 8 humans all throwing constantly
{
  const sim = createSim(rand); const peers = Array.from({ length: 8 }, (_, i) => 'k3v6q2rt7wacd4f' + i);
  sim.syncRoster(peers); sim.startMatch('team'); let c = 0;
  for (let i = 0; i < 3000; i++) { c++; peers.forEach((p) => { const e = sim.S.ents.find((q) => q.peer === p); sim.setReport(p, { q: c, ep: e.ep, x: e.x, z: e.z, vx: 0, vz: 0, t: c, ax: 0, az: 0 }); }); sim.step(1 / 30); checkInvariants(sim, 'flood'); }
}

// hostile reports: garbage values, teleports, super speed, old spawns
{
  const sim = createSim(rand); sim.syncRoster(['x']); sim.startMatch('ffa');
  const e = sim.S.ents.find((q) => q.peer === 'x');
  sim.setReport('x', { q: 1, ep: e.ep, x: 1e9, z: NaN, vx: 'a', vz: {}, t: 'zz' });
  if (![e.x, e.z, e.vx, e.vz].every(Number.isFinite) || Math.hypot(e.x, e.z) > K.ARENA + 1e-6) fail('garbage report broke position', e);
  sim.step(1); const before = { x: e.x, z: e.z };
  sim.setReport('x', { q: 2, ep: e.ep, x: -before.x, z: -before.z, vx: 999, vz: 0, t: 0 });
  const jumped = Math.hypot(e.x - before.x, e.z - before.z);
  if (jumped > K.HUMAN_SPEED * 1.4 + 0.61) fail('teleport not limited: ' + jumped);
  if (Math.hypot(e.vx, e.vz) > K.HUMAN_SPEED * 1.05 + 1e-6) fail('speed not clamped', e);
  const at = { x: e.x, z: e.z }; sim.setReport('x', { q: 3, ep: e.ep - 1, x: 0, z: 5, t: 0 });
  if (e.x !== at.x || e.z !== at.z) fail('report from an old spawn was accepted');
  sim.setReport('x', { q: 2, ep: e.ep, x: 0, z: 5, t: 0 });
  if (e.x !== at.x || e.z !== at.z) fail('out-of-order report was accepted');
}
if (botEmotes < matches) fail('bots hardly ever emote', { botEmotes });
console.log(`bots emoted ${botEmotes} times in ${matches} matches (about ${(botEmotes / matches).toFixed(1)} per match)`);
console.log(`OK: ${matches} full matches, invariants held every frame; largest snapshot ${maxBytes} bytes (limit 4096)`);
