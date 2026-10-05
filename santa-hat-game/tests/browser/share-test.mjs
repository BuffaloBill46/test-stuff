// SHARE BUTTONS (Cody, 2026-10-04 to-do #7: "share buttons for big wins, when they acquire a costume, and after the game where
// they can share the score"). In a real browser (a computer: the picture downloads; a phone opens its share sheet instead):
//   1. a BIG single win (a forced Big Hat pool jackpot) puts "Share this win" on the result line; it makes the win picture
//   2. after a match, "Share my score" makes the match picture (place, score, thrown / hit / %)
//   3. a player who gets a season costume sees "You got the … costume!" ONCE, with Share it (the costume picture, drawn on the
//      3D model) and Wear it; the Avatar screen's Costumes list offers a Share for every costume they have
// (the share sheet is stood in for, as on a phone: the test checks the picture and the words the page hands it)
// Run: node --import ./win-chrome.mjs share-test.mjs
import { createRequire } from 'module'; import { readFileSync, existsSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW ? path.join(process.env.PW, 'node_modules/playwright') : path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname, fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const cache = new Map(), curl = (u) => { if (!cache.has(u)) cache.set(u, execSync(`curl -sS -L -A "Mozilla/5.0 Chrome/120" "${u}"`, { maxBuffer: 1e8 })); return cache.get(u); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }), errors = [];
await ctx.route('**/*', async (route) => { const url = route.request().url();
  if (url.startsWith('https://api.santahatgames.com')) return route.fulfill({ contentType: 'application/json', body: '{"error":"stand-in"}' });
  if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
  if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: curl(url), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
  if (url.startsWith('https://local.test/')) { const f = path.join(ROOT, url.replace('https://local.test/', '').split('#')[0].split('?')[0]); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); }
  return route.abort(); });
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
// the share sheet, as a phone has it: record what the page hands over (the picture file and the words)
await p.addInitScript(() => { window.__shared = []; navigator.canShare = () => true;
  navigator.share = async ({ files, text }) => { window.__shared.push({ name: files?.[0]?.name, size: files?.[0]?.size || 0, type: files?.[0]?.type, text }); }; });
const open = async (hash) => { await p.goto(`https://local.test/online.html?net=local&t=${Date.now()}#${hash}`, { timeout: 90000 }); await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1500); };
// a share button on a computer downloads the picture: its name and size
const shareFile = async (selector) => { const n = await p.evaluate(() => window.__shared.length); await p.click(selector);
  await p.waitForFunction((k) => window.__shared.length > k, n, { timeout: 20000 }).catch(() => {}); return p.evaluate(() => window.__shared.at(-1) || null); };

console.log('1. a big win');
await open('games'); await p.waitForFunction(() => window.__slots, null, { timeout: 60000 });
await p.evaluate(() => { window.__slots.test.run = ['JACKPOT']; document.querySelector('#slots [data-run="1"]').click(); });
await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 10000 }); await p.evaluate(() => document.querySelector('#buyGo').click());
await p.waitForFunction(() => document.querySelector('#slots [data-share-win]'), null, { timeout: 30000 }).catch(() => {});
check(await p.evaluate(() => !!document.querySelector('#slots [data-share-win]')), 'a pool jackpot puts "Share this win" right on the result');
const win = await shareFile('#slots [data-share-win]');
check(win?.name === 'santa-hat-win.png' && win.size > 20000, `it makes the win picture (${win?.name}, ${win?.size} bytes)`);

console.log('2. after a match');
await open('play'); await p.evaluate(() => window.__sq.startPractice()); await p.waitForTimeout(2500); await p.evaluate(() => document.querySelector('#start')?.click());
await p.waitForFunction(() => window.__sq.sim?.S.phase === 'play', null, { timeout: 60000 });
for (let i = 0; i < 8; i++) { await p.evaluate(() => { const s = window.__sq.sim, me = s.S.ents.find((e) => e.peer === window.__sq.me.id), b = s.S.ents.find((e) => e.bot); if (b) window.__sq.throwAt(b.x, b.z); }); await p.waitForTimeout(250); }
await p.evaluate(() => { const s = window.__sq.sim; s.S.round = 3; s.S.time = 0.2; });
await p.waitForFunction(() => window.__sq.view?.phase === 'end', null, { timeout: 60000 }); await p.waitForTimeout(2000);
check(await p.evaluate(() => !!document.querySelector('[data-share-match]')), 'the end card has "Share my score"');
const data = await p.evaluate(() => JSON.parse(document.querySelector('[data-share-match]').dataset.shareMatch));
check(data.place >= 1 && data.players >= 2 && Number.isFinite(data.score) && data.thrown >= 1, `with my place, score and aim: ${JSON.stringify(data)}`);
const m = await shareFile('[data-share-match]');
check(m?.name === 'santa-hat-match.png' && m.size > 20000, `it makes the match picture (${m?.name}, ${m?.size} bytes)`);

console.log('3. a new costume');
await open('home'); await p.click('#signin'); await p.waitForTimeout(400); await p.click('#walletBtn'); await p.waitForTimeout(1200);
const set = await p.evaluate(async () => { const { COSTUMES, costumeItems } = await import('./catalog.js'); const [set] = Object.entries(COSTUMES).find(([, c]) => c.season);
  const db = JSON.parse(localStorage.getItem('sq-local-db')); const pid = Object.values(db.logins)[0].pid; db.inv[pid] = costumeItems(set).map((i) => i.id);
  localStorage.setItem('sq-local-db', JSON.stringify(db)); localStorage.removeItem('santa.costumesSeen'); return set; });
await open('home'); await p.waitForFunction(() => !document.querySelector('#costumeNews').hidden, null, { timeout: 15000 }).catch(() => {});
const news = await p.evaluate(() => ({ shown: !document.querySelector('#costumeNews').hidden, text: document.querySelector('#costumeNews').textContent.replace(/\s+/g, ' ').trim() }));
check(news.shown && /You got the .+ costume!/.test(news.text) && /Share it/.test(news.text) && /Wear it/.test(news.text), `the banner: "${news.text.slice(0, 90)}"`);
const c = await shareFile('#costumeNews [data-share-costume]');
check(c?.name === 'santa-hat-costume.png' && c.size > 40000, `Share it makes the costume picture, the costume drawn on the model (${c?.name}, ${c?.size} bytes)`);
await open('home'); await p.waitForTimeout(1500);
check(await p.evaluate(() => document.querySelector('#costumeNews').hidden), 'the banner shows once, not on every visit');
await p.evaluate(() => document.querySelector('#t-avatar').click()); await p.waitForTimeout(800);
await p.evaluate(() => document.querySelector('[data-avtab="costume"], [data-slot="costume"]')?.click()); await p.waitForTimeout(800);
const row = await p.evaluate(() => { const r = document.querySelector('#avshare'); return { shown: r && !r.hidden, text: r?.textContent || '' }; });
check(row.shown && /Share /.test(row.text), `the Avatar screen's Costumes list offers it: "${row.text.slice(0, 80)}"`);
check(!errors.length, 'no page errors ' + errors.slice(0, 2).join(' | '));
await browser.close();
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
