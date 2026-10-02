// The Avatar screen's Special Snowballs tab (Cody, 2026-10-01): slots SB1–SB3 opened by level, pick a slot then a special, a
// special in two slots moves instead, a special not owned can't be saved, the saved loadout is what the match buttons show; and
// the Store's Special Snowballs shelf. Local stand-in accounts (?net=local), same save rules as the database (012).
// Run: node loadout-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 860 } });
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.fulfill({ status: 503, body: '' }); });
const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message));
const open = async () => { await p.goto('http://localhost/online.html?net=local', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1500); };
const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('sq-local-db')));
const setDb = (fn) => p.evaluate((src) => { const d = JSON.parse(localStorage.getItem('sq-local-db')); new Function('d', src)(d); localStorage.setItem('sq-local-db', JSON.stringify(d)); }, fn);
const slots = () => p.evaluate(() => [...document.querySelectorAll('#avsb [data-sbslot]')].map((b) => b.textContent.trim() + (b.disabled ? ' (locked)' : '')));
const pick = async (slot, item) => { await p.click(`#avsb [data-sbslot="${slot}"]`); await p.waitForTimeout(150); await p.click(`#avgrid [data-pick="${item}"]`); await p.waitForTimeout(250); };

console.log('1. A level-1 player: one slot open; SB2 and SB3 say which level opens them');
await open();
await p.click('#signin'); await p.waitForTimeout(400); await p.fill('#email', 'cody@example.com'); await p.click('#emailBtn'); await p.waitForTimeout(900); await p.click('#acctClose').catch(() => {});
await p.click('#t-avatar'); await p.waitForTimeout(600); await p.click('[data-slot="sball"]'); await p.waitForTimeout(400);
check(JSON.stringify(await slots()) === JSON.stringify(['SB1Empty', 'SB2Opens at level 4 (locked)', 'SB3Opens at level 8 (locked)']), 'level 1: ' + (await slots()).join(' | '));

console.log('2. Level 8 owning Ice Ball and Sky Ball: fill, move, refuse what is not owned, save');
await setDb(`const pid = Object.values(d.logins)[0].pid; d.profiles[pid].level = 8; d.inv[pid] = ['sb_ice', 'sb_sky'];`);
await open(); await p.click('#t-avatar'); await p.waitForTimeout(600); await p.click('[data-slot="sball"]'); await p.waitForTimeout(400);
check((await slots()).every((s) => !/locked/.test(s)), 'level 8: all three open');
await pick('sb1', 'sb_ice'); await pick('sb2', 'sb_sky'); await pick('sb3', 'sb_ice');
check(JSON.stringify(await slots()) === JSON.stringify(['SB1Empty', 'SB2Sky Ball', 'SB3Ice Ball']), 'putting Ice Ball in SB3 moved it out of SB1: ' + (await slots()).join(' | '));
await pick('sb1', 'sb_fire');
check(await p.isDisabled('#avsave') && /isn't unlocked/.test(await p.textContent('#avmsg')), 'Fire Ball (not owned) previews but can\'t be saved: ' + (await p.textContent('#avmsg')));
await pick('sb1', 'sb_none'); await p.click('#avsave'); await p.waitForTimeout(900);
const saved = Object.values((await db()).profiles)[0].avatar;
check(saved.sb1 === 'sb_none' && saved.sb2 === 'sb_sky' && saved.sb3 === 'sb_ice', `saved: ${saved.sb1}, ${saved.sb2}, ${saved.sb3}`);
await p.screenshot({ path: 'out/loadout-avatar.png' });

console.log('3. The match: the SB buttons are the saved loadout');
await p.evaluate(() => window.__sq.startPractice()); await p.waitForTimeout(2500); await p.evaluate(() => document.querySelector('#start')?.click());
await p.waitForFunction(() => { const s = window.__sq; if (/^(intro|count)$/.test(s.sim?.S.phase)) s.sim.S.time = 0; return s.view?.phase === 'play'; }, null, { timeout: 60000 });
await p.waitForFunction(() => document.querySelectorAll('#hud .sbrow button').length > 0, null, { timeout: 20000 }).catch(() => {});
const btns = await p.evaluate(() => [...document.querySelectorAll('#hud .sbrow button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
check(btns.length === 2 && /^SB2 Sky Ball/.test(btns[0]) && /^SB3 Ice Ball/.test(btns[1]), 'buttons keep their slot numbers (SB1 is empty): ' + btns.join(' | '));
await p.click('#leave').catch(() => {}); await p.waitForTimeout(800);

console.log('4. The Store has a Special Snowballs shelf');
await p.click('#t-store'); await p.waitForTimeout(1500);
await p.waitForFunction(() => document.querySelectorAll('#carousels .shop').length, null, { timeout: 30000 });
const shelf = await p.evaluate(() => { const c = [...document.querySelectorAll('#carousels .shop')].find((x) => /Special Snowballs/.test(x.querySelector('h3')?.textContent || '')); return c ? [...c.querySelectorAll('.shopitem b')].map((b) => b.textContent) : []; });
check(shelf.join() === 'Ice Ball,Split Ball,Giant Ball,Fire Ball,Sky Ball,Snowball Rain', 'shelf: ' + shelf.join(', '));
check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); process.exit(0);
