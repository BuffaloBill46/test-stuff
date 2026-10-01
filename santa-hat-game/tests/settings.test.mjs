// Game settings: version 0 is exactly today's game; the guard rails refuse unsafe changes; a change does what it says.
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, build, check, itemsWith, wheelFrom } from '../mockups/settings.js';
import { MACHINES, stats, pull, POOL_RULES } from '../mockups/slots.js';
import { MAIN, BONUS, STAR, spin, SPIN_RULES } from '../mockups/spin.js';

const S = () => structuredClone(DEFAULT_SETTINGS);
// Version 0 = today's game, exactly (same strips, same wheel, same payback).
const b0 = build(S());
assert.deepEqual(b0.machine.strips, MACHINES.big.strips, 'identical reel strips');
assert.deepEqual(b0.wheel, { main: MAIN, bonus: BONUS }, 'identical wheels');
const c0 = check(S()); assert.ok(c0.ok, c0.problems.join('; '));
assert.ok(Math.abs(c0.report.big.payback - stats(MACHINES.big).payback) < 1e-12 && Math.abs(c0.report.spin.payback - 0.80) < 1e-9);
console.log(`today: Big Hat pays back ${(c0.report.big.payback * 100).toFixed(1)}% (real win ${(c0.report.big.realWin * 100).toFixed(0)}% of pulls); Spin ${(c0.report.spin.payback * 100).toFixed(1)}% (real win ${(c0.report.spin.realWin * 100).toFixed(1)}%)`);

// Refused: anything that drains a pool, locks a game, or is nonsense.
const refused = (label, f) => { const s = S(); f(s); const r = check(s); assert.equal(r.ok, false, label); return r.problems.join('; '); };
assert.match(refused('Spin over 100%', (s) => { s.spin.main = { 0: 5, 1: 10, 2: 15, star: 10 }; }), /Spin would pay back/);
assert.match(refused('Big Hat over 98%', (s) => { s.big.hatBonus = 0.2; }), /Big Hat would pay back/);
assert.match(refused('main wheel not 40', (s) => { s.spin.main[0] = 10; }), /exactly 40 segments/);
assert.match(refused('bonus wheel not 12', (s) => { s.spin.bonus[3] = 20; }), /exactly 12 segments/);
assert.match(refused('a star on the bonus wheel', (s) => { s.spin.bonus = { star: 1, 3: 11 }; }), /whole-number prizes/);
assert.match(refused('top prize bigger than a top-off can cover', (s) => { s.big.pays.hat[5] = 900; s.big.counts.hat = 1; }), /must cover the top prize/);
assert.match(refused('jackpot 90%', (s) => { s.big.jackpotPct = 0.9; }), /1%–50%/);
assert.match((() => { const r = check(S(), { spin: { ...SPIN_RULES, topOffTo: 8 }, slots: POOL_RULES }); assert.equal(r.ok, false); return r.problems.join('; '); })(), /Snowball Drop's top prize/, 'the shared pool must cover a 10× drop');
assert.match(refused('jackpot too easy', (s) => { s.big.jackpotOdds = 50; }), /1 in 1,000/);
assert.match(refused('free plays', (s) => { s.prices.big = 0; }), /\$0\.01–\$100/);
assert.match(refused('small spin dearer than big', (s) => { s.prices.spin10 = 2; }), /small spin must cost less/);
assert.match(refused('a spin price that isn\'t whole 10¢', (s) => { s.prices.spin100 = 1.25; }), /whole number of 10¢/, 'the Spin balance is kept in 10¢ units');
assert.match(refused('prize for coal', (s) => { s.big.pays.coal = { 3: 5 }; }), /no prizes for coal/);
assert.match(refused('negative symbols', (s) => { s.big.counts.hat = -1; }), /whole numbers/);

// Allowed changes do what they say.
let s = S(); s.big.jackpotOdds = 10000; s.big.jackpotPct = 0.14; assert.ok(check(s).ok);
const m = build(s).machine; assert.equal(m.poolJackpotOdds, 1 / 10000);
const st = { pool: 1750, prepaid: true }; assert.ok(Math.abs(pull(st, m, Math.random, 'JACKPOT').pay - 1750 * 0.14) < 1e-9, 'jackpot % from the settings');
s = S(); s.spin.main = { 0: 18, 1: 12, 2: 6, star: 4 }; s.spin.bonus = { 3: 8, 4: 3, 5: 1 }; const r = check(s); assert.ok(r.ok, r.problems.join('; '));
assert.ok(r.report.spin.realWin > c0.report.spin.realWin && r.report.spin.payback > c0.report.spin.payback, 'fewer no-win segments, more stars: more real wins, higher payback');
const w = wheelFrom(s.spin);
for (const [mult, n] of Object.entries(s.spin.main)) assert.equal(w.main.filter((x) => x === (mult === 'star' ? STAR : +mult)).length, n, `main ${mult} has exactly ${n} segments`);
for (const [mult, n] of Object.entries(s.spin.bonus)) assert.equal(w.bonus.filter((x) => x === +mult).length, n, `bonus ${mult}× has exactly ${n} segments`);
const sp = { pool: 1000, prepaid: true };
for (let i = 0; i < 40; i++) for (let j = 0; j < 12; j++) assert.equal(spin(sp, 1, () => 0, [i, j], w).mult, w.main[i] === STAR ? w.bonus[j] : w.main[i]);
s = S(); s.prices = { ...s.prices, big: 2 }; const r2 = check(s); assert.ok(r2.ok && r2.report.big.topPrize === 200, 'a $2 pull doubles the prizes in dollars');
console.log(`example: 3 fewer "no win" segments and one more star → Spin pays back ${(r.report.spin.payback * 100).toFixed(1)}%, real win ${(r.report.spin.realWin * 100).toFixed(1)}%`);

// Store items: change a price, add a new colour; new shapes are refused (they need code).
s = S(); s.store.items = [{ id: 'shirt_coal', slot: 'shirt', name: 'Coal', price: 0.5 }, { id: 'shirt_mint', slot: 'shirt', name: 'Mint', color: 0x98e0c0, price: 0.3 }, { id: 'pants_plum', slot: 'pants', name: 'Plum', color: 0x5a2a55, level: 7 }];
assert.ok(check(s).ok, check(s).problems.join('; '));
const items = itemsWith(s); assert.equal(items.find((x) => x.id === 'shirt_coal').price, 0.5); assert.ok(items.find((x) => x.id === 'shirt_mint'));
assert.equal(items.find((x) => x.id === 'shirt_coal').color, 0x2a2a35, 'a price change keeps the look');
for (const bad of [{ id: 'face_alien', slot: 'face', name: 'Alien', face: 'alien', level: 3 }, { id: 'x', slot: 'shirt', name: 'X', color: 1, level: 1 }, { id: 'shirt_both', slot: 'shirt', name: 'B', color: 1, level: 1, price: 1 }, { id: 'hat_top', slot: 'hat', name: 'Top hat', price: 1 }])
  { s = S(); s.store.items = [bad]; assert.equal(check(s).ok, false, 'refuses ' + bad.id); }
// The reels and wheel depend only on the numbers, never on the order the settings list them in (the database reorders keys).
{ const a = S(), b = S(); a.big.counts = { ...a.big.counts, hat: 9, coal: 24 };
  b.big.counts = Object.fromEntries(Object.entries(a.big.counts).reverse()); b.spin = { main: Object.fromEntries(Object.entries(a.spin.main).reverse()), bonus: Object.fromEntries(Object.entries(a.spin.bonus).reverse()) };
  assert.deepEqual(build(a).machine.strips, build(b).machine.strips, 'same reels whatever the key order');
  assert.deepEqual(build(a).wheel, build(b).wheel, 'same wheels whatever the key order'); }
console.log('OK: settings: version 0 = today exactly; 14 unsafe changes refused; odds, prices, wheel and store changes do what they say');
