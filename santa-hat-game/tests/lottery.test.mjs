// Santa Lottery rules (Cody, 2026-10-01): schedule, sales cut-off, exact pot splits, one place per wallet, equal odds per ticket,
// and a draw anyone can re-check. Run: node tests/lottery.test.mjs
import assert from 'node:assert/strict';
import { LOTTERIES, nextDraw, salesFor, splitPot, pickWinners, drawWinners, SALES_CLOSE_MS } from '../mockups/lottery.js';
import { newSeed } from '../mockups/fair.js';

const T = (s) => Date.parse(s), DAY = 86_400_000;
// 1. Schedule: daily at the next 00:00 UTC (dailies are off); WEEKLY on Sunday 9 PM Indiana time (Cody 2026-10-02), with
// daylight saving: 01:00 UTC Monday in summer (EDT), 02:00 UTC in winter (EST); Christmas once, Dec 23 2026 9 PM Indiana (02:00 UTC Dec 24).
assert.equal(nextDraw('daily-10', T('2026-10-01T15:00:00Z')), T('2026-10-02T00:00:00Z'));
assert.equal(nextDraw('daily-100', T('2026-10-01T23:59:59Z')), T('2026-10-02T00:00:00Z'));
assert.equal(nextDraw('daily-100', T('2026-10-02T00:00:00Z')), T('2026-10-03T00:00:00Z'), 'exactly at a draw: the next one');
assert.equal(new Date(nextDraw('weekly-10', T('2026-10-01T15:00:00Z'))).toISOString(), '2026-10-05T01:00:00.000Z', 'Thursday → Sunday 9 PM EDT');
assert.equal(new Date(nextDraw('weekly-100', T('2026-10-05T01:00:00Z'))).toISOString(), '2026-10-12T01:00:00.000Z', 'at Sunday\'s draw → the next Sunday');
assert.equal(new Date(nextDraw('weekly-100', T('2026-10-05T00:59:59Z'))).toISOString(), '2026-10-05T01:00:00.000Z', 'Sunday 8:59 PM → that evening');
assert.equal(new Date(nextDraw('weekly-100', T('2026-10-31T12:00:00Z'))).toISOString(), '2026-11-02T02:00:00.000Z', 'the clocks go back Nov 1: 9 PM EST = 02:00 UTC');
assert.equal(new Date(nextDraw('weekly-100', T('2027-03-13T12:00:00Z'))).toISOString(), '2027-03-15T01:00:00.000Z', 'the clocks go forward Mar 14: 9 PM EDT = 01:00 UTC');
const indiana = (t) => new Date(t).toLocaleString('en-US', { timeZone: 'America/Indiana/Indianapolis', weekday: 'short', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' });
for (let t = T('2026-10-01T00:00:00Z'); t < T('2027-12-31T00:00:00Z'); t += 3_600_000 * 7) { // every 7 hours for 15 months (both clock changes)
  const w = nextDraw('weekly-10', t); assert.equal(indiana(w), 'Sun 21:00', 'always Sunday 9 PM in Indiana: ' + new Date(w).toISOString()); assert.ok(w > t && w - t <= 7 * DAY);
  const d = nextDraw('daily-10', t); assert.ok(d > t && d - t <= DAY && d % DAY === 0);
}
assert.equal(new Date(nextDraw('christmas', T('2026-10-01T00:00:00Z'))).toISOString(), '2026-12-24T02:00:00.000Z', 'Christmas draws Dec 23 at 9 PM Indiana (EST)');
assert.equal(nextDraw('christmas', T('2026-12-24T02:00:00Z')), null, 'and runs once');

// 2. Sales close 5 minutes before a draw.
assert.equal(salesFor('daily-10', T('2026-10-01T23:54:59Z')).open, true);
assert.equal(salesFor('daily-10', T('2026-10-01T23:55:00Z')).open, false, 'last 5 minutes: closed');
assert.equal(salesFor('christmas', T('2026-12-24T01:56:00Z')).open, false);
assert.equal(salesFor('christmas', T('2026-12-25T00:00:00Z')).why, 'this lottery has been drawn');
assert.equal(SALES_CLOSE_MS, 300_000);

// 3. Pot splits: exact to the smallest unit, always summing to the pot; unfilled places go to 1st.
assert.deepEqual(splitPot(1000, [60, 25, 15], 3), [600n, 250n, 150n]);
assert.deepEqual(splitPot(1000, [60, 25, 15], 2), [750n, 250n], 'only 2 wallets: 3rd\'s share goes to 1st');
assert.deepEqual(splitPot(1000, [60, 25, 15], 1), [1000n]);
assert.deepEqual(splitPot(1000, [100], 5), [1000n]); assert.deepEqual(splitPot(1000, [60, 25, 15], 0), []);
for (let i = 0; i < 20000; i++) { const pot = BigInt(Math.floor(Math.random() * 1e12)), n = 1 + (i % 3), s = splitPot(pot, [60, 25, 15], n);
  assert.equal(s.reduce((a, b) => a + b, 0n), pot, 'the shares add up to the pot exactly'); assert.ok(s.every((x) => x >= 0n)); }
assert.equal(LOTTERIES['daily-10'].split.length, 1); assert.equal(LOTTERIES['weekly-100'].split.join(), '60,25,15'); assert.equal(LOTTERIES.christmas.ticket, 1);

// 4. One place per wallet, even when one wallet holds almost every ticket (no cap); never more places than wallets.
const whale = Array.from({ length: 50000 }, (_, i) => ({ id: i, wallet: 'WHALE' })).concat([{ id: 50000, wallet: 'A' }, { id: 50001, wallet: 'B' }]);
for (let k = 0; k < 200; k++) { const w = pickWinners(whale, 3, () => Math.random());
  assert.equal(w.length, 3); assert.equal(new Set(w.map((x) => x.ticket.wallet)).size, 3, 'three different wallets'); }
assert.equal(pickWinners([{ id: 1, wallet: 'A' }, { id: 2, wallet: 'A' }], 3, () => 0.5).length, 1, 'one wallet: one place');
assert.deepEqual(pickWinners([], 3, () => 0.5), []);

// 5. Equal odds per ticket: 1st place over 60,000 draws lands on each wallet in proportion to its tickets (±3 points).
const mix = [...Array(6)].map((_, i) => ({ id: i, wallet: 'A' })).concat([...Array(3)].map((_, i) => ({ id: 10 + i, wallet: 'B' })), [{ id: 20, wallet: 'C' }]);
const firsts = { A: 0, B: 0, C: 0 }; for (let k = 0; k < 60000; k++) firsts[pickWinners(mix, 1, () => Math.random())[0].ticket.wallet]++;
for (const [w, share] of [['A', 0.6], ['B', 0.3], ['C', 0.1]]) assert.ok(Math.abs(firsts[w] / 60000 - share) < 0.03, `${w}: ${firsts[w] / 600}% vs ${share * 100}%`);

// 6. The real draw: same public inputs → same winners (anyone can re-check); change any input → a different draw.
const tickets = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, wallet: 'W' + (i % 9) }));
const secret = newSeed(), blockhash = 'Gh9ZwEmdLJ8DscKNTkTqPbNwcj9mSBnasNYPzeYoGGfR';
const a = await drawWinners({ secret, blockhash, tickets, drawId: 17, places: 3 }), again = await drawWinners({ secret, blockhash, tickets, drawId: 17, places: 3 });
assert.deepEqual(a, again, 're-checking a draw gives the same winners'); assert.equal(new Set(a.map((x) => x.ticket.wallet)).size, 3);
let differs = 0; for (let k = 0; k < 20; k++) {
  const variants = [{ secret: newSeed(), blockhash, tickets }, { secret, blockhash: blockhash.slice(0, -1) + 'x', tickets }, { secret, blockhash, tickets: tickets.slice(1) }];
  for (const v of variants) if (JSON.stringify(await drawWinners({ ...v, drawId: 17, places: 3 })) !== JSON.stringify(a)) differs++; }
assert.ok(differs >= 50, `changing the secret, the blockhash or the ticket list changes the draw (${differs}/60)`);
assert.deepEqual(await drawWinners({ secret, blockhash, tickets: [], drawId: 1, places: 3 }), [], 'no tickets: no winners');

console.log(`OK: lottery: daily/weekly/Christmas schedule; sales close 5 min before; pot splits exact (unfilled places → 1st); one place per wallet even vs a 50,000-ticket wallet; equal odds per ticket (A ${firsts.A / 600}% / B ${firsts.B / 600}% / C ${firsts.C / 600}%); draws re-check and can't be steered`);
