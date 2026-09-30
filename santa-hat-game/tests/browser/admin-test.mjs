// The admin screen (admin.html) driven like Cody would: connect wallet, Stop a pool, try a bad setting, save a good one.
// Real server code + real SQL behind it; a stand-in wallet signs with a real Ed25519 key (as Phantom's signMessage would).
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path'; import http from 'http';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const { makeDb } = await import('../db/setup.mjs');
const { createGameServer } = await import('../../server/games.js');
const { makeHandler } = await import('../../server/http.js');
const { createAdmin, b58encode } = await import('../../server/admin.js');
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, m) => { if (!ok) fails.push(m); };

const db = await makeDb();
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', 58823529411, '{}'), ('slots', 588235294117, '{}')`);
await db.query(`insert into public.pool_transfers (game, kind, amount_raw, status) values ('slots', 'top-off', 411764705882, 'needs_approval')`);
const key = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const addr = b58encode(new Uint8Array(await crypto.subtle.exportKey('raw', key.publicKey)));
const pkcs8 = [...new Uint8Array(await crypto.subtle.exportKey('pkcs8', key.privateKey))];
const server = createGameServer({ db, chain: {}, livePrice: async () => ({ usd: 0.00085 }), liveFee: async () => ({ bps: 300, max: 1e15 }), poolWallets: {} });
const handle = makeHandler({ server, admin: createAdmin({ db, adminWallets: [addr], onSettings: () => server.settingsChanged() }), profileFor: async () => null, credits: async () => [] });
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
await p.tap('[data-act="pause"][data-game="slots"]'); await p.waitForFunction(() => /Done|Refused/.test(document.querySelector('#msg').textContent), null, { timeout: 15000 });
const rules = async () => (await db.query(`select rules from public.pools where game = 'slots'`))[0].rules;
check((await rules()).paused === true, 'Stop really stopped the Slots pool: ' + (await p.textContent('#msg')));
check(/Stopped/.test(await p.textContent('.pools')) && /pause/.test(await p.textContent('#log')), 'the page shows Stopped and the log entry');
await p.fill('#fields [data-k="skim"]', '5000'); await p.tap('#save'); await p.waitForFunction(() => /Refused/.test(document.querySelector('#msg').textContent), null, { timeout: 15000 });
check((await rules()).skim === undefined, 'an unsafe setting was refused and changed nothing: ' + (await p.textContent('#msg')));
await p.fill('#fields [data-k="skim"]', '25'); await p.fill('#fields [data-k="jackpotPct"]', '0.14'); await p.tap('#save');
await p.waitForFunction(() => /Done/.test(document.querySelector('#msg').textContent), null, { timeout: 15000 });
check((await rules()).jackpotPct === 0.14, 'the jackpot % change was saved');
await p.tap('[data-act="resume"][data-game="slots"]'); await p.waitForFunction(async () => /Running/.test(document.querySelector('.pools').textContent), null, { timeout: 15000 }).catch(() => {});
check((await rules()).paused === false, 'Resume');
check((await db.query('select count(*)::int as n from public.pool_log'))[0].n === 3, 'three signed changes in the public log');
// Game settings editor: the preview updates; an unsafe change can't be published; a safe one is signed and saved; a new item.
await p.waitForFunction(() => /pays back/.test(document.querySelector('#gsPreview').textContent), null, { timeout: 15000 });
check(/Spin pays back 75\.0%/.test(await p.textContent('#gsPreview')) && /Big Hat pays back 75\.5%/.test(await p.textContent('#gsPreview')), 'preview shows today\'s payback: ' + (await p.textContent('#gsPreview')).slice(0, 120));
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
await p.waitForFunction(() => /version 1/.test(document.querySelector('#gsVer').textContent), null, { timeout: 10000 }).catch(() => {});
check(/version 1/.test(await p.textContent('#gsVer')), 'the editor shows version 1');
await p.screenshot({ path: 'out/admin.png', fullPage: true });
await browser.close(); web.close();
console.log('errors:', errors.length ? errors : 'none'); console.log(fails.length || errors.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
process.exit(0);
