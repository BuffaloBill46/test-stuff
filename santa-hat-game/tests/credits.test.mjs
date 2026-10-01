// Play credits + fair results: every rule as an assertion (TODO → "Play credits", DESIGN_NOTES → "Fair results: the order").
import assert from 'node:assert/strict';
import { KINDS, MAX_BUY, newLedger, buy, spend, audit, costOf } from '../mockups/credits.js';
import { createHouse, check, outcomeFrom, NUMS } from '../mockups/house.js';
import { numbers, newSeed } from '../mockups/fair.js';
import { IN_PER_DOLLAR, POOL_RULES, canPull, pull } from '../mockups/slots.js';
import { SPIN_RULES, canSpin, spin, payback } from '../mockups/spin.js';

const fresh = () => ({ ledger: newLedger(), pools: { spin: { pool: SPIN_RULES.start, prepaid: true }, slots: { pool: POOL_RULES.start, prepaid: true } } });
const close = (a, b) => Math.abs(a - b) < 1e-6;

// 1. Buying: 1–10 only, each payment once, the money lands in that game's pool and nowhere else.
{
  const { ledger, pools } = fresh();
  for (const n of [0, 11, 2.5, -1, NaN]) assert.equal(buy(ledger, pools, 'spin10', n, 'p' + n).ok, false, `bought ${n}`);
  assert.equal(buy(ledger, pools, 'nope', 1, 'px').ok, false);
  const s0 = pools.spin.pool, l0 = pools.slots.pool;
  assert.ok(buy(ledger, pools, 'spin10', 3, 'pay1').ok);
  assert.ok(close(pools.spin.pool - s0, 0.30 * IN_PER_DOLLAR) && pools.slots.pool === l0, 'Spin credits pay only the Spin pool');
  assert.equal(buy(ledger, pools, 'big', 2, 'pay1').ok, false, 'a payment can buy credits only once');
  assert.ok(buy(ledger, pools, 'big', MAX_BUY, 'pay2').ok);
  assert.ok(close(pools.slots.pool - l0, 10 * IN_PER_DOLLAR) && close(pools.spin.pool - s0, 0.30 * IN_PER_DOLLAR), 'Slots credits pay only the Slots pool');
  assert.equal(costOf('spin10', 3), 0.3); assert.equal(costOf('spin100', 10), 10);
  assert.deepEqual(audit(ledger), []);
}

// 2. Spending: never below zero, never twice.
{
  const { ledger, pools } = fresh();
  assert.equal(spend(ledger, 'big'), false);
  buy(ledger, pools, 'big', 1, 'a');
  assert.equal(spend(ledger, 'big'), true); assert.equal(spend(ledger, 'big'), false, 'one credit, one play');
  assert.deepEqual(audit(ledger), []);
}

// 3. Two taps at once: two plays opened together with one credit. Exactly one gets through.
{
  const { ledger, pools } = fresh(); const house = createHouse(ledger, pools);
  buy(ledger, pools, 'spin100', 1, 'a');
  const [a, b] = await Promise.all([house.open('spin100'), house.open('spin100')]);
  assert.equal([a, b].filter((x) => x.ticket).length, 1); assert.equal([a, b].filter((x) => x.noCredit).length, 1);
  assert.deepEqual(audit(ledger), []);
}

// 4. A refused play keeps its credit, and no secret is ever made for it.
{
  const { ledger, pools } = fresh(); const house = createHouse(ledger, pools);
  buy(ledger, pools, 'big', 2, 'a'); buy(ledger, pools, 'spin10', 2, 'b');
  pools.slots.rules = { paused: true }; pools.spin.rules = { paused: true };
  assert.deepEqual(await house.open('big'), { refused: true, stopped: true });
  assert.deepEqual(await house.open('spin10'), { refused: true, stopped: true });
  assert.equal(ledger.credits.big, 2); assert.equal(ledger.credits.spin10, 2); assert.deepEqual(house.steps, [], 'nothing spent, no secret made');
}

// 5. canSpin / canPull say exactly what spin / pull would do (so the check before spending a credit can't disagree).
{
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 20000; i++) {
    const paused = r() < 0.05;
    const sp = { pool: r() * 60, rules: { paused } }, sl = { pool: r() * 400, rules: { paused } };
    const bet = r() < 0.5 ? 0.1 : 1;
    assert.equal(canSpin(sp, bet).ok, !spin(structuredClone(sp), bet, r).paused, `canSpin at pool ${sp.pool}`);
    assert.equal(canPull(sl, 'big').ok, !pull(structuredClone(sl), 'big', r).paused, `canPull at pool ${sl.pool}`);
  }
}

// 6. Many random sessions: the ORDER holds on every play, the books balance after every step, every result checks out.
let plays = 0, checked = 0, prepaidOk = 0;
for (let run = 0; run < 60; run++) {
  const { ledger, pools } = fresh(); const house = createHouse(ledger, pools);
  for (let step = 0; step < 60; step++) {
    const kind = Object.keys(KINDS)[Math.floor(Math.random() * 3)];
    if (ledger.credits[kind] === 0 || Math.random() < 0.15) { buy(ledger, pools, kind, 1 + Math.floor(Math.random() * MAX_BUY), newSeed(8)); assert.deepEqual(audit(ledger), []); continue; }
    const before = house.steps.length, poolKey = KINDS[kind].game, poolBefore = pools[poolKey].pool;
    const o = await house.open(kind);
    assert.ok(o.ticket, 'open'); assert.match(o.commit, /^[0-9a-f]{64}$/);
    const s = await house.settle(o.ticket, newSeed(16));
    assert.deepEqual(house.steps.slice(before), ['spent', 'locked', 'drawn', 'revealed'], 'Cody\'s order: credit spent, secret locked, numbers drawn, secret revealed');
    assert.deepEqual(audit(ledger), []);
    // prepaid: the play itself adds nothing; the pool only pays out (plus any skim / top-off)
    const expect = poolBefore - s.r.pay - (s.r.skim || 0) + (s.r.topOff || 0);
    assert.ok(close(pools[poolKey].pool, expect), `prepaid play moved the pool by the entry: ${pools[poolKey].pool} vs ${expect}`); prepaidOk++;
    const c = await check(s.proof);
    assert.ok(c.matches, 'secret matches the fingerprint shown before the play');
    if (KINDS[kind].game === 'spin') assert.deepEqual([c.outcome.slice, c.outcome.bonusSlice, c.outcome.mult], [s.r.slice, s.r.bonusSlice, s.r.mult], 'the re-check gives the same segment(s) and result, bonus wheel included');
    else if (s.r.jackpot) assert.ok(c.outcome.jackpot); else assert.deepEqual(c.outcome.stops, s.r.stops);
    checked++; plays++;
  }
  assert.equal(house.pending(), 0);
}

// 7. Tampering is caught; the player's number changes the result.
{
  const { ledger, pools } = fresh(); const house = createHouse(ledger, pools);
  buy(ledger, pools, 'spin100', 1, 'a');
  const o = await house.open('spin100'); const { proof } = await house.settle(o.ticket, 'abcd');
  assert.equal((await check({ ...proof, secret: newSeed() })).matches, false, 'a swapped secret fails the check');
  const a = await numbers(proof.secret, 'abcd', 1, NUMS), b = await numbers(proof.secret, 'abce', 1, NUMS);
  assert.notDeepEqual(a, b);
  await assert.rejects(() => house.settle(o.ticket, 'abcd'), /already settled/, 'a play settles once');
}

// 8. The fair numbers are really uniform: the wheels pay back their exact 75% when driven by them.
{
  const secret = newSeed(); let paid = 0, N = 40000; const hits = new Array(40).fill(0), bonusHits = new Array(12).fill(0);
  for (let i = 0; i < N; i++) { const xs = await numbers(secret, 'seed', i, 2); const o = outcomeFrom('spin100', xs); paid += o.mult; hits[o.slice]++; if (o.bonusSlice !== undefined) bonusHits[o.bonusSlice]++; }
  const pb = paid / N; assert.ok(Math.abs(pb - payback()) < 0.02, `payback from fair numbers ${pb}`);
  assert.ok(Math.min(...hits) > 800 && Math.max(...hits) < 1200, 'every main segment turns up about equally');
  assert.ok(Math.min(...bonusHits) > 150 && Math.max(...bonusHits) < 350, 'every bonus segment turns up about equally: ' + bonusHits);
  console.log(`fair numbers: ${N.toLocaleString()} spins pay back ${(pb * 100).toFixed(2)}% (exact ${(payback() * 100).toFixed(2)}%)`);
}
// 9. Snowball Drop: ONE dollar balance for both sizes (Cody, 2026-10-01: "when someone buys $10.00 in tokens they can play
//    either the 0.10 or 1.00 game"). Invariant: balance = paid − spent, to the cent; a size is refused only when the balance
//    can't cover it; a refused or failed drop gives back exactly what it took; every drop re-checks from its proof.
{
  const { unitsFor, balanceOf } = await import('../mockups/credits.js');
  const ledger = newLedger(), pools = { spin: { pool: 500, prepaid: true }, slots: { pool: 500, prepaid: true } }, house = createHouse(ledger, pools);
  const r = buy(ledger, pools, 'drop', 10, 'pay-drop'); // $10
  assert.ok(r.ok && r.cost === 10 && ledger.credits.drop === 100 && balanceOf(ledger, 'drop') === 10, '$10 buys a $10.00 balance');
  assert.equal(unitsFor('drop', 0.10), 1); assert.equal(unitsFor('drop', 1), 10);
  let spent = 0;
  const go = async (bet) => { const o = await house.open('drop', bet); if (!o.ticket) return o; const st = await house.settle(o.ticket, newSeed(8));
    const c = await check(st.proof); assert.ok(c.matches); assert.deepEqual([c.outcome.path, c.outcome.mult], [st.r.path, st.r.mult], 'the drop re-checks from its proof');
    spent += bet; return st; };
  for (const bet of [1, 0.1, 0.1, 1, 0.1, 1, 1, 1, 1, 0.1]) { const st = await go(bet); assert.ok(st.r, 'drop ' + bet); assert.equal(st.r.bet, bet); }
  assert.equal(balanceOf(ledger, 'drop'), Math.round((10 - spent) * 100) / 100, 'balance = $10 − what was played'); // 10 − 6.4 = 3.60
  assert.deepEqual(audit(ledger), []);
  for (let i = 0; i < 3; i++) await go(1); // $0.60 left
  assert.equal(balanceOf(ledger, 'drop'), 0.6);
  assert.deepEqual(await house.open('drop', 1), { noCredit: true }, 'a $1 drop is refused with only 60¢ left');
  assert.equal(balanceOf(ledger, 'drop'), 0.6, '...and nothing was taken');
  for (let i = 0; i < 6; i++) await go(0.1);
  assert.equal(ledger.credits.drop, 0, 'the last 60¢ plays six 10¢ drops');
  assert.deepEqual(await house.open('drop', 0.1), { noCredit: true });
  assert.equal((await house.open('drop', 0.37)).why, 'unknown size', 'only 10¢ and $1 drops');
  // a stopped pool refuses BEFORE taking anything; a stopped pool at settle gives back exactly the $1
  buy(ledger, pools, 'drop', 2, 'pay-drop-2');
  pools.spin.rules = { paused: true }; assert.deepEqual(await house.open('drop', 1), { refused: true, stopped: true }); assert.equal(balanceOf(ledger, 'drop'), 2);
  pools.spin.rules = {}; const o = await house.open('drop', 1); assert.equal(balanceOf(ledger, 'drop'), 1);
  pools.spin.rules = { paused: true }; assert.equal((await house.settle(o.ticket, 'abcd')).refused, true); assert.equal(balanceOf(ledger, 'drop'), 2, 'refund gives back exactly $1');
  pools.spin.rules = {};
  assert.deepEqual(audit(ledger), []);
  console.log('Snowball Drop balance: $10 played as a mix of 10¢ and $1 drops, to the cent; $1 refused at 60¢; refunds exact; every drop re-checked');
}
console.log(`OK: ${plays} plays in Cody's order, ${checked} results re-checked, ${prepaidOk} prepaid pool moves, books balanced after every step`);

// 9. Something breaks mid-play (e.g. hashing unavailable): the credit comes back, the books still balance.
{
  const { ledger, pools } = fresh();
  const boom = () => { throw new Error('no hashing'); };
  const h1 = createHouse(ledger, pools, { newSeed, fingerprint: boom, numbers });
  buy(ledger, pools, 'big', 2, 'a');
  const o = await h1.open('big');
  assert.equal(o.failed, true); assert.equal(ledger.credits.big, 2, 'credit returned when the secret could not be made');
  const h2 = createHouse(ledger, pools, { newSeed, fingerprint: (await import('../mockups/fair.js')).fingerprint, numbers: boom });
  const o2 = await h2.open('big'); assert.ok(o2.ticket); assert.equal(ledger.credits.big, 1);
  const s2 = await h2.settle(o2.ticket, 'x');
  assert.equal(s2.failed, true); assert.equal(ledger.credits.big, 2, 'credit returned when the numbers could not be drawn');
  assert.deepEqual(audit(ledger), []);
  console.log('failures mid-play return the credit: OK');
}
