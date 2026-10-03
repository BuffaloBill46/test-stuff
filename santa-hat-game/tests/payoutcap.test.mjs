// The payout safety cap must NEVER freeze a real win (Cody, 2026-10-01: "I don't want a hold on a player that wins").
// The cap is n × maxPerPlay (server/games.js), worked out from the prize table. This checks, as assertions, that no play
// the games can produce pays more than maxPerPlay: every Spin and Snowball Drop result exactly, the worst Big Hat grids
// (every square the same symbol), 300,000 random pulls, and settings Cody might publish (bigger prizes, a $2 price).
import assert from 'node:assert/strict';
import { maxPerPlay, playCap } from '../server/games.js';
import { DEFAULT_SETTINGS, build } from '../mockups/settings.js';
import { SYMBOLS, evaluate, pull } from '../mockups/slots.js';
import { odds } from '../mockups/spin.js';
import { PAYS } from '../mockups/plinko.js';

const settingsList = [DEFAULT_SETTINGS];
{ const s = structuredClone(DEFAULT_SETTINGS); s.prices.big = 2; s.prices.spin100 = 2; s.big.hatBonus = 0.1;
  for (const p of Object.values(s.big.pays)) for (const k of Object.keys(p)) p[k] *= 3; // much bigger prizes
  s.spin.main = { 0: 18, 1: 12, 2: 6, star: 4 }; s.spin.bonus = { 3: 8, 4: 3, 5: 1 }; settingsList.push(s); }

let checked = 0, closest = 0;
for (const s of settingsList) {
  const cfg = build(s), m = cfg.machine;
  for (const bet of [m.bet, 1]) {
    const cap = maxPerPlay(cfg, 'big', bet), scale = bet / m.bet;
    // the worst grids: every square one symbol (Santa Hats are wild, so all-hats lines pay the hat prize on every line)
    for (let id = 0; id < SYMBOLS.length; id++) {
      const grid = Array.from({ length: m.reels }, () => Array(m.rows).fill(id));
      const hats = id === 0 ? m.reels * m.rows : 0; // SYM.hat is 0
      const pay = (evaluate(m, grid).reduce((a, w) => a + w.pay, 0) + hats * (m.hatBonus || 0) * m.bet) * scale;
      assert.ok(pay <= cap + 1e-9, `${SYMBOLS[id].id} everywhere pays ${pay} > cap ${cap}`); checked++; closest = Math.max(closest, pay / cap);
    }
    // real pulls (jackpot excluded: it's added to the cap separately, as the share of the pool it really paid)
    let seed = 99; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 150000; i++) {
      const res = pull({ pool: 1e9, treasury: 0, prepaid: true, rules: {} }, m, r);
      if (res.jackpot) continue;
      assert.ok(res.pay * scale <= cap + 1e-9, `a real pull paid ${res.pay * scale} > cap ${cap}`); checked++;
    }
  }
  for (const bet of [0.1, 1, 2]) {
    const top = Math.max(...Object.keys(odds(cfg.wheel)).map(Number)) * bet; // every Spin result, both wheels
    assert.ok(top <= maxPerPlay(cfg, 'spin', bet) + 1e-9, 'Spin\'s top result is within the cap'); checked++;
    const drop = Math.max(...PAYS) * bet;
    assert.ok(drop <= maxPerPlay(cfg, 'drop', bet) + 1e-9, 'Snowball Drop\'s edge present is within the cap'); checked++;
  }
}
// And the cap is not loose for Spin and Drop: it's exactly their top prize.
assert.equal(maxPerPlay(build(DEFAULT_SETTINGS), 'spin', 1), 5); assert.equal(maxPerPlay(build(DEFAULT_SETTINGS), 'drop', 1), 25); // board 3: the 25× edge (the centre is the pool jackpot)
assert.equal(maxPerPlay(build(DEFAULT_SETTINGS), 'stocking', 1), 50, 'Stocking Stuffer: 7 gifts, 50× (8 gifts is the pool jackpot)');
// ONE GAME POOL + POOL JACKPOTS (Cody, 2026-10-02). finishRun's cap is the sum of playCap over the run's plays. Proven:
//  - every real Stocking Stuffer and Snowball Drop result (fixed prizes and pool jackpots, at many pool sizes, both sizes) is
//    within its play's cap, so a real jackpot (25% of the pool at that moment × the play's size) is never frozen;
//  - a jackpot whose pay doesn't match its own recorded pool share, and any fixed prize above the table's top, IS over the cap;
//  - drops played on board 2 (100× centre) and turns played on board 1 (250× for 8 gifts) still fit their own board's cap.
{ const { play: stockPlay } = await import('../mockups/stocking.js'), { play: dropPlay } = await import('../mockups/plinko.js');
  const cfg = build(DEFAULT_SETTINGS), within = (kind, bet, r) => playCap(cfg, kind, bet, { state: 'settled', pay: Math.round(r.pay * 100) / 100, result: r.jackpot ? { jackpot: true, pool: r.jackpotPool, pct: r.pct, board: r.board } : { mult: r.mult, board: r.board } }) + 0.01;
  let jackpots = 0, fixed = 0, worst = 0;
  for (const pool of [200, 333.33, 500, 777.77, 1024.99, 5000]) for (const bet of [0.1, 1]) {
    for (let k = 0; k <= 8; k++) { const r = stockPlay({ pool, prepaid: true }, bet, Math.random, k); const cap = within('stocking', bet, r);
      assert.ok(r.pay <= cap + 1e-9, `stocking ${k} gifts at $${pool}, ${bet}: ${r.pay} > cap ${cap}`); r.jackpot ? jackpots++ : fixed++; worst = Math.max(worst, r.pay / cap); }
    for (let bin = 0; bin <= 16; bin++) { const r = dropPlay({ pool, prepaid: true }, bet, Math.random, Array.from({ length: 16 }, (_, i) => (i < bin ? 1 : 0))); const cap = within('drop', bet, r);
      assert.ok(r.pay <= cap + 1e-9, `drop present ${bin} at $${pool}, ${bet}: ${r.pay} > cap ${cap}`); r.jackpot ? jackpots++ : fixed++; }
    const bigJ = pull({ pool, prepaid: true }, cfg.machine, Math.random, 'JACKPOT'); const capJ = playCap(cfg, 'big', 1, { state: 'settled', pay: bigJ.pay, result: { jackpot: true, pool: bigJ.jackpotPool, pct: bigJ.pct } }) + 0.01;
    assert.ok(bigJ.pay <= capJ + 1e-9, `Big Hat pool jackpot at $${pool}`); jackpots++;
  }
  assert.ok(jackpots >= 30 && fixed > 100, 'real jackpots and fixed prizes were both checked');
  // the cap still freezes impossible amounts
  const over = (kind, bet, pay, result) => pay > playCap(cfg, kind, bet, { state: 'settled', pay, result }) + 0.01;
  assert.ok(over('drop', 1, 126, { jackpot: true, pool: 500, pct: 0.25, board: 3 }), 'a drop jackpot $1 over its 25% × $500 share is frozen');
  assert.ok(over('stocking', 0.1, 12.6, { jackpot: true, pool: 500, pct: 0.25, board: 2 }), 'a 10¢ jackpot over its 2.5% share is frozen');
  assert.ok(over('drop', 1, 300, { jackpot: true, pool: 500, pct: 0.9, board: 3 }), 'a recorded % above the 50% guard rail is capped at 50%');
  assert.ok(over('drop', 1, 25.02, { mult: 25, board: 3 }), 'a fixed drop prize above 25× is frozen');
  assert.ok(over('stocking', 1, 50.02, { mult: 50, board: 2 }), 'a fixed turn prize above 50× is frozen');
  assert.ok(!over('drop', 1, 100, { mult: 100, board: 2 }) && over('drop', 1, 100, { mult: 100, board: 3 }), 'board 2 drops keep their 100× cap; on board 3 a fixed $100 is impossible');
  assert.ok(!over('stocking', 1, 250, { mult: 250 }) && over('stocking', 1, 250, { mult: 250, board: 2 }), 'board 1 turns (no board) keep their 250× cap');
  assert.equal(playCap(cfg, 'stocking', 1, { state: 'refunded', pay: 1, result: null }), 1, 'a refused play: its price');
  console.log(`OK: pool jackpots are never frozen (${jackpots} jackpots at 6 pool sizes × both sizes; the closest a real turn came: ${(worst * 100).toFixed(1)}% of its cap) and impossible amounts are (7 cases); old boards keep their own caps`); }
console.log(`OK: payout cap never freezes a real win: ${checked.toLocaleString()} results checked across today's and bigger-prize settings (worst grid reaches ${(closest * 100).toFixed(0)}% of the cap); $1 Big Hat cap per pull $${maxPerPlay(build(DEFAULT_SETTINGS), 'big', 1)}`);
