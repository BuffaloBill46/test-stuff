// Stocking Stuffer (Cody's brief, 2026-10-02): 20 stockings, 8 gifts, 12 coal; open up to 8, the first coal ends the turn.
// Proven here: the exact chances and payback FROM THE MATH (whole numbers, no simulation); a forced loss (coal first) and a
// forced win (all 8 gifts); the shuffle is a real permutation of 20; "Check this result" re-runs the same stockings; a turn
// is decided (and its fingerprint locked) before anything is shown; a few million turns land on the exact chances; and the
// shared Drop pool stays safe with Stocking Stuffer playing from it.
import assert from 'node:assert/strict';
import { STOCKINGS, GIFTS, PAYS, DEFAULT_PAYS, WAYS, TOTAL, NUMS_USED, MAX_MULT, odds, atLeast, payback, realWin, shuffle, outcome, deal, play, canPlay } from '../mockups/stocking.js';
import { rng } from './rng.mjs';

// 1. Cody's pay table, exactly (a stray mid-line comment once silently switched off a money setting: LESSONS).
assert.deepEqual(PAYS, [0, 0.5, 2.5, 6, 10, 20, 40, 90, 250], "Cody's pay table (raised to ~78%), gifts 0 to 8");
assert.deepEqual([...DEFAULT_PAYS], PAYS); assert.equal(MAX_MULT, 250); assert.equal(STOCKINGS, 20); assert.equal(GIFTS, 8);

// 2. Every step's chance, from the brief's own formula, checked EXACTLY in whole numbers (BigInt, no floating point):
//    P(at least k) = 8·7·…·(8−k+1) / 20·19·…·(20−k+1);  P(exactly k) = P(at least k) − P(at least k+1);  k = 8: P(at least 8).
const B = BigInt, fall = (n, k) => { let r = 1n; for (let i = 0; i < k; i++) r *= B(n - i); return r; };
assert.equal(WAYS.reduce((a, b) => a + b, 0), TOTAL, 'the chances add up to exactly 1');
assert.ok(WAYS.every((w) => Number.isSafeInteger(w) && w > 0) && Number.isSafeInteger(TOTAL), 'whole numbers, every step reachable');
for (let k = 0; k <= 8; k++) {
  // WAYS[k] / TOTAL  ==  fall(8,k)/fall(20,k) − fall(8,k+1)/fall(20,k+1)   (cross-multiplied)
  const lhsN = B(WAYS[k]), lhsD = B(TOTAL);
  const rN = k < 8 ? fall(8, k) * fall(20, k + 1) - fall(8, k + 1) * fall(20, k) : fall(8, 8), rD = k < 8 ? fall(20, k) * fall(20, k + 1) : fall(20, 8);
  assert.equal(lhsN * rD, rN * lhsD, `exactly ${k} gifts: the table matches the formula`);
  assert.ok(Math.abs(atLeast(k) - Number(fall(8, k)) / Number(fall(20, k))) < 1e-15);
}
// the "1 in N" figures in Cody's brief (rounded the same way he wrote them)
const oneIn = (k) => 1 / odds(k);
assert.equal(odds(0), 0.6, 'coal first: 60% exactly');
assert.equal(Math.round(oneIn(1)), 4); assert.equal(oneIn(2).toFixed(1), '10.2'); assert.equal(oneIn(3).toFixed(1), '28.8'); assert.equal(oneIn(4).toFixed(1), '92.3');
assert.equal(Math.round(oneIn(5)), 346); assert.equal(Math.round(oneIn(6)), 1615); assert.equal(Math.round(oneIn(7)), 10498); assert.equal(Math.round(oneIn(8)), 125970);

// 3. THE PAYBACK, EXACTLY: sum of prize × chance as one fraction (prizes × 4 are whole numbers: 0.5 → 2, 2.5 → 10).
// Cody raised it to ~78% (2026-10-02, from 60.5%): the window moved with it, just as tight.
const num = PAYS.reduce((a, p, k) => a + B(p * 4) * B(WAYS[k]), 0n), den = 4n * B(TOTAL);
assert.ok(num * 1000n >= 775n * den && num * 1000n <= 785n * den, `exact payback must stay within 77.5%–78.5% (is ${Number(num * 1000000n / den) / 10000}%)`);
assert.ok(Math.abs(payback() - Number(num) / Number(den)) < 1e-15, 'payback() is the exact fraction');
const exactPct = (Number(num * 10n ** 9n / den) / 1e7).toFixed(3);
assert.equal(exactPct, '78.146', 'Cody\'s table pays back 78.146%');
console.log(`exact: pays back ${exactPct}% (${num}/${den}); a real win (2 gifts or more) 1 in ${(1 / realWin()).toFixed(2)}; chances 1 in ${WAYS.map((w) => (TOTAL / w).toFixed(1)).join(' · ')}`);

// 4. The shuffle is a real permutation, and every stocking can hold anything.
let r = rng(11);
for (let t = 0; t < 2000; t++) {
  const nums = Array.from({ length: 19 }, r), p = shuffle(Array.from({ length: 20 }, (_, i) => i), nums);
  assert.deepEqual([...p].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i), 'a permutation of the 20 stockings');
  const o = outcome(Array.from({ length: NUMS_USED }, r));
  assert.equal(o.gifts.filter(Boolean).length, 8, '8 gifts'); assert.equal(o.coal.length, 12, '12 coal');
  assert.deepEqual([...o.order].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i), 'the opening order is a permutation too');
  assert.ok(o.opened.length >= 1 && o.opened.length <= 8, 'opens 1 to 8 stockings');
  assert.equal(o.found, o.opened.filter((s) => o.gifts[s]).length, 'gifts found = gifts among the opened stockings');
  assert.ok(o.found === 8 || !o.gifts[o.opened.at(-1)], 'it stops at the first coal (or after all 8 gifts)');
  assert.ok(o.opened.slice(0, -1).every((s) => o.gifts[s]), 'every stocking before the last one opened held a gift');
}
// Fisher–Yates with all-zero numbers / all-0.999 numbers: still permutations (the edges of floor(u × (i + 1)))
for (const u of [0, 0.999999999]) { const p = shuffle([...Array(20).keys()], Array(19).fill(u)); assert.equal(new Set(p).size, 20); }
// every stocking holds a gift 8 times in 20, and is opened first 1 time in 20 (no favourite spot on the mantel)
{ const g = Array(20).fill(0), first = Array(20).fill(0), N = 200_000; r = rng(5);
  for (let t = 0; t < N; t++) { const o = outcome(Array.from({ length: NUMS_USED }, r)); o.gifts.forEach((x, s) => { if (x) g[s]++; }); first[o.order[0]]++; }
  for (let s = 0; s < 20; s++) { assert.ok(Math.abs(g[s] / N - 0.4) < 0.006, `stocking ${s + 1} holds a gift ${(g[s] / N * 100).toFixed(1)}% (expect 40%)`); assert.ok(Math.abs(first[s] / N - 0.05) < 0.003, `stocking ${s + 1} opened first ${(first[s] / N * 100).toFixed(2)}%`); } }

// 5. Forced loss and forced win (LESSONS: every mode needs a tested way to lose AND a tested way to win).
{ const st = { pool: 1000, prepaid: true };
  const lose = play(st, 1, Math.random, 0); assert.deepEqual([lose.found, lose.mult, lose.pay, lose.ahead, lose.opened.length], [0, 0, 0, false, 1], 'coal first: the turn ends at once, nothing paid');
  assert.equal(st.pool, 1000, 'a loss pays nothing from the pool');
  const win = play(st, 1, Math.random, 8); assert.deepEqual([win.found, win.mult, win.pay, win.ahead, win.opened.length], [8, 250, 250, true, 8], 'all 8 gifts: 250×, after 8 stockings');
  assert.equal(st.pool, 750, 'the pool paid the $250');
  const one = play(st, 0.1, Math.random, 1); assert.ok(!one.ahead && Math.abs(one.pay - 0.05) < 1e-12, 'one gift = 0.5× back: a LOSS, never shown as a win');
  const two = play(st, 0.1, Math.random, 2); assert.ok(two.ahead && Math.abs(two.pay - 0.25) < 1e-12, 'two gifts = 2.5× = 25¢, exact');
  for (let k = 0; k <= 8; k++) { const x = play({ pool: 1000, prepaid: true }, 1, Math.random, k); assert.equal(x.found, k); assert.equal(x.mult, PAYS[k]); assert.equal(x.gifts.filter(Boolean).length, 8); }
  assert.throws(() => play({ pool: 1000, prepaid: true }, 1, Math.random, 9), /0–8/);
  assert.throws(() => deal(0.37), /unknown bet/); }

// 6. The house's order (house.js, the same steps the server runs): paid → secret locked → drawn → revealed; the result is in
//    hand (with its proof) before the page shows anything, and "Check this result" replays the same stockings.
{ const { createHouse, check, NUMS } = await import('../mockups/house.js');
  const { newLedger } = await import('../mockups/credits.js');
  const { numbers } = await import('../mockups/fair.js');
  const { SPIN_RULES } = await import('../mockups/spin.js'), { POOL_RULES } = await import('../mockups/slots.js');
  assert.ok(NUMS >= NUMS_USED, `the house draws ${NUMS} numbers a play; Stocking Stuffer needs ${NUMS_USED}`);
  const ledger = newLedger(), pools = { spin: { pool: SPIN_RULES.start, prepaid: true }, slots: { pool: POOL_RULES.start, prepaid: true } }, house = createHouse(ledger, pools);
  const b = await house.buy('stocking', 0.1, 10, 'pay-stock');
  assert.deepEqual(house.steps, ['paid', 'locked'], 'the payment first, then a secret locked per turn: nothing drawn yet');
  let won = 0, seen = 0;
  for (const [i, p] of b.plays.entries()) {
    const s = await house.settle(p.ticket, 'ab'.repeat(8));
    assert.deepEqual(house.steps.slice(-2), ['drawn', 'revealed']);
    assert.ok(s.r && s.proof, 'the whole result comes back at once, before the page animates anything');
    assert.equal(s.proof.commit, p.commit, 'with the fingerprint locked when it was bought');
    const c = await check(s.proof);
    assert.ok(c.matches, 'the secret matches its fingerprint');
    assert.deepEqual([c.outcome.gifts, c.outcome.order, c.outcome.opened, c.outcome.found, c.outcome.mult], [s.r.gifts, s.r.order, s.r.opened, s.r.found, s.r.mult], 're-check replays the same stockings');
    const nums = await numbers(s.proof.secret, s.proof.playerSeed, s.proof.playNo, NUMS_USED);
    assert.deepEqual(outcome(nums).coal, s.r.coal, 'anyone can rebuild where the coal was from the revealed numbers');
    won += s.r.pay; seen += s.r.opened.length;
    if (i === 9) assert.ok(Math.abs(s.sent - won) < 1e-9, 'the run\'s winnings are sent once, at the end');
  }
  assert.equal(KINDSOK(await import('../mockups/credits.js')), true);
  console.log(`house: a 10-turn run in the fair order; every turn re-checks to the same ${seen} stockings opened`); }
function KINDSOK(m) { return m.KINDS.stocking?.game === 'spin' && m.SIZES.stocking.join() === '0.1,1'; }

// 7. A few million turns with ordinary random numbers land on the exact chances (each step within 4.5 standard errors).
{ const N = 3_000_000, count = Array(9).fill(0); r = rng(20261002); let paid = 0;
  const nums = new Array(NUMS_USED);
  for (let t = 0; t < N; t++) { for (let i = 0; i < NUMS_USED; i++) nums[i] = r(); const o = outcome(nums); count[o.found]++; paid += o.mult; }
  for (let k = 0; k <= 8; k++) { const p = odds(k), e = N * p, sd = Math.sqrt(N * p * (1 - p));
    assert.ok(Math.abs(count[k] - e) < 4.5 * sd + 1, `${k} gifts: ${count[k]} times in ${N.toLocaleString()} (expected ${e.toFixed(1)})`); }
  assert.ok(Math.abs(paid / N - payback()) < 0.01, `simulated payback ${(paid / N * 100).toFixed(2)}%`);
  console.log(`simulated ${N.toLocaleString()} turns: ${count.join(' / ')} (0..8 gifts); paid back ${(paid / N * 100).toFixed(3)}% vs exact ${(payback() * 100).toFixed(3)}%`); }

// 8. The shared Drop pool with Stocking Stuffer playing from it too (Snowball Drop + stockings, 10¢ and $1). Asserted on every
//    play: never negative, never pays past what the pool holds. COUNTED (for Cody, not a pass/fail): how often a $1 turn is
//    refused because the pool can't cover its 250× ($250) top prize.
{ const { play: dropPlay } = await import('../mockups/plinko.js'), { SPIN_RULES } = await import('../mockups/spin.js'), { IN_PER_DOLLAR } = await import('../mockups/slots.js');
  const rand = rng(77); let refused1 = 0, tried1 = 0, refused10 = 0, tops = 0, low = Infinity, stockings = 0;
  for (let run = 0; run < 200; run++) {
    const st = { pool: SPIN_RULES.start, treasury: 0 };
    for (let i = 0; i < 20000; i++) {
      const bet = rand() < 0.4 ? 1 : 0.1, before = st.pool, isStock = rand() < 0.5;
      const x = isStock ? play(st, bet, rand) : dropPlay(st, bet, rand);
      if (isStock && bet === 1) tried1++;
      if (x.paused) { if (isStock && bet === 1) refused1++; else refused10++; continue; }
      if (isStock) stockings++;
      assert.ok(x.pay <= before + bet * IN_PER_DOLLAR + (x.topOff || 0) + 1e-9, 'paid more than the pool held');
      assert.ok(st.pool > -1e-9, 'pool went negative');
      if (x.topOff) tops++; low = Math.min(low, st.pool);
    }
  }
  assert.equal(refused10, 0, 'no 10¢ turn or drop is ever refused');
  console.log(`shared Drop pool, half stockings: ${stockings.toLocaleString()} turns; $1 turns refused ${refused1.toLocaleString()} of ${tried1.toLocaleString()} (${(refused1 / tried1 * 100).toFixed(2)}%: pool between $100 and $250); ${tops} top-offs; lowest $${low.toFixed(2)}`);
  // the rule itself: $1 needs $250 in the pool (after any top-off); 10¢ needs $25
  assert.equal(canPlay({ pool: 249 }, 1).ok, false); assert.equal(canPlay({ pool: 250 }, 1).ok, true); assert.equal(canPlay({ pool: 99 }, 1).ok, true, 'below $100 a top-off to $300 comes first');
  assert.equal(canPlay({ pool: 120 }, 0.1).ok, true); assert.equal(canPlay({ pool: 400, rules: { paused: true } }, 0.1).ok, false, 'the emergency stop stops it too'); }
console.log('OK: Stocking Stuffer: exact chances and payback from the math; forced loss and win; real permutations; re-check replays the same stockings; decided before the reveal; 3 million turns match; shared pool safe');
