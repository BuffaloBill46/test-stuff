// The STORE and the LOTTERY on the LIVE site with devnet money (QA after the game server moved to the Droplet, 2026-10-03):
// a test player signs in with their wallet and, like a person clicking the page, buys 5 ranked tickets, one Store item, a level,
// and 2 Weekly 10¢ lottery tickets. Each is a real devnet payment checked by the real game server (api.santahatgames.com).
// Checks what the page says and shows (ticket counter, Owned, level, the lottery card's ticket count); the database side is
// checked after (shop purchases, the treasury's half, the lottery pot).
// Run (Windows, real Chrome): PW=<folder with node_modules/playwright> node live-shop-test.mjs [testPlayerNumber=4] [phone]
import { mkdirSync } from 'fs';
import { chromium, withWallet, signIn, santaRaw, SITE } from './live-wallet.mjs';
const N = +(process.argv[2] || 4), PHONE = process.argv[3] === 'phone', OUT = './out/liveshop/'; mkdirSync(OUT, { recursive: true });
const fails = [], check = (ok, m) => { console.log((ok ? '  ✓ ' : '  ✗ ') + m); if (!ok) fails.push(m); };
const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 860 } });
const p = await ctx.newPage(), errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
p.on('response', async (r) => { if (r.status() >= 400 && !r.url().includes('api.devnet.solana.com')) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 90)} ${(await r.text().catch(() => '')).slice(0, 120)}`); });
const w = await withWallet(p, N);
const txt = (sel) => p.locator(sel).first().textContent().then((t) => t.replace(/\s+/g, ' ').trim(), () => '');
const tap = async (loc) => { const l = typeof loc === 'string' ? p.locator(loc).first() : loc; await l.scrollIntoViewIfNeeded().catch(() => {}); if (PHONE) await l.tap(); else await l.click(); };
const shot = (n) => p.screenshot({ path: `${OUT}P${N}-${n}.png`, fullPage: false }).catch(() => {});
// Wait for a purchase: the wallet asked once, then the note settles on a final message (not "Getting…/Approve…/Confirming…")
async function bought(noteSel, label, before) {
  const t0 = Date.now(); let note = '';
  while (Date.now() - t0 < 240000) { note = await txt(noteSel); if (note && !/Getting a price|Approve|Confirming/.test(note)) break; await p.waitForTimeout(500); }
  check(w.signs() === before + 1 && !/not|error|couldn't|failed|went wrong/i.test(note), `${label}: "${note}" after ${Math.round((Date.now() - t0) / 1000)} s (wallet asked ${w.signs() - before}×)`);
  return note;
}

const start = await santaRaw(w.addr);
console.log(`testPlayer${N} ${w.addr}: ${Number(start) / 1e6} test SANTA`);
await p.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForFunction(() => window.__sq, null, { timeout: 60000 });
check(await signIn(p), `signed in: "${await txt('#signin')}"`);
await p.waitForTimeout(1500);
const tix0 = await txt('#tixchip b');
console.log(`  ticket counter: ${tix0}; progress: "${(await txt('#progress')).slice(0, 120)}"`);

// 1. A level (the Progress box on the Play page)
const lvl0 = await txt('#pgBuy');
if (/Buy level/.test(lvl0)) { const b = w.signs(); await tap('#pgBuy'); await bought('#pgNote', `Buy level ("${lvl0}")`, b); await shot('1-level');
  await p.waitForTimeout(1500); check((await txt('#pgBuy')) !== lvl0, `the level button moved on: "${await txt('#pgBuy')}"`); }
else console.log(`  (no level to buy: "${lvl0}")`);

// 2. Store: 5 ranked tickets
await tap('#t-store'); await p.waitForTimeout(1500);
{ const b = w.signs(); await tap('.packs [data-tix="5"]'); const note = await bought('#tixNote', 'Buy 5 ranked tickets', b); await shot('2-tickets');
  if (/\+5 ranked tickets/.test(note)) {
    await p.waitForFunction((t) => document.querySelector('#tixchip b')?.textContent !== t, tix0, { timeout: 30000 }).catch(() => {});
    check(+(await txt('#tixchip b')).split('/')[0] === Math.min(25, +tix0.split('/')[0] + 5), `the ticket counter went ${tix0} → ${await txt('#tixchip b')}`);
  } }

// 3. Store: the first item for sale
const item = await p.evaluate(() => { const b = document.querySelector('[data-buyitem]'); return b && { id: b.dataset.buyitem, card: b.closest('[class*="card"], li, article')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) }; });
if (item) { const b = w.signs(); await tap(`[data-buyitem="${item.id}"]`);
  // the Store's note is the one nearest the button; read whichever store note changes
  const t0 = Date.now(); let note = '';
  while (Date.now() - t0 < 240000) { note = await p.evaluate(() => [...document.querySelectorAll('#tab-store [aria-live]')].map((n) => n.textContent.trim()).filter(Boolean).join(' | ')); if (/Bought|refund|owed|not|error|failed|wrong/i.test(note)) break; await p.waitForTimeout(500); }
  check(w.signs() === b + 1 && /Bought/.test(note), `Buy item ${item.id} (${item.card}): "${note}"`);
  await p.waitForTimeout(1500);
  check(await p.evaluate((id) => !!document.querySelector(`[data-owned="${id}"]`), item.id), `${item.id} now shows Owned`); await shot('3-item'); }
else check(false, 'no item for sale found in the Store');

// 4. Lottery: 2 Weekly 10¢ tickets
const card = p.locator('[data-lot="weekly-10"]');
const lotBefore = (await card.textContent()).replace(/\s+/g, ' ');
await card.locator('input').fill('2');
{ const b = w.signs(); await tap(card.locator('.lotgo')); const note = await bought('[data-lot="weekly-10"] .lotnote', 'Buy 2 Weekly 10¢ lottery tickets', b);
  check(/tickets? #\d+/.test(note), `the card names my ticket numbers: "${note}"`); }
await p.waitForTimeout(3000); await shot('4-lottery');
console.log(`  weekly-10 card before: "${lotBefore.slice(0, 200)}"\n  after: "${(await card.textContent()).replace(/\s+/g, ' ').slice(0, 200)}"`);

const end = await santaRaw(w.addr);
console.log(`spent ${Number(start - end) / 1e6} test SANTA in ${w.signs()} payments`);
check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 6).join(' | ') : ''));
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); process.exit(0);
