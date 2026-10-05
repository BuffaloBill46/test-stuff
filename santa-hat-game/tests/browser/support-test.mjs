// SUPPORT + THE X LINK in the sign-in sheet (Cody, 2026-10-04: "put that at the bottom of the signin/profile tab ... put support
// button next to the x link"). In a real browser, desktop and phone: the sheet's last row is the game's X account
// (https://x.com/Santahatgame, opens in a new tab) with Support right beside it; Support opens a short form; nothing written is
// refused on the page; a message goes to the game server's 'support' action with where the player was (the tab), and the page
// says it was sent (with its number). Signed out here: support must work for players who can't sign in.
// Run: node --import ./win-chrome.mjs support-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW ? path.join(process.env.PW, 'node_modules/playwright') : path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
mkdirSync('out', { recursive: true });
const cache = new Map(), curl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const got = [], tickets = []; // the stand-in game server's tickets
for (const [w, h] of [[1280, 860], [390, 760]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } }), errors = [];
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.startsWith('https://api.santahatgames.com')) { const b = JSON.parse(route.request().postData() || '{}');
      const json = (o) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(o) });
      if (b.action === 'support') { got.push(b); const id = 40 + got.length, key = 'k'.repeat(22) + id; tickets.push({ id, key, status: 'pending', note: null, about: b.message.slice(0, 60), at: Date.now() }); return json({ ok: true, id, key }); }
      if (b.action === 'support-status') { const mine = new Set((b.tickets || []).map((t) => t.id + ':' + t.key));
        return json({ ok: true, tickets: tickets.filter((t) => mine.has(t.id + ':' + t.key) && !t.cleared).reverse().map(({ key, cleared, ...t }) => t) }); }
      if (b.action === 'support-clear') { const t = tickets.find((x) => x.id === b.id && (b.tickets || []).some((y) => y.id === x.id && y.key === x.key));
        if (t && t.status === 'resolved') { t.cleared = true; return json({ ok: true, id: t.id }); } return json({ error: 'only your own resolved tickets can be cleared' }); }
      return route.fulfill({ contentType: 'application/json', body: b.action === 'burned' ? '{"gamesRaw":0,"lotteryRaw":0,"storeRaw":0,"totalRaw":0}' : '{"error":"stand-in"}' }); }
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: curl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('https://local.test/')) { const f = path.join(ROOT, url.replace('https://local.test/', '').split('#')[0].split('?')[0]); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.abort(); });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('https://local.test/online.html?net=local&t=' + Date.now() + '#store', { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1200);
  await p.click('#signin'); await p.waitForTimeout(400);
  const foot = await p.evaluate(() => { const x = document.querySelector('#acct .acctfoot .xlink'), b = document.querySelector('#supportBtn'), sheet = document.querySelector('#acct');
    const rx = x.getBoundingClientRect(), rb = b.getBoundingClientRect(), last = [...sheet.children].filter((c) => !c.hidden && c.offsetParent).pop();
    return { href: x.href, target: x.target, rel: x.rel, text: x.textContent.trim(), sameRow: Math.abs((rx.top + rx.bottom) / 2 - (rb.top + rb.bottom) / 2) < 6, side: rb.left > rx.right,
      visible: rx.width > 0 && rb.width > 0 && rx.right <= innerWidth && rb.right <= innerWidth, lastIsFoot: last?.classList.contains('acctfoot'), formHidden: document.querySelector('#supportForm').hidden }; });
  check(foot.href === 'https://x.com/Santahatgame' && foot.target === '_blank' && /noopener/.test(foot.rel) && foot.text === '@Santahatgame', `${w}px: the X link is the game's account, opens in a new tab ("${foot.text}")`);
  check(foot.sameRow && foot.side && foot.visible && foot.lastIsFoot && foot.formHidden, `${w}px: at the bottom of the sign-in sheet, Support right beside the X link, both on screen; the form closed`);
  await p.click('#supportBtn'); await p.waitForTimeout(200);
  check(await p.evaluate(() => !document.querySelector('#supportForm').hidden && document.activeElement?.id === 'supportMsg'), `${w}px: Support opens the form, ready to type`);
  await p.click('#supportSend'); await p.waitForTimeout(200);
  check(/Write what happened/.test(await p.textContent('#supportNote')) && got.length === (w === 1280 ? 0 : 1), `${w}px: an empty message is stopped on the page (nothing sent)`);
  await p.fill('#supportMsg', `Test from ${w}px: the store button did nothing`); await p.fill('#supportContact', '@tester');
  await p.click('#supportSend'); await p.waitForFunction(() => /Sent: ticket #\d+/.test(document.querySelector('#supportNote').textContent), null, { timeout: 10000 }).catch(() => {});
  const note = await p.textContent('#supportNote'), last = got[got.length - 1];
  check(/Sent: ticket #\d+\. Thanks/.test(note) && last?.message === `Test from ${w}px: the store button did nothing` && last?.contact === '@tester' && last?.page === 'store', `${w}px: sent to the game server with the tab (${last?.page}); the page says "${note}"`);
  check(await p.inputValue('#supportMsg') === '', `${w}px: the message box is cleared after sending`);
  // the ticket shows under Support: Pending, no ×
  await p.waitForFunction(() => !document.querySelector('#supportTickets').hidden, null, { timeout: 8000 }).catch(() => {});
  const mine = tickets[tickets.length - 1];
  const pend = await p.evaluate(() => [...document.querySelectorAll('#supportTickets li')].map((li) => ({ t: li.textContent.replace(/\s+/g, ' ').trim(), x: !!li.querySelector('[data-clear]') })));
  check(pend.length === 1 && pend[0].t.replace(/\s/g, '').startsWith(`Ticket#${mine.id}Pending`) && !pend[0].x, `${w}px: under Support: "${pend[0]?.t}", no × while pending`);
  // Cody resolves it with a note; the player opens the sheet again: Resolved, his note, and an × to clear it
  mine.status = 'resolved'; mine.note = 'Fixed: try the Store again';
  await p.click('#acctClose'); await p.waitForTimeout(300); await p.click('#signin');
  await p.waitForFunction(() => /Resolved/.test(document.querySelector('#supportTickets').textContent), null, { timeout: 8000 }).catch(() => {});
  const res = await p.evaluate(() => [...document.querySelectorAll('#supportTickets li')].map((li) => ({ t: li.textContent.replace(/\s+/g, ' ').trim(), x: !!li.querySelector('[data-clear]') })));
  check(res.length === 1 && /Resolved/.test(res[0].t) && /Fixed: try the Store again/.test(res[0].t) && res[0].x, `${w}px: after Cody resolves it: "${res[0]?.t}", with an ×`);
  await p.screenshot({ path: `out/support-${w}.png` });
  await p.click('#supportTickets [data-clear]');
  await p.waitForFunction(() => document.querySelector('#supportTickets').hidden, null, { timeout: 8000 }).catch(() => {});
  check(await p.evaluate(() => document.querySelector('#supportTickets').hidden && !JSON.parse(localStorage.getItem('santa.supportTickets') || '[]').length) && mine.cleared, `${w}px: the × clears it (gone from the list and from this browser)`);
  check(!errors.length, `${w}px: no page errors ${errors.slice(0, 2).join(' | ')}`);
  await ctx.close();
}
await browser.close();
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
