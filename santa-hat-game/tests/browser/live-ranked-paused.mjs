// Ranked paused (Cody, 2026-10-02: /etc/santa/ranked-paused on the Droplet): a signed-in player pressing Ranked "Play now" on the
// live site must be told it's paused, spend no ticket, and not be put in a ranked match. Run while it's paused.
// Run (Windows, real Chrome): PW=<folder with node_modules/playwright> node live-ranked-paused.mjs [test player=5]
import { chromium, withWallet, signIn, SITE } from './live-wallet.mjs';
const N = +(process.argv[2] || 5), fails = [], check = (ok, m) => { console.log((ok ? '  ✓ ' : '  ✗ ') + m); if (!ok) fails.push(m); };
const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist'] });
const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await withWallet(p, N);
await p.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForFunction(() => window.__sq, null, { timeout: 60000 });
check(await signIn(p), 'signed in');
await p.waitForTimeout(2000);
const tix0 = await p.textContent('#tixchip b');
await p.click('#playRanked'); await p.waitForTimeout(800);
// whatever the lobby asks next (mode / Auto match), take the first ranked way in
for (const sel of ['#quick', '[data-ranked]', 'button:has-text("Auto match")']) { const l = p.locator(sel).first(); if (await l.isVisible().catch(() => false)) { await l.click(); break; } }
const said = await p.waitForFunction(() => /Ranked is paused/.test(document.body.innerText), null, { timeout: 30000 }).then(() => true, () => false);
const text = await p.evaluate(() => [...document.querySelectorAll('[aria-live], .toast, #panel, #home')].map((n) => n.innerText.trim()).filter((t) => /paused|ranked/i.test(t)).join(' | ').slice(0, 200));
check(said, `the player is told: "${text}"`);
check(!(await p.evaluate(() => window.__sq.view?.phase === 'play' && window.__sq.room?.ranked)), 'no ranked match started');
await p.waitForTimeout(2000);
check((await p.textContent('#tixchip b')) === tix0, `no ticket spent (${tix0} → ${await p.textContent('#tixchip b')})`);
await p.screenshot({ path: './out/live-ranked-paused.png' });
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); process.exit(0);
