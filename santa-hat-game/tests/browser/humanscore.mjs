import { createSim, K } from '../../mockups/sim.js';
const sim = createSim(); const peers = ['a', 'b', 'c']; sim.syncRoster(peers); sim.startMatch('team');
const c = {}; let thrown = 0;
for (let i = 0; i < 30 * 90; i++) {
  for (const p of peers) {
    const e = sim.S.ents.find((q) => q.peer === p); const s = (c[p] = c[p] || { t: 0, q: 0 });
    const foe = sim.S.ents.find((o) => o.team !== e.team);
    if (i % 10 === 0) s.t++;
    const hx = sim.S.hat.x, hz = sim.S.hat.z, d = Math.hypot(hx - e.x, hz - e.z) || 1;
    sim.setReport(p, { q: ++s.q, ep: e.ep, x: e.x + (hx - e.x) / d * 0.2, z: e.z + (hz - e.z) / d * 0.2, vx: 0, vz: 0, t: s.t, ax: foe.x, az: foe.z });
  }
  const before = sim.S.balls.length; sim.step(1 / 30); thrown += Math.max(0, sim.S.balls.length - before);
}
const hs = sim.S.ents.filter((e) => !e.bot).map((e) => `${e.peer}:${e.score}`);
console.log('human scores after one round', hs.join(' '), '| team totals', sim.S.team, '| phase', sim.S.phase);
