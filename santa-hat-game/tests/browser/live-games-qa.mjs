// LIVE MINI-GAME QA (Cody, 2026-10-04 final launch QA: "play all mini games 1000+ times"). Devnet test players sign in on the LIVE
// site with their wallet (live-wallet.mjs: a stand-in that signs and SENDS real devnet transactions, as Phantom does after
// Approve), then play through the real game server exactly as the page does: quote → pay (wallet.js, one real devnet payment per
// run) → buy → settle every play. Runs of 100 (the most one payment buys). By default 5 players × 2 runs × 3 games = 1,000 plays
// of each game. Writes every run to out/livegames/; the database side (every run paid out once, the pool's books against its
// wallet) is checked after by query.
// Run (Windows, real Chrome): PW=<folder with node_modules/playwright> node live-games-qa.mjs [players=5] [runs per game=2] [first player=1]
import { mkdirSync, writeFileSync } from 'fs';
import { chromium, withWallet, signIn, santaRaw, SITE } from './live-wallet.mjs';
const PLAYERS = +(process.argv[2] || 5), RUNS = +(process.argv[3] || 2), FIRST = +(process.argv[4] || 1), PER_RUN = 100, OUT = './out/livegames/';
mkdirSync(OUT, { recursive: true });
const GAMES = [['drop', 0.1], ['stocking', 0.1], ['big', 1]];
const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist'] });

async function player(n) {
  const log = (m) => console.log(`[P${n}] ${m}`), runs = [];
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage(), errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const w = await withWallet(p, n);
  await p.goto(SITE + (SITE.includes('?') ? '&' : '?') + 't=' + Date.now() + '#games', { timeout: 90000 });
  await p.waitForFunction(() => window.__sq, null, { timeout: 90000 }); await p.waitForTimeout(1500);
  if (!(await signIn(p))) { log('✗ sign-in failed'); return { n, runs, signedIn: false, errors }; }
  const before = await santaRaw(w.addr);
  for (let r = 0; r < RUNS; r++) for (const [kind, bet] of GAMES) {
    const t0 = Date.now();
    // everything below runs IN the page, with the page's own modules: its server calls (signed-in) and its wallet step
    const res = await p.evaluate(async ({ kind, bet, n }) => {
      const { call } = await import('./gameserver.js'); const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
      const ask = async (action, body) => { for (let i = 0; ; i++) { const o = await call(action, body);
        if (/slow down|too many requests/i.test(o?.error || '') && i < 20) { await sleep(2500); continue; } return o; } };
      const q = await ask('quote', { kind, n, bet }); if (!q?.id) return { stage: 'quote', error: q?.error || JSON.stringify(q) };
      let sig; try { sig = await window.santaPay(q); } catch (e) { return { stage: 'pay', error: e.message }; }
      let b; for (let i = 0; i < 30; i++) { b = await ask('buy', { quote: q.id, signature: sig }); if (b?.ok || !/not found|not finalized/.test(b?.error || '')) break; await sleep(3000); }
      if (!b?.ok) return { stage: 'buy', error: b?.error, sig };
      const out = { sig, usd: q.usd, plays: 0, payUsd: 0, payRaw: 0, jackpots: 0, refunded: 0, failed: 0, errors: [], runDone: false, sent: null };
      const hex = () => [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('');
      for (const pl of b.plays) {
        const s = await ask('settle', { ticket: pl.ticket, seed: hex() });
        if (s?.error) { out.errors.push(s.error); continue; }
        out.plays++; if (s.refunded) out.refunded++; if (s.failed) out.failed++;
        out.payUsd += s.r?.pay || 0; out.payRaw += s.payRaw || 0; if (s.r?.jackpot) out.jackpots++;
        if (s.runDone) { out.runDone = true; out.sent = s.payout ?? s.sent ?? s.amountRaw ?? true; }
        await sleep(260); // under the server's per-player speed limit (40 requests / 10 s)
      }
      return out;
    }, { kind, bet, n: PER_RUN });
    runs.push({ kind, bet, ...res, seconds: Math.round((Date.now() - t0) / 1000) });
    log(res.error ? `✗ ${kind} run ${r + 1}: ${res.stage}: ${res.error}` : `${kind} run ${r + 1}: ${res.plays} plays, paid $${res.usd}, won $${res.payUsd.toFixed(2)}, ${res.jackpots} jackpots, ${res.errors.length} errors, run finished: ${res.runDone} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
  const after = await santaRaw(w.addr);
  writeFileSync(OUT + `P${n}.json`, JSON.stringify({ n, addr: w.addr, before: String(before), after: String(after), signs: w.signs(), runs, errors }, null, 1));
  return { n, runs, signedIn: true, errors, signs: w.signs() };
}

const all = await Promise.all(Array.from({ length: PLAYERS }, (_, i) => player(FIRST + i)));
await browser.close();
console.log('\nSUMMARY');
let bad = 0;
for (const [kind] of GAMES) {
  const rs = all.flatMap((a) => a.runs).filter((r) => r.kind === kind), ok = rs.filter((r) => !r.error);
  const plays = ok.reduce((a, r) => a + r.plays, 0), paid = ok.reduce((a, r) => a + r.usd, 0), won = ok.reduce((a, r) => a + r.payUsd, 0);
  const errs = rs.filter((r) => r.error).length + ok.reduce((a, r) => a + r.errors.length, 0), unfinished = ok.filter((r) => !r.runDone).length;
  bad += errs + unfinished;
  console.log(`  ${kind}: ${plays} plays in ${ok.length}/${rs.length} runs, paid $${paid.toFixed(2)}, won $${won.toFixed(2)} (payback ${(100 * won / (paid || 1)).toFixed(1)}%), jackpots ${ok.reduce((a, r) => a + r.jackpots, 0)}, refunded ${ok.reduce((a, r) => a + r.refunded, 0)}, errors ${errs}, runs not finished ${unfinished}`);
}
for (const a of all) if (!a.signedIn || a.errors.length) { bad++; console.log(`  P${a.n}: signed in ${a.signedIn}, page errors ${a.errors.slice(0, 3).join(' | ')}`); }
console.log(bad ? `FAILED: ${bad} problems` : 'ALL RUNS PLAYED AND FINISHED');
process.exit(bad ? 1 : 0);
