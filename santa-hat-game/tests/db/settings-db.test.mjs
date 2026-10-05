// Game settings end to end on real Postgres: Cody signs a change; new plays use it; a play started before keeps the old odds;
// every play re-checks on the odds it ran on; credits keep the price they were bought at; unsafe changes are refused.
import assert from 'node:assert/strict';
import { makeDb, directRun } from './setup.mjs';
import { createGameServer } from '../../server/games.js';
import { createAdmin, adminMessage, b58encode } from '../../server/admin.js';
import { DEFAULT_SETTINGS, build } from '../../mockups/settings.js';
import { check } from '../../mockups/house.js';
import { newSeed } from '../../mockups/fair.js';

const db = await makeDb(), PRICE = 0.00085;
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', $1, '{"topOffTo": 250}'), ('slots', $2, '{}')`, [Math.round(50 / PRICE * 1e6), Math.round(500 / PRICE * 1e6)]);
const me = await db.player('PLAYERwa11et111111111111111111111111111111');
const server = createGameServer({ retired: [], db, chain: {}, livePrice: async () => ({ usd: PRICE }), liveFee: async () => ({ bps: 300, max: 1e15 }), poolWallets: {} });
const key = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']), cody = b58encode(new Uint8Array(await crypto.subtle.exportKey('raw', key.publicKey)));
const admin = createAdmin({ db, adminWallets: [cody] });
const sign = async (settings) => { const message = adminMessage({ action: 'set-settings', game: 'all', settings, at: new Date().toISOString(), nonce: newSeed(16) });
  return { wallet: cody, message, signature: [...new Uint8Array(await crypto.subtle.sign('Ed25519', key.privateKey, new TextEncoder().encode(message)))].map((b) => b.toString(16).padStart(2, '0')).join('') }; };
const S = () => { const s = structuredClone(DEFAULT_SETTINGS); delete s.version; return s; };

// Unsafe changes are refused and store nothing.
let bad = S(); bad.big.hatBonus = 0.2;
assert.match((await admin.run(await sign(bad))).error, /Big Hat would pay back/);
assert.equal((await server.settings()).version, 0);

// (Santa Hat Spin, this test's old example, was removed 2026-10-04: Big Hat shows the same versioning.)
// A Big Hat run is bought on version 0...
const early = { ticket: (await directRun(db, me, 'big', 1, 1, 0)).tickets[0] };
// ...then Cody changes the Big Hat jackpot odds and doubles the pull price to $2 (its $200 top prize needs more than the $125
// default backing: this pool is backed to $250, see the insert above).
const s1 = S(); s1.big.jackpotOdds = 10000; s1.prices.big = 2;
const sameResult = (c, r) => (r.jackpot ? !!c.outcome.jackpot : JSON.stringify(c.outcome.stops) === JSON.stringify(r.stops));
const saved = await admin.run(await sign(s1)); assert.ok(saved.ok, saved.error);
assert.equal(saved.version, 1); console.log(`saved settings v1: Big Hat pays back ${(saved.report.big.payback * 100).toFixed(1)}%, top line prize $${saved.report.big.topPrize}`);
// The early play still settles on version 0 (the change never lands mid-play), and re-checks on version 0's reels.
await new Promise((r) => setTimeout(r, 10));
const e = await server.settle(me, early.ticket, newSeed(16));
assert.equal(e.proof.settingsVersion, 0);
const v0 = build(DEFAULT_SETTINGS), v1 = build({ ...s1, version: 1 });
assert.ok(sameResult(await check(e.proof, v0), e.r), 'the early play re-checks on version 0'); assert.equal(e.proof.bet, 1, 'at the $1 it was bought at');
// New plays run on version 1 (the cache refreshes within 15 s; a fresh server sees it at once).
const fresh = createGameServer({ retired: [], db, chain: {}, livePrice: async () => ({ usd: PRICE }), liveFee: async () => ({ bps: 300, max: 1e15 }), poolWallets: {} });
assert.equal((await fresh.settings()).version, 1);
assert.match((await fresh.quote(me, 'big', 1, 1)).error, /size/, 'after the change, $1 is no longer the Big Hat price');
const o = { ticket: (await directRun(db, me, 'big', 1, 2, 1)).tickets[0] }, later = await fresh.settle(me, o.ticket, newSeed(16));
assert.equal(later.proof.settingsVersion, 1); assert.ok(sameResult(await check(later.proof, v1), later.r), 'a new play re-checks on version 1');
assert.equal(later.proof.bet, 2, 'the new $2 pull');
assert.equal((await fresh.quote(me, 'big', 5, 2)).usd, 10, 'quotes use the new price ($2 × 5)');
// A replayed settings signature is refused.
assert.match((await admin.run(await sign(s1))).error || '', /^$/, 'a fresh signature on the same settings is fine');
const again = await sign(S()); assert.ok((await admin.run(again)).ok); assert.equal((await admin.run(again)).error, 'this signed message was already used');
// Everyone can see every version (public): the log says who changed what.
assert.equal((await db.query('select count(*)::int as n from public.game_settings'))[0].n, 3);
assert.ok((await db.query(`select what from public.pool_log where game = 'all'`)).every((r) => /^settings v\d+$/.test(r.what)));
console.log('OK: settings end to end: unsafe refused; changes never land mid-play; old plays re-check on their own odds; runs play at their own price and settings; no replays');
