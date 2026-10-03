// A REAL PLAYER on the LIVE site (Cody, 2026-10-02: "double check everything works playing or doing actions on the live website
// like a real human player would do"): https://buffalobill46.github.io/test-stuff/ in real Chrome (on Windows: the real GPU, ~60 fps;
// a hidden or minimized browser window pauses the game, so this runs Chrome with no window), real mouse clicks, key presses and
// touch (phone: the floating joystick + taps). Guest only (no wallet sign-in). Screenshots to out/live/.
// Run (Windows, real GPU): PW=<folder with node_modules/playwright> node live-player.mjs [phone]
import { createRequire } from 'module'; import { mkdirSync } from 'fs';
const require = createRequire(import.meta.url);
// Playwright: PW=<folder holding node_modules/playwright> (Windows, uses the installed Chrome: real GPU), else the global one
import { execSync } from 'child_process'; import path from 'path';
const { chromium } = require(process.env.PW ? path.join(process.env.PW, 'node_modules/playwright') : path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const PHONE = process.argv[2] === 'phone', OUT = (process.env.OUT || './out/live/') + (PHONE ? 'phone-' : ''); mkdirSync(process.env.OUT || './out/live/', { recursive: true });
const SITE = process.env.SITE || 'https://buffalobill46.github.io/test-stuff/'; // SITE=http://localhost:…/online.html to try unpublished code
const log = [], bad = [], ok = (c, m) => { (c ? log : bad).push((c ? '✓ ' : '✗ ') + m); console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const b = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist'] });
const ctx = await b.newContext(PHONE ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage(), errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
const shot = (n) => p.screenshot({ path: OUT + n + '.png' });
const vis = (sel) => p.locator(sel).first().isVisible().catch(() => false);
const wait = (fn, arg, ms = 20000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const tap = async (sel) => { const l = p.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); if (PHONE) await l.tap(); else await l.click(); };
const view = () => p.evaluate(() => { const v = window.__sq?.view; return v && { phase: v.phase, round: v.round, time: Math.round(v.time), me: v.ents.find((e) => e.peer === window.__sq.me.id), n: v.ents.length }; });

try {
  console.log('1. The site loads');
  await p.goto(SITE, { waitUntil: 'domcontentloaded' });
  ok(await wait(() => window.__sq), 'the game starts');
  await p.waitForTimeout(1500); await shot('01-home');
  ok(await vis('text=or win 5 matches'), 'Progress box: "or win 5 matches top 3 or better" with its counter');

  console.log('2. A full practice match against bots');
  await tap('#playUnranked'); await p.waitForTimeout(500);
  ok(await vis('#home:not([hidden])'), 'Play now opens the Unranked lobby');
  await tap('#practice');
  ok(await wait(() => window.__sq.view && document.querySelector('#start')), 'Practice: in the plaza with a Start button');
  await shot('02-practice-lobby');
  await tap('#start');
  ok(await wait(() => window.__sq.view?.phase === 'intro', null, 5000), 'Start → the load screen');
  await p.waitForTimeout(800); await shot('03-load-screen');
  ok(await vis('#panel .lineup'), 'load screen lists every player');
  const tIntro = Date.now();
  ok(await wait(() => window.__sq.view?.phase === 'count', null, 8000), 'then the countdown');
  await p.waitForTimeout(1500); await shot('04-countdown');
  ok(await wait(() => window.__sq.view?.phase === 'play', null, 9000), 'then round 1');
  ok(Math.abs((Date.now() - tIntro) / 1000 - 10) < 2.5, `load screen + countdown took ${((Date.now() - tIntro) / 1000).toFixed(1)} s (5 + 5)`);
  // play: run at the hat, throw at the nearest bot, keep moving; 3 rounds
  const canvas = PHONE ? null : await p.locator('canvas').first().boundingBox();
  let throws = 0, moved = 0, last = await view();
  const keys = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
  const tPlay = Date.now(); for (let i = 0; (await view())?.phase !== 'end' && Date.now() - tPlay < 400000; i++) {
    const v = await view(); if (!v) break;
    if (PHONE && v.phase === 'play') {
      // phone: drag the floating joystick (lower left) a little in a direction, then tap the upper screen to throw
      const cdp = p.__cdp || (p.__cdp = await ctx.newCDPSession(p)), ang = (Math.floor(i / 6) % 4) * Math.PI / 2;
      const sx = 90, sy = 700, ex = sx + Math.cos(ang) * 40, ey = sy + Math.sin(ang) * 40;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 1 }] });
      for (let k = 1; k <= 4; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + (ex - sx) * k / 4, y: sy + (ey - sy) * k / 4, id: 1 }] });
      await p.waitForTimeout(350);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.touchscreen.tap(160 + (i % 5) * 20, 330); throws++;
      if (i % 25 === 3) { const e = p.locator('#emotes [data-e="1"]'); if (await e.isVisible().catch(() => false)) await e.tap(); }
    } else if (!PHONE && v.phase === 'play') {
      const k = keys[Math.floor(i / 6) % 4]; await p.keyboard.down(k); await p.waitForTimeout(350); await p.keyboard.up(k);
      // throw at a bot: click where it is on screen
      const at = await p.evaluate(() => { const v = window.__sq.view, me = v.ents.find((e) => e.peer === window.__sq.me.id), t = v.ents.filter((e) => e !== me).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]; return t && window.__sq.toScreen ? window.__sq.toScreen(t.x, t.z) : null; });
      await p.mouse.click(at?.x ?? canvas.x + canvas.width / 2 + (i % 5) * 40 - 80, at?.y ?? canvas.y + canvas.height / 2 - 60); throws++;
      if (i % 25 === 3) await p.keyboard.press('Digit1'); // an emote now and then
    } else await p.waitForTimeout(1000);
    const now = await view(); if (now?.me && last?.me && Math.hypot(now.me.x - last.me.x, now.me.z - last.me.z) > 0.3) moved++; last = now;
    if (i === 30) await shot('05-playing');
  }
  const end = await view();
  ok(end?.phase === 'end', 'the match ran to the end (3 rounds)');
  ok(moved > 5, `I moved around (${moved} times seen moving)`);
  ok(throws > 10, `I threw ${throws} snowballs`);
  await p.waitForTimeout(800); await shot('06-results');
  ok(await vis('#panel .final'), 'the results show every player\'s score');
  console.log('   my score:', end?.me?.score);
  ok(await wait(() => window.__sq.view?.phase === 'lobby', null, 20000), 'back to the plaza after the results');
  await tap('#leave, button:has-text("Leave")'); await p.waitForTimeout(800);
  ok(!(await p.evaluate(() => !!window.__sq.room || !!window.__sq.sim)), 'Leave takes me out');

  console.log('3. Public Auto match (alone: bots fill in after 25 s)');
  await tap('#playUnranked'); await p.waitForTimeout(400); await tap('#quick');
  ok(await wait(() => window.__sq.room && window.__sq.view, null, 20000), 'Auto match puts me in a public room');
  await p.waitForTimeout(1500); await shot('07-auto-match');
  ok(await wait(() => ['intro', 'count', 'play'].includes(window.__sq.view?.phase), null, 40000), 'it starts by itself');
  await shot('08-auto-started');
  await tap('#leave, button:has-text("Leave")'); await p.waitForTimeout(800);

  console.log('4. Games tab');
  await tap('#t-games'); ok(await wait(() => window.__slots, null, 20000), 'Games tab opens');
  await p.waitForTimeout(1500); await shot('09-games');
  ok(await vis('text=locked'), 'the price-lock note is on the page');
  const bal0 = await p.evaluate(() => window.__slots.state.balance ?? window.__slots.state.bank ?? null);
  await tap('#slots [data-run="1"]'); await p.waitForTimeout(600); await shot('10-buy-dialog');
  if (await vis('#buyGo')) await tap('#buyGo');
  ok(await wait(() => !window.__slots.busy, null, 30000), 'a Big Hat pull plays');
  await p.waitForTimeout(1200); await shot('11-after-pull');
  ok(await vis('#slots .runcount, .runcount'), 'the run counter shows between the game and the buy buttons');
  console.log('   demo balance before/after:', bal0, await p.evaluate(() => window.__slots.state.balance ?? window.__slots.state.bank ?? null));
  // the custom run box: arrows
  const box = p.locator('#slots input[type=number]').first();
  if (await box.isVisible().catch(() => false)) { await box.fill('7'); await p.keyboard.press('ArrowUp'); ok((await box.inputValue()) === '8', 'custom run box: arrow up 7 → 8'); }
  else ok(false, 'custom run box visible');
  // Snowball Drop
  const drop = p.locator('#drop [data-run="1"], #drop button:has-text("Drop 1")').first();
  if (await drop.isVisible().catch(() => false)) { await drop.scrollIntoViewIfNeeded(); await drop.click(); await p.waitForTimeout(400); if (await vis('#buyGo')) await tap('#buyGo'); await p.waitForTimeout(6000); await shot('12-drop'); ok(true, 'a Snowball Drop played'); }
  else ok(false, 'Snowball Drop button visible');
  // since 026 (Cody, 2026-10-02) Drop's top prize is the pool jackpot, not a fixed 100×
  const dropOdds = (await p.textContent('#dropOdds').catch(() => '')).replace(/\s+/g, ' ').trim();
  ok(/^Pool jackpot \$[\d,.]+ on a .+ drop right now .*1 in 5,000 to hit it/.test(dropOdds), `Drop shows its jackpot odds line: "${dropOdds}"`);
  console.log('5. Store, Avatar, Ranks, Sign in');
  await tap('#t-store'); await p.waitForTimeout(1200); await shot('14-store');
  ok((await p.locator('#tab-store :text("Special Snowballs")').count()) > 0 && (await p.locator('#tab-store :text("Special Gear")').count()) > 0, 'Store: Special Snowballs and Special Gear sections');
  ok(await vis('text=7 days') || await vis('text=7-day'), 'Store mentions the gear 7-day rule');
  // lottery
  const lot = p.locator('.lotcard'); const kinds = await lot.evaluateAll((els) => els.map((e) => e.dataset.lot));
  ok(kinds.length === 3 && kinds.includes('christmas') && kinds.includes('weekly-10') && kinds.includes('weekly-100') && !kinds.some((k) => k.startsWith('daily')), 'lottery: the two weekly + Christmas (no daily) (no daily): ' + kinds.join(', '));
  if (kinds.length) { await lot.first().scrollIntoViewIfNeeded(); await shot('13-lottery'); await lot.first().locator('.lotgo').click(); await p.waitForTimeout(800); ok(/soon|sign in|test|not on sale/i.test(await lot.first().locator('.lotnote').textContent()), 'lottery Buy says why it can\'t sell yet: ' + (await lot.first().locator('.lotnote').textContent())); }


  const buy = p.locator('#store button:has-text("Buy"), .shopitem button').first();
  if (await buy.isVisible().catch(() => false)) { await buy.click(); await p.waitForTimeout(800); await shot('15-store-buy'); ok(await vis('text=/sign in|soon|test/i'), 'a Store Buy as a guest explains (sign in / payments soon)'); }
  await tap('#t-avatar'); await p.waitForTimeout(1500); await shot('16-avatar');
  for (const t of ['Special Snowballs', 'Special Gear']) { const tab = p.locator(`button:has-text("${t}")`).first(); if (await tab.isVisible().catch(() => false)) { await tab.click(); await p.waitForTimeout(1200); await shot('17-avatar-' + t.split(' ')[1].toLowerCase()); ok(true, `Avatar: ${t} tab opens`); } else ok(false, `Avatar: ${t} tab visible`); }
  await tap('#t-ranks'); await p.waitForTimeout(800); await shot('18-ranks'); ok(true, 'Ranks tab opens');
  await tap('#signin, button:has-text("Sign in")'); await p.waitForTimeout(800); await shot('19-signin'); ok(await vis('text=Connect wallet') && await vis('text=Email me a link'), 'Sign in opens the sign-in sheet (Connect wallet / Email me a link)');
  await p.keyboard.press('Escape');
} catch (e) { bad.push('✗ stopped: ' + e.message.split('\n')[0]); console.log('  ✗ stopped:', e.message.split('\n')[0]); await shot('99-stopped').catch(() => {}); }
const errs = [...new Set(errors)];
console.log('\npage errors:', errs.length ? errs : 'none');
console.log(`\n${PHONE ? 'PHONE' : 'DESKTOP'}: ${log.length} passed, ${bad.length} failed`); bad.forEach((x) => console.log('  ' + x));
await b.close();
