// Game settings: version 0 is exactly today's game; the guard rails refuse unsafe changes; a change does what it says.
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, build, check, itemsWith } from '../mockups/settings.js';
import { MACHINES, stats, pull, POOL_RULES } from '../mockups/slots.js';
const SPIN_RULES = POOL_RULES; // the shared Game pool's rules (its key is 'spin'; the Spin wheel itself was removed 2026-10-04)

const S = () => structuredClone(DEFAULT_SETTINGS);
// Version 0 = today's game, exactly (same strips, same payback).
const b0 = build(S());
assert.deepEqual(b0.machine.strips, MACHINES.big.strips, 'identical reel strips');
assert.equal(b0.wheel, undefined, 'no wheel: Santa Hat Spin was removed');
const c0 = check(S()); assert.ok(c0.ok, c0.problems.join('; '));
assert.ok(Math.abs(c0.report.big.fixed - stats(MACHINES.big).payback) < 1e-12 && c0.report.spin === undefined);
// Settings published BEFORE the Spin was removed still carry its prices and wheel (the live database's do): they are accepted
// and those fields ignored, so nothing published has to change.
{ const old = S(); old.prices = { spin10: 0.1, spin100: 1, ...old.prices }; old.spin = { main: { 0: 20, 1: 12, 2: 5, star: 3 }, bonus: { 3: 9, 4: 2, 5: 1 } };
  const r = check(old); assert.ok(r.ok, 'old settings with the Spin fields still pass: ' + r.problems.join('; '));
  assert.equal(r.report.big.payback, c0.report.big.payback, 'and give the same Big Hat'); assert.equal(build(old).wheel, undefined); }
// one Game pool (Cody, 2026-10-02): payback is fixed prizes + the pool jackpot, shown at the start ($125 since Cody 2026-10-05), checked at the top-off line ($30) and $1,025
assert.ok(Math.abs(c0.report.big.payback - (c0.report.big.fixed + 0.25 * 125 / 25000)) < 1e-12 && c0.report.big.at === 125 && c0.report.big.lowPool === 30 && c0.report.big.highPool === 1025, 'Big Hat: fixed + 1/25,000 × 25% × $125');
console.log(`today: Big Hat pays back ${(c0.report.big.payback * 100).toFixed(1)}% (real win ${(c0.report.big.realWin * 100).toFixed(0)}% of pulls)`);

// Refused: anything that drains a pool, locks a game, or is nonsense.
const refused = (label, f) => { const s = S(); f(s); const r = check(s); assert.equal(r.ok, false, label); return r.problems.join('; '); };
assert.match(refused('Big Hat over 98%', (s) => { s.big.hatBonus = 0.2; }), /Big Hat would pay back/);
assert.match(refused('top prize bigger than a top-off can cover', (s) => { s.big.pays.hat[5] = 900; s.big.counts.hat = 1; }), /must cover Big Hat's top prize/);
assert.match(refused('jackpot 90%', (s) => { s.big.jackpotPct = 0.9; }), /1%–50%/);
assert.match((() => { const r = check(S(), { spin: { ...SPIN_RULES, topOffTo: 8 }, slots: POOL_RULES }); assert.equal(r.ok, false); return r.problems.join('; '); })(), /Snowball Drop's top prize/, 'the shared pool must cover a 25× drop');
assert.match(refused('jackpot too easy', (s) => { s.big.jackpotOdds = 50; }), /1 in 1,000/);
assert.match(refused('free plays', (s) => { s.prices.big = 0; }), /\$0\.01–\$100/);
assert.match(refused('prize for coal', (s) => { s.big.pays.coal = { 3: 5 }; }), /no prizes for coal/);
assert.match(refused('negative symbols', (s) => { s.big.counts.hat = -1; }), /whole numbers/);

// Allowed changes do what they say.
let s = S(); s.big.jackpotOdds = 10000; s.big.jackpotPct = 0.14; assert.ok(check(s).ok);
const m = build(s).machine; assert.equal(m.poolJackpotOdds, 1 / 10000);
const st = { pool: 1750, prepaid: true }; assert.ok(Math.abs(pull(st, m, Math.random, 'JACKPOT').pay - 1750 * 0.14) < 1e-9, 'jackpot % from the settings');
s = S(); s.prices = { ...s.prices, big: 2 }; const back200 = { spin: { ...POOL_RULES, topOffTo: 200 }, slots: POOL_RULES };
assert.match(check(s).problems.join(' '), /top-off \(\$125\) must cover Big Hat's top prize \(\$200\)/, "a $2 pull's $200 top prize is more than Cody's $125 backing: refused");
const r2 = check(s, back200); assert.ok(r2.ok && r2.report.big.topPrize === 200, 'a $2 pull doubles the prizes in dollars (with $200 backing)');

// Store items: change a price, add a new colour; new shapes are refused (they need code).
s = S(); s.store.items = [{ id: 'shirt_coal', slot: 'shirt', name: 'Coal', price: 0.5 }, { id: 'shirt_mint', slot: 'shirt', name: 'Mint', color: 0x98e0c0, price: 0.3 }, { id: 'pants_plum', slot: 'pants', name: 'Plum', color: 0x5a2a55, level: 7 }];
assert.ok(check(s).ok, check(s).problems.join('; '));
const items = itemsWith(s); assert.equal(items.find((x) => x.id === 'shirt_coal').price, 0.5); assert.ok(items.find((x) => x.id === 'shirt_mint'));
assert.equal(items.find((x) => x.id === 'shirt_coal').color, 0x2a2a35, 'a price change keeps the look');
for (const bad of [{ id: 'face_alien', slot: 'face', name: 'Alien', face: 'alien', level: 3 }, { id: 'x', slot: 'shirt', name: 'X', color: 1, level: 1 }, { id: 'shirt_both', slot: 'shirt', name: 'B', color: 1, level: 1, price: 1 }, { id: 'hat_top', slot: 'hat', name: 'Top hat', price: 1 }])
  { s = S(); s.store.items = [bad]; assert.equal(check(s).ok, false, 'refuses ' + bad.id); }
// The reels depend only on the numbers, never on the order the settings list them in (the database reorders keys).
{ const a = S(), b = S(); a.big.counts = { ...a.big.counts, hat: 9, coal: 24 };
  b.big.counts = Object.fromEntries(Object.entries(a.big.counts).reverse());
  assert.deepEqual(build(a).machine.strips, build(b).machine.strips, 'same reels whatever the key order'); }
console.log('OK: settings: version 0 = today exactly; old settings with the removed Spin still pass; 9 unsafe changes refused; odds, prices and store changes do what they say');
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
// Stocking Stuffer's pay table, BOARD 2 (Cody, 2026-10-02: 9 gifts, 0–7 gifts fixed prizes, 8 gifts = the pool jackpot):
// editable on the admin screen with guard rails (payback = fixed + jackpot, checked at the $200 top-off point AND the $1,025
// skim point); settings from before keep re-checking old (board 1) turns on their own table.
{ const { DEFAULT_SETTINGS: D, check: chk, build: bld, applyToGame, stockPays, stock2Of } = await import('../mockups/settings.js');
  const { PAYS, DEFAULT_PAYS, BOARD1_PAYS, WAYS, TOTAL, JP, payback: pb, paybackAt, play } = await import('../mockups/stocking.js');
  const T = () => structuredClone(D), no = (label, f, why, rules) => { const s = T(); f(s); const r = chk(s, rules); assert.equal(r.ok, false, label); assert.match(r.problems.join('; '), why, label); };
  assert.deepEqual(D.stocking2.pays, [0, 0.5, 1.5, 3, 7, 15, 25, 50], 'version 0 = Cody\'s board-2 table'); assert.equal(D.stocking2.jackpotPct, 0.25);
  assert.deepEqual(D.stocking.pays, [...BOARD1_PAYS], 'board 1\'s table kept (old turns re-check on it)');
  const r0 = chk(T()); assert.ok(r0.ok, r0.problems.join('; '));
  assert.ok(Math.abs(r0.report.stocking.fixed - 0.72375) < 1e-5 && r0.report.stocking.top === 50, 'the preview: fixed 72.4%, top fixed 50×');
  assert.ok(Math.abs(r0.report.stocking.payback - paybackAt(125)) < 1e-15 && Math.abs(r0.report.stocking.low - paybackAt(30)) < 1e-15 && Math.abs(r0.report.stocking.high - paybackAt(1025)) < 1e-15, 'with the jackpot at $125 / $30 / $1,025 (Cody 2026-10-05), worked out from the table');
  no('payback over 98%', (s) => { s.stocking2.pays = [0, 1, 4, 8, 16, 30, 50, 100]; }, /Stocking Stuffer would pay back 1\d\d\.\d% with the jackpot at a \$\d+ Game pool/);
  no('payback under 50%', (s) => { s.stocking2.pays = [0, 0.3, 1, 2, 5, 10, 20, 40]; }, /Stocking Stuffer would pay back 4\d\.\d% with the jackpot at a \$30 Game pool/); // the lowest pool it plays at: the $30 top-off line (Cody 2026-10-05)
  no('more gifts paying less', (s) => { s.stocking2.pays = [0, 0.5, 1.5, 3, 2, 15, 25, 50]; }, /never pay less/);
  no('missing a prize', (s) => { s.stocking2.pays = [0, 0.5, 1.5, 3, 7, 15, 25]; }, /needs 8 prizes/);
  no('the old 9-prize shape', (s) => { s.stocking2.pays = [...BOARD1_PAYS]; }, /needs 8 prizes/);
  no('not a number', (s) => { s.stocking2.pays = [0, 0.5, '1.5', 3, 7, 15, 25, 50]; }, /needs 8 prizes/);
  no('a top fixed prize the shared pool\'s top-off can\'t cover', (s) => { s.stocking2.pays = [0, 0.5, 1.5, 3, 7, 15, 25, 600]; }, /must cover Stocking Stuffer's top fixed prize \(\$600\)/);
  no('stocking jackpot 90%', (s) => { s.stocking2.jackpotPct = 0.9; }, /Stocking Stuffer's pool jackpot must be 1%–50%/);
  no('drop jackpot 0%', (s) => { s.drop = { jackpotPct: 0 }; }, /Snowball Drop's pool jackpot must be 1%–50%/);
  // the reference pools: a skim point so high that the Drop's jackpot would push it over 98% is refused (the jackpot grows with the pool)
  no('a $5,000 skim point', () => {}, /Snowball Drop would pay back 10\d\.\d% with the jackpot at a \$5000 Game pool/, { spin: { ...SPIN_RULES, skimAt: 5000 }, slots: POOL_RULES });
  // Cody's pool-rule jackpot override on the Game pool is what every game plays with, so the guard rails and preview use it too
  { const ov = chk(T(), { spin: { ...SPIN_RULES, jackpotPct: 0.1 }, slots: POOL_RULES }); assert.ok(ov.ok);
    assert.ok(Math.abs(ov.report.drop.payback - (0.76 + 0.1 * 125 / 5000)) < 1e-12 && Math.abs(ov.report.stocking.payback - paybackAt(125, 0.1)) < 1e-15, 'the override % is what the payback uses');
    assert.match(ov.report.drop.jackpot, /^10% of the pool/); }
  // an allowed change does what it says: a bigger 3-gift prize raises the payback by exactly its extra × its chance
  const s = T(); s.stocking2.pays[3] = DEFAULT_PAYS[3] + 1; const r = chk(s); assert.ok(r.ok, r.problems.join('; '));
  assert.ok(Math.abs(r.report.stocking.fixed - (pb(DEFAULT_PAYS) + WAYS[3] / TOTAL)) < 1e-12, '3 gifts at one more × adds exactly 1 × P(3 gifts)');
  assert.equal(play({ pool: 1000, prepaid: true }, 1, Math.random, 3, bld(s).stocking2.pays).pay, DEFAULT_PAYS[3] + 1, 'a turn on those settings pays the new 3-gift prize');
  // a different jackpot % does what it says too
  const j = T(); j.stocking2.jackpotPct = 0.1; assert.ok(chk(j).ok); assert.equal(play({ pool: 1000, prepaid: true }, 1, Math.random, 8, bld(j).stocking2.pays, bld(j).stocking2.jackpotPct).pay, 100, '10% of a $1,000 pool');
  // settings published BEFORE this change (no `stocking2` / `drop`): new turns use Cody's board-2 table and 25%; old (no `stocking`) re-check on board 1's
  const old = T(); delete old.stocking2; delete old.drop; delete old.stocking;
  assert.deepEqual(bld(old).stocking2, { pays: [...DEFAULT_PAYS], jackpotPct: 0.25 }); assert.deepEqual(bld(old).drop, { jackpotPct: 0.25 });
  assert.deepEqual(stockPays(old), [...BOARD1_PAYS]); assert.deepEqual(stock2Of(old).pays, [...DEFAULT_PAYS]); assert.ok(chk(old).ok);
  // the page in server mode swaps the published table and jackpot %s in place, then back
  const { JP: DJP } = await import('../mockups/plinko.js'); const pj = T(); pj.drop = { jackpotPct: 0.2 }; pj.stocking2.jackpotPct = 0.3; pj.stocking2.pays[3] = 4;
  applyToGame(pj); assert.equal(PAYS[3], 4, 'applyToGame: the page plays the published table'); assert.deepEqual([DJP.pct, JP.pct], [0.2, 0.3], 'and the published jackpot %s');
  applyToGame(T()); assert.deepEqual(PAYS, [...DEFAULT_PAYS]); assert.deepEqual([DJP.pct, JP.pct], [0.25, 0.25]);
  console.log(`OK: Stocking Stuffer pay table (board 2): editable, 10 unsafe settings refused (payback outside 50%–98% at $200 or $1,025, decreasing, short, old shape, bad number, top fixed prize over the top-off, jackpot % out of range, a skim point that would push the Drop over 98%), old settings keep their tables`); }
