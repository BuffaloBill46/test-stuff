// The admin screen (admin.html) driven like Cody would: connect wallet, Stop a pool, try a bad setting, save a good one.
// Real server code + real SQL behind it; a stand-in wallet signs with a real Ed25519 key (as Phantom's signMessage would).
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path'; import http from 'http';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const { makeDb, directRun, FILES } = await import('../db/setup.mjs');
const { createGameServer } = await import('../../server/games.js');
const { makeHandler } = await import('../../server/http.js');
const { makeLimiter, memoryStore } = await import('../../server/ratelimit.js');
const { createAdmin, b58encode } = await import('../../server/admin.js');
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, m) => { if (!ok) fails.push(m); };

const db = await makeDb([...FILES, '010_levels.sql', '011_lottery.sql']); // + levels and the lottery (manual payouts panel)
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', 58823529411, '{}'), ('slots', 588235294117, '{}')`);
await db.query(`insert into public.pool_transfers (game, kind, amount_raw, status) values ('slots', 'top-off', 411764705882, 'needs_approval')`);
// A frozen payout (an impossible $5,000 from one $1 pull: a fault, never a real win), so the screen must show it with Release.
const holly = await db.player('HoLLYwa11et11111111111111111111111111111111', 'Holly');
{ const q = (await db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'big', 1, 1, 1, 1, 0.00085) returning id`, [holly]))[0].id;
  const run = +(await db.query(`select public.buy_run($1, $2, 1, 0, 0, 0) as id`, [q, 'FROZEN' + '5'.repeat(80)]))[0].id;
  const pl = (await db.query('select id from public.plays where run_id = $1', [run]))[0].id;
  await db.query(`select public.lock_play($1, $2, 's')`, [pl, 'c'.repeat(64)]);
  await db.query(`select public.settle_play($1, 'x', '{"stops":[1,2,3,4,5]}', 5000, 5882352941176, 0.00085, 0, 0, 'w', 0)`, [pl]);
  await db.query(`select public.finish_run($1, 'HoLLYwa11et11111111111111111111111111111111', 1101.51)`, [run]); }
// A drawn lottery whose winner (Holly) waits to be paid by hand.
{ const d = (await db.query(`insert into public.lottery_draws (kind, draws_at, commit, secret, status, blockhash, block_slot, drawn_at, pot_raw, tickets) values ('weekly-100', now() - interval '1 hour', $1, 's', 'drawn', 'bh', 1, now(), 1234567890, 3) returning id`, ['d'.repeat(64)]))[0].id;
  await db.query(`insert into public.lottery_payouts (draw_id, place, profile_id, to_wallet, amount_raw, status) values ($1, 1, $2, 'HoLLYwa11et11111111111111111111111111111111', 1234567890, 'manual')`, [d, holly]); }
// A scripted player for the Possible bots box: 35 runs, each started 2.0 s after the last one ended.
const speedy = await db.player('SpeedYwa11et1111111111111111111111111111111', 'Speedy');
{ let t = Date.now() - 3600e3;
  for (let i = 0; i < 35; i++) { const { run } = await directRun(db, speedy, 'spin', 1, 1), paid = t + 18000 + (i % 3) * 1000;
    await db.query(`update public.quotes set created_at = $2 where id = (select pa.quote_id from public.runs r join public.payments pa on pa.signature = r.signature where r.id = $1)`, [run, new Date(t)]);
    await db.query('update public.runs set paid_at = $2 where id = $1', [run, new Date(paid)]); t = paid + 2000 + (i % 2) * 40; } }
const key = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const addr = b58encode(new Uint8Array(await crypto.subtle.exportKey('raw', key.publicKey)));
const pkcs8 = [...new Uint8Array(await crypto.subtle.exportKey('pkcs8', key.privateKey))];
const server = createGameServer({ retired: [], db, chain: {}, livePrice: async () => ({ usd: 0.00085 }), liveFee: async () => ({ bps: 300, max: 1e15 }), poolWallets: {} });
const handle = makeHandler({ limiter: makeLimiter({ store: memoryStore() }), server, admin: createAdmin({ db, adminWallets: [addr], onSettings: () => server.settingsChanged() }), profileFor: async () => null }); // the real speed limit and numbers: a player clicking through must never be slowed
const web = http.createServer(async (req, res) => {
  if (req.method === 'GET') { const f = path.join(ROOT, req.url.split('?')[0]); if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); return res.end(readFileSync(f)); }
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await handle(new Request('http://localhost:8788' + req.url, { method: req.method, headers: req.headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }));
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8788);

const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }); const errors = [];
await ctx.route('**/*', (route) => (route.request().url().startsWith('http://localhost:8788/') ? route.continue() : route.fulfill({ status: 503, body: '' })));
// The stand-in wallet: Phantom's shape (connect, publicKey, signMessage), signing with the real key.
await ctx.addInitScript(({ pkcs8, addr }) => {
  const kp = crypto.subtle.importKey('pkcs8', new Uint8Array(pkcs8), { name: 'Ed25519' }, false, ['sign']);
  window.phantom = { solana: { async connect() {}, publicKey: { toString: () => addr }, async signMessage(bytes) { return { signature: new Uint8Array(await crypto.subtle.sign('Ed25519', await kp, bytes)) }; } } };
}, { pkcs8, addr });
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://localhost:8788/admin.html?server=' + encodeURIComponent('http://localhost:8788/api'));
await p.waitForFunction(() => document.querySelectorAll('.pool').length === 2, null, { timeout: 15000 });
check(/top-off/.test(await p.textContent('#pending')) && /waiting for your deposit/.test(await p.textContent('#pending')) && /send [0-9,]+ SANTA/.test(await p.textContent('#toSend')), 'the waiting top-off is shown, with how much to send');
await p.tap('#connect'); await p.waitForFunction(() => /Connected/.test(document.querySelector('#who').textContent));
await p.tap('[data-act="pause"][data-game="spin"]'); await p.waitForFunction(() => /Done|Refused/.test(document.querySelector('#msg').textContent), null, { timeout: 15000 });
// ONE GAME POOL (Cody, 2026-10-02): the 'spin' row is the shared pool every game plays from; Stop and the thresholds act on it
const rules = async () => (await db.query(`select rules from public.pools where game = 'spin'`))[0].rules;
check((await rules()).paused === true, 'Stop really stopped the Game pool: ' + (await p.textContent('#msg')));
check(/Stopped/.test(await p.textContent('.pools')) && /pause/.test(await p.textContent('#log')), 'the page shows Stopped and the log entry');
await p.fill('#fields [data-k="skim"]', '5000'); await p.tap('#save'); await p.waitForFunction(() => /Refused/.test(document.querySelector('#msg').textContent), null, { timeout: 15000 });
check((await rules()).skim === undefined, 'an unsafe setting was refused and changed nothing: ' + (await p.textContent('#msg')));
await p.fill('#fields [data-k="skim"]', '25'); await p.fill('#fields [data-k="jackpotPct"]', '0.14'); await p.tap('#save');
await p.waitForFunction(() => /Done/.test(document.querySelector('#msg').textContent), null, { timeout: 15000 });
check((await rules()).jackpotPct === 0.14, 'the jackpot % change was saved');
// the override is what every game's jackpot uses (and the preview below); put it back to Cody's 25%
await p.evaluate(() => { document.querySelector('#msg').textContent = ''; }); // the last "Done" must not count for this save
await p.fill('#fields [data-k="jackpotPct"]', '0.25'); await p.tap('#save');
await p.waitForFunction(() => /Done|Refused/.test(document.querySelector('#msg').textContent), null, { timeout: 15000 });
check((await rules()).jackpotPct === 0.25, 'the Game pool jackpot override back at 25%: ' + (await p.textContent('#msg')));
await p.tap('[data-act="resume"][data-game="spin"]'); await p.waitForFunction(async () => /Running/.test(document.querySelector('.pools').textContent), null, { timeout: 15000 }).catch(() => {});
check((await rules()).paused === false, 'Resume');
check((await db.query('select count(*)::int as n from public.pool_log'))[0].n === 4, 'four signed changes in the public log (stop, the jackpot %, back to 25%, resume)');
// Game settings editor: the preview updates; an unsafe change can't be published; a safe one is signed and saved; a new item.
await p.waitForFunction(() => /pays back/.test(document.querySelector('#gsPreview').textContent), null, { timeout: 15000 });
// payback is fixed prizes + the pool jackpot at the Game pool's $500 start, with the $200 and $1,025 ends (Cody, 2026-10-02)
{ const pv0 = (await p.textContent('#gsPreview')).replace(/\s+/g, ' ');
  check(/Spin pays back 80\.0%/.test(pv0) && /Big Hat pays back 78\.6% \(fixed prizes 78\.1% \+ the pool jackpot at the \$500 start; 78\.3% at \$200, 79\.1% at \$1,025\)/.test(pv0), 'preview shows today\'s payback with the jackpot: ' + pv0.slice(0, 220));
  check(/Snowball Drop pays back 78\.5% \(fixed prizes 76\.0% \+ the pool jackpot at the \$500 start; 77\.0% at \$200, 81\.1% at \$1,025\)/.test(pv0) && /top fixed prize 25×/.test(pv0), 'preview shows Snowball Drop\'s payback with its jackpot: ' + (pv0.match(/Snowball Drop pays back[^;]*/) || [''])[0]);
  // Stocking Stuffer's pay table (board 2, 2026-10-02): the preview shows its payback; a top fixed prize the Game pool's top-off can't cover is refused
  check(/Stocking Stuffer pays back 73\.3% \(fixed prizes 72\.4% \+ the pool jackpot at the \$500 start; 72\.7% at \$200, 74\.2% at \$1,025\)/.test(pv0) && /top fixed prize 50×/.test(pv0), 'preview shows Stocking Stuffer\'s 73.3% (72.4% fixed) and 50×: ' + (pv0.match(/Stocking Stuffer pays back[^;]*/) || [''])[0]);
  check(await p.evaluate(() => document.querySelector('[data-gs="drop.jackpotPct"]')?.value === '0.25' && document.querySelector('[data-gs="stock2.jackpotPct"]')?.value === '0.25' && !document.querySelector('[data-gs="stock.8"]')), 'the editor has both jackpot %s and 8 Stocking prizes (0–7 gifts; 8 = the jackpot)'); }
await p.fill('[data-gs="stock.7"]', '600'); await p.waitForTimeout(700);
check(await p.evaluate(() => document.querySelector('#gsSave').disabled) && /must cover Stocking Stuffer's top fixed prize \(\$600\)/.test(await p.textContent('#gsPreview')), 'a 600× Stocking Stuffer top prize (more than the Game pool\'s top-off covers) can\'t be published');
await p.fill('[data-gs="stock.7"]', '50'); await p.fill('[data-gs="stock.1"]', '0.6'); await p.waitForTimeout(700);
check(/Stocking Stuffer pays back 75\.9% \(fixed prizes 75\.0%/.test(await p.textContent('#gsPreview')), 'a 0.6× one-gift prize previews 75.9% (75.0% fixed): ' + (await p.textContent('#gsPreview')).match(/Stocking Stuffer[^;]*/)?.[0]);
await p.fill('[data-gs="main.0"]', '30'); await p.waitForTimeout(700);
check(await p.evaluate(() => document.querySelector('#gsSave').disabled) && /exactly 40 segments/.test(await p.textContent('#gsPreview')), 'a main wheel that isn\'t 40 segments can\'t be published');
await p.fill('[data-gs="main.0"]', '18'); await p.fill('[data-gs="main.2"]', '6'); await p.fill('[data-gs="main.star"]', '4');
await p.fill('[data-gs="bonus.3"]', '8'); await p.fill('[data-gs="bonus.4"]', '3');
await p.fill('[data-gs="big.jackpotOdds"]', '10000'); await p.fill('[data-gs="prices.spin100"]', '2');
await p.evaluate(() => document.querySelector('#gsNew').closest('details').open = true);
await p.fill('[data-new="id"]', 'shirt_mint'); await p.fill('[data-new="name"]', 'Mint'); await p.fill('[data-new="price"]', '0.3'); await p.tap('#gsAdd');
await p.waitForTimeout(800);
const pv = await p.textContent('#gsPreview');
check(/Spin pays back 94\.2%/.test(pv) && /1 in 10,000/.test(pv) && !(await p.evaluate(() => document.querySelector('#gsSave').disabled)), 'preview of the new settings: ' + pv.slice(0, 160));
await p.tap('#gsSave'); await p.waitForFunction(() => /Published settings version|Refused/.test(document.querySelector('#msg').textContent), null, { timeout: 20000 });
const gsRow = (await db.query('select version, settings from public.game_settings order by version desc limit 1'))[0];
check(gsRow?.version === 1 && gsRow.settings.big.jackpotOdds === 10000 && gsRow.settings.prices.spin100 === 2 && gsRow.settings.spin.main['0'] === 18 && gsRow.settings.spin.bonus['4'] === 3, 'settings v1 saved: ' + (await p.textContent('#msg')));
check(gsRow?.settings.store.items.some((i) => i.id === 'shirt_mint' && i.price === 0.3), 'the new Mint shirt is in the store');
check(JSON.stringify(gsRow?.settings.stocking2) === '{"pays":[0,0.6,1.5,3,7,15,25,50],"jackpotPct":0.25}' && JSON.stringify(gsRow?.settings.drop) === '{"jackpotPct":0.25}', 'Stocking Stuffer\'s new pay table (and both jackpot %s) were signed and saved: ' + JSON.stringify(gsRow?.settings.stocking2));
check(JSON.stringify(gsRow?.settings.stocking?.pays) === '[0,0.5,2.5,6,10,20,40,90,250]', 'board 1\'s table is kept as it was (old turns re-check on it)');
await p.waitForFunction(() => /version 1/.test(document.querySelector('#gsVer').textContent), null, { timeout: 10000 }).catch(() => {});
check(/version 1/.test(await p.textContent('#gsVer')), 'the editor shows version 1');
// Frozen payouts: the player and amount are shown; Release (wallet-signed) puts it back in the payout queue.
const frozenText = (await p.textContent('#frozen')).replace(/\s+/g, ' ');
check(/Holly/.test(frozenText) && /HoLL…1111/.test(frozenText) && /\$5,000\.00/.test(frozenText) && /Big Hat · 1 × \$1\.00/.test(frozenText), 'the frozen payout shows player, wallet, run and amount: ' + frozenText);
check(await p.evaluate(() => document.querySelector('#frozenBox').classList.contains('alert')), 'the Frozen payouts box stands out while something is frozen');
await p.locator('#frozenBox').screenshot({ path: 'out/admin-frozen.png' });
await p.tap('#frozen [data-release]'); await p.waitForFunction(() => /Released payout|Refused/.test(document.querySelector('#msg').textContent), null, { timeout: 15000 });
check((await db.query(`select status from public.payouts where to_wallet like 'HoLLY%'`))[0].status === 'queued', 'Release queued the payout: ' + (await p.textContent('#msg')));
check(/None frozen/.test(await p.textContent('#frozen')) && /release payout/.test(await p.textContent('#log')), 'the list empties and the release is in the log');
// Possible bots: the signed check lists the scripted player with its signals; private and read only (nothing in the log).
const logBefore = (await p.textContent('#log')).length;
await p.tap('#botCheck'); await p.waitForFunction(() => /Checked \d+ runs|Refused/.test(document.querySelector('#msg').textContent), null, { timeout: 15000 });
const botsText = (await p.textContent('#bots')).replace(/\s+/g, ' ');
check(/Speedy/.test(botsText) && /clockwork \(strong\)/.test(botsText) && !/Holly/.test(botsText), 'the bot check lists Speedy (clockwork), not Holly: ' + botsText + ' | ' + (await p.textContent('#msg')));
check(await p.evaluate(() => document.querySelector('#botsBox').classList.contains('alert')), 'the Possible bots box stands out when a strong signal is found');
check((await p.textContent('#log')).length === logBefore, 'the bot check is not logged');
await p.locator('#botsBox').screenshot({ path: 'out/admin-bots.png' });
// The lottery panel: the private list of winners to pay by hand (full wallet, amount), and the payout mode switch.
await p.tap('#lotLoad'); await p.waitForFunction(() => /lottery payment|No lottery winners|Refused/.test(document.querySelector('#msg').textContent), null, { timeout: 15000 });
const owedText = (await p.textContent('#lotOwed')).replace(/\s+/g, ' ');
check(/HoLLYwa11et11111111111111111111111111111111/.test(owedText) && /1,234\.56789 SANTA/.test(owedText) && /1st place/.test(owedText), 'the lottery list shows the full wallet, the place and the exact amount to send: ' + owedText.slice(0, 160));
check(/manual/.test(await p.textContent('#lotMode')), 'it says payouts are manual');
await p.tap('#lotAuto'); await p.waitForFunction(() => /Payouts are auto/.test(document.querySelector('#lotMode').textContent), null, { timeout: 15000 }).catch(() => {});
check(/auto/.test(await p.textContent('#lotMode')), 'switching to automatic works (and is logged)');
await p.tap('#lotManual'); await p.waitForFunction(() => /Payouts are manual/.test(document.querySelector('#lotMode').textContent), null, { timeout: 15000 }).catch(() => {});
await p.locator('#lotteryBox').screenshot({ path: 'out/admin-lottery.png' });
await p.screenshot({ path: 'out/admin.png', fullPage: true });
await browser.close(); web.close();
console.log('errors:', errors.length ? errors : 'none'); console.log(fails.length || errors.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
process.exit(0);
