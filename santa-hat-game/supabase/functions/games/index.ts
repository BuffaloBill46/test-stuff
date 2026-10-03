// Supabase Edge Function "games": Spin and Slots with play credits (Cody, 2026-09-30: runs on Edge Functions).
// NOT DEPLOYED YET. Thin wiring only; the logic is in server/ and mockups/ (the same files the tests run).
// Settings (Supabase → Edge Functions → Secrets). SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_DB_URL come built in.
//   SPIN_POOL_WALLET, SLOTS_POOL_WALLET  public addresses of the pool wallets (until set, buying is refused)
//   SOLANA_RPC_URL                       e.g. a Helius URL (defaults to a free public endpoint)
//   ADMIN_WALLETS                        Cody's admin wallet address(es), comma-separated (escrow admin controls)
//   SANTA_MINT                           the token to accept (leave unset for real SANTA; the test token's address on devnet)
//   LOTTERY_WALLET                       public address of the lottery wallet (until set, no lottery tickets are sold)
//   TREASURY_WALLET                      public address of the treasury (until set, the shop sells nothing: Store items, levels, tickets)
//   SOLANA_CLUSTER                       'devnet' or 'mainnet' (optional: read from SOLANA_RPC_URL otherwise)
//   TELEGRAM_BOT_TOKEN                   Cody's "Santa Hat Alerts" bot (a secret only he pastes; until set, alerts are off)
//   TELEGRAM_CHAT_ID                     optional: where alerts go (else the chat that sent the bot /start, remembered)
//   REFEREE_HEALTH_URL                   optional: the match server's health check (default https://play.santahatgames.com/health)
// Pool wallet KEYS are not used here (payouts are sent by a separate worker) and never go in the website.
// The Deno-native build of postgres.js (same API): the npm build runs through Deno's Node compatibility layer, and a fresh
// connection to the pooler sometimes froze the whole copy of this server (2026-10-03: even a 6 s timer never fired).
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createGameServer } from '../../../server/games.js';
import { makeHandler } from '../../../server/http.js';
import { createAdmin } from '../../../server/admin.js';
import { makePrice } from '../../../server/price.js';
import { makeLimiter, dbStore } from '../../../server/ratelimit.js';
import { createLevels } from '../../../server/levels.js';
import { createLottery } from '../../../server/lottery.js';
import { createShop } from '../../../server/shop.js';
import { createAlerts, makeTelegram } from '../../../server/alerts.js';
import { livePrice, liveFee } from '../../../mockups/market.js';

const env = (k: string) => Deno.env.get(k) ?? '';
// The database through Supabase's TRANSACTION POOLER when DB_POOLER_HOST is set (e.g. aws-0-us-east-1.pooler.supabase.com, from the
// dashboard's Connect panel: an address, not a secret). Found live 2026-10-02: with direct connections every copy of this function
// opened its own, a burst of ~70 requests used up the free plan's connection slots, ~1 in 7 requests failed and the speed limit
// couldn't count. The pooler shares a few real connections between all copies. Same password; user becomes postgres.<project>.
// (Only transaction-scoped locks are used, e.g. 005's pg_advisory_xact_lock, which the transaction pooler supports.)
function dbUrl(): string {
  const raw = env('SUPABASE_DB_URL'), pooler = env('DB_POOLER_HOST');
  if (!pooler) return raw;
  const u = new URL(raw), m = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  if (!m) return raw; // not the usual direct address: leave it alone
  if (u.username === 'postgres') u.username = 'postgres.' + m[1];
  u.hostname = pooler; u.port = '6543';
  return u.toString();
}
// A CONNECTION MUST ANSWER BEFORE IT CARRIES WORK (found 2026-10-03): about 1 request in 10 waited 75–150 s because a fresh
// copy of this server's first connection to the pooler sometimes never got through (the pooler never saw it; the request just
// hung, connect_timeout didn't cut it). So before a connection is used, fresh or idle over 30 s, it must answer a harmless
// "select 1" within 6 s; if it doesn't, it's dropped and a new one opened (up to 4 tries). ONLY that check is ever retried:
// real work (payments, settles, payouts) never runs twice, it just only runs on a connection that has just answered.
// One connection per copy (max 1): a copy serves few requests at once, and every connection it uses is a checked one.
const newClient = () => postgres(dbUrl(), { prepare: false, max: 1, connect_timeout: 10 });
let sql = newClient(), answeredAt = 0;
async function ready() {
  if (Date.now() - answeredAt < 30_000) return sql;
  for (let i = 1; i <= 4; i++) {
    const c = sql; let timer: ReturnType<typeof setTimeout> | undefined;
    const ok = await Promise.race([c`select 1`.then(() => true, () => false), new Promise<boolean>((r) => { timer = setTimeout(() => r(false), 6000); })]);
    clearTimeout(timer);
    if (ok) { answeredAt = Date.now(); return c; }
    console.warn(`db: connection didn't answer in 6 s (try ${i} of 4): opening a fresh one`);
    if (sql === c) { c.end({ timeout: 0 }).catch(() => {}); sql = newClient(); }
  }
  return sql; // four fresh connections failed: let the real work try (and report its own error)
}
const seen = <T>(p: Promise<T>) => p.then((r) => { answeredAt = Date.now(); return r; });
const db = {
  query: async (q: string, p: unknown[] = []) => seen((await ready()).unsafe(q, p as never[])),
  tx: async (fn: (t: { query: (q: string, p?: unknown[]) => Promise<unknown[]> }) => Promise<unknown>) =>
    seen((await ready()).begin((t: any) => fn({ query: (q: string, p: unknown[] = []) => t.unsafe(q, p as never[]) }))),
};
const rpcUrl = env('SOLANA_RPC_URL') || 'https://solana-rpc.publicnode.com';
const chain = {
  async getTransaction(signature: string) {
    const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [signature, { encoding: 'jsonParsed', commitment: 'finalized', maxSupportedTransactionVersion: 0 }] }) });
    return (await r.json()).result ?? null; // null until finalized
  },
};
// The newest FINALIZED block (the lottery mixes its hash into each draw, taken after sales closed).
async function latestBlock() {
  const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'finalized' }] }) });
  const j = await r.json(); if (!j.result) throw new Error('no blockhash from the network');
  return { blockhash: j.result.value.blockhash, slot: j.result.context.slot };
}
const auth = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
// The game prices plays with the 10-minute median, not one live reading (audit: price manipulation).
const poolWallets = { spin: env('SPIN_POOL_WALLET') || null, slots: env('SLOTS_POOL_WALLET') || null }, mintOpt = env('SANTA_MINT') ? { mint: env('SANTA_MINT') } : {};
// The tax is read from the token this server accepts, on its own network (the test token on devnet), not always real SANTA.
const feeOfMint = () => liveFee(env('SANTA_MINT') || undefined, [rpcUrl]);
// The network the page signs on: SOLANA_CLUSTER if set, else read from the RPC address (a devnet URL says devnet).
const cluster = env('SOLANA_CLUSTER') || (/devnet/.test(rpcUrl) ? 'devnet' : 'mainnet');
const server = createGameServer({ db, chain, livePrice: makePrice({ db, livePrice }), liveFee: feeOfMint, poolWallets, ...mintOpt, cluster });

// Speed limit: counts in the database (table rate_hits, supabase/007_rate_limits.sql: apply it with 005), because each call
// here may run in a fresh copy that remembers nothing. On the planned always-on game server: memoryStore() instead (one line).
// The caller's address: the first x-forwarded-for entry (the http.js default). CHECK ON THE LIVE FUNCTION that this entry is
// the real visitor and can't be set by them (FOR_MAIN_CLAUDE); if not, pass addressOf here.
const limiter = makeLimiter({ store: dbStore(db) });

// Alerts to Cody's Telegram (server/alerts.js; supabase/021): pool wallets read on the chain for the books check.
async function walletRaw(game: string) {
  const owner = poolWallets[game as 'spin' | 'slots']; if (!owner) return null;
  const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner',
    params: [owner, { mint: env('SANTA_MINT') || '3c7mmVSyEH8jfZXgxvpLsETtko1Y16DyRJ5XYB4snhGt' }, { encoding: 'jsonParsed', commitment: 'finalized' }] }),
    signal: AbortSignal.timeout(15000) }); // a stalled network answer must not hold the 5-minute alert run (it once took 75 s on devnet)
  const j = await r.json(); if (!j.result) throw new Error('no balance from the network');
  return (j.result.value || []).reduce((a: number, x: any) => a + Number(x.account.data.parsed.info.tokenAmount.amount), 0);
}
async function refereeHealth() {
  const r = await fetch(env('REFEREE_HEALTH_URL') || 'https://play.santahatgames.com/health', { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('health answered ' + r.status);
}
const alerts = createAlerts({ db, telegram: makeTelegram({ token: env('TELEGRAM_BOT_TOKEN'), chatId: env('TELEGRAM_CHAT_ID') || null, db }), walletRaw, refereeHealth });

Deno.serve(makeHandler({
  alerts,
  server,
  limiter,
  levels: createLevels({ db }), // progress + Auto match finishes (needs supabase/010_levels.sql)
  // The shop (needs supabase/016_shop.sql and the TREASURY_WALLET setting; until set, nothing is sold).
  shop: createShop({ db, chain, livePrice: makePrice({ db, livePrice }), liveFee: feeOfMint, treasury: env('TREASURY_WALLET') || null, ...mintOpt, cluster }),
  // The Santa Lottery (needs supabase/011_lottery.sql and the LOTTERY_WALLET setting; until set, no tickets are sold).
  lottery: createLottery({ db, chain: { ...chain, latestBlock }, livePrice: makePrice({ db, livePrice }), liveFee: feeOfMint, wallet: env('LOTTERY_WALLET') || null, ...mintOpt, cluster }),
  admin: createAdmin({ db, adminWallets: env('ADMIN_WALLETS').split(',').map((s) => s.trim()).filter(Boolean), onSettings: () => server.settingsChanged(), chain, poolWallets: { ...poolWallets, lottery: env('LOTTERY_WALLET') || null, treasury: env('TREASURY_WALLET') || null }, ...mintOpt }), // chain: to check Cody's deposits
  async profileFor(token: string) {
    const { data, error } = await auth.auth.getUser(token);
    if (error || !data.user) return null;
    const rows = await db.query('select profile_id from public.logins where user_id = $1', [data.user.id]) as unknown as { profile_id: string }[];
    return rows[0]?.profile_id ?? null;
  },
}));
