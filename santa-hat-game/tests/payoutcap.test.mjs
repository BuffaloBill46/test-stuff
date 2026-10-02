// The payout safety cap must NEVER freeze a real win (Cody, 2026-10-01: "I don't want a hold on a player that wins").
// The cap is n × maxPerPlay (server/games.js), worked out from the prize table. This checks, as assertions, that no play
// the games can produce pays more than maxPerPlay: every Spin and Snowball Drop result exactly, the worst Big Hat grids
// (every square the same symbol), 300,000 random pulls, and settings Cody might publish (bigger prizes, a $2 price).
import assert from 'node:assert/strict';
import { maxPerPlay } from '../server/games.js';
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
assert.equal(maxPerPlay(build(DEFAULT_SETTINGS), 'spin', 1), 5); assert.equal(maxPerPlay(build(DEFAULT_SETTINGS), 'drop', 1), 100); // board 2: the 100× centre
console.log(`OK: payout cap never freezes a real win: ${checked.toLocaleString()} results checked across today's and bigger-prize settings (worst grid reaches ${(closest * 100).toFixed(0)}% of the cap); $1 Big Hat cap per pull $${maxPerPlay(build(DEFAULT_SETTINGS), 'big', 1)}`);
