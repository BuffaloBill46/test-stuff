// LIVE STORE QA (Cody, 2026-10-04 final launch QA: "have each item bought 1 time to make sure the path works"). Fresh devnet test
// players sign in on the LIVE site with their wallet (live-wallet.mjs: real devnet transactions) and, through the page's own
// modules (its signed-in server calls and its wallet step, wallet.js), buy EVERY Store item for sale exactly once between them,
// plus a level each, the season pass, and Weekly lottery tickets. Ranked tickets must be refused while ranked is paused (Cody's
// switch). Every purchase is checked by the real game server and granted by the real database; the page's Owned list is
// checked after each. Writes out/livestore/summary.json.
// Run (Windows, real Chrome): PW=<folder with node_modules/playwright> node live-store-qa.mjs [first player=6] [players=3]
import { mkdirSync, writeFileSync } from 'fs';
import { chromium, withWallet, signIn, SITE } from './live-wallet.mjs';
const FIRST = +(process.argv[2] || 6), PLAYERS = +(process.argv[3] || 3), OUT = './out/livestore/'; mkdirSync(OUT, { recursive: true });
const fails = [], check = (ok, m) => { console.log((ok ? '  ✓ ' : '  ✗ ') + m); if (!ok) fails.push(m); };
const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist'] });

async function open(n) {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage(), errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const w = await withWallet(p, n);
  await p.goto(SITE + (SITE.includes('?') ? '&' : '?') + 't=' + Date.now() + '#store', { timeout: 90000 });
  await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1500);
  const ok = await signIn(p); check(ok, `test player ${n} signed in with their wallet`);
  return { n, p, w, errors };
}
// one purchase through the page: quote → the wallet pays (one real devnet payment) → the server checks it and grants it
const buy = (pl, quoteAction, buyAction, body) => pl.p.evaluate(async ({ quoteAction, buyAction, body }) => {
  const { call } = await import('./gameserver.js'), sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const q = await call(quoteAction, body); if (!q?.id) return { stage: 'quote', error: q?.error || JSON.stringify(q) };
  let sig; try { sig = await window.santaPay(q); } catch (e) { return { stage: 'pay', error: e.message }; }
  let b; for (let i = 0; i < 30; i++) { b = await call(buyAction, { quote: q.id, signature: sig }); if (b?.ok || !/not found|not finalized|slow down/i.test(b?.error || '')) break; await sleep(3000); }
  return b?.ok ? { ok: true, usd: q.usd, santaRaw: q.santaRaw, result: b } : { stage: 'buy', error: b?.error, sig };
}, { quoteAction, buyAction, body });

const players = [];
for (let i = 0; i < PLAYERS; i++) players.push(await open(FIRST + i));
// every item the Store sells (the page's own catalogue and sale rule), split between the players
const items = await players[0].p.evaluate(async () => { const { ITEMS } = await import('./catalog.js'), { forSale } = await import('./shoprules.js'); return ITEMS.filter(forSale).map((i) => ({ id: i.id, name: i.name, price: i.price })); });
console.log(`Store: ${items.length} items for sale`);
const results = [];
// each player works through its share in turn (purchases from one wallet go one at a time, like a person); players in parallel
await Promise.all(players.map(async (pl, k) => {
  for (const it of items.filter((_, j) => j % players.length === k)) {
    const r = await buy(pl, 'shop-quote', 'shop-buy', { kind: 'item', id: it.id });
    results.push({ player: pl.n, what: it.id, ...r });
    check(r.ok, `P${pl.n} bought ${it.name} ($${it.price})${r.ok ? '' : ' — ' + r.stage + ': ' + r.error}`);
  }
  const lv = await buy(pl, 'shop-quote', 'shop-buy', { kind: 'level' }); results.push({ player: pl.n, what: 'level', ...lv });
  check(lv.ok, `P${pl.n} bought a level${lv.ok ? ' (now ' + (lv.result.level ?? '?') + ')' : ' — ' + lv.stage + ': ' + lv.error}`);
  const lt = await buy(pl, 'lottery-quote', 'lottery-buy', { lottery: 'weekly-10', n: 2 }); results.push({ player: pl.n, what: 'lottery', ...lt });
  check(lt.ok, `P${pl.n} bought 2 Weekly 10¢ lottery tickets${lt.ok ? ' (#' + lt.result.tickets?.first + '–' + lt.result.tickets?.last + ')' : ' — ' + lt.stage + ': ' + lt.error}`);
}));
// the season pass: one player buys it; a second buy by the same player is refused before any payment
const ps = await buy(players[0], 'shop-quote', 'shop-buy', { kind: 'pass' }); results.push({ player: players[0].n, what: 'pass', ...ps });
check(ps.ok, `P${players[0].n} bought the season pass${ps.ok ? '' : ' — ' + ps.stage + ': ' + ps.error}`);
const ps2 = await players[0].p.evaluate(async () => (await (await import('./gameserver.js')).call('shop-quote', { kind: 'pass' })));
check(!ps2?.id && /already have/.test(ps2?.error || ''), `a second pass is refused before paying: "${ps2?.error}"`);
// ranked tickets while ranked is paused: refused before paying
const rt = await players[1 % players.length].p.evaluate(async () => (await (await import('./gameserver.js')).call('shop-quote', { kind: 'tickets', n: 1 })));
check(!rt?.id && /paused/i.test(rt?.error || ''), `ranked tickets while ranked is paused: refused before paying ("${rt?.error}")`);
// what the server says each player owns now
for (const pl of players) {
  const owned = await pl.p.evaluate(async () => (await (await import('./gameserver.js')).call('shop-owned', {}))?.items || []);
  const mine = items.filter((_, j) => j % players.length === players.indexOf(pl)).map((i) => i.id);
  check(mine.every((id) => owned.includes(id)), `P${pl.n} owns all ${mine.length} of its items (server's Owned list)`);
  check(!pl.errors.length, `P${pl.n}: no page errors ${pl.errors.slice(0, 2).join(' | ')}`);
}
writeFileSync(OUT + 'summary.json', JSON.stringify({ items: items.length, results }, null, 1));
await browser.close();
const bought = results.filter((r) => r.ok).length;
console.log(`\n${bought}/${results.length} purchases went through; ${fails.length ? 'FAILED ' + fails.length : 'ALL CHECKS PASSED'}`);
process.exit(fails.length ? 1 : 0);
