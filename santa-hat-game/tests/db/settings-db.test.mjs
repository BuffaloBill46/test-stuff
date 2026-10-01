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
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', $1, '{}'), ('slots', $2, '{}')`, [Math.round(50 / PRICE * 1e6), Math.round(500 / PRICE * 1e6)]);
const me = await db.player('PLAYERwa11et111111111111111111111111111111');
const server = createGameServer({ db, chain: {}, livePrice: async () => ({ usd: PRICE }), liveFee: async () => ({ bps: 300, max: 1e15 }), poolWallets: {} });
const key = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']), cody = b58encode(new Uint8Array(await crypto.subtle.exportKey('raw', key.publicKey)));
const admin = createAdmin({ db, adminWallets: [cody] });
const sign = async (settings) => { const message = adminMessage({ action: 'set-settings', game: 'all', settings, at: new Date().toISOString(), nonce: newSeed(16) });
  return { wallet: cody, message, signature: [...new Uint8Array(await crypto.subtle.sign('Ed25519', key.privateKey, new TextEncoder().encode(message)))].map((b) => b.toString(16).padStart(2, '0')).join('') }; };
const S = () => { const s = structuredClone(DEFAULT_SETTINGS); delete s.version; return s; };

// Unsafe changes are refused and store nothing.
let bad = S(); bad.spin.main = { 0: 5, 1: 10, 2: 15, star: 10 };
assert.match((await admin.run(await sign(bad))).error, /Spin would pay back/);
assert.equal((await server.settings()).version, 0);

// A run is bought on version 0...
const early = { ticket: (await directRun(db, me, 'spin', 1, 1, 0)).tickets[0] };
// ...then Cody changes the wheel (fewer no-wins) and the Big Hat jackpot odds, and doubles the $1 spin's price.
const s1 = S(); s1.spin.main = { 0: 18, 1: 12, 2: 6, star: 4 }; s1.spin.bonus = { 3: 8, 4: 3, 5: 1 }; s1.big.jackpotOdds = 10000; s1.prices.spin100 = 2;
const saved = await admin.run(await sign(s1)); assert.ok(saved.ok, saved.error);
assert.equal(saved.version, 1); console.log(`saved settings v1: Spin payback ${(saved.report.spin.payback * 100).toFixed(1)}%, real win ${(saved.report.spin.realWin * 100).toFixed(1)}%`);
// The early play still settles on version 0 (the change never lands mid-play), and re-checks on version 0's wheel.
await new Promise((r) => setTimeout(r, 10));
const e = await server.settle(me, early.ticket, newSeed(16));
assert.equal(e.proof.settingsVersion, 0);
const v0 = build(DEFAULT_SETTINGS), v1 = build({ ...s1, version: 1 });
assert.equal((await check(e.proof, v0)).outcome.mult, e.r.mult, 'the early play re-checks on version 0');
// New plays run on version 1 (the cache refreshes within 15 s; a fresh server sees it at once).
const fresh = createGameServer({ db, chain: {}, livePrice: async () => ({ usd: PRICE }), liveFee: async () => ({ bps: 300, max: 1e15 }), poolWallets: {} });
assert.equal((await fresh.settings()).version, 1);
assert.match((await fresh.quote(me, 'spin', 1, 1)).error, /size/, 'after the change, $1 is no longer a Spin size');
const o = { ticket: (await directRun(db, me, 'spin', 1, 2, 1)).tickets[0] }, later = await fresh.settle(me, o.ticket, newSeed(16));
assert.equal(later.proof.settingsVersion, 1); assert.equal((await check(later.proof, v1)).outcome.mult, later.r.mult, 'a new play re-checks on version 1');
assert.equal(later.r.bet, 2, 'the new $2 spin');
assert.equal((await fresh.quote(me, 'spin', 5, 2)).usd, 10, 'quotes use the new price ($2 × 5)');
// A replayed settings signature is refused.
assert.match((await admin.run(await sign(s1))).error || '', /^$/, 'a fresh signature on the same settings is fine');
const again = await sign(S()); assert.ok((await admin.run(again)).ok); assert.equal((await admin.run(again)).error, 'this signed message was already used');
// Everyone can see every version (public): the log says who changed what.
assert.equal((await db.query('select count(*)::int as n from public.game_settings'))[0].n, 3);
assert.ok((await db.query(`select what from public.pool_log where game = 'all'`)).every((r) => /^settings v\d+$/.test(r.what)));
console.log('OK: settings end to end: unsafe refused; changes never land mid-play; old plays re-check on their own odds; runs play at their own price and settings; no replays');
