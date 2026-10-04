// ALL THREE GAMES ON THE ONE SHARED GAME POOL (Cody, 2026-10-04: "all 3 games share the same pool, run a 6 million run on that").
// Big Hat ($1 a pull), Snowball Drop and Stocking Stuffer (10¢ or $1) played in random order on ONE pool, on the real game rules
// (slots.js pull, plinko.js play, stocking.js play) with the real pool rules (POOL_RULES: start $500, $25 skim at $1,025,
// top-off below $200 back to $500). Each play's entry reaches the pool first (87.59¢ of every $1 after the burn and the tax).
// Asserted on EVERY play (a failure stops the run), not just at the end:
//   - the pool never goes negative;
//   - a play never pays more than the pool held (before the play + its entry + any top-off);
//   - the pool never sits at or above the skim point after a play;
//   - no play is refused for lack of pool (the top-off covers every game's biggest fixed prize);
//   - a pool jackpot pays exactly its % of the pool at that moment (× the play's size for Drop and Stocking);
//   - every dollar is accounted for: pool now = start + entries − prizes − skims + top-offs.
// Run: node tests/pool3-sim.mjs [runs per mix=100] [plays per run=20000]
import assert from 'node:assert/strict';
import { pull, POOL_RULES, IN_PER_DOLLAR, FEE } from '../mockups/slots.js';
import { play as dropPlay } from '../mockups/plinko.js';
import { play as stockPlay } from '../mockups/stocking.js';
import { rng } from './rng.mjs';

const RUNS = +(process.argv[2] || 100), PLAYS = +(process.argv[3] || 20000), R = POOL_RULES, near = (a, b) => Math.abs(a - b) < 1e-6;
// how players spread across the games (each mix is a different kind of day on the site)
const MIXES = [
  ['even: a third each', { big: 1 / 3, drop: 1 / 3, stocking: 1 / 3 }],
  ['Big Hat heavy (60%)', { big: 0.6, drop: 0.2, stocking: 0.2 }],
  ['Drop and Stocking heavy, mostly $1 plays', { big: 0.1, drop: 0.45, stocking: 0.45, dollar: 0.8 }],
];
const NAME = { big: 'Big Hat', drop: 'Snowball Drop', stocking: 'Stocking Stuffer' };
const rand = rng(20261004), t0 = Date.now();
const total = { plays: 0, staked: 0, paid: 0, jackpots: 0, skims: 0, tops: 0 };
for (const [mixName, mix] of MIXES) {
  const g = Object.fromEntries(Object.keys(NAME).map((k) => [k, { plays: 0, staked: 0, paid: 0, ahead: 0, jackpots: 0, jpPaid: 0, biggest: 0 }]));
  let skims = 0, tops = 0, skimUsd = 0, topUsd = 0, low = Infinity, high = 0, treasury = 0, refused = 0, sumPool = 0, n = 0;
  for (let run = 0; run < RUNS; run++) {
    // prepaid, as on the live server: the entry reaches the pool when the play is bought (below), and the game doesn't add it again
    const st = { pool: R.start, treasury: 0, prepaid: true }; let entries = 0, prizes = 0, sk = 0, to = 0;
    for (let i = 0; i < PLAYS; i++) {
      const x = rand(), kind = x < mix.big ? 'big' : x < mix.big + mix.drop ? 'drop' : 'stocking';
      const bet = kind === 'big' ? 1 : rand() < (mix.dollar ?? 0.4) ? 1 : 0.1;
      const before = st.pool, entry = bet * IN_PER_DOLLAR;
      st.pool += entry; entries += entry; // the entry reaches the pool when the play is bought
      const r = kind === 'big' ? pull(st, 'big', rand) : kind === 'drop' ? dropPlay(st, bet, rand) : stockPlay(st, bet, rand);
      if (r.paused) { refused++; st.pool -= entry; entries -= entry; continue; } // (counted; asserted zero below)
      const top = r.topOff || 0, skim = r.skim || 0;
      assert.ok(r.pay <= before + entry + top + 1e-9, `${NAME[kind]} paid $${r.pay} with only $${(before + entry + top).toFixed(2)} in the pool`);
      assert.ok(st.pool > -1e-9, `the pool went negative ($${st.pool}) after ${NAME[kind]}`);
      assert.ok(st.pool < R.skimAt, `the pool sits at $${st.pool}, at or above the $${R.skimAt} skim point`);
      if (r.jackpot) { // the pool jackpot: its % of the pool at that moment (the pool the play recorded), × the size for Drop/Stocking
        const want = r.pct * r.jackpotPool * (kind === 'big' ? 1 : bet);
        assert.ok(near(r.pay, want), `${NAME[kind]} jackpot paid $${r.pay}, expected ${r.pct} × $${r.jackpotPool.toFixed(2)}${kind === 'big' ? '' : ' × ' + bet} = $${want}`);
        g[kind].jackpots++; g[kind].jpPaid += r.pay;
      }
      prizes += r.pay; sk += skim; to += top;
      g[kind].plays++; g[kind].staked += bet; g[kind].paid += r.pay; if (r.pay > bet + 1e-9) g[kind].ahead++; g[kind].biggest = Math.max(g[kind].biggest, r.pay);
      if (skim) { skims++; skimUsd += skim; } if (top) { tops++; topUsd += top; }
      low = Math.min(low, st.pool); high = Math.max(high, st.pool); sumPool += st.pool; n++;
    }
    // every dollar accounted for, run by run
    assert.ok(Math.abs(st.pool - (R.start + entries - prizes - sk + to)) < 1e-4, `run ${run}: the pool's books don't balance`);
    treasury += st.treasury;
  }
  assert.equal(refused, 0, `${mixName}: ${refused} plays refused for lack of pool`);
  const plays = Object.values(g).reduce((a, x) => a + x.plays, 0), staked = Object.values(g).reduce((a, x) => a + x.staked, 0), paid = Object.values(g).reduce((a, x) => a + x.paid, 0);
  console.log(`\n${mixName}: ${plays.toLocaleString()} plays, $${Math.round(staked).toLocaleString()} played, $${Math.round(paid).toLocaleString()} won back (${(paid / staked * 100).toFixed(1)}% overall)`);
  for (const [k, x] of Object.entries(g)) if (x.plays) console.log(`  ${NAME[k].padEnd(17)} ${x.plays.toLocaleString().padStart(9)} plays  pays back ${(x.paid / x.staked * 100).toFixed(1).padStart(5)}%  ahead ${(x.ahead / x.plays * 100).toFixed(1).padStart(4)}% of plays  biggest $${x.biggest.toFixed(2).padStart(7)}  pool jackpots ${String(x.jackpots).padStart(3)} ($${Math.round(x.jpPaid).toLocaleString()})`);
  console.log(`  pool: lowest $${low.toFixed(2)}, highest $${high.toFixed(2)}, average $${(sumPool / n).toFixed(2)}; ${skims.toLocaleString()} skims ($${Math.round(skimUsd).toLocaleString()}), ${tops} top-offs ($${Math.round(topUsd).toLocaleString()}); 0 refused`);
  console.log(`  treasury (skims in, less tax; top-offs out, plus tax): about $${(treasury / RUNS).toFixed(0)} per ${PLAYS.toLocaleString()} plays`);
  Object.assign(total, { plays: total.plays + plays, staked: total.staked + staked, paid: total.paid + paid, jackpots: total.jackpots + Object.values(g).reduce((a, x) => a + x.jackpots, 0), skims: total.skims + skims, tops: total.tops + tops });
}
console.log(`\nOK: ${total.plays.toLocaleString()} plays of all three games on one shared pool, every play checked: never negative, never paid more than it held, never left at the skim point, nothing refused, ${total.jackpots} pool jackpots each exactly its share, every dollar accounted for (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
