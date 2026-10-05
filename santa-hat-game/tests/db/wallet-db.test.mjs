// MY WALLET UNDER THE GAMES, server side (server/games.js wallet; Cody 2026-10-05: "show their SOL balance under the SANTA
// balance"): the linked wallet's SANTA with its dollars, and its SOL with its dollars; a SOL read that fails leaves SOL out (the
// SANTA still shows; nothing made up); no wallet linked: says so. Real game server code on real SQL (PGlite, every migration).
// Run: node tests/db/wallet-db.test.mjs
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { makeDb } from './setup.mjs';
import { createGameServer } from '../../server/games.js';

const FILES = readdirSync(new URL('../../supabase/', import.meta.url)).filter((f) => /^0\d\d_.*\.sql$/.test(f) && f !== '031_games_role.sql').sort();
const db = await makeDb(FILES);
const W = 'WaLLeTwa11et'.padEnd(44, '1').replace(/[0OIl]/g, '9'), me = await db.player(W, 'Ann');
const mk = (solBalance) => createGameServer({ retired: [], db, poolWallets: {}, livePrice: async () => ({ usd: 0.001 }), liveFee: async () => ({ bps: 300, max: 1e15 }),
  liveSol: async () => ({ usd: 150 }), chain: { tokenBalance: async () => 54_321e6, solBalance } });
const r = await mk(async () => 200_000_000).wallet(me);
assert.deepEqual([r.wallet, r.santaRaw, +r.usd.toFixed(2), r.solLamports, +r.solUsd.toFixed(2)], [W, 54_321e6, 54.32, 200_000_000, 30], 'SANTA and SOL, each with its dollars ' + JSON.stringify(r));
const r2 = await mk(async () => { throw new Error('busy node'); }).wallet(me);
assert.ok(r2.santaRaw === 54_321e6 && !('solLamports' in r2) && !('solUsd' in r2), 'SOL could not be read: left out, SANTA still shown');
const r3 = await mk(undefined).wallet(me);
assert.ok(r3.santaRaw === 54_321e6 && !('solLamports' in r3), 'a server without a SOL reader: SANTA only');
console.log('OK: wallet reading: SANTA + SOL with dollars; a failed SOL read is left out (SANTA still shown); no SOL reader: SANTA only');
