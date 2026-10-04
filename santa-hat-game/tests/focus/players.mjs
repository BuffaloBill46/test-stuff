// Focus group, part 1: 100 simulated players on the REAL game rules (plinko.js, slots.js; it ran on the Spin until that game was removed, 2026-10-04: Snowball Drop has the
// same two sizes and the same pool). Hard numbers, not opinions:
// how long budgets last, losing streaks, how often players see a real win, who walks away ahead. Writes players.json.
import { writeFileSync } from 'node:fs';
import { play as dropPlay } from '../../mockups/plinko.js';
import { pull, POOL_RULES } from '../../mockups/slots.js';

let seed = 20260930; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const SEGMENTS = [
  // name, budget range $, game mix, buy size, quit rule
  ['Crypto regular', [20, 60], ['big', 'drop100'], 10, 'double-or-bust'],
  ['Phone newcomer', [2, 10], ['drop10', 'drop100'], 5, 'budget'],
  ['Careful budgeter', [1, 5], ['drop10'], 1, 'stop-loss-half'],
  ['High roller', [100, 300], ['big', 'drop100'], 10, 'budget'],
  ['Skeptic', [3, 10], ['drop10', 'big'], 1, 'stop-after-20'],
  ['Competitive gamer', [5, 15], ['big'], 5, 'stop-on-big-win'],
  ['Collector', [5, 20], ['drop100'], 5, 'stop-loss-half'],
  ['Small-phone player', [2, 8], ['drop10'], 5, 'budget'],
  ['Grinder', [30, 80], ['big'], 10, 'budget'],
  ['Returning daily player', [3, 6], ['drop10', 'drop100', 'big'], 3, 'budget'],
];
const BET = { drop10: 0.1, drop100: 1, big: 1 }, SECS = { drop10: 6, drop100: 6, big: 5 };
const spinPool = { pool: POOL_RULES.start, prepaid: false }, slotsPool = { pool: POOL_RULES.start, prepaid: false };
const players = [];
for (const [seg, [lo, hi], games, buy, quit] of SEGMENTS) for (let k = 0; k < 10; k++) {
  const budget = Math.round(lo + rnd() * (hi - lo)); let bal = budget, plays = 0, secs = 0, dry = 0, longestDry = 0, realWins = 0, biggest = 0, purchases = 0, credits = 0, jackpot = false, top = false, peak = budget;
  const game = pick(games), bet = BET[game];
  while (true) {
    if (quit === 'double-or-bust' && bal >= 2 * budget) break;
    if (quit === 'stop-loss-half' && bal <= budget / 2) break;
    if (quit === 'stop-after-20' && plays >= 20) break;
    if (quit === 'stop-on-big-win' && biggest >= 10 * bet) break;
    if (credits === 0) { const n = Math.min(buy, Math.floor(bal / bet + 1e-9)); if (n < 1) break; credits = n; bal -= n * bet; purchases++; }
    credits--; plays++; secs += SECS[game];
    const r = game === 'big' ? pull(slotsPool, 'big') : dropPlay(spinPool, bet);
    if (r.paused) { credits++; break; }
    bal += r.received; peak = Math.max(peak, bal + credits * bet);
    if (r.pay > bet + 1e-9) { realWins++; longestDry = Math.max(longestDry, dry); dry = 0; } else dry++;
    biggest = Math.max(biggest, r.pay); if (r.jackpot) jackpot = true; if (r.wins?.some((w) => w.top)) top = true;
    if (plays > 5000) break;
  }
  longestDry = Math.max(longestDry, dry);
  const end = bal + credits * bet; // unused credits still belong to the player (no cash-out, but no expiry either)
  players.push({ seg, game, budget, end: +end.toFixed(2), plays, minutes: +(secs / 60).toFixed(1), realWins, winRate: plays ? +(realWins / plays).toFixed(3) : 0,
    longestDry, biggest: +biggest.toFixed(2), purchases, jackpot, top, ahead: end > budget, peakAhead: peak > budget * 1.2 });
}
writeFileSync(new URL('players.json', import.meta.url), JSON.stringify(players, null, 1));
const by = (f) => { const o = {}; for (const p of players) (o[p.seg] ||= []).push(p); return Object.entries(o).map(([s, ps]) => [s, f(ps)]); };
const med = (a) => { const v = [...a].sort((x, y) => x - y); return v[v.length >> 1]; };
console.log('segment                 game mix     median min  median plays  ended ahead  was ever 20% up  longest dry run (median)  real-win rate');
for (const [s, r] of by((ps) => [ps.map((p) => p.game).join(',').slice(0, 11), med(ps.map((p) => p.minutes)), med(ps.map((p) => p.plays)), ps.filter((p) => p.ahead).length, ps.filter((p) => p.peakAhead).length, med(ps.map((p) => p.longestDry)), (ps.reduce((a, p) => a + p.realWins, 0) / Math.max(1, ps.reduce((a, p) => a + p.plays, 0))).toFixed(2)]))
  console.log(s.padEnd(24), String(r[0]).padEnd(12), String(r[1]).padStart(8), String(r[2]).padStart(12), String(r[3] + '/10').padStart(11), String(r[4] + '/10').padStart(15), String(r[5]).padStart(18), String(r[6]).padStart(14));
const all = players;
console.log(`\nall 100: ended ahead ${all.filter((p) => p.ahead).length}; were 20%+ up at some point ${all.filter((p) => p.peakAhead).length}; hit a 100× line ${all.filter((p) => p.top).length}; hit the pool jackpot ${all.filter((p) => p.jackpot).length}; went 15+ plays without a real win ${all.filter((p) => p.longestDry >= 15).length}; median session ${med(all.map((p) => p.minutes))} min`);
