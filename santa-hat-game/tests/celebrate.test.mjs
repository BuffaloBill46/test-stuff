// Tiered win celebrations (celebrate.js): the tier follows the money, and nothing that didn't come out ahead ever celebrates.
// Run: node tests/celebrate.test.mjs
import assert from 'assert/strict';
const { tierOf, TIERS } = await import('../mockups/celebrate.js').catch(async () => {
  // celebrate.js imports sfx.js (browser audio); load just the pure part for Node
  const src = (await import('fs')).readFileSync(new URL('../mockups/celebrate.js', import.meta.url), 'utf8').replace(/^import .*$/m, 'const sfx = () => {};');
  return import('data:text/javascript,' + encodeURIComponent(src));
});
const cases = [
  // [what came back ÷ stake, ahead?, jackpot?, expected tier]
  [0, false, false, 0], [0.5, false, false, 0], [1, false, false, 0], // nothing, a loss, money back: never celebrated
  [0.9, true, false, 0],   // a bad "ahead" flag can't make a loss celebrate: the multiple must be over 1 too
  [1.5, true, false, 1], [2.99, true, false, 1],
  [3, true, false, 2], [9.99, true, false, 2],
  [10, true, false, 3], [24.99, true, false, 3],
  [25, true, false, 4], [50, true, false, 4], [100, true, false, 4],
  [0, false, true, 5], [3, true, true, 5],
];
for (const [mult, ahead, jackpot, want] of cases) assert.equal(tierOf({ ahead, jackpot, mult }), want, `mult ${mult} ahead ${ahead} jackpot ${jackpot}`);
// tiers only ever grow: more sound, more effects, longer holds as the win gets bigger
for (let k = 2; k <= 5; k++) for (const f of ['fx', 'hold', 'ms']) assert.ok(TIERS[k][f] >= TIERS[k - 1][f], `tier ${k} ${f} >= tier ${k - 1}`);
// every game's top prizes land in the top tiers: Drop 25×, Stocking 25×/50×, Big Hat's 100× line
assert.equal(tierOf({ ahead: true, mult: 25 }), 4); assert.equal(tierOf({ ahead: true, mult: 100 }), 4);
console.log(`celebrate: ${cases.length} cases + ordering, ALL CHECKS PASSED`);
