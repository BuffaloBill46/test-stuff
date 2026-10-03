// THE $5 SEASON PASS ON THE LIVE SITE with devnet money (2026-10-03): a test player signs in with their wallet and, like a person,
// presses "Get the pass" on the Home page's season card. A real devnet payment, checked by the real game server, granted by the
// real database (shop_buy → shop_grant kind 'pass'). Checks what the card says after (the pass is theirs, pieces count) and that
// a second buy can't happen (the button is gone). The database side (season_passes, any backdated pieces) is checked after.
// Run (Windows, real Chrome): PW=<folder with node_modules/playwright> node live-pass-test.mjs [testPlayerNumber=4] [phone]
import { mkdirSync } from 'fs';
import { chromium, withWallet, signIn, santaRaw, SITE } from './live-wallet.mjs';
const N = +(process.argv[2] || 4), PHONE = process.argv[3] === 'phone', OUT = './out/livepass/'; mkdirSync(OUT, { recursive: true });
const fails = [], check = (ok, m) => { console.log((ok ? '  ✓ ' : '  ✗ ') + m); if (!ok) fails.push(m); };
const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 860 } });
await ctx.addInitScript(() => { try { localStorage.setItem('santa.coached', '1'); } catch {} });
const p = await ctx.newPage(), errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
p.on('response', async (r) => { if (r.status() >= 400 && !r.url().includes('api.devnet.solana.com')) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 90)} ${(await r.text().catch(() => '')).slice(0, 120)}`); });
const w = await withWallet(p, N);
const txt = (sel) => p.locator(sel).first().textContent().then((t) => t.replace(/\s+/g, ' ').trim(), () => '');
const tap = async (sel) => { const l = p.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); if (PHONE) await l.tap(); else await l.click(); };

const start = await santaRaw(w.addr);
console.log(`testPlayer${N} ${w.addr}: ${Number(start) / 1e6} test SANTA`);
await p.goto(SITE.replace(/#.*$/, '') + '#home', { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForFunction(() => window.__sq, null, { timeout: 60000 });
check(await signIn(p), `signed in: "${await txt('#signin')}"`);
await p.waitForFunction(() => !document.querySelector('#season').hidden && /Season pass/.test(document.querySelector('#ssGoldHead')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(2500);
const head0 = await txt('#ssGoldHead');
console.log(`  before: "${head0}" · buy button: ${await p.locator('#ssBuy').isVisible()}`);
if (/yours/.test(head0)) { console.log('  this test player already has the pass: nothing to buy (use another player number)'); await browser.close(); process.exit(0); }
const b = w.signs(); await tap('#ssBuy');
const t0 = Date.now(); let note = '';
while (Date.now() - t0 < 240000) { note = await txt('#ssBuyNote'); if (note && !/Getting a price|Approve|Confirming/.test(note)) break; await p.waitForTimeout(500); }
check(w.signs() === b + 1 && /season pass is yours/i.test(note), `Get the pass: "${note}" after ${Math.round((Date.now() - t0) / 1000)} s (wallet asked ${w.signs() - b}×)`);
await p.waitForFunction(() => /yours/.test(document.querySelector('#ssGoldHead')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
const head1 = await txt('#ssGoldHead');
check(/Season pass · yours · \d+ of 6 pieces/.test(head1), `the card says it's mine: "${head1}"`);
check(!(await p.locator('#ssBuy').isVisible()), 'no second "Get the pass" button');
await p.locator('#season').screenshot({ path: `${OUT}P${N}-after.png` }).catch(() => {});
const end = await santaRaw(w.addr);
console.log(`spent ${Number(start - end) / 1e6} test SANTA`);
check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 6).join(' | ') : ''));
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); process.exit(0);
