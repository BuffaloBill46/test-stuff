// THE GAME SERVER ON THE DROPLET (Cody, 2026-10-03: "it makes sense"). The same game server as the Supabase Edge Function
// (supabase/functions/games/index.ts: the same server/*.js and mockups/*.js, the same makeHandler), run as one always-on Node
// program behind Caddy at https://api.santahatgames.com. Why: on Supabase, a fresh copy of the function was started for almost
// every request, and about 1 request in 10 froze for 75–150 s while that fresh copy made its first database connection (found
// and measured 2026-10-03; a bare function and a database-only function never froze). One always-on program keeps one checked
// connection and has no fresh copies.
// Differences from the Edge Function, on purpose:
//   * sign-ins are checked like the match server does (Supabase /auth/v1/user with the public key + the player's own token), so
//     this Droplet never holds the service-role key;
//   * the speed limit counts in this program's memory (memoryStore: one program), with no database write before every request;
//   * the visitor's address is Caddy's (x-forwarded-for is only trusted from 127.0.0.1, as worker/referee.mjs does);
//   * its own database login santa_games (supabase/031), password only in /etc/santa/games.env (a SCRAM hash in the database).
// Settings (environment; /etc/santa/games.env on the Droplet, never in the repo): DATABASE_URL, SOLANA_RPC_URL, SANTA_MINT,
// SPIN_POOL_WALLET, SLOTS_POOL_WALLET, LOTTERY_WALLET, TREASURY_WALLET, ADMIN_WALLETS, SOLANA_CLUSTER, TELEGRAM_BOT_TOKEN,
// TELEGRAM_CHAT_ID, REFEREE_HEALTH_URL, SUPABASE_URL, SUPABASE_KEY (publishable), PORT (default 8082), HOST (127.0.0.1).
import http from 'node:http';
import { JSONB } from './pgjson.mjs';
import postgres from 'postgres';
import { createGameServer } from '../server/games.js';
import { makeHandler } from '../server/http.js';
import { createAdmin } from '../server/admin.js';
import { makePrice } from '../server/price.js';
import { makeLimiter, memoryStore } from '../server/ratelimit.js';
import { createLevels } from '../server/levels.js';
import { createLottery } from '../server/lottery.js';
import { createShop } from '../server/shop.js';
import { makeRelay } from '../server/relay.js';
import { createSeasons } from '../server/seasons.js';
import { createAlerts, makeTelegram } from '../server/alerts.js';
import { livePrice, liveFee, keptFee, liveSolPrice } from '../mockups/market.js';
import { existsSync } from 'fs';

const env = (k, d = '') => process.env[k] || d;
if (!env('DATABASE_URL')) { console.error('games: DATABASE_URL is not set'); process.exit(2); }
// One long-lived connection pool; a connection must answer quickly before it carries work (the same rule as the Edge Function:
// only a harmless "select 1" is ever retried, real work never runs twice).
const newClient = () => postgres(env('DATABASE_URL'), { prepare: false, max: 4, connect_timeout: 10, ...JSONB });
let sql = newClient(), answeredAt = 0;
async function ready() {
  if (Date.now() - answeredAt < 30_000) return sql;
  for (let i = 1; i <= 4; i++) {
    const c = sql; let timer;
    const ok = await Promise.race([c`select 1`.then(() => true, () => false), new Promise((r) => { timer = setTimeout(() => r(false), 6000); })]);
    clearTimeout(timer);
    if (ok) { answeredAt = Date.now(); return c; }
    console.warn(`games: database connection didn't answer in 6 s (try ${i} of 4): opening a fresh one`);
    if (sql === c) { c.end({ timeout: 0 }).catch(() => {}); sql = newClient(); }
  }
  return sql;
}
const seen = (p) => p.then((r) => { answeredAt = Date.now(); return r; });
const db = {
  query: async (q, p = []) => seen((await ready()).unsafe(q, p)),
  tx: async (fn) => seen((await ready()).begin((t) => fn({ query: (q, p = []) => t.unsafe(q, p) }))),
};

const rpcUrl = env('SOLANA_RPC_URL', 'https://solana-rpc.publicnode.com');
const rpc = async (method, params, ms = 20000) => (await (await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(ms) })).json());
const chain = {
  tokenBalance: (owner) => tokenRaw(owner, 'confirmed'), // a player's own wallet, under the games (server/games.js wallet)
  async getTransaction(signature) {
    return (await rpc('getTransaction', [signature, { encoding: 'jsonParsed', commitment: 'finalized', maxSupportedTransactionVersion: 0 }])).result ?? null; // null until finalized
  },
};
// The newest FINALIZED block (the lottery mixes its hash into each draw, taken after sales closed).
async function latestBlock() {
  const j = await rpc('getLatestBlockhash', [{ commitment: 'finalized' }]); if (!j.result) throw new Error('no blockhash from the network');
  return { blockhash: j.result.value.blockhash, slot: j.result.context.slot };
}
const poolWallets = { spin: env('SPIN_POOL_WALLET') || null, slots: env('SLOTS_POOL_WALLET') || null }, mintOpt = env('SANTA_MINT') ? { mint: env('SANTA_MINT') } : {};
const feeOfMint = keptFee(() => liveFee(env('SANTA_MINT') || undefined, [rpcUrl])); // remembered a minute (market.js keptFee)
const cluster = env('SOLANA_CLUSTER') || (/devnet/.test(rpcUrl) ? 'devnet' : 'mainnet');
const price = makePrice({ db, livePrice });
setInterval(() => price().catch(() => {}), 61_000); // a price sample every minute even when nobody plays (server/price.js MIN_SAMPLES)
price().catch(() => {});
const solPrice = keptFee(liveSolPrice); // paying with SOL (mainnet only): the SOL price, remembered a minute, shared by all three
const server = createGameServer({ db, chain, livePrice: price, liveFee: feeOfMint, poolWallets, ...mintOpt, cluster, liveSol: solPrice });

// Alerts to Cody's Telegram (server/alerts.js; supabase/021): pool wallets read on the chain for the books check.
// The SANTA (smallest units) a wallet holds, across its token accounts. finalized: the books check; confirmed: what a player sees.
async function tokenRaw(owner, commitment = 'finalized') {
  const j = await rpc('getTokenAccountsByOwner', [owner, { mint: env('SANTA_MINT') || '3c7mmVSyEH8jfZXgxvpLsETtko1Y16DyRJ5XYB4snhGt' }, { encoding: 'jsonParsed', commitment }], 15000);
  if (!j.result) throw new Error('no balance from the network');
  return (j.result.value || []).reduce((a, x) => a + Number(x.account.data.parsed.info.tokenAmount.amount), 0);
}
async function walletRaw(game) {
  const owner = poolWallets[game]; if (!owner) return null;
  return tokenRaw(owner);
}
async function refereeHealth() {
  const r = await fetch(env('REFEREE_HEALTH_URL', 'https://play.santahatgames.com/health'), { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('health answered ' + r.status);
}
const alerts = createAlerts({ db, telegram: makeTelegram({ token: env('TELEGRAM_BOT_TOKEN'), chatId: env('TELEGRAM_CHAT_ID') || null, db }), walletRaw, refereeHealth });

// Sign-ins: Supabase checks the player's token (public key + their token, as worker/referee.mjs does), then their profile.
const SB_URL = env('SUPABASE_URL', 'https://olganobdypnxfpmsxibe.supabase.co');
const SB_KEY = env('SUPABASE_KEY', 'sb_publishable_eLn_YYzLDOTuUAOTZLeyKQ_PLGT8B6N'); // publishable: meant to be public
async function profileFor(token) {
  const r = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: SB_KEY, authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const user = await r.json(); if (!user?.id) return null;
  const rows = await db.query('select profile_id from public.logins where user_id = $1', [user.id]);
  return rows[0]?.profile_id ?? null;
}

const handle = makeHandler({
  alerts, server,
  limiter: makeLimiter({ store: memoryStore() }),
  levels: createLevels({ db }),
  seasons: createSeasons({ db }), // my season: daily tasks, doors, pass (server/seasons.js)
  shop: createShop({ db, chain, livePrice: price, liveFee: feeOfMint, treasury: env('TREASURY_WALLET') || null, ...mintOpt, cluster,
    rankedPaused: () => existsSync(env('RANKED_PAUSE_FILE') || '/etc/santa/ranked-paused'), // no ticket sales while ranked is paused
    liveSol: solPrice }),
  lottery: createLottery({ db, chain: { ...chain, latestBlock }, livePrice: price, liveFee: feeOfMint, wallet: env('LOTTERY_WALLET') || null, ...mintOpt, cluster, liveSol: solPrice }),
  admin: createAdmin({ db, adminWallets: env('ADMIN_WALLETS').split(',').map((s) => s.trim()).filter(Boolean), onSettings: () => server.settingsChanged(), onWeekly: () => server.weeklyChanged(), chain,
    poolWallets: { ...poolWallets, lottery: env('LOTTERY_WALLET') || null, treasury: env('TREASURY_WALLET') || null }, ...mintOpt }),
  relay: makeRelay((method, params) => rpc(method, params, 15000)), // the page's backup Solana reads (read-only, signed in)
  profileFor,
});

// Node's HTTP request → a web Request (what makeHandler takes) → its Response back. The visitor's address: Caddy's x-forwarded-for,
// trusted only when the connection comes from this machine (Caddy), else the socket's own address.
const PORT = +env('PORT', '8082'), HOST = env('HOST', '127.0.0.1'), MAX_BODY = 64 * 1024;
http.createServer(async (req, res) => {
  try {
    const direct = req.socket.remoteAddress || '', local = /^(::ffff:)?127\.0\.0\.1$|^::1$/.test(direct);
    // the LAST entry: Caddy appends the address it saw, so a visitor can't pick their own by sending an x-forwarded-for
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim();
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > MAX_BODY) { res.writeHead(413); return res.end(); } chunks.push(c); }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (k !== 'x-forwarded-for' && v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    headers.set('x-forwarded-for', local && xff ? xff : direct);
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
    if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true}'); }
    const r = await handle(new Request('https://api.santahatgames.com' + req.url, { method: req.method, headers, body }));
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { console.error('games: request failed', e); if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' }); res.end('{"error":"something went wrong on our side; please try again"}'); }
}).listen(PORT, HOST, () => console.log(`games: listening on ${HOST}:${PORT} (${cluster})`));
