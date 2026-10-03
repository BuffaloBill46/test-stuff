// The Store and Avatar screens after Cody's 2026-10-01 notes: the Store sells only 1. Special Snowballs and 2. Special Gear, each
// saying what it does, with the rules (snowballs forever, gear 7 days, no stacking); the three ranked-ticket packs sit in ONE row on
// phones; the Avatar screen's Backpacks tab is now Special Gear (G1, G2 from level 8, rules shown, same-stat gear refused) and the
// Special Snowballs tab shows what each one does. Local stand-in accounts (?net=local).
// Run: node store-gear-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, OUT = 'out/store'; mkdirSync(OUT, { recursive: true });
const fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const cache = new Map(); const fetchCurl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(vp) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 900, isMobile: vp.width < 900 });
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: fetchCurl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.abort(); });
  const p = await ctx.newPage(), errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost/online.html?net=local'); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(800);
  return { p, ctx, errors };
}
const store = async (p) => { await p.click('#t-store'); await p.waitForFunction(() => document.querySelectorAll('#carousels .shopitem').length > 0, null, { timeout: 30000 }); };

console.log('1. The Store: only Special Snowballs and Special Gear, each saying what it does, with the rules');
{ const { p, ctx, errors } = await open({ width: 1280, height: 860 });
  await store(p);
  const s = await p.evaluate(() => ({ heads: [...document.querySelectorAll('#carousels .shop h3')].map((h) => h.textContent), items: [...document.querySelectorAll('#carousels .shopitem')].map((it) => it.querySelector('b').textContent + ' | ' + it.querySelector('p').textContent),
    rules: [...document.querySelectorAll('#carousels .rule')].map((r) => r.textContent.replace(/\s+/g, ' ')), old: document.querySelectorAll('#carousels .carousel, #carousels [data-try^="shirt_"], #carousels [data-try^="hat_"], #carousels [data-try^="pack_"]').length }));
  check(JSON.stringify(s.heads) === JSON.stringify(['1. Special Snowballs', '2. Special Gear']), 'two sections: ' + s.heads.join(', '));
  check(s.old === 0, 'no look items (shirts, hats, backpacks) in the Store');
  check(s.items.length === 14 && !s.items.some((x) => /Pumpkin/.test(x)) && s.items.every((x) => x.split(' | ')[1].length > 5), `14 items (6 snowballs + 8 gear; the Heated Coat was removed 2026-10-02, the Pumpkin Costume retired 2026-10-03), each saying what it does (e.g. "${s.items[0]}", "${s.items[6]}")`);
  check(s.rules.some((r) => /Yours forever/.test(r)) && s.rules.some((r) => /Lasts 7 days/.test(r) && /first match wearing it/.test(r)) && s.rules.some((r) => /No stacking/.test(r) && /same stat/.test(r)), 'rules shown: snowballs forever, gear 7 days, no stacking');
  await p.evaluate(() => document.querySelector('#carousels').scrollIntoView({ block: 'start' })); await p.screenshot({ path: `${OUT}/desk-store.png` });

  console.log('2. Avatar: Special Gear replaces Backpacks; G2 opens at level 8; Special Snowballs show what they do');
  await p.click('#t-avatar'); await p.waitForTimeout(500);
  const tabs = await p.evaluate(() => [...document.querySelectorAll('#avslots [data-slot]')].map((b) => b.textContent));
  check(!tabs.includes('Backpacks') && tabs.includes('Special Gear') && tabs.includes('Special Snowballs'), 'tabs: ' + tabs.join(', '));
  await p.click('[data-slot="sball"]'); await p.waitForTimeout(300);
  const sbNotes = await p.evaluate(() => [...document.querySelectorAll('#avgrid .pick')].map((b) => b.querySelectorAll('small')[0]?.textContent || ''));
  check(sbNotes.filter((t) => t.length > 12).length >= 6 && (await p.textContent('#avsb')).includes('Yours forever'), 'Special Snowballs: what each does, and "Yours forever"');
  await p.click('[data-slot="gear"]'); await p.waitForTimeout(300);
  const g = await p.evaluate(() => ({ slots: [...document.querySelectorAll('#avsb [data-gslot]')].map((b) => b.textContent + (b.disabled ? ' (locked)' : '')), rule: document.querySelector('#avsb .avrule')?.textContent, n: document.querySelectorAll('#avgrid .pick').length }));
  check(JSON.stringify(g.slots) === JSON.stringify(['G1Empty', 'G2Opens at level 8 (locked)']) && /7 days/.test(g.rule) && /same stat/.test(g.rule) && g.n === 9 && !(await p.$('#avgrid [data-pick="gear_pumpkin"]')), `level 1 (8 gear + empty, no retired Pumpkin Costume): ${g.slots.join(' | ')}; rules; ${g.n} picks`);
  await p.screenshot({ path: `${OUT}/desk-avatar-gear.png` });
  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : '')); await ctx.close(); }

console.log('3. Level 8 owning Toy Sack, Backpack and Elf Shoes: two slots; same-stat gear refused with the rule; different stats fine');
{ const { p, ctx, errors } = await open({ width: 1280, height: 860 });
  await p.click('#signin'); await p.waitForTimeout(400); await p.fill('#email', 'cody@example.com'); await p.click('#emailBtn'); await p.waitForTimeout(900); await p.click('#acctClose').catch(() => {});
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('sq-local-db')); const pid = Object.values(d.logins)[0].pid; d.profiles[pid].level = 8; d.inv[pid] = ['gear_sack', 'gear_backpack', 'gear_shoes']; localStorage.setItem('sq-local-db', JSON.stringify(d)); });
  await p.reload(); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1000);
  await p.click('#t-avatar'); await p.waitForTimeout(500); await p.click('[data-slot="gear"]'); await p.waitForTimeout(300);
  const pick = async (slot, id) => { await p.click(`#avsb [data-gslot="${slot}"]`); await p.waitForTimeout(150); await p.click(`#avgrid [data-pick="${id}"]`); await p.waitForTimeout(250); };
  const slots = () => p.evaluate(() => [...document.querySelectorAll('#avsb [data-gslot]')].map((b) => b.textContent));
  await pick('g1', 'gear_sack');
  check(JSON.stringify(await slots()) === JSON.stringify(['G1Toy Sack', 'G2Empty']), 'level 8: both slots open; Toy Sack in G1');
  await pick('g2', 'gear_backpack');
  check(JSON.stringify(await slots()) === JSON.stringify(['G1Toy Sack', 'G2Empty']) && /Can't stack/.test(await p.textContent('#avmsg')), `Backpack next to Toy Sack refused: "${await p.textContent('#avmsg')}"`);
  await pick('g2', 'gear_shoes');
  check(JSON.stringify(await slots()) === JSON.stringify(['G1Toy Sack', 'G2Elf Shoes']) && !(await p.textContent('#avmsg')), 'Elf Shoes (a different stat) goes in G2');
  await pick('g2', 'gear_sack');
  check(JSON.stringify(await slots()) === JSON.stringify(['G1Empty', 'G2Toy Sack']), 'the same gear MOVES to the other slot');
  check(!(await p.isDisabled('#avsave')), 'owned gear: Save is on');
  await p.screenshot({ path: `${OUT}/desk-avatar-gear-l8.png` });
  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : '')); await ctx.close(); }

console.log('4. Phones: the three ticket packs on ONE row; the Store and the gear tab fit');
for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 640 }]) {
  const { p, ctx, errors } = await open(vp);
  await store(p);
  const r = await p.evaluate(() => { const ps = [...document.querySelectorAll('.packs .pack')].map((e) => e.getBoundingClientRect());
    return { row: ps.length === 3 && ps.every((b) => Math.abs(b.top - ps[0].top) < 1), h: Math.round(Math.max(...ps.map((b) => b.height))), scroll: document.documentElement.scrollWidth > innerWidth }; });
  check(r.row && !r.scroll && r.h < 170, `${vp.width}: ticket packs on one row (${r.h} px tall), no sideways scroll`);
  await p.evaluate(() => document.querySelector('.packs').scrollIntoView({ block: 'center' })); await p.screenshot({ path: `${OUT}/phone-${vp.width}-tickets.png` });
  await p.evaluate(() => document.querySelector('#carousels').scrollIntoView({ block: 'start' })); await p.screenshot({ path: `${OUT}/phone-${vp.width}-store.png` });
  await p.click('#t-avatar'); await p.waitForTimeout(500); await p.click('[data-slot="gear"]'); await p.waitForTimeout(300);
  check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${vp.width}: the gear tab fits`);
  await p.screenshot({ path: `${OUT}/phone-${vp.width}-gear.png` });
  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : '')); await ctx.close();
}
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); process.exit(0);
