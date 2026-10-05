// Stocking Stuffer, BOARD 2 (Cody, 2026-10-02): 20 stockings, 9 gifts, 11 coal; open up to 8, the first coal ends the turn;
// 1 → 0.5× · 2 → 1.5× · 3 → 3× · 4 → 7× · 5 → 15× · 6 → 25× · 7 → 50× · 8 gifts → THE POOL JACKPOT (25% of the shared Game pool
// at that moment × the turn's size). Proven here: the exact chances FROM THE MATH (BigInt, no floating point); the fixed payback
// exactly 72.375%; the jackpot's payback at several pool sizes; a forced loss (coal first) and a forced jackpot win; the shuffle
// is a real permutation of 20; "Check this result" re-runs the same stockings and re-works the jackpot amount; turns played on
// board 1 (8 gifts, 250×) still re-check as played; a turn is decided before anything is shown; 3 million turns land on the
// exact chances; the shared pool stays safe and never refuses a turn; tap to open can never change a turn.
import assert from 'node:assert/strict';
import { STOCKINGS, GIFTS, COAL, MAX_OPEN, BOARD, PAYS, DEFAULT_PAYS, BOARD1_PAYS, WAYS, WAYS_ON, TOTAL, NUMS_USED, MAX_MULT, odds, atLeast, payback, paybackAt, jackpotOdds, realWin, shuffle, outcome, deal, play, canPlay, asTapped } from '../mockups/stocking.js';
import { rng } from './rng.mjs';

// 1. Cody's new layout and pay table, exactly (a stray mid-line comment once silently switched off a money setting: LESSONS).
assert.deepEqual(PAYS, [0, 0.5, 1.5, 3, 7, 15, 25, 50], "Cody's fixed prizes, gifts 0 to 7 (8 gifts = the pool jackpot)");
assert.deepEqual([...DEFAULT_PAYS], PAYS); assert.equal(MAX_MULT, 50, 'biggest FIXED prize 50×');
assert.deepEqual([STOCKINGS, GIFTS, COAL, MAX_OPEN, BOARD], [20, 9, 11, 8, 2]);
assert.deepEqual([...BOARD1_PAYS], [0, 0.5, 2.5, 6, 10, 20, 40, 90, 250], 'board 1 table kept for re-checks');

// 2. Every step's chance, from the brief's own formula, checked EXACTLY in whole numbers (BigInt):
//    P(exactly k, k < 8) = fall(9,k)·11 / fall(20,k+1);   P(8 gifts) = fall(9,8) / fall(20,8)   (= 1 in 13,997)
const B = BigInt, fall = (n, k) => { let r = 1n; for (let i = 0; i < k; i++) r *= B(n - i); return r; };
assert.equal(WAYS.reduce((a, b) => a + b, 0), TOTAL, 'the chances add up to exactly 1');
assert.ok(WAYS.every((w) => Number.isSafeInteger(w) && w > 0) && Number.isSafeInteger(TOTAL), 'whole numbers, every step reachable');
for (let k = 0; k <= 8; k++) {
  const rN = k < 8 ? fall(9, k) * 11n : fall(9, 8), rD = k < 8 ? fall(20, k + 1) : fall(20, 8);
  assert.equal(B(WAYS[k]) * rD, rN * B(TOTAL), `exactly ${k} gifts: the table matches the formula`);
  assert.ok(Math.abs(atLeast(k) - Number(fall(9, k)) / Number(fall(20, k))) < 1e-15);
}
assert.equal(Math.round(1 / jackpotOdds()), 13997, 'the pool jackpot: 1 in 13,997');
assert.equal(B(WAYS[8]) * fall(20, 8), fall(9, 8) * B(TOTAL), 'P(8 gifts) = fall(9,8)/fall(20,8) exactly');
// board 1's chances are unchanged (old turns re-check on them): P(at least k) = fall(8,k)/fall(20,k)
for (let k = 0; k <= 8; k++) { const rN = k < 8 ? fall(8, k) * fall(20, k + 1) - fall(8, k + 1) * fall(20, k) : fall(8, 8), rD = k < 8 ? fall(20, k) * fall(20, k + 1) : fall(20, 8);
  assert.equal(B(WAYS_ON[1][k]) * rD, rN * B(TOTAL), `board 1, exactly ${k} gifts`); }
assert.equal(odds(0), 0.55, 'coal first: 55% exactly (11 coal in 20)');

// 3. THE FIXED PAYBACK, EXACTLY: sum of prize × chance as one fraction (prizes × 2 are whole numbers: 0.5 → 1, 1.5 → 3).
const num = PAYS.reduce((a, p, k) => a + B(p * 2) * B(WAYS[k]), 0n), den = 2n * B(TOTAL);
assert.ok(Math.abs(payback() - Number(num) / Number(den)) < 1e-15, 'payback() is the exact fraction');
const exactPct = (Number(num * 10n ** 9n / den) / 1e7).toFixed(3);
assert.equal(exactPct, '72.375', 'fixed prizes pay back 72.375% (Cody: ~72.4%)');
assert.equal(((Number(fall(9, 1) * 11n) * 0.5) / Number(fall(20, 2))).toFixed(6), (WAYS[1] * 0.5 / TOTAL).toFixed(6), 'the 1-gift step');
// board 1's table still pays back 78.146% on board 1 (old turns)
assert.equal((payback(BOARD1_PAYS, 1) * 100).toFixed(3), '78.146', 'board 1 unchanged');
// the jackpot's part at several pool sizes: P(8) × 25% × pool (a share of the pool × the turn's size, so the same at 10¢ or $1)
for (const pool of [200, 300, 500, 777, 1025]) {
  const want = Number(num) / Number(den) + (Number(fall(9, 8)) / Number(fall(20, 8))) * 0.25 * pool;
  assert.ok(Math.abs(paybackAt(pool) - want) < 1e-12, `payback at a $${pool} pool`);
}
console.log(`exact: fixed prizes ${exactPct}% (${num}/${den}); with the jackpot ${[200, 500, 1025].map((p) => `${(paybackAt(p) * 100).toFixed(3)}% at $${p}`).join(', ')}; a real win (2 gifts or more) 1 in ${(1 / realWin()).toFixed(2)}; chances 1 in ${WAYS.map((w) => (TOTAL / w).toFixed(1)).join(' · ')}`);

// 4. The shuffle is a real permutation, and every stocking can hold anything.
let r = rng(11);
for (let t = 0; t < 2000; t++) {
  const nums = Array.from({ length: 19 }, r), p = shuffle(Array.from({ length: 20 }, (_, i) => i), nums);
  assert.deepEqual([...p].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i), 'a permutation of the 20 stockings');
  const o = outcome(Array.from({ length: NUMS_USED }, r));
  assert.equal(o.gifts.filter(Boolean).length, 9, '9 gifts'); assert.equal(o.coal.length, 11, '11 coal'); assert.equal(o.board, 2);
  assert.deepEqual([...o.order].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i), 'the opening order is a permutation too');
  assert.ok(o.opened.length >= 1 && o.opened.length <= 8, 'opens 1 to 8 stockings');
  assert.equal(o.found, o.opened.filter((s) => o.gifts[s]).length, 'gifts found = gifts among the opened stockings');
  assert.ok(o.found === 8 || !o.gifts[o.opened.at(-1)], 'it stops at the first coal (or after 8 gifts)');
  assert.ok(o.opened.slice(0, -1).every((s) => o.gifts[s]), 'every stocking before the last one opened held a gift');
  assert.equal(!!o.jackpot, o.found === 8, '8 gifts is the jackpot, nothing else is'); if (!o.jackpot) assert.equal(o.mult, PAYS[o.found]);
}
for (const u of [0, 0.999999999]) { const p = shuffle([...Array(20).keys()], Array(19).fill(u)); assert.equal(new Set(p).size, 20); }
// every stocking holds a gift 9 times in 20, and is opened first 1 time in 20 (no favourite spot on the mantel)
{ const g = Array(20).fill(0), first = Array(20).fill(0), N = 200_000; r = rng(5);
  for (let t = 0; t < N; t++) { const o = outcome(Array.from({ length: NUMS_USED }, r)); o.gifts.forEach((x, s) => { if (x) g[s]++; }); first[o.order[0]]++; }
  for (let s = 0; s < 20; s++) { assert.ok(Math.abs(g[s] / N - 0.45) < 0.006, `stocking ${s + 1} holds a gift ${(g[s] / N * 100).toFixed(1)}% (expect 45%)`); assert.ok(Math.abs(first[s] / N - 0.05) < 0.003, `stocking ${s + 1} opened first ${(first[s] / N * 100).toFixed(2)}%`); } }

// 5. Forced loss and forced JACKPOT (LESSONS: every mode needs a tested way to lose AND a tested way to win).
{ const st = { pool: 1000, prepaid: true };
  const lose = play(st, 1, Math.random, 0); assert.deepEqual([lose.found, lose.mult, lose.pay, lose.ahead, lose.opened.length, !!lose.jackpot], [0, 0, 0, false, 1, false], 'coal first: the turn ends at once, nothing paid');
  assert.equal(st.pool, 1000, 'a loss pays nothing from the pool');
  const jp = play(st, 1, Math.random, 8); assert.deepEqual([jp.found, jp.jackpot, jp.pay, jp.ahead, jp.opened.length, jp.jackpotPool, jp.pct], [8, true, 250, true, 8, 1000, 0.25], '8 gifts: the pool jackpot, 25% of the $1,000 pool on a $1 turn');
  assert.equal(st.pool, 750, 'the pool paid exactly the jackpot');
  const jp10 = play(st, 0.1, Math.random, 8); assert.equal(jp10.pay, 750 * 0.25 * 0.1, 'a 10¢ turn wins 2.5% of the pool at that moment (18.75)');
  assert.equal(st.pool, 750 - 18.75);
  const one = play(st, 0.1, Math.random, 1); assert.ok(!one.ahead && Math.abs(one.pay - 0.05) < 1e-12, 'one gift = 0.5× back: a LOSS, never shown as a win');
  const two = play(st, 0.1, Math.random, 2); assert.ok(two.ahead && Math.abs(two.pay - 0.15) < 1e-12, 'two gifts = 1.5× = 15¢, exact');
  for (let k = 0; k <= 8; k++) { const x = play({ pool: 1000, prepaid: true }, 1, Math.random, k); assert.equal(x.found, k); if (k < 8) assert.equal(x.mult, PAYS[k]); else assert.ok(x.jackpot); assert.equal(x.gifts.filter(Boolean).length, 9); }
  assert.equal(play({ pool: 500, prepaid: true, rules: { jackpotPct: 0.1 } }, 1, Math.random, 8).pay, 50, "Cody's pool rule jackpotPct overrides the settings' %, like Big Hat's");
  assert.equal(play({ pool: 500, prepaid: true }, 1, Math.random, 8, PAYS, 0.2).pay, 100, 'the settings\' % is used');
  assert.throws(() => play({ pool: 1000, prepaid: true }, 1, Math.random, 9), /0–8/);
  assert.throws(() => deal(0.37), /unknown bet/); }

// 6. The house's order (house.js, the same steps the server runs): paid → secret locked → drawn → revealed; the result is in
//    hand (with its proof) before the page shows anything, and "Check this result" replays the same stockings; a jackpot
//    re-checks to the same amount from the pool it recorded.
{ const { createHouse, check, NUMS, outcomeFrom } = await import('../mockups/house.js');
  const { newLedger } = await import('../mockups/credits.js');
  const { numbers } = await import('../mockups/fair.js');
  const { POOL_RULES } = await import('../mockups/slots.js');
  assert.ok(NUMS >= NUMS_USED, `the house draws ${NUMS} numbers a play; Stocking Stuffer needs ${NUMS_USED}`);
  const ledger = newLedger(), pools = { spin: { pool: POOL_RULES.start, prepaid: true }, slots: { pool: 0, prepaid: true } }, house = createHouse(ledger, pools);
  const b = await house.buy('stocking', 0.1, 10, 'pay-stock');
  assert.deepEqual(house.steps, ['paid', 'locked'], 'the payment first, then a secret locked per turn: nothing drawn yet');
  let won = 0, seen = 0;
  for (const [i, p] of b.plays.entries()) {
    const s = await house.settle(p.ticket, 'ab'.repeat(8));
    assert.deepEqual(house.steps.slice(-2), ['drawn', 'revealed']);
    assert.ok(s.r && s.proof, 'the whole result comes back at once, before the page animates anything');
    assert.equal(s.proof.commit, p.commit, 'with the fingerprint locked when it was bought'); assert.equal(s.proof.board, 2, 'the proof says which layout');
    const c = await check(s.proof);
    assert.ok(c.matches, 'the secret matches its fingerprint');
    assert.deepEqual([c.outcome.gifts, c.outcome.order, c.outcome.opened, c.outcome.found, c.outcome.mult], [s.r.gifts, s.r.order, s.r.opened, s.r.found, s.r.jackpot ? undefined : s.r.mult], 're-check replays the same stockings');
    const nums = await numbers(s.proof.secret, s.proof.playerSeed, s.proof.playNo, NUMS_USED);
    assert.deepEqual(outcome(nums).coal, s.r.coal, 'anyone can rebuild where the coal was from the revealed numbers');
    won += s.r.pay; seen += s.r.opened.length;
    if (i === 9) assert.ok(Math.abs(s.sent - won) < 1e-9, 'the run\'s winnings are sent once, at the end');
  }
  assert.equal(pools.slots.pool, 0, 'nothing touches the old Slots pool');
  // a forced jackpot through the house: the proof carries the pool and %, and the check re-works the same amount
  const jb = await house.buy('stocking', 1, 1, 'pay-stock-jp'), before = pools.spin.pool, js = await house.settle(jb.plays[0].ticket, 'cd'.repeat(8), 8);
  assert.ok(js.r.jackpot && js.proof.jackpot, 'a jackpot proof carries its pool');
  assert.deepEqual([js.proof.jackpot.pool, js.proof.jackpot.pct, js.proof.jackpot.pay], [before, 0.25, before * 0.25]);
  const jc = await check(js.proof);
  assert.ok(jc.jackpot === undefined || jc.jackpot.ok, 'forced plays may not re-check (their numbers were not used)');
  const { jackpotCheck } = await import('../mockups/house.js');
  const k = jackpotCheck(js.proof); assert.ok(k.known && k.ok && k.pctFromSettings && Math.abs(k.expected - before * 0.25) < 1e-9, 'the jackpot amount re-works exactly from the recorded pool and the settings\' 25%');
  const bad = jackpotCheck({ ...js.proof, jackpot: { ...js.proof.jackpot, pay: js.proof.jackpot.pay + 1 } }); assert.equal(bad.ok, false, 'a jackpot paid more than its share does NOT check out');
  // BOARD 1 turns (no `board` in their proof) still re-check on 8 gifts and Cody's 250× table
  const nums = Array.from({ length: NUMS }, rng(99)), o1 = outcomeFrom('stocking', nums, { board: 1 }), o2 = outcomeFrom('stocking', nums, { board: 2 });
  assert.equal(o1.gifts.filter(Boolean).length, 8, 'board 1: 8 gifts'); assert.equal(o2.gifts.filter(Boolean).length, 9, 'board 2: 9 gifts');
  assert.equal(o1.mult, BOARD1_PAYS[o1.found], 'board 1 pays its own table'); assert.equal(outcomeFrom('stocking', nums).board, 1, 'no board = board 1 (turns from before)');
  assert.equal(KINDSOK(await import('../mockups/credits.js')), true);
  console.log(`house: a 10-turn run in the fair order; every turn re-checks to the same ${seen} stockings opened; a jackpot re-works to its exact amount; board 1 turns re-check on 8 gifts`); }
function KINDSOK(m) { return m.KINDS.stocking?.game === 'spin' && m.KINDS.big?.game === 'spin' && m.KINDS.drop?.game === 'spin' && m.SIZES.stocking.join() === '0.1,1'; }

// 7. A few million turns with ordinary random numbers land on the exact chances (each step within 4.5 standard errors), and pay
//    back the exact fixed payback + the jackpot at the pool they were played on (kept at $500 for the test).
{ const N = 3_000_000, count = Array(9).fill(0); r = rng(20261002); let paid = 0;
  const nums = new Array(NUMS_USED);
  for (let t = 0; t < N; t++) { for (let i = 0; i < NUMS_USED; i++) nums[i] = r(); const o = outcome(nums); count[o.found]++; paid += o.jackpot ? 0.25 * 500 : o.mult; }
  for (let k = 0; k <= 8; k++) { const p = odds(k), e = N * p, sd = Math.sqrt(N * p * (1 - p));
    assert.ok(Math.abs(count[k] - e) < 4.5 * sd + 1, `${k} gifts: ${count[k]} times in ${N.toLocaleString()} (expected ${e.toFixed(1)})`); }
  assert.ok(count[8] > 0, 'the jackpot was hit in the simulation (a check over nothing proves nothing)');
  assert.ok(Math.abs(paid / N - paybackAt(500)) < 0.015, `simulated payback ${(paid / N * 100).toFixed(2)}%`);
  console.log(`simulated ${N.toLocaleString()} turns: ${count.join(' / ')} (0..8 gifts); paid back ${(paid / N * 100).toFixed(3)}% vs exact ${(paybackAt(500) * 100).toFixed(3)}% at a $500 pool`); }

// 8. The shared Game pool with Stocking Stuffer and Snowball Drop playing from it (10¢ and $1). Asserted on every play: never
//    negative, never pays past what the pool holds, never refused (the top-off point covers the 50× top fixed prize).
{ const { play: dropPlay } = await import('../mockups/plinko.js'), { POOL_RULES: SPIN_RULES, IN_PER_DOLLAR } = await import('../mockups/slots.js'); // the shared pool's rules
  const rand = rng(77); let refused = 0, tops = 0, low = Infinity, stockings = 0, jackpots = 0;
  for (let run = 0; run < 200; run++) {
    const st = { pool: SPIN_RULES.start, treasury: 0 };
    for (let i = 0; i < 20000; i++) {
      const bet = rand() < 0.4 ? 1 : 0.1, before = st.pool, isStock = rand() < 0.5;
      const x = isStock ? play(st, bet, rand) : dropPlay(st, bet, rand);
      if (x.paused) { refused++; continue; }
      if (isStock) stockings++; if (x.jackpot) jackpots++;
      assert.ok(x.pay <= before + bet * IN_PER_DOLLAR + (x.topOff || 0) + 1e-9, 'paid more than the pool held');
      assert.ok(st.pool > -1e-9, 'pool went negative');
      if (x.topOff) tops++; low = Math.min(low, st.pool);
    }
  }
  assert.equal(refused, 0, 'no turn or drop is ever refused');
  assert.ok(jackpots > 0, 'jackpots were hit');
  console.log(`shared Game pool, half stockings: ${stockings.toLocaleString()} turns; 0 refused; ${jackpots} pool jackpots; ${tops} top-offs; lowest $${low.toFixed(2)}`);
  // the rule itself: $1 needs $50 (50×) covered (the pool, counting Cody's backing up to topOffTo: slots.js covers); 10¢ needs $5
  assert.equal(canPlay({ pool: 49, rules: { topOffBelow: 0, topOffTo: 0 } }, 1).ok, false); assert.equal(canPlay({ pool: 50, rules: { topOffBelow: 0, topOffTo: 0 } }, 1).ok, true);
  assert.equal(canPlay({ pool: 49 }, 1).ok, true, "Cody's rules: his $125 backing covers it (Cody 2026-10-05: let the games play)");
  assert.equal(canPlay({ pool: 400, rules: { paused: true } }, 0.1).ok, false, 'the emergency stop stops it too'); }

// 9. TAP TO OPEN (Cody, 2026-10-02), with 9 gifts: wherever the player taps, the turn is the same. For thousands of turns and
// several random tap orders each: the k-th stocking tapped shows the k-th item of the fair sequence, so the gifts found (and the
// prize, or the jackpot) can't change; the layout is still exactly 9 gifts and 11 coals; a bad tap list is refused.
{ const R = rng(1225); let jackpotsTapped = 0;
  for (let t = 0; t < 3000; t++) {
    const o = t % 50 === 0 ? play({ pool: 500, prepaid: true }, 1, Math.random, 8) : outcome(Array.from({ length: NUMS_USED }, () => R()));
    const seq = o.opened.map((s) => o.gifts[s]);
    for (let v = 0; v < 4; v++) {
      const taps = shuffle(Array.from({ length: STOCKINGS }, (_, i) => i), Array.from({ length: STOCKINGS - 1 }, () => R())).slice(0, o.opened.length);
      const shown = asTapped(o, taps);
      assert.deepEqual(taps.map((d) => shown[d]), seq, 'the k-th tap shows the k-th item of the fair sequence');
      assert.equal(shown.filter(Boolean).length, GIFTS, 'still exactly 9 gifts (and 11 coals)');
      const found = seq.findIndex((g) => !g); assert.equal(found === -1 ? MAX_OPEN : found, o.found, 'so the gifts found, and the prize, are the fair ones');
      if (o.jackpot) jackpotsTapped++;
    }
  }
  assert.ok(jackpotsTapped >= 240, 'jackpot turns were tapped too (8 gifts, one gift left unopened)');
  const o = outcome(Array.from({ length: NUMS_USED }, () => R())), ok = o.opened.map((_, i) => i);
  assert.throws(() => asTapped(o, [...ok.slice(0, -1), ok[0]]), /one different stocking/, 'a repeated tap is refused');
  if (ok.length > 1) assert.throws(() => asTapped(o, ok.slice(1)), /one different stocking/, 'too few taps are refused');
  assert.throws(() => asTapped(o, [...ok.slice(0, -1), 20]), /one different stocking/, 'a tap off the mantel is refused');
}
console.log('OK: Stocking Stuffer board 2: tap to open can never change a turn (3,000 turns × 4 tap orders, jackpots included); exact chances (BigInt) and fixed payback 72.375%; jackpot payback at 5 pool sizes; forced loss and forced jackpot; real permutations; re-check replays the same stockings and re-works the jackpot; board 1 re-checks; decided before the reveal; 3 million turns match; shared pool safe, never refused');
