// The Games page in SERVER MODE, end to end: the real game server steps (server/games.js) behind the real web door
// (server/http.js, the same code the Edge Function runs) on real Postgres (PGlite) with the real 001–005 SQL.
// The page buys a run through the server, plays it, lands the reels on the server's result, and re-checks it.
// Needs: npm install in tests/db (PGlite) and here. Wallet payments are NOT part of this (no wallet here; FOR_MAIN_CLAUDE.md).
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path'; import http from 'http';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const { PGlite } = await import('../db/node_modules/@electric-sql/pglite/dist/index.js');
const { createGameServer } = await import('../../server/games.js');
const { makeHandler } = await import('../../server/http.js');
const { makeLimiter, memoryStore } = await import('../../server/ratelimit.js');
const { splitPayment, MINT } = await import('../../mockups/market.js');
const PORT = Number(process.env.PORT) || 8787; // another port when 8787 is busy: PORT=8797 node server-mode-test.mjs
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); };

// --- the server: real SQL, stand-in chain and price (fixed so the test is repeatable)
const pg = new PGlite();
await pg.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), last_sign_in_at timestamptz);
  create table auth.identities (id uuid primary key default gen_random_uuid(), provider_id text, user_id uuid references auth.users, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
for (const f of ['001_profiles.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql']) await pg.exec(readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8'));
const db = { query: async (q, p) => (await pg.query(q, p)).rows, tx: (fn) => pg.transaction((t) => fn({ query: async (q, p) => (await t.query(q, p)).rows })) };
const PLAYER = 'PLAYERwa11et111111111111111111111111111111', POOLS = { spin: 'SPINpoo1wa11et11111111111111111111111111111', slots: 'SLOTSpoo1wa11et1111111111111111111111111111' };
const PRICE = 0.00085, FEE = { bps: 300, max: 1e15 };
const me = (await db.query('insert into auth.users default values returning id'))[0].id;
await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, $2, 'Cody', '{}')`, [me, PLAYER]);
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', $1, '{}'), ('slots', $2, '{}')`, [Math.round(50 / PRICE * 1e6), Math.round(500 / PRICE * 1e6)]);
// fake but realistically shaped Solana transaction signatures (base58, 88 characters)
const S = (name) => (name + '5'.repeat(88)).slice(0, 88).replace(/[0OIl]/g, '9');
const txs = new Map();
const server = createGameServer({ retired: [], db, chain: { getTransaction: async (s) => txs.get(s) ?? null }, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, poolWallets: POOLS });
// The stand-in wallet: when the page asks it to pay a quote, it "sends" the payment and returns its signature (the chain
// stand-in then reports a finalized transaction: the player's SANTA down, 10% burned, the rest arriving in the pool).
let paid = 0;
function payFor(q) {
  const sig = S('Pay' + 'abcdefgh'[paid++]), sp = splitPayment(q.santaRaw, 1000, FEE), b = (i, o, a) => ({ accountIndex: i, mint: MINT, owner: o, uiTokenAmount: { amount: String(a) } });
  txs.set(sig, { blockTime: Math.floor(Date.now() / 1000), meta: { err: null, innerInstructions: [], preTokenBalances: [b(1, PLAYER, 1e13), b(2, q.pool, 1e12)], postTokenBalances: [b(1, PLAYER, 1e13 - q.santaRaw), b(2, q.pool, 1e12 + sp.arrives)] },
    transaction: { message: { accountKeys: [{ pubkey: PLAYER, signer: true }], instructions: [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { mint: MINT, authority: PLAYER, tokenAmount: { amount: String(sp.burn) } } } }] } } });
  return sig;
}
// The busiest 10-second window the real page produced (per player and per connection), to prove the limit is really counting.
const busiest = { player: 0, ip: 0 }, mem = memoryStore();
const watched = { hit: async (key, w, t) => { const n = await mem.hit(key, w, t), k = key.split(':')[0]; busiest[k] = Math.max(busiest[k], n); return n; } };
// The real server always has a lottery (supabase/functions/games/index.ts); without one the page's public "lottery" request got
// 400 "unknown action". This payment test needs no real draws (lottery-test.mjs covers them), so: none open.
const noDraws = { draws: async () => ({ open: [], recent: [] }), tickets: async () => ({ error: 'no such draw' }) };
const noShop = { tickets: async () => ({ free: 7, extra: 2, held: 0, resetsAt: Date.now() + 5 * 3600e3 }) }; // the ticket chip (shop-db.test.mjs covers the real one)
const handle = makeHandler({ lottery: noDraws, shop: noShop, limiter: makeLimiter({ store: watched }), server, profileFor: async (t) => (t === 'test-token' ? me : null) }); // the real speed limit and numbers: a player clicking through must never be slowed
// One local address serves the page AND the game server (like the real site + Edge Function, both https in real life).
const web = http.createServer(async (req, res) => {
  if (req.method === 'GET') { const pth = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'online.html');
    if (!pth.startsWith(ROOT) || !existsSync(pth)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': pth.endsWith('.js') ? 'text/javascript' : pth.endsWith('.png') ? 'image/png' : 'text/html' }); return res.end(readFileSync(pth)); }
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await handle(new Request('http://localhost:' + PORT + '' + req.url, { method: req.method, headers: req.headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }));
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT);

// --- the page
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }); const errors = [];
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.startsWith('http://localhost:' + PORT + '/')) return route.continue();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' }); return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.fulfill({ status: 503, body: 'offline in tests' }); });
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/503/.test(m.text())) errors.push(m.text()); });
// Someone else's big win, already settled on the server: it must show in this player's Recent winners list.
const other = (await db.query('insert into auth.users default values returning id'))[0].id;
await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, 'THEMwa11et11111111111111111111111111111111', 'Rudolph', '{}')`, [other]);
const rq = (await db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'spin', 1, 1, 1, 1, 0.00085) returning id`, [other]))[0].id;
const rrun = (await db.query(`select public.buy_run($1, $2, 1, 0, 0, 0) as id`, [rq, 'RUDOLPH' + '5'.repeat(81)]))[0].id;
await db.query(`update public.plays set state = 'settled', commit = $2, secret = 's', player_seed = 'p', result = '{"mult":5}', pay = 5, settled_at = now() where run_id = $1`, [rrun, 'f'.repeat(64)]);
await p.goto('http://localhost:' + PORT + '/online.html?net=local&server=' + encodeURIComponent('http://localhost:' + PORT + '/api') + '&token=test-token', { timeout: 90000 });
await p.waitForFunction(() => window.__sq, null, { timeout: 60000 });
await p.evaluate(() => document.querySelector('#t-games').click()); await p.waitForFunction(() => window.__slots, null, { timeout: 90000 });
await p.waitForFunction(() => /Rudolph/.test(document.querySelector('#winList')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
// The price + tax line comes from the server (its stand-in price $0.00085 is nothing like the real market's).
await p.waitForFunction(() => /0\.000850/.test(document.querySelector('#liveMarket')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
const mk = await p.evaluate(() => document.querySelector('#liveMarket')?.textContent || '');
check(/\$0\.000850/.test(mk) && /tax 3%/.test(mk), 'the price/tax line should come from the server: ' + mk);
// Button-audit fixes (2026-10-02): this server says mainnet, so no "Test version / nothing can be bought" notes; the ticket chip
// shows my tickets; a practice match keeps ?server= in the address (a reload used to fall back to the demo); a wallet step that
// can't load says so in plain English.
check(await p.waitForFunction(() => [...document.querySelectorAll('.testnote')].every((n) => n.hidden), null, { timeout: 15000 }).then(() => true, () => false), 'mainnet server: the "Test version" notes are hidden');
check(await p.waitForFunction(() => /^\d+\/10/.test(document.querySelector('#tixchip b')?.textContent || ''), null, { timeout: 15000 }).then(() => true, () => false), 'the ticket chip shows my tickets: ' + await p.evaluate(() => document.querySelector('#tixchip b')?.textContent));
await p.evaluate(() => { window.__sq.startPractice(); window.__sq.leaveRoom(); });
check(/server=/.test(await p.evaluate(() => location.search)), 'leaving a match keeps ?server= in the address: ' + await p.evaluate(() => location.search));
check(await p.evaluate(async () => (await import('./gameserver.js')).payError(new Error('Failed to fetch dynamically imported module: https://cdn.jsdelivr.net/x'))) === "Couldn't load the wallet step. Check your connection and try again. Nothing was charged.", 'a wallet step that cannot load: plain English');
const winText = (await p.textContent('#winList')).replace(/\s+/g, ' ');
check(/Rudolph/.test(winText) && /\$5\.00/.test(winText) && /5×/.test(winText), `another player's win shows in the shared list: "${winText.slice(0, 120)}"`);
check(!/wa11et/.test(winText), 'no wallet addresses on the page');
// Pull 5 through the server: the page asks for a price, the wallet pays, the server checks the payment, makes the 5 plays
// and their secrets, and the page plays them; the run's winnings become ONE payout to the player's wallet.
await p.exposeFunction('testPay', (q) => payFor(q));
await p.evaluate(() => { window.santaPay = (q) => window.testPay(q); });
await p.evaluate(() => document.querySelector('#slots [data-run="5"]').click());
await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 });
await p.evaluate(() => document.querySelector('#buyGo').click());
await p.waitForFunction(() => window.__slots.busy, null, { timeout: 15000 }).catch(() => {});
await p.waitForTimeout(800); await p.evaluate(() => document.querySelector('#slots .skip:not([hidden])')?.click());
await p.waitForFunction(() => !window.__slots.busy, null, { timeout: 400000 });
const shown = [await p.textContent('.machine .res')];
const run = (await db.query('select * from public.runs where profile_id = $1 order by id desc limit 1', [me]))[0];
check(run && run.n === 5 && run.paid_at, 'the server recorded the run of 5 and finished it');
const rows = await db.query('select id, state, result, commit, secret, pay_raw from public.plays where run_id = $1 order by play_no', [run.id]);
check(rows.length === 5 && rows.every((x) => x.state === 'settled'), 'all 5 plays settled on the server');
const proof = await p.evaluate(() => window.__credits.last.big);
check(rows.at(-1).commit === proof.commit && rows.at(-1).secret === proof.secret, "the page's last proof is the server's last play");
if (!rows.at(-1).result.jackpot) {
  const { gridFor, MACHINES } = await import('../../mockups/slots.js');
  check(JSON.stringify(gridFor(MACHINES.big, rows.at(-1).result.stops)) === JSON.stringify(await p.evaluate(() => window.__slots.view.shown())), "the reels show exactly the server's last stops");
}
const wonRaw = rows.reduce((a, x) => a + +x.pay_raw, 0), payouts = await db.query('select amount_raw, to_wallet, status from public.payouts where run_id = $1', [run.id]);
check(wonRaw ? payouts.length === 1 && +payouts[0].amount_raw === wonRaw && payouts[0].to_wallet === PLAYER : payouts.length === 0, `ONE payout of the run's winnings to the player's wallet (${wonRaw} raw)`);
check(/^5 pulls: (no win|\$[\d.]+ back · sent to your wallet)/.test(shown[0]), `the run summary: ${shown[0]}`);
// ("My plays" was removed, Cody 2026-09-30: players don't need their history; every play stays in the backend log.)
check(!(await p.$('#myPlays')), 'no My plays section');
await p.evaluate(() => document.querySelector('[data-proof="big"]').click()); await p.evaluate(() => document.querySelector('#proofCheck').click());
await p.waitForFunction(() => /atch/.test(document.querySelector('#proofOut').textContent), null, { timeout: 15000 });
check(/^Matches\./.test(await p.textContent('#proofOut')), 'Check this result matches the server\'s revealed secret');
await p.evaluate(() => document.querySelector('#proofClose').click());
// With no wallet connected, buying says so plainly, and nothing is charged or played.
await p.evaluate(() => { delete window.santaPay; document.querySelector('#slots [data-run="1"]').click(); });
await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 });
await p.evaluate(() => document.querySelector('#buyGo').click());
await p.waitForFunction(() => /connected yet/.test(document.querySelector('#buyNote').textContent), null, { timeout: 15000 }).catch(() => {});
check(/Wallet payments aren't connected yet/.test(await p.textContent('#buyNote')), `buy without a wallet: "${await p.textContent('#buyNote')}"`);
const quotes = await db.query('select count(*)::int as n from public.quotes where used_by is null');
check(quotes[0].n === 1, 'the server made a quote, and nothing was bought');
await p.evaluate(() => document.querySelector('#buyCancel').click());
await p.screenshot({ path: 'out/server-mode.png' });
console.log('results shown:', shown.map((s) => s.slice(0, 50)).join(' | '));
check(busiest.player > 0 && busiest.ip > 0, 'the speed limit counted the page\'s requests (it was really in the path)');
check(busiest.player <= 40 / 2 && busiest.ip <= 60 / 2, `a real player stays under half the speed limit (busiest 10 s: ${busiest.player} per player, ${busiest.ip} per connection)`);
console.log(`speed limit: busiest 10 s from the real page: ${busiest.player} requests per player (limit 40), ${busiest.ip} per connection (limit 60)`);
console.log('errors:', errors.length ? errors : 'none');
console.log(fails.length || errors.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); web.close(); process.exit(0);
