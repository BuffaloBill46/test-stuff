// Game settings end to end on real Postgres: Cody signs a change; new plays use it; a play started before keeps the old odds;
// every play re-checks on the odds it ran on; credits keep the price they were bought at; unsafe changes are refused.
import assert from 'node:assert/strict';
import { makeDb } from './setup.mjs';
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
const credit = (kind, bet, n) => db.query(`insert into public.credits (profile_id, kind, bet, left_n, bought) values ($1, $2, $3, $4, $4) on conflict (profile_id, kind, bet) do update set left_n = public.credits.left_n + $4, bought = public.credits.bought + $4`, [me, kind, bet, n]);
const S = () => { const s = structuredClone(DEFAULT_SETTINGS); delete s.version; return s; };

// Unsafe changes are refused and store nothing.
let bad = S(); bad.spin.main = { 0: 5, 1: 10, 2: 15, star: 10 };
assert.match((await admin.run(await sign(bad))).error, /Spin would pay back/);
assert.equal((await server.settings()).version, 0);

// A play is opened on version 0...
await credit('spin100', 1, 3);
const early = await server.open(me, 'spin100'); assert.ok(early.ticket);
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
const o = await fresh.open(me, 'spin100'), later = await fresh.settle(me, o.ticket, newSeed(16));
assert.equal(later.proof.settingsVersion, 1); assert.equal((await check(later.proof, v1)).outcome.mult, later.r.mult, 'a new play re-checks on version 1');
// Credits keep their price: this $1 credit (bought before the change) still plays at $1, not the new $2.
assert.equal(later.r.bet, 1, 'an old credit plays at the price it was bought at');
// New purchases use the new price, and are kept apart from the old credits.
assert.equal((await fresh.quote(me, 'spin100', 2)).usd, 4, 'quotes use the new price ($2 × 2)');
// A replayed settings signature is refused.
assert.match((await admin.run(await sign(s1))).error || '', /^$/, 'a fresh signature on the same settings is fine');
const again = await sign(S()); assert.ok((await admin.run(again)).ok); assert.equal((await admin.run(again)).error, 'this signed message was already used');
// Everyone can see every version (public): the log says who changed what.
assert.equal((await db.query('select count(*)::int as n from public.game_settings'))[0].n, 3);
assert.ok((await db.query(`select what from public.pool_log where game = 'all'`)).every((r) => /^settings v\d+$/.test(r.what)));
console.log('OK: settings end to end: unsafe refused; changes never land mid-play; old plays re-check on their own odds; credits keep their price; new prices for new purchases; no replays');
