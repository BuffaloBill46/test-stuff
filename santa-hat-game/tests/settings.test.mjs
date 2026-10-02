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
// Hats and backpacks (2026-10-01): a new colour of an existing shape is fine; a brand-new shape or no colour is refused.
{ const { checkItem: ci } = await import('../mockups/settings.js');
  assert.deepEqual(ci({ id: 'hat_beanie_red', slot: 'hat', name: 'Red Beanie', hat: 'beanie', color: 0xcc2222, level: 2 }), []);
  assert.match(ci({ id: 'hat_crown', slot: 'hat', name: 'Crown', hat: 'crown', color: 0xffd060, level: 2 }).join(), /existing shape/);
  assert.match(ci({ id: 'pack_sack_blue', slot: 'pack', name: 'Blue Sack', pack: 'sack', level: 2 }).join(), /needs a colour/);
  console.log('OK: store editor: new hat/backpack colours allowed, new shapes need code'); }
// Special snowballs and gear (Cody, 2026-10-01: "Add the special gear and snowballs. Don't remove the other stuff"): their prices
// can be changed; a brand-new one is refused (what it does needs code); the looks keep working as before.
{ const { checkItem: ci, check: chk, DEFAULT_SETTINGS: D, itemsWith } = await import('../mockups/settings.js');
  assert.deepEqual(ci({ id: 'sb_ice', slot: 'sball', name: 'Ice Ball', price: 0.4 }), [], 'Ice Ball repriced');
  assert.deepEqual(ci({ id: 'gear_pumpkin', slot: 'gear', name: 'Pumpkin Costume', price: 0.6 }), [], 'Pumpkin Costume repriced');
  assert.match(ci({ id: 'sb_laser', slot: 'sball', name: 'Laser Ball', price: 1 }).join(), /needs code/, 'a new special snowball needs code');
  assert.match(ci({ id: 'gear_cape', slot: 'gear', name: 'Cape', price: 1 }).join(), /needs code/, 'new gear needs code');
  assert.deepEqual(ci({ id: 'shirt_mint', slot: 'shirt', name: 'Mint', color: 0x98e0c0, price: 0.3 }), [], 'looks still sell');
  const s = structuredClone(D); s.store = { items: [{ id: 'sb_ice', slot: 'sball', name: 'Ice Ball', price: 0.4 }, { id: 'gear_shoes', slot: 'gear', name: 'Elf Shoes', price: 1.25 }] };
  assert.ok(chk(s).ok, 'publishable: ' + chk(s).problems.join('; '));
  const it = itemsWith(s); assert.equal(it.find((x) => x.id === 'sb_ice').price, 0.4); assert.equal(it.find((x) => x.id === 'gear_shoes').price, 1.25);
  assert.equal(it.find((x) => x.id === 'gear_shoes').gear, 'shoes', 'repricing keeps what the gear does');
  console.log('OK: store editor: special snowball and gear prices editable, new ones need code, looks unchanged'); }
// Stocking Stuffer's pay table (Cody, 2026-10-02): editable on the admin screen with guard rails; old settings keep his table.
{ const { DEFAULT_SETTINGS: D, check: chk, build: bld, applyToGame, stockPays } = await import('../mockups/settings.js');
  const { PAYS, DEFAULT_PAYS, payback: pb, play } = await import('../mockups/stocking.js');
  const T = () => structuredClone(D), no = (label, f, why) => { const s = T(); f(s); const r = chk(s); assert.equal(r.ok, false, label); assert.match(r.problems.join('; '), why, label); };
  assert.deepEqual(D.stocking.pays, [0, 0.5, 1.75, 4, 8, 16, 40, 90, 250], 'version 0 = Cody\'s table');
  const r0 = chk(T()); assert.ok(r0.ok); assert.ok(Math.abs(r0.report.stocking.payback - 0.60519171) < 1e-8 && r0.report.stocking.top === 250, 'the preview shows 60.5% and 250×');
  no('payback over 98%', (s) => { s.stocking.pays = [0, 1, 3, 6, 12, 24, 60, 135, 250]; }, /Stocking Stuffer would pay back 10\d\.\d%/);
  no('payback under 50%', (s) => { s.stocking.pays = [0, 0.2, 1, 4, 8, 16, 40, 90, 250]; }, /Stocking Stuffer would pay back 4\d\.\d%/);
  no('more gifts paying less', (s) => { s.stocking.pays = [0, 0.5, 1.75, 4, 3, 16, 40, 90, 250]; }, /never pay less/);
  no('missing a prize', (s) => { s.stocking.pays = [0, 0.5, 1.75, 4, 8, 16, 40, 90]; }, /needs 9 prizes/);
  no('not a number', (s) => { s.stocking.pays = [0, 0.5, '1.75', 4, 8, 16, 40, 90, 250]; }, /needs 9 prizes/);
  no('a top prize the shared pool\'s top-off can\'t cover', (s) => { s.stocking.pays = [0, 0.5, 1.75, 4, 8, 16, 40, 90, 400]; }, /must cover Stocking Stuffer's top prize \(\$400\)/);
  // an allowed change does what it says: a bigger 3-gift prize raises the payback by exactly its extra × its chance
  const s = T(); s.stocking.pays[3] = 5; const r = chk(s); assert.ok(r.ok, r.problems.join('; '));
  assert.ok(Math.abs(r.report.stocking.payback - (pb(DEFAULT_PAYS) + 1 * 2113413120 / 60949324800)) < 1e-12, '3 gifts at 5× adds exactly 1 × P(3 gifts)');
  assert.equal(play({ pool: 1000, prepaid: true }, 1, Math.random, 3, bld(s).stocking.pays).pay, 5, 'a turn on those settings pays 5×');
  // settings published BEFORE Stocking Stuffer (no `stocking` key) build and re-check on Cody's table
  const old = T(); delete old.stocking; assert.deepEqual(bld(old).stocking.pays, [...DEFAULT_PAYS]); assert.deepEqual(stockPays(old), [...DEFAULT_PAYS]); assert.ok(chk(old).ok);
  // the page in server mode swaps the published table in place, then back
  applyToGame(s); assert.equal(PAYS[3], 5, 'applyToGame: the page plays the published table'); applyToGame(T()); assert.deepEqual(PAYS, [...DEFAULT_PAYS]);
  console.log(`OK: Stocking Stuffer pay table: editable, 6 unsafe tables refused (payback outside 50%–98%, decreasing, short, bad number, top prize over the top-off), old settings keep Cody's table`); }
