// THE PAYOUT WORKER (runs on the always-on Droplet; Cody 2026-10-01: "DigitalOcean ... it will hold pool keys"). Every few seconds
// it sends what the game server queued, with the right wallet's key, using the tested worker (../server/payouts.js: never pays twice,
// a transaction saved BEFORE it's sent, an expired one re-signed only after its blockhash can no longer land) and the live chain
// adapter (server/solanachain.js: Token-2022 with the 3% fee, a unique memo per payout).
//   payouts           a run's winnings → from that game's pool (Big Hat: Slots pool; Snowball Drop / Spin: the Spin pool)
//   pool_transfers    a skim → from the game's pool to the treasury; a top-off → from the treasury to the pool
//   lottery_payouts   only when Cody switched lottery payouts to automatic (manual ones wait for him on the admin screen)
// Settings (environment; /etc/santa/worker.env on the Droplet, never in the repo):
//   DATABASE_URL       Postgres connection: the worker's own limited login santa_worker (supabase/020_worker_role.sql)
//                      through the session pooler; its password lives only in this file
//   SPIN_POOL_WALLET, SLOTS_POOL_WALLET   the pools' public addresses (where approved top-offs go)
//   SOLANA_RPC_URL     devnet: https://api.devnet.solana.com; mainnet: Cody's Helius address
//   SANTA_MINT         the token
//   KEYS_DIR           folder with spinPool.json, slotsPool.json, lotteryPool.json, treasury.json (64-byte key arrays; chmod 600)
//   TREASURY_WALLET    the treasury's public address (where skims go)
//   EVERY_MS           how often to look (default 5000)
//   ONCE=1             run one pass and exit (for testing)
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import * as kit from '@solana/kit';
import * as T22 from '@solana-program/token-2022';
import { runPayouts } from '../server/payouts.js';
import { makeSolanaChain } from '../server/solanachain.js';
import { liveFee } from '../mockups/market.js';

const env = (k, d = '') => process.env[k] || d;
const need = (k) => { const v = env(k); if (!v) { console.error(`worker: ${k} is not set`); process.exit(2); } return v; };
const sql = postgres(need('DATABASE_URL'), { prepare: false, max: 2 });
const db = { query: (q, p = []) => sql.unsafe(q, p), tx: (fn) => sql.begin((t) => fn({ query: (q, p = []) => t.unsafe(q, p) })) };
const rpcUrl = need('SOLANA_RPC_URL'), mint = need('SANTA_MINT'), KEYS = need('KEYS_DIR'), treasuryAddr = need('TREASURY_WALLET');
const signer = async (name) => { const f = path.join(KEYS, name + '.json'); if (!existsSync(f)) return null; return kit.createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(f, 'utf8')))); };
const keys = { spin: await signer('spinPool'), slots: await signer('slotsPool'), lottery: await signer('lotteryPool'), treasury: await signer('treasury') };
const feeOf = () => liveFee(mint, [rpcUrl]);

// which game a run's payout comes from (runs.kind: big → slots; spin, drop → the Spin pool)
const gameOfRun = async (runId) => { const [r] = await db.query('select kind from public.runs where id = $1', [runId]); return r?.kind === 'big' ? 'slots' : 'spin'; };
const missing = (what) => { throw new Error(`no key for ${what} in ${KEYS}`); };
function adapter(table) {
  return makeSolanaChain({ kit, T22, rpcUrl, mint, feeOf, label: (row) => `Santa Hat ${table} #${row.id}`,
    keyFor: async (row) => {
      if (table === 'payouts') { const g = await gameOfRun(row.run_id); return keys[g] || missing(g + ' pool'); }
      if (table === 'lottery_payouts') return keys.lottery || missing('the lottery wallet');
      if (row.kind === 'skim') return keys[row.game] || missing(row.game + ' pool');
      if (row.kind === 'top-off') return keys.treasury || missing('the treasury');
      throw new Error(`pool transfer #${row.id}: ${row.kind} is never sent by the worker`);
    },
    to: async (row) => {
      if (table !== 'pool_transfers') return row.to_wallet;
      if (row.kind === 'skim') return treasuryAddr;
      // a top-off goes to its pool's wallet, from the settings (pools has no wallet column: it used to ask for one, fail
      // quietly and fall back to this; found 2026-10-02 while giving the worker its own limited login)
      return env(row.game === 'slots' ? 'SLOTS_POOL_WALLET' : 'SPIN_POOL_WALLET') || missing(row.game + ' pool address');
    } });
}
const tables = ['payouts', 'pool_transfers', 'lottery_payouts'], chains = Object.fromEntries(tables.map((t) => [t, adapter(t)]));
async function pass() {
  for (const t of tables) {
    // a money table that doesn't exist in this database yet (e.g. the lottery before 011) is skipped, not an error every pass
    if (!(await db.query('select to_regclass($1) is not null as x', ['public.' + t]))[0].x) continue;
    try {
      const r = await runPayouts({ db, chain: chains[t], table: t });
      if (r.sent || r.pending || r.resigned || r.failed) console.log(new Date().toISOString(), t, JSON.stringify(r));
    } catch (e) { console.error(new Date().toISOString(), t, 'pass failed:', e.message); }
  }
}
console.log(`worker: ${env('SOLANA_CLUSTER', /devnet/.test(rpcUrl) ? 'devnet' : 'mainnet')}, keys: ${Object.entries(keys).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}`);
if (env('ONCE')) { await pass(); await sql.end(); process.exit(0); }
for (;;) { await pass(); await new Promise((r) => setTimeout(r, +env('EVERY_MS', '5000'))); }
