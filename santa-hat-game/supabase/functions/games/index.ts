// Supabase Edge Function "games": Spin and Slots with play credits (Cody, 2026-09-30: runs on Edge Functions).
// NOT DEPLOYED YET. Thin wiring only; the logic is in server/ and mockups/ (the same files the tests run).
// Settings (Supabase → Edge Functions → Secrets). SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_DB_URL come built in.
//   SPIN_POOL_WALLET, SLOTS_POOL_WALLET  public addresses of the pool wallets (until set, buying is refused)
//   SOLANA_RPC_URL                       e.g. a Helius URL (defaults to a free public endpoint)
//   ADMIN_WALLETS                        Cody's admin wallet address(es), comma-separated (escrow admin controls)
//   SANTA_MINT                           the token to accept (leave unset for real SANTA; the test token's address on devnet)
// Pool wallet KEYS are not used here (payouts are sent by a separate worker) and never go in the website.
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createGameServer } from '../../../server/games.js';
import { makeHandler } from '../../../server/http.js';
import { createAdmin } from '../../../server/admin.js';
import { makePrice } from '../../../server/price.js';
import { makeLimiter, dbStore } from '../../../server/ratelimit.js';
import { livePrice, liveFee } from '../../../mockups/market.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const sql = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 3 });
const db = {
  query: (q: string, p: unknown[] = []) => sql.unsafe(q, p as never[]),
  tx: (fn: (t: { query: (q: string, p?: unknown[]) => Promise<unknown[]> }) => Promise<unknown>) =>
    sql.begin((t) => fn({ query: (q: string, p: unknown[] = []) => t.unsafe(q, p as never[]) })),
};
const rpcUrl = env('SOLANA_RPC_URL') || 'https://solana-rpc.publicnode.com';
const chain = {
  async getTransaction(signature: string) {
    const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [signature, { encoding: 'jsonParsed', commitment: 'finalized', maxSupportedTransactionVersion: 0 }] }) });
    return (await r.json()).result ?? null; // null until finalized
  },
};
const auth = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
// The game prices plays with the 10-minute median, not one live reading (audit: price manipulation).
const poolWallets = { spin: env('SPIN_POOL_WALLET') || null, slots: env('SLOTS_POOL_WALLET') || null }, mintOpt = env('SANTA_MINT') ? { mint: env('SANTA_MINT') } : {};
const server = createGameServer({ db, chain, livePrice: makePrice({ db, livePrice }), liveFee, poolWallets, ...mintOpt });

// Speed limit: counts in the database (table rate_hits, supabase/007_rate_limits.sql: apply it with 005), because each call
// here may run in a fresh copy that remembers nothing. On the planned always-on game server: memoryStore() instead (one line).
// The caller's address: the first x-forwarded-for entry (the http.js default). CHECK ON THE LIVE FUNCTION that this entry is
// the real visitor and can't be set by them (FOR_MAIN_CLAUDE); if not, pass addressOf here.
const limiter = makeLimiter({ store: dbStore(db) });

Deno.serve(makeHandler({
  server,
  limiter,
  admin: createAdmin({ db, adminWallets: env('ADMIN_WALLETS').split(',').map((s) => s.trim()).filter(Boolean), onSettings: () => server.settingsChanged(), chain, poolWallets, ...mintOpt }), // chain: to check Cody's deposits
  async profileFor(token: string) {
    const { data, error } = await auth.auth.getUser(token);
    if (error || !data.user) return null;
    const rows = await db.query('select profile_id from public.logins where user_id = $1', [data.user.id]) as unknown as { profile_id: string }[];
    return rows[0]?.profile_id ?? null;
  },
}));
