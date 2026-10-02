// BUTTON AUDIT (Cody, 2026-10-02: "run a test and make sure every button in game has a complete start to end path").
// Visits every tab, sheet, dialog, lobby, room and a practice match, plus admin.html; lists EVERY visible control (and the
// disabled ones, with the reason they show); clicks each one like a player would (re-opening the screen fresh before each click,
// except inside a running match and the admin screen) and records what happened:
//   NAVIGATES (tab/page change) · OPENS (a sheet/dialog/panel appears) · CLOSES (it dismisses one) · CHANGES (visible state
//   or text changes) · PLAYS (a match or a run starts) · NETWORK (it called the game server: action names recorded)
//   · EXPLAINS (it shows an honest "soon / not yet / sign in / connect" message) · NOTHING (no visible effect: a dead end)
//   · NO-OP (it was already the selected one) · DISABLED (not clickable; the text/title it shows is recorded) · FIELD (a text box)
// Runs twice: demo (?net=local, no game server) and server mode (?net=local&server=…/api&token=test-token) against the REAL
// server/http.js + server/games.js + server/lottery.js + server/levels.js + server/admin.js on PGlite with the real SQL.
// Then traces every PURCHASE as far as it goes (price → server quote → wallet pay step → server confirms → granted).
// Nothing leaves this computer: three.js and supabase-js come from node_modules, everything else off-machine is answered 503
// (so the live SANTA price, Google fonts and the wallet's Solana libraries are unavailable here; the wallet is a stand-in).
// Writes ../../audits/2026-10-02-buttons/results.json, controls.md and shots/. Run: node button-audit.mjs [demo|server]
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path'; import http from 'http';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const { makeDb, FILES } = await import('../db/setup.mjs');
const { createGameServer } = await import('../../server/games.js');
const { createLottery } = await import('../../server/lottery.js');
const { createLevels } = await import('../../server/levels.js');
const { createAdmin, b58encode } = await import('../../server/admin.js');
const { createShop } = await import('../../server/shop.js');
const { makeHandler } = await import('../../server/http.js');
const { splitPayment, MINT } = await import('../../mockups/market.js');

const ROOT = new URL('../../mockups', import.meta.url).pathname;
const OUT = new URL('../../audits/2026-10-02-buttons/', import.meta.url).pathname; mkdirSync(OUT + 'shots', { recursive: true });
const PORT = 8787, BASE = `http://localhost:${PORT}`, API = BASE + '/api';
const ONLY = process.argv[2] || '';
const log = (...a) => console.log(...a);
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- the stand-in server (real server code, real SQL, PGlite)
// every SQL file in order (001…016), as the live database has them
let db, levels = null, dbNote = '';
const ALL_SQL = ['001_profiles.sql', '002_items_seed.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql', '006_ranked_tickets.sql', '007_rate_limits.sql', '008_hats_backpacks.sql',
  '009_lock_my_plays.sql', '010_levels.sql', '011_lottery.sql', '012_special_snowballs.sql', '013_match_stats.sql', '014_run_sizes.sql', '015_special_gear.sql', '016_shop.sql'];
try { db = await makeDb(ALL_SQL); }
catch (e) { dbNote = 'all 16 SQL files would not apply in order (' + clean(e.message).slice(0, 100) + '); fell back to the shop test\'s set + lottery';
  db = await makeDb(['001_profiles.sql', '002_items_seed.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql', '006_ranked_tickets.sql', '007_rate_limits.sql', '008_hats_backpacks.sql', '009_lock_my_plays.sql', '010_levels.sql', '011_lottery.sql', '012_special_snowballs.sql', '014_run_sizes.sql']);
  for (const f of ['015_special_gear.sql', '016_shop.sql']) await db.pg.exec(readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8')); }
try { levels = createLevels({ db }); } catch (e) { dbNote += ' · levels server not built: ' + e.message; }
const PLAYER = 'PLAYERwa11et111111111111111111111111111111Q', LOT = 'LoTTwa11et11111111111111111111111111111111Z';
const POOLS = { spin: 'SPiNpoo1wa11et11111111111111111111111111111', slots: 'SLoTSpoo1wa11et1111111111111111111111111111' };
const PRICE = 0.00085, FEE = { bps: 300, max: 1e15 };
const me = await db.player(PLAYER, 'Cody');
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', $1, '{}'), ('slots', $2, '{}')`, [Math.round(50 / PRICE * 1e6), Math.round(500 / PRICE * 1e6)]);
const txs = new Map(); let paidCount = 0;
const chain = { getTransaction: async (s) => txs.get(s) ?? null, latestBlock: async () => ({ blockhash: 'Bh' + 'x'.repeat(42), slot: 7 }) };
// What the chain records for one page payment: 10% burned, the rest arriving at the quote's wallet (pool or lottery), finalized.
function payFor(q) {
  const sig = ('AuditPay' + (++paidCount)).padEnd(88, '5'), sp = splitPayment(q.santaRaw, q.burnBps ?? 1000, FEE), b = (i, o, a) => ({ accountIndex: i, mint: MINT, owner: o, uiTokenAmount: { amount: String(a) } });
  txs.set(sig, { blockTime: Math.floor(Date.now() / 1000), meta: { err: null, innerInstructions: [], preTokenBalances: [b(1, PLAYER, 1e13), b(2, q.pool, 1e12)], postTokenBalances: [b(1, PLAYER, 1e13 - q.santaRaw), b(2, q.pool, 1e12 + sp.arrives)] },
    transaction: { message: { accountKeys: [{ pubkey: PLAYER, signer: true }], instructions: [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { mint: MINT, authority: PLAYER, tokenAmount: { amount: String(sp.burn) } } } }] } } });
  return sig;
}
const server = createGameServer({ retired: ['spin'], db, chain, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, poolWallets: POOLS });
const lottery = createLottery({ db, chain, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, wallet: LOT, mint: MINT, cluster: 'devnet' });
// The admin's wallet: a real Ed25519 key (as Phantom's signMessage would sign), stood in on the admin page only.
const key = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const ADMIN = b58encode(new Uint8Array(await crypto.subtle.exportKey('raw', key.publicKey)));
const pkcs8 = [...new Uint8Array(await crypto.subtle.exportKey('pkcs8', key.privateKey))];
const admin = createAdmin({ db, adminWallets: [ADMIN], onSettings: () => server.settingsChanged() });
// limiter: null on purpose: this robot clicks far faster than a person; the speed limit has its own tests.
const TREASURY = 'TReASURYwa11et'.padEnd(44, '1');
const shop = createShop({ db, chain, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, treasury: TREASURY, mint: MINT, cluster: 'devnet' });
const handle = makeHandler({ server, lottery, levels, admin, shop, limiter: null, profileFor: async (t) => (t === 'test-token' ? me : null) });
const web = http.createServer(async (req, res) => {
  if (req.method === 'GET') { const pth = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'online.html');
    if (!pth.startsWith(ROOT) || !existsSync(pth)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': pth.endsWith('.js') ? 'text/javascript' : pth.endsWith('.png') ? 'image/png' : 'text/html' }); return res.end(readFileSync(pth)); }
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await handle(new Request(BASE + req.url, { method: req.method, headers: req.headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }));
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT);

// Seeds: one finished lottery draw with real tickets (so "Check this draw" and the admin's manual-payout list have something real),
// drawn by a second lottery instance on a fast test schedule; and one frozen payout (an impossible $5,000 pull) for admin Release.
let seedNote = '';
try {
  const EVERY = 8000, CLOSE = 1500, fast = { nextDraw: (k, t) => (k === 'weekly-10' ? (Math.floor(t / EVERY) + 1) * EVERY : null),
    salesFor: (k, t) => { const at = fast.nextDraw(k, t); return at === null ? { open: false, why: 'drawn' } : at - t <= CLOSE ? { open: false, at, why: 'closed' } : { open: true, at }; } };
  const lot2 = createLottery({ db, chain, livePrice: async () => ({ usd: PRICE }), liveFee: async () => FEE, wallet: LOT, mint: MINT, cluster: 'devnet', schedule: fast });
  let q; for (let i = 0; i < 10; i++) { q = await lot2.quote(me, 'weekly-10', 3); if (!q.closed && !q.error) break; await new Promise((r) => setTimeout(r, 1000)); }
  const b = await lot2.buy(me, q.id, payFor(q));
  await new Promise((r) => setTimeout(r, EVERY + 1500)); await lot2.draws();
  const d = (await db.query(`select id, status, tickets from public.lottery_draws where status = 'drawn' order by id desc limit 1`))[0];
  seedNote = d ? `seeded lottery draw #${d.id} (${d.tickets} tickets, drawn)` : 'lottery seed: no drawn draw (' + JSON.stringify(b).slice(0, 80) + ')';
} catch (e) { seedNote = 'lottery seed failed: ' + clean(e.message).slice(0, 100); }
try {
  const holly = await db.player('HoLLYwa11et11111111111111111111111111111111', 'Holly');
  const q = (await db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, 'big', 1, 1, 1, 1, 0.00085) returning id`, [holly]))[0].id;
  const run = +(await db.query(`select public.buy_run($1, $2, 1, 0, 0, 0) as id`, [q, 'FROZEN' + '5'.repeat(80)]))[0].id;
  const pl = (await db.query('select id from public.plays where run_id = $1', [run]))[0].id;
  await db.query(`select public.lock_play($1, $2, 's')`, [pl, 'c'.repeat(64)]);
  await db.query(`select public.settle_play($1, 'x', '{"stops":[1,2,3,4,5]}', 5000, 5882352941176, 0.00085, 0, 0, 'w', 0)`, [pl]);
  await db.query(`select public.finish_run($1, 'HoLLYwa11et11111111111111111111111111111111', 1101.51)`, [run]);
  seedNote += ' · seeded 1 frozen payout';
} catch (e) { seedNote += ' · frozen-payout seed failed: ' + clean(e.message).slice(0, 100); }
log('server ready.', dbNote, seedNote);

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const SUPA = readFileSync('node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'utf8') + '\nexport const createClient = supabase.createClient;\n';
const blocked = new Set();
async function newContext(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...opts });
  await ctx.route('**/*', async (r) => { const url = r.request().url();
    if (url.startsWith(BASE + '/')) return r.continue();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return r.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (url.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js')) return r.fulfill({ body: SUPA, contentType: 'text/javascript' });
    blocked.add(url.split('?')[0].slice(0, 100)); return r.fulfill({ status: 503, body: '' }); });
  await ctx.addInitScript(auditInit);
  return ctx;
}
async function openPage(ctx, url, ready = 'window.__sq') {
  const p = await ctx.newPage(), st = { errors: [], net: [], dialogs: [] };
  p.on('pageerror', (e) => st.errors.push(e.message)); p.on('dialog', (d) => { st.dialogs.push(d.type() + ': ' + d.message()); d.dismiss().catch(() => {}); });
  p.on('response', async (res) => { const rq = res.request(); if (rq.method() !== 'POST' || !rq.url().startsWith(API)) return;
    let a = '?'; try { const b = JSON.parse(rq.postData() || '{}'); a = b.action || (b.message ? 'admin:' + ((/"action":\s*"([\w-]+)"|action:\s*([\w-]+)/.exec(b.message) || [])[1] || (/action[^\w]+([\w-]+)/.exec(b.message) || [])[1] || '?') : '?'); } catch {}
    let err = ''; try { const j = await res.json(); if (j?.error) err = ` "${String(j.error).slice(0, 70)}"`; } catch {}
    st.net.push(`${a} → ${res.status()}${err}`); });
  await p.goto(BASE + url, { timeout: 120000 }); await p.waitForFunction(ready, null, { timeout: 120000 });
  return { p, st };
}

// Installed into every page before its own code runs: what's on screen (to diff before/after a click) and the control list.
function auditInit() {
  const SKIP = '#hud,#board,#tags,#pops,#count,#loading,[data-left],#liveMarket,.runcount,#banner';
  const OVER = ['#acct', '#home', '#panel', '#toast', '#emotes', '#zoom', '#gamebar', '#joy'];
  const vis = (el) => !!el && (el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : !!el.offsetParent);
  const chunks = () => { const out = new Map(), cache = new Map(), w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) { const t = n.data.replace(/\s+/g, ' ').trim(); if (!t) continue; const el = n.parentElement; if (!el || el.closest(SKIP)) continue;
      let v = cache.get(el); if (v === undefined) cache.set(el, (v = vis(el))); if (v) out.set(t, (out.get(t) || 0) + 1); } return out; }; // counted: the same message on a second card is new text too
  const state = () => { const sq = window.__sq, sl = window.__slots, dr = window.__drop;
    return { tab: location.hash, page: location.pathname,
      over: OVER.filter((s) => { const e = document.querySelector(s); return e && !e.hidden && vis(e); }).concat([...document.querySelectorAll('dialog[open]')].map((d) => '#' + d.id)).join(','),
      vals: [...document.querySelectorAll('input,select,textarea')].filter(vis).map((i) => (i.id || i.getAttribute('aria-label') || '') + '=' + i.value).join('&'),
      flags: [...document.querySelectorAll('button,[role=tab],[role=radio],details')].filter((b) => !b.closest(SKIP) && vis(b)).map((b) => (b.getAttribute('aria-pressed') || '') + (b.getAttribute('aria-checked') || '') + (b.getAttribute('aria-selected') || '') + (b.disabled ? 'd' : '') + (b.open ? 'o' : '')).join(',') + (document.querySelector('.max') ? '|max' : '') + (document.fullscreenElement ? '|fs' : ''),
      room: sq ? [sq.room ? 'room' : '', sq.sim ? 'sim' : '', sq.view?.phase || ''].join('/') : '',
      run: `${sl ? !!sl.busy : ''}/${dr ? !!(dr.opening || dr.flying) : ''}`, zoom: sq ? String(sq.zoom) : '', armed: sq ? String(sq.armed) : '',
      say: String(document.querySelectorAll('#tags .say.me').length), theme: sq ? String(sq.theme) : '', muted: String(window.__sfx?.muted) };
  };
  const ATTRS = ['data-tab', 'data-run', 'data-try', 'data-pick', 'data-slot', 'data-amt', 'data-buy', 'data-theme', 'data-step', 'data-proof', 'data-dbet', 'data-bet', 'data-e', 'data-sb', 'data-mode', 'data-lmode', 'data-watch', 'data-gslot', 'data-sbslot', 'data-act', 'data-check', 'data-release', 'data-lotpaid'];
  const uniq = (s) => { try { return document.querySelectorAll(s).length === 1; } catch { return false; } };
  const pathOf = (el) => { const seg = []; let e = el; while (e && e !== document.body && !e.id) { const sib = [...e.parentElement.children].filter((x) => x.tagName === e.tagName);
    seg.unshift(sib.length > 1 ? `${e.tagName.toLowerCase()}:nth-of-type(${sib.indexOf(e) + 1})` : e.tagName.toLowerCase()); e = e.parentElement; }
    return (e && e.id ? '#' + CSS.escape(e.id) : 'body') + ' > ' + seg.join(' > '); };
  const selOf = (el) => {
    if (el.id && uniq('#' + CSS.escape(el.id))) return '#' + CSS.escape(el.id);
    const s0 = el.parentElement.closest('[data-lot],[data-draw],[id]');
    const scope = !s0 ? '' : s0.id ? '#' + CSS.escape(s0.id) : s0.dataset.lot ? `[data-lot="${s0.dataset.lot}"]` : `[data-draw="${s0.dataset.draw}"]`;
    if (el.matches('[data-run]') && el.closest('.runpick')) { const s = `${scope} .runpick [data-run]`.trim(); if (uniq(s)) return s; }
    for (const a of ATTRS) if (el.hasAttribute(a)) { const s = `${scope} ${el.tagName.toLowerCase()}[${a}="${el.getAttribute(a).replace(/"/g, '\\"')}"]`.trim(); if (uniq(s)) return s; }
    for (const c of el.classList) { const s = `${scope} ${el.tagName.toLowerCase()}.${CSS.escape(c)}`.trim(); if (uniq(s)) return s; }
    return pathOf(el);
  };
  const labelOf = (el) => (el.getAttribute('aria-label') || el.textContent || el.value || el.title || el.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 70);
  const info = (e) => ({ sel: selOf(e), label: labelOf(e) || '(' + e.tagName.toLowerCase() + ')', tag: e.tagName.toLowerCase(), type: e.type || '', disabled: !!e.disabled || e.getAttribute('aria-disabled') === 'true',
    title: e.title || '', pressed: ['aria-pressed', 'aria-selected', 'aria-checked'].some((a) => e.getAttribute(a) === 'true') });
  const CTRL = 'button, a[href], [role=button], summary, select, input, textarea';
  window.__audit = { vis,
    controls(roots, exclude) { const set = new Set(); for (const r of document.querySelectorAll(roots)) for (const e of r.querySelectorAll(CTRL)) if (!(exclude && e.closest(exclude))) set.add(e);
      return [...set].filter(vis).map(info); },
    hiddenCount(roots) { let n = 0; for (const r of document.querySelectorAll(roots)) for (const e of r.querySelectorAll(CTRL)) if (!vis(e)) n++; return n; },
    one(sel) { const e = document.querySelector(sel); return e && vis(e) ? info(e) : null; },
    mark() { this.b = state(); this.bt = chunks(); },
    diff() { const a = state(), t = chunks(); return { keys: Object.keys(a).filter((k) => a[k] !== this.b[k]), was: this.b, now: a, added: [...t.keys()].filter((x) => t.get(x) > (this.bt.get(x) || 0)).slice(0, 30), removed: [...this.bt.keys()].filter((x) => (t.get(x) || 0) < this.bt.get(x)).length }; },
  };
}

// ---------------------------------------------------------------- clicking one control and classifying what happened
const results = [], purchases = [], notes = [];
let deadN = 0;
// in-between messages: keep waiting while one of these is the newest thing on screen
const PENDING = /^(Connecting|Joining|Getting a price|Approve|Confirming|Sending|Saving|Checking|Loading|Wrapping|Lighting|Waiting for the referee)/i;
const EXPLAIN = /soon|not yet|aren't|isn't|is not|sign in|test version|not connected|connected yet|connect the|no solana wallet|unlocked|can't|cannot|couldn't|didn't|opens at|doesn't look right|type the room code|nothing changed|nothing is sold|first\.|paste the|open this page with/i;
async function exercise(ctx, sc, c) {
  const { p, st, mode } = ctx;
  const row = { mode, screen: sc.name, label: c.label, sel: c.sel, result: '', also: [], notes: '' };
  if ((c.tag === 'input' && !/checkbox|radio|button|submit/.test(c.type)) || c.tag === 'textarea' || c.tag === 'select') { row.result = 'FIELD'; row.notes = `${c.tag === 'select' ? 'drop-down' : (c.type || 'text') + ' box'}${c.disabled ? ' (disabled)' : ''}`; return row; }
  if (c.disabled) { row.result = 'DISABLED'; row.notes = `shows "${c.label}"` + (c.title ? ` · tooltip "${c.title}"` : ''); return row; }
  if (sc.pre) await sc.pre(p, c);
  const n0 = st.net.length, e0 = st.errors.length, g0 = st.dialogs.length;
  // clear the message lines first: a second button that says the SAME thing as the last one would otherwise look like it did nothing
  await p.evaluate(() => { for (const e of document.querySelectorAll('#msg, #tixNote, #pgNote, .shopnote, .lotnote, #avmsg, #acctMsg, #status, #buyNote')) e.textContent = ''; window.__audit.mark(); });
  try { await p.click(c.sel, { timeout: 15000 }); }
  catch (e) { const lines = e.message.split('\n'), why = lines.filter((l) => /intercepts|not stable|not visible|outside of the viewport|not enabled|detached/.test(l)).pop() || lines.slice(-2).join(' ');
    row.notes += `REAL MOUSE CLICK FAILED (${clean(why).slice(0, 170)}), used a script click. `; await p.evaluate((s) => document.querySelector(s)?.click(), c.sel).catch(() => {}); }
  // wait for an effect; once something changes, wait until it stops changing (a server call can show 2–3 messages in a row)
  const limit = sc.wait || (mode === 'server' ? 3500 : 2500);
  let d = null, last = '', deadline = Date.now() + limit;
  for (;;) {
    await p.waitForTimeout(350);
    d = await p.evaluate(() => window.__audit.diff()).catch(() => null); if (!d) break;
    const changed = d.keys.length || d.added.length || d.removed || st.net.length > n0, sig = JSON.stringify([d.keys, d.added, d.removed]) + st.net.length;
    const pending = d.added.some((t) => PENDING.test(t)) && !(d.keys.includes('room') && /sim|room/.test(d.now.room));
    if (changed) { if (!last) deadline = Date.now() + Math.max(limit, pending ? 20000 : 6000); if (sig === last && !pending) break; last = sig; await p.waitForTimeout(400); }
    if (Date.now() > deadline) break;
  }
  // the lottery cards refresh themselves every 30 s ("lottery"): counted only for the lottery's own buttons
  const net = st.net.slice(n0).filter((x) => !/^lottery →/.test(x) || /lot|draw/i.test(c.sel));
  const cls = [];
  if (d) {
    const k = new Set(d.keys), ph = (s) => s.split('/')[2] || '';
    // a run is "busy" from the moment its buy dialog opens, so a run counts as started only once the dialog is gone and it is still busy
    const wasO = d.was.over.split(','), nowO = d.now.over.split(','), runStarted = /true/.test(d.now.run) && !nowO.includes('#buyDlg') && (!/true/.test(d.was.run) || wasO.includes('#buyDlg'));
    if ((k.has('room') && /sim|room/.test(d.now.room) && !/sim|room/.test(d.was.room)) || runStarted || (k.has('room') && /^(intro|count|play)$/.test(ph(d.now.room)) && !/^(intro|count|play)$/.test(ph(d.was.room)))) cls.push('PLAYS');
    if (k.has('tab') || k.has('page')) cls.push('NAVIGATES');
    const was = d.was.over.split(',').filter(Boolean), now = d.now.over.split(',').filter(Boolean);
    const opened = now.filter((x) => !was.includes(x)), closed = was.filter((x) => !now.includes(x));
    if (opened.length) cls.push('OPENS');
    if (net.length) cls.push('NETWORK');
    const expl = d.added.filter((t) => EXPLAIN.test(t)); if (expl.length) cls.push('EXPLAINS');
    if (closed.length && !opened.length) cls.push('CLOSES');
    if (!cls.length && (d.keys.length || d.added.length || d.removed)) cls.push('CHANGES');
    const other = d.keys.filter((x) => x !== 'over');
    row.notes += [opened.length ? 'opened ' + opened.join(' ') : '', closed.length ? 'closed ' + closed.join(' ') : '', other.length ? 'changed ' + other.join(',') : '',
      expl.length ? `says "${expl.join(' / ').slice(0, 170)}"` : d.added.length ? `new text "${d.added.slice(0, 3).join(' / ').slice(0, 140)}"` : ''].filter(Boolean).join('; ');
  } else row.notes += 'page went away during the click';
  if (net.length) row.notes += (row.notes ? '; ' : '') + 'server: ' + net.join(', ');
  if (!cls.length) cls.push(c.pressed ? 'NO-OP' : 'NOTHING');
  if (c.pressed && cls[0] === 'NO-OP') row.notes += 'already the selected one';
  if (st.errors.length > e0) row.notes += '; PAGE ERROR: ' + st.errors.slice(e0).join(' | ').slice(0, 160);
  if (st.dialogs.length > g0) row.notes += '; browser popup: ' + st.dialogs.slice(g0).join(' | ').slice(0, 120);
  row.result = cls[0]; row.also = cls.slice(1);
  if (row.result === 'NOTHING') {
    row.shot = `shots/${mode}-dead-${++deadN}.png`;
    await p.evaluate((s) => { const e = document.querySelector(s); if (e) { e.scrollIntoView({ block: 'center' }); e.style.outline = '4px solid #ff00ff'; e.style.outlineOffset = '2px'; } }, c.sel).catch(() => {});
    await p.screenshot({ path: OUT + row.shot }).catch(() => {});
    await p.evaluate((s) => { const e = document.querySelector(s); if (e) e.style.outline = ''; }, c.sel).catch(() => {});
  }
  return row;
}
const say = (row) => log(`  ${row.result.padEnd(9)} ${(row.also.length ? '+' + row.also.join('+') : '').padEnd(18)} ${row.label.slice(0, 34).padEnd(34)} ${row.sel.slice(0, 44).padEnd(44)} ${row.notes.slice(0, 150)}`);

async function runScreen(ctx, sc) {
  const { p, mode } = ctx; log(`\n[${mode}] ${sc.name}`);
  try { await sc.enter(p, ctx); }
  catch (e) { const r = { mode, screen: sc.name, label: '(whole screen)', sel: '', result: 'NOT REACHED', also: [], notes: 'could not open it: ' + clean(e.message.split('\n')[0]).slice(0, 160) }; results.push(r); say(r); return; }
  let list = await p.evaluate(([r, x]) => window.__audit.controls(r, x), [sc.roots, sc.exclude || null]);
  const hidden = await p.evaluate((r) => window.__audit.hiddenCount(r), sc.roots);
  if (sc.filter) list = list.filter(sc.filter);
  if (sc.last) list.sort((a, b) => sc.last(a) - sc.last(b));
  const done = new Set();
  const runOne = async (c0) => {
    done.add(c0.sel);
    if (!sc.persistent && !c0.disabled) { try { await reset(p); await sc.enter(p, ctx); } catch (e) { results.push({ mode, screen: sc.name, label: c0.label, sel: c0.sel, result: 'NOT REACHED', also: [], notes: 're-opening the screen failed: ' + clean(e.message).slice(0, 120) }); return; } }
    const c = (await p.evaluate((s) => window.__audit.one(s), c0.sel)) || null;
    if (!c) { const r = { mode, screen: sc.name, label: c0.label, sel: c0.sel, result: 'GONE', also: [], notes: 'no longer on screen when its turn came (the screen changed)' }; results.push(r); say(r); return; }
    const row = await exercise(ctx, sc, c); results.push(row); say(row);
    if (sc.after) await sc.after(p, ctx, c, row).catch((e) => log('   (after-step failed: ' + e.message.split('\n')[0] + ')'));
  };
  for (const c0 of list) await runOne(c0);
  if (sc.persistent) { // controls that only appeared after earlier clicks (e.g. Release, the lottery's paid buttons)
    const more = (await p.evaluate(([r, x]) => window.__audit.controls(r, x), [sc.roots, sc.exclude || null])).filter((c) => !done.has(c.sel) && !(sc.filter && !sc.filter(c)));
    for (const c0 of more) await runOne(c0);
  }
  if (hidden) notes.push(`[${mode}] ${sc.name}: ${hidden} control(s) hidden on this screen (not clickable here; e.g. Spin's, or ones that appear later)`);
}

// ---------------------------------------------------------------- getting to each screen
async function reset(p) {
  await p.evaluate(() => {
    const bd = document.querySelector('#buyDlg'); if (bd?.open) document.querySelector('#buyCancel').click(); // its own Cancel: closing it any other way leaves the buy step waiting
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    document.querySelector('.machine.max')?.classList.remove('max');
    const sq = window.__sq; if (sq && (sq.room || sq.sim)) sq.leaveRoom();
    if (sq && window.__auditSaved && !sq.sim) { sq.me.l = window.__auditSaved.l; for (const k of Object.keys(sq.me.a)) delete sq.me.a[k]; Object.assign(sq.me.a, window.__auditSaved.a); delete window.__auditSaved; }
    if (document.querySelector('#acct') && !document.querySelector('#acct').hidden) document.querySelector('#acctClose').click();
    if (document.querySelector('#home') && !document.querySelector('#home').hidden) document.querySelector('#homeClose').click();
    const t = document.querySelector('#toast'); if (t) t.hidden = true;
  }).catch(() => {});
}
async function gotoTab(p, tab) {
  await p.evaluate((t) => document.querySelector('#t-' + t).click(), tab);
  await p.waitForFunction((t) => !document.querySelector('#tab-' + t).hidden, tab, { timeout: 15000 });
  if (tab === 'games') { await p.waitForFunction(() => window.__slots && window.__drop, null, { timeout: 120000 }); await waitIdle(p); }
  if (tab === 'store') await p.waitForFunction(() => document.querySelectorAll('#carousels .shopitem').length > 0 && document.querySelectorAll('#lotGrid [data-lot]').length > 0, null, { timeout: 60000 });
  if (tab === 'avatar') await p.waitForFunction(() => document.querySelectorAll('#avgrid .pick').length > 0, null, { timeout: 30000 });
}
const waitIdle = (p, timeout = 300000) => p.waitForFunction(() => { const s = window.__slots, d = window.__drop; if (!s) return true;
  if (s.busy || d?.opening || d?.flying) { for (const b of document.querySelectorAll('.skip:not([hidden])')) if (!/Normal/.test(b.textContent)) b.click(); return false; } return true; }, null, { timeout, polling: 500 });
const T = (tab) => async (p) => { await reset(p); await gotoTab(p, tab); };
const lobby = (btn) => async (p) => { await reset(p); await gotoTab(p, 'play'); await p.click(btn); await p.waitForFunction(() => !document.querySelector('#home').hidden, null, { timeout: 10000 }); };
const rank = (sels) => (c) => { const i = sels.findIndex((s) => c.sel === s); return i < 0 ? 0 : i + 1; };
const signedIn = (p) => p.evaluate(() => document.querySelector('#signin').classList.contains('in'));
async function signOut(p) { if (!(await signedIn(p))) return; await p.click('#signin'); await p.waitForSelector('#signOut', { timeout: 10000 }); await p.click('#signOut'); await p.waitForFunction(() => !document.querySelector('#signin').classList.contains('in'), null, { timeout: 10000 }); }
async function signIn(p) { if (await signedIn(p)) return; await p.click('#signin'); await p.waitForSelector('#email', { state: 'visible' }); await p.fill('#email', 'audit@example.com'); await p.click('#emailBtn');
  await p.waitForFunction(() => document.querySelector('#signin').classList.contains('in'), null, { timeout: 15000 }); await reset(p); }
const acctOut = async (p) => { await reset(p); await gotoTab(p, 'play'); await signOut(p); await reset(p); await p.click('#signin'); await p.waitForSelector('#acctOut', { state: 'visible', timeout: 10000 }); };
const acctIn = async (p) => { await reset(p); await gotoTab(p, 'play'); await signIn(p); await p.click('#signin'); await p.waitForSelector('#acctIn', { state: 'visible', timeout: 10000 }); };
const acctLink = async (p) => { await acctIn(p); await p.click('#mkWallet'); await p.waitForSelector('#acct .linkbox', { state: 'visible', timeout: 10000 }); };
async function privateRoom(p) { await reset(p); await gotoTab(p, 'play'); await p.click('#playUnranked'); await p.click('#create'); await p.waitForSelector('#panel #start', { state: 'visible', timeout: 90000 }); }
async function practiceMatch(p) {
  await reset(p); await gotoTab(p, 'play');
  // test set-up (as tests/browser/specials-play.mjs): a level-10 player with Ice Ball, Sky Ball and Snowball Rain in SB1–SB3, so the SB buttons exist
  // (put back by reset() when the match is left, so the test's specials don't leak into the Avatar screen's preview)
  await p.evaluate(() => { const s = window.__sq; window.__auditSaved = { l: s.me.l, a: { ...s.me.a } }; s.me.l = 10; Object.assign(s.me.a, { sb1: 'sb_ice', sb2: 'sb_sky', sb3: 'sb_rain' }); });
  await p.click('#playUnranked'); await p.click('#practice'); await p.waitForSelector('#panel #start', { state: 'visible', timeout: 90000 }); await p.click('#panel #start');
  await p.waitForFunction(() => { const s = window.__sq; if (/^(intro|count)$/.test(s.sim?.S.phase)) s.sim.S.time = 0; return s.view?.phase === 'play'; }, null, { timeout: 90000 });
  await p.waitForSelector('#hud [data-sb]', { timeout: 30000 }).catch(() => {});
}
async function watchSetup(p, ctx) {
  if (!ctx.host) { const h = await openPage(ctx.context, ctx.url); ctx.host = h.p; await h.p.click('#playUnranked'); await h.p.click('#quick'); }
  await reset(p); await gotoTab(p, 'play'); await p.click('#playUnranked');
  await p.click('#lobbyModes [data-lmode="ffa"]'); // the host's Auto match is FFA; the list only shows the picked type (TEAM was clicked earlier)
  await p.waitForSelector('#gamesList [data-watch]', { timeout: 90000 });
}
async function buyDlg(p) { await reset(p); await gotoTab(p, 'games'); await p.click('#slots [data-run="1"]'); await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 }); }
// (a script click: the real mouse click on "How to win" is recorded on the Games tab screen, where it was intercepted)
async function howDlg(p) { await reset(p); await gotoTab(p, 'games'); await p.evaluate(() => document.querySelector('#howBtn').click()); await p.waitForFunction(() => document.querySelector('#howDlg').open, null, { timeout: 10000 }); }
async function proofDlg(p) { await reset(p); await gotoTab(p, 'games'); await p.click('[data-proof="big"]', { timeout: 8000 }); await p.waitForFunction(() => document.querySelector('#proofDlg').open, null, { timeout: 10000 }); }
const avatarSlot = (s) => async (p) => { await reset(p); await gotoTab(p, 'avatar'); await p.click(`#avslots [data-slot="${s}"]`); await p.waitForTimeout(250); };

// ---------------------------------------------------------------- purchase traces
// The page's own wallet step (wallet.js's window.santaPay) can't work here: it loads its Solana libraries from a CDN, which this
// test answers 503. So each purchase is tried twice: first with the page's own santaPay (records what a player sees when the
// wallet step fails), then with the stand-in wallet that pays like pay.js would. realPay() puts the page's own one back.
async function installPay(ctx) {
  if (!ctx.payExposed) { ctx.payExposed = true; await ctx.p.exposeFunction('auditPay', (q) => payFor(q)); }
  await ctx.p.evaluate(() => { if (!('__realPay' in window)) window.__realPay = window.santaPay; window.santaPay = (q) => window.auditPay(q); });
}
// a purchase is complete when every step passed except the page's own wallet step (it can't work in this test, see above)
const allOk = (steps) => steps.filter((s) => !/page's own/.test(s.step)).every((s) => s.ok);
const realPay = (ctx) => ctx.p.evaluate(() => { if ('__realPay' in window) window.santaPay = window.__realPay; });
const count = async (sql, args = [me]) => +(await db.query(sql, args))[0].n;
async function waitNote(p, sel, timeout = 60000) { await p.waitForFunction((s) => { const t = document.querySelector(s)?.textContent || ''; return t && !/^(Getting a price|Approve|Confirming)/.test(t); }, sel, { timeout }).catch(() => {}); return clean(await p.textContent(sel)); }
async function skipRow(ctx, scope) { // Skip ahead is only on screen during a run: exercise it there
  const s = `${scope} .skip`;
  try { await ctx.p.waitForSelector(s + ':not([hidden])', { timeout: 20000 }); } catch { return; }
  const c = await ctx.p.evaluate((x) => window.__audit.one(x), s); if (!c) return;
  const row = await exercise(ctx, { name: 'Games tab during a run' }, c); results.push(row); say(row);
}
async function traceRun(ctx, game) {
  const { p, mode, st } = ctx, scope = game === 'big' ? '#slots' : '#drop', sel = `${scope} [data-run="1"]`, res = `${scope} .res`;
  const item = game === 'big' ? 'Games: Big Hat, Pull 1' : 'Games: Snowball Drop, Drop 1 (10¢)', steps = [], add = (step, ok, ev) => steps.push({ step, ok, ev });
  await reset(p); await gotoTab(p, 'games');
  add('price shown', true, `button "${clean(await p.textContent(sel))}"`);
  await p.click(sel); await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 });
  add('confirm dialog', true, `"${clean(await p.textContent('#buyWhat'))}"; SANTA line: "${clean(await p.textContent('#buySanta')) || '(empty: the live price is blocked in this test)'}"`);
  if (mode === 'demo') {
    const bal0 = clean(await p.textContent('#demoBal')), n0 = st.net.length; await p.click('#buyGo');
    await skipRow(ctx, scope); await waitIdle(p);
    const bal1 = clean(await p.textContent('#demoBal'));
    add('paid (demo balance)', bal0 !== bal1, `${bal0} → ${bal1}`);
    add('played, result shown', true, `"${clean(await p.textContent(res)).slice(0, 110)}"`);
    add('server', false, `demo mode: the house runs in this browser (house.js); no server call${st.net.length > n0 ? ' (but saw: ' + st.net.slice(n0).join(', ') + ')' : ''}`);
    purchases.push({ mode, item, steps, furthest: 'played in the browser demo (pretend money)', missing: 'nothing in demo; real money needs server mode' });
    return;
  }
  const q0 = await count('select count(*) n from public.quotes where profile_id = $1'), n0 = st.net.length;
  await realPay(ctx); await p.click('#buyGo'); const note = await waitNote(p, '#buyNote');
  const q1 = await count('select count(*) n from public.quotes where profile_id = $1');
  add('server quote', q1 > q0, `quotes for this player ${q0} → ${q1}; network: ${st.net.slice(n0).join(', ') || 'none'}`);
  add("wallet pay step (the page's own wallet.js)", false, `"${note}" (wallet.js's Solana libraries come from a CDN, blocked in this test, so this step can't finish here; nothing was charged)`);
  await reset(p); await gotoTab(p, 'games');
  await installPay(ctx);
  const r0 = await count('select coalesce(max(id),0) n from public.runs where profile_id = $1'), paid0 = paidCount, n1 = st.net.length;
  await p.click(sel); await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 }); await p.click('#buyGo');
  await skipRow(ctx, scope); await waitIdle(p); await p.waitForTimeout(1500);
  const run = (await db.query('select * from public.runs where profile_id = $1 order by id desc limit 1', [me]))[0];
  add('wallet pay step (stand-in wallet)', paidCount > paid0, `the page called window.santaPay(quote) → signature ${paidCount > paid0 ? 'made' : 'NOT made'}`);
  add('server confirms payment', !!run && +run.id > r0, run ? `run #${run.id}: ${run.n} play(s), kind ${run.kind ?? '?'}, paid_at ${run.paid_at ? 'set' : 'EMPTY'}` : 'no run row');
  const plays = run ? await db.query('select state, pay_raw from public.plays where run_id = $1', [run.id]) : [], pays = run ? await db.query('select amount_raw, status from public.payouts where run_id = $1', [run.id]) : [];
  const won = plays.reduce((a, x) => a + +x.pay_raw, 0);
  add('granted (plays settled, winnings queued)', plays.length > 0 && plays.every((x) => x.state === 'settled') && (won ? pays.length === 1 : true),
    `${plays.filter((x) => x.state === 'settled').length}/${plays.length} plays settled; won ${won} raw; payouts: ${pays.map((x) => x.amount_raw + ' ' + x.status).join(', ') || 'none (nothing won)'}; page says "${clean(await p.textContent(res)).slice(0, 90)}"; network: ${st.net.slice(n1).join(', ')}`);
  const ok = allOk(steps);
  purchases.push({ mode, item, steps, furthest: ok ? 'COMPLETE: paid, confirmed by the server, played, winnings queued for the payout worker' : 'stopped short (see steps)', missing: ok ? 'nothing in the page/server path; real wallet (Phantom) + deployed Edge Function still unproven here' : 'see failed step' });
}
async function traceLottery(ctx) {
  const { p, mode, st } = ctx, steps = [], add = (step, ok, ev) => steps.push({ step, ok, ev });
  await reset(p); await gotoTab(p, 'store');
  const kind = await p.evaluate(() => (document.querySelector('[data-lot="weekly-10"]') || document.querySelector('[data-lot]')).dataset.lot), card = `[data-lot="${kind}"]`;
  const item = `Store: Santa Lottery (${kind}), 1 ticket`;
  add('price shown', true, `card rows: "${clean(await p.textContent(card + ' .lotrows')).slice(0, 120)}"`);
  await p.fill(card + ' input', '1');
  await realPay(ctx);
  const n0 = st.net.length, q0 = await count('select count(*) n from public.lottery_quotes where profile_id = $1').catch(() => -1);
  await p.click(card + ' [data-buy]'); const note = await waitNote(p, card + ' .lotnote');
  if (mode === 'demo') {
    add('server quote', false, `"${note}" (no server in demo; lotteryui.js buy() stops before asking)`);
    purchases.push({ mode, item, steps, furthest: 'price shown; says "sales open soon"', missing: 'demo only; server mode below' }); return;
  }
  const q1 = await count('select count(*) n from public.lottery_quotes where profile_id = $1').catch(() => -1);
  add('server quote', q1 > q0, `lottery quotes ${q0} → ${q1}; network: ${st.net.slice(n0).join(', ')}`);
  add("wallet pay step (the page's own wallet.js)", false, `"${note}" (its Solana libraries are blocked in this test; nothing was charged)`);
  await installPay(ctx);
  const b0 = await count('select count(*) n from public.lottery_buys where profile_id = $1').catch(() => -1), n1 = st.net.length;
  await p.click(card + ' [data-buy]'); await p.waitForFunction((s) => /tickets #|Not paid|error|wrong|refund|closed/i.test(document.querySelector(s)?.textContent || ''), card + ' .lotnote', { timeout: 60000 }).catch(() => {});
  const note2 = clean(await p.textContent(card + ' .lotnote'));
  const b1 = await count('select count(*) n from public.lottery_buys where profile_id = $1').catch(() => -1);
  add('wallet pay step (stand-in wallet)', true, 'window.santaPay(quote) called');
  add('server confirms payment', b1 > b0, `lottery_buys for this player ${b0} → ${b1}; network: ${st.net.slice(n1).join(', ')}`);
  add('granted (tickets numbered, shown)', /tickets #/.test(note2), `"${note2}"; card "Yours": "${clean(await p.evaluate((c) => [...document.querySelectorAll(c + ' .lotrows div')].find((d) => /Yours/.test(d.textContent))?.textContent, card))}"`);
  const ok = allOk(steps);
  purchases.push({ mode, item, steps, furthest: ok ? 'COMPLETE: paid, server checked the payment and numbered the tickets' : 'stopped short (see steps)', missing: ok ? 'nothing in the page/server path (needs the server deployed + a real wallet)' : 'see failed step' });
}
// The shop (shopui.js → server/shop.js, Cody 2026-10-02): ranked tickets, Buy level, a Store special snowball, a Store gear, a look
// on the Avatar screen. Each: signed in on the page → click Buy → [demo] "payments open soon" | [server] shop-quote → wallet step
// (first with no wallet, then the stand-in) → shop-buy → granted (checked in the database) → what the page says.
async function traceShop(ctx) {
  const { p, mode, st } = ctx;
  await reset(p); await gotoTab(p, 'play'); await signIn(p);
  const owns = async (id) => !!(await db.query('select 1 from public.inventory where profile_id = $1 and item_id = $2', [me, id]))[0];
  const level = async () => +(await db.query('select level from public.profiles where id = $1', [me]))[0].level;
  const extra = async () => +((await db.query('select extra from public.tickets where profile_id = $1', [me]).catch(() => []))[0]?.extra || 0);
  const quotes = () => count('select count(*) n from public.shop_quotes where profile_id = $1');
  // one purchase: open(): go to the screen and return { btn, note } selectors; granted(): the database check
  const one = (item, open, granted) => one1(item, open, granted).catch((e) => { purchases.push({ mode, item, steps: [], furthest: 'the trace failed', missing: 'trace error: ' + clean(e.message).slice(0, 200) }); log('  trace failed: ' + item + ': ' + e.message.split('\n')[0]); });
  const one1 = async (item, open, granted) => {
    const steps = [], add = (step, ok, ev) => steps.push({ step, ok, ev });
    let s; try { s = await open(); } catch (e) { purchases.push({ mode, item, steps, furthest: 'could not reach its Buy button', missing: clean(e.message).slice(0, 160) }); return; }
    add('price shown', true, `button "${clean(await p.textContent(s.btn))}"${s.price ? '; ' + s.price : ''}`);
    const dis = await p.evaluate((b) => document.querySelector(b).disabled, s.btn);
    if (dis) { add('buy button', false, 'disabled'); purchases.push({ mode, item, steps, furthest: 'price shown; Buy is disabled', missing: 'Buy button disabled' }); return; }
    await realPay(ctx);
    const before = await granted(), q0 = await quotes(), n0 = st.net.length;
    await p.evaluate((x) => { const n = document.querySelector(x); if (n) n.textContent = ''; }, s.note);
    await p.click(s.btn); const note = await waitNote(p, s.note, 30000);
    if (mode === 'demo') {
      add('server quote', false, `"${note}" (demo: shopBuy stops before asking any server)`);
      purchases.push({ mode, item, steps, furthest: 'price shown; Buy says payments open soon', missing: 'demo only; server mode below' }); return;
    }
    const q1 = await quotes();
    add('server quote', q1 > q0, `shop quotes ${q0} → ${q1}; network: ${st.net.slice(n0).join(', ') || 'none'}${q1 > q0 ? '' : '; page says "' + note + '"'}`);
    if (q1 <= q0) { purchases.push({ mode, item, steps, furthest: 'price shown; the server gave no quote', missing: `server refused: "${note}"` }); return; }
    const mid = await granted();
    add("wallet pay step (the page's own wallet.js)", false, `"${note}" (its Solana libraries are blocked in this test)${JSON.stringify(mid) !== JSON.stringify(before) ? ' BUT SOMETHING WAS GRANTED ANYWAY' : '; nothing granted'}`);
    await installPay(ctx);
    if (s.reopen) await s.reopen();
    const paid0 = paidCount, n1 = st.net.length;
    await p.evaluate((x) => { const n = document.querySelector(x); if (n) n.textContent = ''; }, s.note);
    await p.click(s.btn); const note2 = await waitNote(p, s.note, 60000);
    const after = await granted();
    add('wallet pay step (stand-in wallet)', paidCount > paid0, 'window.santaPay(quote) ' + (paidCount > paid0 ? 'called, payment made' : 'NOT called'));
    add('server confirms payment', st.net.slice(n1).some((x) => /^shop-buy → 200/.test(x)), `network: ${st.net.slice(n1).join(', ') || 'none'}`);
    add('granted (database)', JSON.stringify(after) !== JSON.stringify(before), `${JSON.stringify(before)} → ${JSON.stringify(after)}; page says "${note2}"`);
    const ok = allOk(steps);
    purchases.push({ mode, item, steps, furthest: ok ? 'COMPLETE: quoted, paid, checked by the server and granted' : 'stopped short (see steps)', missing: ok ? 'nothing in the page/server path (real wallet + deployed server still unproven here)' : 'see the failed step' });
  };
  await one('Store: ranked tickets, 1-ticket pack', async () => { await reset(p); await gotoTab(p, 'store'); return { btn: '.packs [data-tix="1"]', note: '#tixNote', price: clean(await p.textContent('.packs .pack em')) }; }, extra);
  await one('Play: Player Progress "Buy level"', async () => { await reset(p); await gotoTab(p, 'play'); return { btn: '#pgBuy', note: '#pgNote' }; }, level);
  const storeItem = (prefix) => async () => { await reset(p); await gotoTab(p, 'store');
    const id = await p.evaluate((x) => document.querySelector(`#carousels [data-buyitem^="${x}"]`)?.dataset.buyitem, prefix); if (!id) throw new Error(`no Buy button for any ${prefix}… item in the Store`);
    storeItem.id = id; const sel = `#carousels [data-buyitem="${id}"]`;
    return { btn: sel, price: clean(await p.evaluate((x) => { const it = document.querySelector(x).closest('.shopitem'); return it.querySelector('b').textContent + ' ' + (it.querySelector('.price')?.textContent || ''); }, sel)) }; };
  for (const [what, prefix] of [['Store: special snowball', 'sb_'], ['Store: special gear', 'gear_']]) {
    let id = null;
    await one(what, async () => { const s = await storeItem(prefix)(); id = storeItem.id;
      // the note under this item (the Store is redrawn after a purchase and its Buy turns into "Owned")
      s.note = `#carousels .shopitem:has([data-buyitem="${id}"], [data-owned="${id}"]) .shopnote`;
      return s; }, async () => (id ? owns(id) : null));
  }
  // a look on the Avatar screen: preview a priced locked one, then its Buy
  let look = null;
  await one('Avatar: a look item ("Buy <name>")', async () => { await reset(p); await gotoTab(p, 'avatar');
    const slots = await p.evaluate(() => [...document.querySelectorAll('#avslots [data-slot]')].map((b) => b.dataset.slot).filter((x) => x !== 'sball' && x !== 'gear'));
    for (const sl of slots) { await p.click(`#avslots [data-slot="${sl}"]`); await p.waitForTimeout(250);
      look = await p.evaluate(() => [...document.querySelectorAll('#avgrid .pick.locked')].find((x) => /\$/.test(x.textContent))?.dataset.pick || null); if (look) break; }
    if (!look) throw new Error('no priced locked look at this level');
    await p.click(`#avgrid [data-pick="${look}"]`); await p.waitForSelector('#avbuy:not([hidden])', { timeout: 5000 });
    // Buy offers the FIRST locked item in the preview, which may not be the one just picked (earlier picks stay in the draft)
    const offered = await p.evaluate(() => document.querySelector('#avbuy').dataset.item), picked = look; look = offered;
    return { btn: '#avbuy', note: '#avmsg', price: `picked ${picked}; Buy offers ${offered}${offered !== picked ? ' (NOT the one just picked)' : ''}` }; }, async () => (look ? owns(look) : null));
}
// ---------------------------------------------------------------- one full pass in one mode
async function runMode(mode) {
  const url = mode === 'demo' ? '/online.html?net=local' : '/online.html?net=local&server=' + encodeURIComponent(API) + '&token=test-token';
  const context = await newContext(), { p, st } = await openPage(context, url);
  await p.waitForTimeout(1500);
  const ctx = { mode, p, st, context, url };
  await gotoTab(p, 'avatar');
  const avSlots = await p.evaluate(() => [...document.querySelectorAll('#avslots [data-slot]')].map((b) => b.dataset.slot));
  const before = [
    { name: 'Top bar', enter: T('play'), roots: '#nav' },
    { name: 'Play tab', enter: T('play'), roots: '#tab-play' },
    { name: 'Unranked lobby', enter: lobby('#playUnranked'), roots: '#home', exclude: '#gamesList', wait: 4000 },
    { name: 'Ranked lobby', enter: lobby('#playRanked'), roots: '#home', exclude: '#gamesList' },
    { name: 'Lobby games list (Watch now)', enter: watchSetup, roots: '#gamesList', wait: 8000 },
    { name: 'Private room (warm-up)', enter: privateRoom, roots: '#panel, #gamebar', persistent: true, last: rank(['#start', '#leave']), wait: 5000 },
    { name: 'Practice match (playing)', enter: practiceMatch, roots: '#hud, #emotes, #zoom, #gamebar', persistent: true, last: rank(['#leave']), wait: 4000,
      pre: async (pp, c) => { if (/data-e=/.test(c.sel)) await pp.waitForTimeout(1300); } }, // emotes: one per 1.2 s by design
    { name: 'Games tab', enter: T('games'), roots: '#tab-games', exclude: 'dialog' },
    { name: 'Buy dialog (Big Hat, Pull 1)', enter: buyDlg, roots: '#buyDlg', wait: 6000, after: async (pp) => { await reset(pp); await waitIdle(pp); } },
    { name: 'How to win dialog', enter: howDlg, roots: '#howDlg' },
    { name: 'Store tab', enter: T('store'), roots: '#tab-store', wait: mode === 'server' ? 6000 : 2500,
      pre: async (pp, c) => { if (/data-amt/.test(c.sel)) await pp.evaluate((s) => { document.querySelector(s).closest('[data-lot]').querySelector('input').value = '7'; }, c.sel); } }, // so "1" has something to change
    { name: 'Avatar tab', enter: T('avatar'), roots: '#tab-avatar', exclude: '#avgrid, #avsb' },
    ...avSlots.map((s) => ({ name: 'Avatar · ' + s, enter: avatarSlot(s), roots: '#avgrid, #avsb' })),
    { name: 'Ranks tab', enter: T('ranks'), roots: '#tab-ranks', wait: 3000 },
    { name: 'Sign-in sheet (signed out)', enter: acctOut, roots: '#acct', wait: 4000 },
  ];
  const after = [
    { name: 'Games tab after a run', enter: T('games'), roots: '#tab-games .credrow' },
    { name: 'Check this result dialog', enter: proofDlg, roots: '#proofDlg', wait: 6000 },
    ...(mode === 'server' ? [{ name: 'Store: recent lottery draws', enter: T('store'), roots: '#lotResults', wait: 8000 }] : []),
    { name: 'Account sheet (signed in)', enter: acctIn, roots: '#acct', last: rank(['#signOut']), wait: 4000 },
    { name: 'Account sheet: link-a-wallet box', enter: acctLink, roots: '#acct .linkbox', wait: 4000 },
  ];
  for (const sc of before) await runScreen(ctx, sc);
  if (ctx.host) { await ctx.host.close().catch(() => {}); ctx.host = null; }
  log(`\n[${mode}] PURCHASE TRACES`);
  for (const f of [() => traceRun(ctx, 'big'), () => traceRun(ctx, 'drop'), () => traceLottery(ctx), () => traceShop(ctx)]) {
    try { await f(); } catch (e) { purchases.push({ mode, item: 'trace failed', steps: [], furthest: '', missing: 'the trace itself failed: ' + clean(e.message).slice(0, 200) }); log('  trace failed: ' + e.message.split('\n')[0]); }
  }
  for (const pu of purchases.filter((x) => x.mode === mode)) log(`  ${pu.item}: ${pu.furthest}`);
  for (const sc of after) await runScreen(ctx, sc);
  await p.screenshot({ path: `${OUT}shots/${mode}-end.png` }).catch(() => {});
  if (st.errors.length) notes.push(`[${mode}] page errors during the run: ${[...new Set(st.errors)].join(' | ').slice(0, 400)}`);
  await context.close();
}
async function runAdmin(mode) {
  const context = await newContext({ viewport: { width: 1100, height: 900 } });
  if (mode === 'server') await context.addInitScript(({ pkcs8, addr }) => {
    const kp = crypto.subtle.importKey('pkcs8', new Uint8Array(pkcs8), { name: 'Ed25519' }, false, ['sign']);
    window.phantom = { solana: { async connect() {}, publicKey: { toString: () => addr }, async signMessage(bytes) { return { signature: new Uint8Array(await crypto.subtle.sign('Ed25519', await kp, bytes)) }; } } };
  }, { pkcs8, addr: ADMIN });
  const url = mode === 'demo' ? '/admin.html' : '/admin.html?server=' + encodeURIComponent(API);
  const { p, st } = await openPage(context, url, 'document.querySelector("#connect")');
  await p.waitForTimeout(2500);
  const ctx = { mode: 'admin-' + mode, p, st, context, url };
  await runScreen(ctx, { name: mode === 'demo' ? 'admin.html (no ?server, no wallet)' : 'admin.html (server, stand-in admin wallet)', enter: async () => {}, roots: 'main', persistent: true, wait: 4000,
    last: (c) => (c.sel === '#connect' ? -1 : 0) });
  await p.screenshot({ path: `${OUT}shots/admin-${mode}.png`, fullPage: true }).catch(() => {});
  if (st.errors.length) notes.push(`[admin-${mode}] page errors: ${[...new Set(st.errors)].join(' | ').slice(0, 300)}`);
  await context.close();
}

// Server probes: does the game server answer any purchase that has no page path? (an unknown action → 400 "unknown action")
async function probes() {
  const out = [];
  for (const action of ['shop-owned', 'buy-item', 'buy-level', 'buy-tickets']) {
    const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test-token', origin: BASE }, body: JSON.stringify({ action }) });
    out.push(`${action} → ${r.status} ${clean(await r.text()).slice(0, 60)}`);
  }
  const state = {
    inventory: await count('select count(*) n from public.inventory where profile_id = $1').catch((e) => 'n/a ' + e.message),
    level: (await db.query('select level from public.profiles where id = $1', [me]))[0]?.level,
    ticketPurchases: await count('select count(*) n from public.ticket_purchases where profile_id = $1').catch((e) => 'n/a ' + clean(e.message).slice(0, 50)),
    extraTickets: +((await db.query('select extra from public.tickets where profile_id = $1', [me]).catch(() => []))[0]?.extra || 0),
    shopQuotes: await count('select count(*) n from public.shop_quotes where profile_id = $1').catch(() => 'n/a'), itemPurchases: await count('select count(*) n from public.item_purchases where profile_id = $1').catch(() => 'n/a'),
    shopRefunds: await count('select count(*) n from public.shop_refunds where profile_id = $1').catch(() => 'n/a'),
    levelPurchases: await count('select count(*) n from public.level_purchases where profile_id = $1').catch((e) => 'n/a ' + clean(e.message).slice(0, 50)),
    runs: await count('select count(*) n from public.runs where profile_id = $1'), lotteryBuys: await count('select count(*) n from public.lottery_buys where profile_id = $1').catch(() => 'n/a'),
  };
  return { out, state };
}

const t0 = Date.now();
try {
  if (!ONLY || ONLY === 'demo') { await runMode('demo'); await runAdmin('demo'); }
  if (!ONLY || ONLY === 'server') { await runMode('server'); await runAdmin('server'); }
} catch (e) { notes.push('THE AUDIT RUN STOPPED EARLY: ' + e.stack.split('\n').slice(0, 3).join(' ')); log(e); }
const pr = await probes().catch((e) => ({ out: ['probes failed: ' + e.message], state: {} }));
log('\nserver probes:', pr.out.join(' | ')); log('database after:', JSON.stringify(pr.state));

// ---------------------------------------------------------------- write it down
const minutes = ((Date.now() - t0) / 60000).toFixed(1);
const prev = existsSync(OUT + 'results.json') && ONLY ? JSON.parse(readFileSync(OUT + 'results.json', 'utf8')) : null;
const keep = (arr, key) => (prev ? (prev[key] || []).filter((r) => !String(r.mode).replace('admin-', '').startsWith(ONLY)) : []).concat(arr);
const all = { when: new Date().toISOString(), minutes, dbNote, seedNote, results: keep(results, 'results'), purchases: keep(purchases, 'purchases'), notes: (prev && ONLY ? prev.notes.filter((n) => !n.includes(`[${ONLY}`) && !n.includes(`[admin-${ONLY}`)) : []).concat(notes), probes: pr, blocked: [...blocked].sort() };
writeFileSync(OUT + 'results.json', JSON.stringify(all, null, 1));
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const counts = {}; for (const r of all.results) { const k = r.mode + ' · ' + r.screen; counts[k] ||= {}; counts[k][r.result] = (counts[k][r.result] || 0) + 1; }
let md = `# Every control, clicked (generated by tests/browser/button-audit.mjs, ${all.when}, ${minutes} min)\n\n`;
md += `Classes: NAVIGATES · OPENS · CLOSES · CHANGES · PLAYS · NETWORK · EXPLAINS · NOTHING (dead end) · NO-OP (already selected) · DISABLED · FIELD (text box/drop-down, not clicked) · GONE / NOT REACHED (couldn't be tested). "also" = more classes that applied.\n\n`;
md += `## Count per screen\n\n| Mode · screen | Controls | Results |\n|---|---|---|\n` + Object.entries(counts).map(([k, v]) => `| ${esc(k)} | ${Object.values(v).reduce((a, b) => a + b, 0)} | ${Object.entries(v).map(([c, n]) => `${c} ${n}`).join(', ')} |`).join('\n') + '\n\n';
md += `## Purchase paths\n\n` + all.purchases.map((pu) => `### [${pu.mode}] ${esc(pu.item)}\nFurthest: **${esc(pu.furthest)}**. Missing: ${esc(pu.missing)}\n\n` + (pu.steps.length ? '| Step | Reached | Evidence |\n|---|---|---|\n' + pu.steps.map((s) => `| ${esc(s.step)} | ${s.ok ? 'yes' : '**no**'} | ${esc(s.ev)} |`).join('\n') : '') + '\n').join('\n') + '\n';
md += `## Server probes (purchase actions the page never calls)\n\n` + all.probes.out.map((x) => `- ${esc(x)}`).join('\n') + `\n\nDatabase afterwards (the audited player): \`${JSON.stringify(all.probes.state)}\`\n\n`;
md += `## Every control\n\n| Mode | Screen | Label | Selector | Result | Also | Notes |\n|---|---|---|---|---|---|---|\n` + all.results.map((r) => `| ${r.mode} | ${esc(r.screen)} | ${esc(r.label)} | \`${esc(r.sel)}\` | **${r.result}** | ${r.also.join(', ')} | ${esc(r.notes)}${r.shot ? ` ([shot](${r.shot}))` : ''} |`).join('\n') + '\n\n';
md += `## Notes\n\n` + all.notes.map((n) => `- ${esc(n)}`).join('\n') + `\n- Test database: ${esc(all.dbNote || 'all files applied')}; seeds: ${esc(all.seedNote)}\n- Answered 503 (nothing left this computer): ${all.blocked.map((b) => '`' + b + '`').join(', ')}\n`;
writeFileSync(OUT + 'controls.md', md);
log(`\nwrote ${OUT}controls.md and results.json (${all.results.length} controls, ${all.purchases.length} purchase traces) in ${minutes} min`);
await browser.close(); web.close(); process.exit(0);
