// SIGNED-IN players in a public Auto match on the LIVE site (QA after the game server moved to the Droplet, 2026-10-03):
// several devnet test players sign in with their wallet, press Auto match together, and play it like people (move, throw at the
// nearest player) on the Droplet's match server (wss://play.santahatgames.com), which then credits the finish in the database
// (games played, top-3 finishes toward the next level). Prints each player's place and the Progress box after; the database
// side (match stats, xp) is checked after by query. Practice matches never count, so this uses Auto match.
// Run (Windows, real Chrome): PW=<folder with node_modules/playwright> node live-match-test.mjs [players=2] [first test player=1]
import { mkdirSync } from 'fs';
import { chromium, withWallet, signIn, SITE } from './live-wallet.mjs';
const N = +(process.argv[2] || 2), FIRST = +(process.argv[3] || 1), OUT = './out/livematch/'; mkdirSync(OUT, { recursive: true });
const fails = [];
const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist'] });

async function player(n, i) {
  const who = `P${n}`, say = (m) => console.log(`[${who}] ${m}`), check = (ok, m) => { say((ok ? '✓ ' : '✗ ') + m); if (!ok) fails.push(`${who}: ${m}`); };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), p = await ctx.newPage(), errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('response', async (r) => { if (r.status() >= 400 && !r.url().includes('api.devnet.solana.com')) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 90)} ${(await r.text().catch(() => '')).slice(0, 120)}`); });
  await withWallet(p, n);
  const view = () => p.evaluate(() => { const v = window.__sq?.view; return v && { phase: v.phase, round: v.round, me: v.ents.find((e) => e.peer === window.__sq.me.id), n: v.ents.length, bots: v.ents.filter((e) => e.bot).length }; }).catch(() => null);
  await p.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.__sq, null, { timeout: 60000 });
  check(await signIn(p), 'signed in');
  await p.waitForTimeout(1500);
  const before = (await p.textContent('#progress').catch(() => '')).replace(/\s+/g, ' ').slice(0, 110);
  say(`progress before: "${before}"`);
  await p.waitForTimeout(i * 1500); // not all in the same instant, like real people
  await p.click('#t-play'); await p.click('#playUnranked'); await p.waitForTimeout(400); await p.click('#quick');
  check(await p.waitForFunction(() => window.__sq.room && window.__sq.view, null, { timeout: 30000 }).then(() => true, () => false), 'Auto match put me in a public room');
  const room = await p.evaluate(() => window.__sq.room?.code || window.__sq.room?.id || null);
  check(await p.waitForFunction(() => window.__sq.view?.phase === 'play', null, { timeout: 90000 }).then(() => true, () => false), `the match started (room ${room})`);
  const start = await view(); say(`in the match: ${start?.n} players, ${start?.bots} bots`);
  const canvas = await p.locator('canvas').first().boundingBox(), keys = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
  let throws = 0;
  for (let k = 0, t0 = Date.now(); (await view())?.phase !== 'end' && Date.now() - t0 < 420000; k++) {
    const v = await view(); if (!v) break;
    if (v.phase !== 'play') { await p.waitForTimeout(800); continue; }
    const key = keys[Math.floor(k / 6) % 4]; await p.keyboard.down(key); await p.waitForTimeout(300); await p.keyboard.up(key);
    const at = await p.evaluate(() => { const v = window.__sq.view, me = v.ents.find((e) => e.peer === window.__sq.me.id); if (!me) return null;
      const t = v.ents.filter((e) => e !== me).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
      return t && window.__sq.toScreen ? window.__sq.toScreen(t.x, t.z) : null; }).catch(() => null);
    await p.mouse.click(at?.x ?? canvas.x + canvas.width / 2 + (k % 5) * 40 - 80, at?.y ?? canvas.y + canvas.height / 2 - 60); throws++;
  }
  const end = await view();
  check(end?.phase === 'end', `the match ran to the end (threw ${throws}, my score ${end?.me?.score})`);
  await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}P${n}-results.png` }).catch(() => {});
  const results = (await p.textContent('#panel').catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
  say(`results: "${results}"`);
  // back in the plaza, the Progress box should count the match (top 3 → one step toward the next level)
  await p.waitForFunction(() => window.__sq.view?.phase === 'lobby', null, { timeout: 30000 }).catch(() => {});
  await p.click('#leave, button:has-text("Leave")').catch(() => {}); await p.waitForTimeout(4000);
  const after = (await p.textContent('#progress').catch(() => '')).replace(/\s+/g, ' ').slice(0, 110);
  say(`progress after: "${after}"`);
  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  await ctx.close();
  return { n, room, score: end?.me?.score, before, after };
}

const out = await Promise.all(Array.from({ length: N }, (_, i) => player(FIRST + i, i).catch((e) => { fails.push(`P${FIRST + i} crashed: ${e.message.split('\n')[0]}`); return null; })));
console.log('\nrooms:', out.map((r) => r && `P${r.n}:${r.room}`).join(' '), out.every((r) => r && r.room === out[0]?.room) ? '(all in the same room)' : '(different rooms)');
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); process.exit(0);
