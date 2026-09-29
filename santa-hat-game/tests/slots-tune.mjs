// Tuning helper for the Slots draft. For each reel mix it keeps the Santa Hat line at 100× the price, scales a fixed
// "shape" of all the other prizes so line wins pay back TARGET, rounds to tidy numbers, then simulates real pulls
// for win rates. Run: node tests/slots-tune.mjs   (paste the chosen counts/pays into mockups/slots.js)
import { MACHINES, gridFor, evaluate } from '../mockups/slots.js';
import { rng } from './rng.mjs';

const TARGET = 0.75, rand = rng(5);
const tidy = (x) => (x < 1 ? Math.max(0.05, Math.round(x * 20) / 20) : x < 10 ? Math.round(x * 2) / 2 : Math.round(x));
const SHAPE = {
  mini: { star: { 3: 50 }, reindeer: { 3: 25 }, snowman: { 3: 15 }, present: { 3: 10 }, lantern: { 3: 6 }, pine: { 3: 4, 2: 0.6 }, bell: { 3: 3, 2: 0.5 }, snowball: { 3: 2, 2: 0.3 } },
  big: {
    hat: { 4: 15, 3: 2 }, star: { 5: 50, 4: 10, 3: 2 }, reindeer: { 5: 25, 4: 6, 3: 1.2 }, snowman: { 5: 15, 4: 4, 3: 0.8 }, present: { 5: 10, 4: 2.5, 3: 0.6 },
    lantern: { 5: 6, 4: 1.6, 3: 0.4 }, pine: { 5: 4, 4: 1, 3: 0.3 }, bell: { 5: 3, 4: 0.8, 3: 0.2 }, snowball: { 5: 2, 4: 0.6, 3: 0.15 },
  },
};

// Exact payback of a pay table for a reel mix (a PAR-sheet sum): lines × Σ P(exactly n in a row from the left) × prize.
function payback(m, counts, pays) {
  const L = Object.values(counts).reduce((a, b) => a + b, 0); let b = 0;
  for (const [id, p] of Object.entries(pays)) for (const [n, x] of Object.entries(p)) { const f = (counts[id] || 0) / L; b += Math.pow(f, +n) * (+n < m.reels ? 1 - f : 1) * x; }
  return b * m.lines.length;
}
export function tune(id, counts) {
  const m = MACHINES[id], top = { hat: { [m.reels]: 100 } };
  const k = (TARGET - payback(m, counts, top)) / payback(m, counts, SHAPE[id]);
  const pays = {};
  for (const [s, p] of Object.entries(SHAPE[id])) for (const [n, x] of Object.entries(p)) (pays[s] ||= {})[n] = Math.min(tidy(x * k), 90);
  pays.hat = { ...(pays.hat || {}), [m.reels]: 100 };
  return { pays, payback: payback(m, counts, pays), k };
}
export function simulate(id, counts, pays, N = 150000) {
  const m = MACHINES[id], mm = { ...m, counts, pays };
  const bag = []; for (const [s, n] of Object.entries(counts)) for (let i = 0; i < n; i++) bag.push(s);
  mm.strips = Array.from({ length: m.reels }, () => bag.map((s) => s).sort(() => rand() - 0.5).map((s) => ({ hat: 0, star: 1, reindeer: 2, snowman: 3, present: 4, lantern: 5, pine: 6, bell: 7, snowball: 8, coal: 9 })[s]));
  mm.stripLen = bag.length;
  let hit = 0, ahead = 0, micro = 0, back = 0;
  for (let i = 0; i < N; i++) {
    const w = evaluate(mm, gridFor(mm, Array.from({ length: m.reels }, () => Math.floor(rand() * mm.stripLen))));
    const pay = w.reduce((a, x) => a + x.pay, 0); back += pay;
    if (w.length) hit++; if (pay > m.bet + 1e-9) ahead++; else if (pay > 0) micro++;
  }
  return { hit: hit / N, ahead: ahead / N, micro: micro / N, back: back / N / m.bet };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const tries = {
    mini: [
      { hat: 2, star: 1, reindeer: 2, snowman: 2, present: 2, lantern: 3, pine: 4, bell: 7, snowball: 9, coal: 0 },
      { hat: 2, star: 1, reindeer: 1, snowman: 2, present: 2, lantern: 3, pine: 5, bell: 7, snowball: 9, coal: 0 },
      { hat: 2, star: 1, reindeer: 1, snowman: 1, present: 2, lantern: 3, pine: 5, bell: 8, snowball: 9, coal: 0 },
    ],
    big: [
      { hat: 4, star: 3, reindeer: 3, snowman: 3, present: 4, lantern: 4, pine: 5, bell: 6, snowball: 8, coal: 0 },
      { hat: 4, star: 2, reindeer: 3, snowman: 3, present: 3, lantern: 4, pine: 5, bell: 7, snowball: 9, coal: 0 },
      { hat: 4, star: 2, reindeer: 2, snowman: 3, present: 3, lantern: 3, pine: 5, bell: 8, snowball: 10, coal: 0 },
    ],
  };
  for (const [id, list] of Object.entries(tries)) for (const counts of list) {
    const t = tune(id, counts), s = simulate(id, counts, t.pays), m = MACHINES[id];
    const L = Object.values(counts).reduce((a, b) => a + b, 0), fh = counts.hat / L, topOdds = 1 / (Math.pow(fh, m.reels) * m.lines.length);
    console.log(`${id} ${JSON.stringify(counts)}\n   pays ${JSON.stringify(t.pays)}\n   payback ${(t.payback * 100).toFixed(1)}% (simulated ${(s.back * 100).toFixed(1)}%); some win on ${(s.hit * 100).toFixed(1)}% of pulls ` +
      `(micro ${(s.micro * 100).toFixed(1)}%, ahead ${(s.ahead * 100).toFixed(1)}%); 100× line about 1 in ${Math.round(topOdds).toLocaleString()}`);
  }
}
