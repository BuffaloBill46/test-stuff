// The Games page in SERVER MODE after Cody changes the GAME SETTINGS (admin screen): new wheel, new reel counts, new jackpot
// odds, a $2 big spin and a new store item. The page must draw them all, and plays must land and re-check on the new odds.
// (Same harness as server-mode-test.mjs.) Originally: the real game server steps (server/games.js) behind the real web door
// (server/http.js, the same code the Edge Function runs) on real Postgres (PGlite) with the real 001–005 SQL.
// The page gets its credits from the server, plays through it, lands the reels on the server's result, and re-checks it.
// Needs: npm install in tests/db (PGlite) and here. Wallet payments are NOT part of this (no wallet here; FOR_MAIN_CLAUDE.md).
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path'; import http from 'http';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const { PGlite } = await import('../db/node_modules/@electric-sql/pglite/dist/index.js');
const { createGameServer } = await import('../../server/games.js');
const { makeHandler } = await import('../../server/http.js');
const { splitPayment, MINT } = await import('../../mockups/market.js');
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
const { createAdmin, adminMessage, b58encode } = await import('../../server/admin.js');
const { DEFAULT_SETTINGS, build } = await import('../../mockups/settings.js');
const server = createGameServer({ db, chain: { getTransaction: async (s) => txs.get(s) ?? null }, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, poolWallets: POOLS });
// Buy 3 Big Hat pulls the normal way (quote → a finalized payment → buy); the payment is a stand-in since there's no wallet here.
const q = await server.quote(me, 'big', 3), sp = splitPayment(q.santaRaw, 1000, FEE), b = (i, o, a) => ({ accountIndex: i, mint: MINT, owner: o, uiTokenAmount: { amount: String(a) } });
txs.set(S('1'), { blockTime: Math.floor(Date.now() / 1000), meta: { err: null, innerInstructions: [], preTokenBalances: [b(1, PLAYER, 1e13), b(2, POOLS.slots, 1e12)], postTokenBalances: [b(1, PLAYER, 1e13 - q.santaRaw), b(2, POOLS.slots, 1e12 + sp.arrives)] },
  transaction: { message: { accountKeys: [{ pubkey: PLAYER, signer: true }], instructions: [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { mint: MINT, authority: PLAYER, tokenAmount: { amount: String(sp.burn) } } } }] } } });
check((await server.buy(me, q.id, S('1'))).ok, 'test purchase');
// Cody publishes settings v1 (signed with a stand-in admin key, through the real admin code).
const akey = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']), aaddr = b58encode(new Uint8Array(await crypto.subtle.exportKey('raw', akey.publicKey)));
const adminSrv = createAdmin({ db, adminWallets: [aaddr], onSettings: () => server.settingsChanged() });
const V1 = structuredClone(DEFAULT_SETTINGS); delete V1.version;
V1.spin.main = { 0: 18, 1: 12, 2: 6, star: 4 }; V1.spin.bonus = { 3: 8, 4: 3, 5: 1 }; V1.big.jackpotOdds = 10000; V1.prices.spin100 = 2;
V1.big.counts = { ...V1.big.counts, hat: 9, coal: 24 }; V1.store.items = [{ id: 'shirt_mint', slot: 'shirt', name: 'Mint', color: 0x98e0c0, price: 0.3 }];
{ const message = adminMessage({ action: 'set-settings', game: 'all', settings: V1, at: new Date().toISOString(), nonce: 'ab'.repeat(16) });
  const sig = [...new Uint8Array(await crypto.subtle.sign('Ed25519', akey.privateKey, new TextEncoder().encode(message)))].map((x) => x.toString(16).padStart(2, '0')).join('');
  const r = await adminSrv.run({ wallet: aaddr, message, signature: sig }); check(r.ok, 'publish v1: ' + r.error); }
const M1 = build(V1).machine;
const handle = makeHandler({ server, profileFor: async (t) => (t === 'test-token' ? me : null), credits: (p) => db.query('select kind, left_n from public.credits where profile_id = $1', [p]) });
// One local address serves the page AND the game server (like the real site + Edge Function, both https in real life).
const web = http.createServer(async (req, res) => {
  if (req.method === 'GET') { const pth = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'online.html');
    if (!pth.startsWith(ROOT) || !existsSync(pth)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': pth.endsWith('.js') ? 'text/javascript' : pth.endsWith('.png') ? 'image/png' : 'text/html' }); return res.end(readFileSync(pth)); }
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await handle(new Request('http://localhost:8787' + req.url, { method: req.method, headers: req.headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }));
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8787);

// --- the page
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }); const errors = [];
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.startsWith('http://localhost:8787/')) return route.continue();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' }); return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.fulfill({ status: 503, body: 'offline in tests' }); });
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/503/.test(m.text())) errors.push(m.text()); });
// Someone else's big win, already settled on the server: it must show in this player's Recent winners list.
const other = (await db.query('insert into auth.users default values returning id'))[0].id;
await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, 'THEMwa11et11111111111111111111111111111111', 'Rudolph', '{}')`, [other]);
await db.query(`insert into public.plays (profile_id, kind, play_no, state, commit, secret, player_seed, result, pay, bet, settled_at) values ($1, 'spin', 1, 'settled', $2, 's', 'p', '{"mult":5}', 5, 1, now())`, [other, 'f'.repeat(64)]);
await p.goto('http://localhost:8787/online.html?net=local&server=' + encodeURIComponent('http://localhost:8787/api') + '&token=test-token', { timeout: 90000 });
await p.waitForFunction(() => window.__sq, null, { timeout: 60000 });
await p.evaluate(() => document.querySelector('#t-games').click()); await p.waitForFunction(() => window.__slots, null, { timeout: 90000 });
await p.waitForFunction(() => document.querySelector('#crBig').textContent === '3', null, { timeout: 15000 }).catch(() => {});
check(await p.textContent('#crBig') === '3', `the page shows the server's 3 pulls, got ${await p.textContent('#crBig')}`);
await p.waitForFunction(() => /Rudolph/.test(document.querySelector('#winList')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
const winText = (await p.textContent('#winList')).replace(/\s+/g, ' ');
check(/Rudolph/.test(winText) && /\$5\.00/.test(winText) && /5×/.test(winText), `another player's win shows in the shared list: "${winText.slice(0, 120)}"`);
check(!/wa11et/.test(winText), 'no wallet addresses on the page');
// The page draws the published settings: prices, the wheel's odds, the Big Hat's jackpot odds, the new store item.
check(/\$2/.test(await p.textContent('#spin .chip100')) && /win up to \$10/.test(await p.textContent('#spin .chip100')), 'the big spin shows $2 (win up to $10): ' + await p.textContent('#spin .chip100'));
check(/0×nowin·18of40onthewheel45\.0%/.test((await p.textContent('#oddsList')).replace(/\s+/g, '')), 'the odds legend shows the new wheel: ' + (await p.textContent('#oddsList')).slice(0, 80));
check(/1 in 10,000/.test(await p.textContent('#slots .facts')), 'the Big Hat facts show 1 in 10,000: ' + await p.textContent('#slots .facts'));
check(await p.evaluate(() => window.__spin.SLICES && window.__spin.view.shownMult !== undefined), 'wheel ready');
await p.evaluate(() => document.querySelector('#t-store').click()); await p.waitForTimeout(1500);
check(/Mint/.test(await p.textContent('#carousels')) && /\$0\.30/.test(await p.textContent('#carousels')), 'the new Mint shirt is in the store at $0.30');
await p.evaluate(() => document.querySelector('#t-games').click()); await p.waitForTimeout(800);
const shown = [];
for (let i = 0; i < 3; i++) {
  await p.evaluate(() => document.querySelector('.machine .pull').click()); await p.waitForTimeout(400);
  await p.waitForFunction(() => !window.__slots.busy, null, { timeout: 90000 });
  const proof = await p.evaluate(() => window.__credits.last.big);
  const row = (await db.query('select state, result, commit, secret from public.plays where profile_id = $1 order by id desc limit 1', [me]))[0];
  check(row.state === 'settled' && row.commit === proof.commit && row.secret === proof.secret && proof.settingsVersion === 1, `pull ${i + 1}: the page's proof is the server's play, on settings v1`);
  if (!row.result.jackpot) {
    const { gridFor, MACHINES } = await import('../../mockups/slots.js');
    const grid = gridFor(M1, row.result.stops), onScreen = await p.evaluate(() => window.__slots.view.shown());
    check(JSON.stringify(grid) === JSON.stringify(onScreen), `pull ${i + 1}: the reels show exactly the server's stops`);
  }
  shown.push(await p.textContent('.machine .res'));
}
check(await p.textContent('#crBig') === '0', 'all 3 pulls used, as the server counts them');
// ("My plays" was removed, Cody 2026-09-30: players don't need their history; every play stays in the backend log.)
check(!(await p.$('#myPlays')), 'no My plays section');
await p.evaluate(() => document.querySelector('[data-proof="big"]').click()); await p.evaluate(() => document.querySelector('#proofCheck').click());
await p.waitForFunction(() => /atch/.test(document.querySelector('#proofOut').textContent), null, { timeout: 15000 });
check(/^Matches\./.test(await p.textContent('#proofOut')), 'Check this result matches the server\'s revealed secret');
await p.evaluate(() => document.querySelector('#proofClose').click());
// No credits left: the counter opens; with no wallet connected, buying says so plainly (and nothing is charged).
await p.evaluate(() => document.querySelector('.machine .pull').click()); await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 });
await p.evaluate(() => document.querySelector('#buyGo').click());
await p.waitForFunction(() => /connected yet/.test(document.querySelector('#buyNote').textContent), null, { timeout: 15000 }).catch(() => {});
check(/Wallet payments aren't connected yet/.test(await p.textContent('#buyNote')), `buy without a wallet: "${await p.textContent('#buyNote')}"`);
const quotes = await db.query('select count(*)::int as n from public.quotes where used_by is null');
check(quotes[0].n === 1, 'the server made a quote, and nothing was bought');
await p.screenshot({ path: 'out/settings-mode.png' });
console.log('results shown:', shown.map((s) => s.slice(0, 50)).join(' | '));
console.log('errors:', errors.length ? errors : 'none');
console.log(fails.length || errors.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); web.close(); process.exit(0);
