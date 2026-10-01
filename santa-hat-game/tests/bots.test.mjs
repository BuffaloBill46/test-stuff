// Bot signals (server/bots.js): simulated people never trip a strong signal; scripts on a timer do; signals only.
// Each simulated run follows the real flow: quote → wallet approval → chain confirmation (~13 s, varies) → the plays →
// the run finishes (paidAt) → the player's REACTION → the next quote. People's reactions vary; a timer's don't.
import assert from 'node:assert/strict';
import { botSignals, BOT_RULES } from '../server/bots.js';

let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const normal = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
const logn = (median, sigma) => median * Math.exp(sigma * normal());
const NOW = Date.UTC(2026, 9, 1, 23, 59, 0);

// One player's runs. react(): seconds from a run ending to the next quote. approve(): seconds in the wallet. play(): seconds per play.
function sim(profile, { runs, startHoursAgo, react, approve, play, n = 10 }) {
  const out = []; let t = NOW - startHoursAgo * 3600e3;
  for (let i = 0; i < runs && t < NOW; i++) {
    const quoteAt = t;
    t += (approve() + Math.max(8, 13 + 2 * normal())) * 1000;   // wallet, then the chain confirms
    for (let k = 0; k < n; k++) t += play() * 1000;             // the plays (and their animations)
    out.push({ profile, name: profile, wallet: profile + 'Wa11et', quoteAt, paidAt: t });
    t += react() * 1000;
  }
  return out;
}
// People: casual players, quick players who use Skip ahead, and grinders playing hours with no break. 300 of each.
const human = (i, type) => {
  const p = { casual: { runs: 40, react: () => (rnd() < 0.05 ? 30 + rnd() * 270 : Math.max(0.9, logn(4, 0.8))), play: () => 2 + rnd() * 4 },
    quick: { runs: 60, react: () => Math.max(1.0, logn(2.2, 0.55)), play: () => 0.6 + rnd() * 1.2 },
    grinder: { runs: 700, hoursAgo: 6 + 5 * rnd(), react: () => Math.max(1.0, logn(1.8, 0.45)), play: () => 0.5 + rnd() * 0.8 } }[type];
  return sim(`${type}${i}`, { ...p, startHoursAgo: p.hoursAgo ?? 10 * rnd() + 1, approve: () => Math.max(1.5, logn(4, 0.6)) });
};
const people = []; for (const type of ['casual', 'quick', 'grinder']) for (let i = 0; i < 300; i++) people.push(...human(i, type));
const flaggedPeople = botSignals(people, NOW);
const strongPeople = flaggedPeople.filter((f) => f.reasons.some((r) => r.strong));
assert.deepEqual(strongPeople.map((f) => f.profile), [], 'no simulated person trips a strong signal');
const lowest = Math.min(...flaggedPeople.concat(botSignals(people, NOW, { ...BOT_RULES, noBreakHours: 0 })).map((f) => f.spread ?? 9));
console.log(`✓ 900 simulated people (casual, quick with Skip ahead, hours-long grinders): no strong signal. Lowest reaction spread seen: ${Math.round(lowest * 100)}% (clockwork is under ${BOT_RULES.clockworkSpread * 100}%); ${flaggedPeople.length} grinders get only weak "no breaks" / "round the clock" notes`);
assert.ok(flaggedPeople.length > 200 && flaggedPeople.every((f) => f.profile.startsWith('grinder')), 'hours-long grinders (only) get weak notes, never more');

// Scripts: the wallet signs instantly, plays settle as fast as the server answers, then a fixed wait (plus network wobble).
const script = (name, { wait, hours = 3, runs = 1e6 }) => sim(name, { runs, startHoursAgo: hours, approve: () => 0.3 + 0.05 * rnd(),
  play: () => 0.15 + 0.05 * rnd(), react: () => Math.max(0.05, wait() + 0.08 * normal()) });
const timer = script('timer2s', { wait: () => 2 });
const instant = script('instant', { wait: () => 0.2 });
const allDay = script('allday', { wait: () => 5, hours: 23.9 });
const sneaky = script('sneaky', { wait: () => 1 + 5 * rnd() });      // adds random waits: the honest limit of this check
const f = botSignals([...people, ...timer, ...instant, ...allDay, ...sneaky], NOW);
const of = (p) => f.find((x) => x.profile === p);
assert.ok(of('timer2s').reasons.some((r) => r.signal === 'clockwork'), 'a 2-second timer is clockwork');
assert.ok(of('instant').reasons.some((r) => r.signal === 'instant'), 'reacting in 0.2 s is instant');
assert.deepEqual(of('allday').reasons.map((r) => r.signal), ['clockwork', 'no breaks', 'round the clock'], 'a timer all day trips everything');
assert.equal(f[0].profile, 'allday', 'strongest first');
assert.ok(f.slice(0, 3).every((x) => ['allday', 'timer2s', 'instant'].includes(x.profile)), 'the three scripts top the list, above any person');
assert.ok(!of('sneaky')?.reasons.some((r) => r.strong), 'documented limit: random waits hide a script from these signals');
console.log(`✓ scripts: a 2 s timer (clockwork), 0.2 s reactions (instant), a timer all day (all three signals, listed first). Limit: a script with random waits isn't caught: ${of('sneaky') ? of('sneaky').reasons.map((r) => r.signal).join(', ') : 'no signal'}`);

// Edges: fewer than 30 runs are never judged; runs older than 24 h don't count; unfinished runs (no paidAt) give no reaction.
assert.deepEqual(botSignals(timer.slice(0, 29), NOW), [], 'under 30 runs: not judged');
assert.deepEqual(botSignals(timer.map((r) => ({ ...r, quoteAt: r.quoteAt - 30 * 3600e3, paidAt: r.paidAt - 30 * 3600e3 })), NOW), [], 'older than 24 h: not counted');
assert.deepEqual(botSignals(timer.map((r) => ({ ...r, paidAt: null })), NOW).flatMap((x) => x.reasons.filter((y) => y.strong)), [], 'no finished runs, no reaction times, no strong signal');
console.log('✓ edges: under 30 runs, older than 24 h, unfinished runs');
console.log('bot signals: all passed');
