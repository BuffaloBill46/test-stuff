// FAKE PLAYERS WITH TEST MONEY on the LIVE site (Cody, 2026-10-03: "check the game on chrome browser with a few fake players like
// a human would play it"): https://santahatgames.com/?server=https://api.santahatgames.com in real Chrome, several devnet test
// players at once (desktop + phone), each signing in with their wallet, paying for Snowball Drop, Stocking Stuffer (tapping the
// stockings themselves) and Big Hat with REAL devnet transactions, through the REAL game server on the Droplet. Nothing here
// is faked except the wallet's approval popup: a stand-in Phantom signs with the test player's key (C:\santa-devnet-keys\players).
// What it prints (balances before/after, run results) is then checked against the live database (runs, payouts, the pool).
// Run (Windows, real Chrome): PW=<folder with node_modules/playwright> node live-money-test.mjs [players=2]
import { createRequire } from 'module'; import { readFileSync, mkdirSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW ? path.join(process.env.PW, 'node_modules/playwright') : path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const kit = await import('../solana/node_modules/@solana/kit/dist/index.node.mjs');
const T22 = await import('../solana/node_modules/@solana-program/token-2022/dist/src/index.mjs');
const cfg = JSON.parse(readFileSync(new URL('../../devnet.json', import.meta.url), 'utf8'));
const KEYS = process.env.SANTA_KEYS || (process.platform === 'win32' ? 'C:/santa-devnet-keys' : '/mnt/c/santa-devnet-keys');
const SITE = process.env.SITE || 'https://santahatgames.com/?server=https://api.santahatgames.com';
const N = +(process.argv[2] || 2), OUT = './out/livemoney/'; mkdirSync(OUT, { recursive: true });
const rpc = kit.createSolanaRpc(cfg.rpc), fails = [];
const ata = async (o) => (await T22.findAssociatedTokenPda({ owner: o, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS, mint: cfg.mint }))[0];
const santa = async (o) => Number((await rpc.getTokenAccountBalance(await ata(o), { commitment: 'confirmed' }).send()).value.amount) / 1e6;
const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist'] });

async function player(n) {
  const phone = n % 2 === 0, who = `P${n} ${phone ? 'phone' : 'desktop'}`, out = [];
  const say = (m) => { const line = `[${who}] ${m}`; out.push(line); console.log(line); };
  const check = (ok, m) => { say((ok ? '✓ ' : '✗ ') + m); if (!ok) fails.push(`${who}: ${m}`); };
  const bytes = new Uint8Array(JSON.parse(readFileSync(path.join(KEYS, 'players', `testPlayer${n}.json`), 'utf8')));
  const signer = await kit.createKeyPairSignerFromBytes(bytes), keys = await kit.createKeyPairFromBytes(bytes), addr = signer.address;
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 860 } });
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  const shot = (name) => p.screenshot({ path: `${OUT}P${n}-${name}.png` }).catch(() => {});
  const txt = (sel) => p.locator(sel).first().textContent().then((t) => t.trim(), () => '');
  const tap = async (sel) => { const l = p.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); if (phone) await l.tap(); else await l.click(); };
  // The wallet's two jobs: sign the sign-in message (Phantom's signMessage), and sign + send a purchase (Wallet Standard).
  let signs = 0;
  await p.exposeFunction('walletSignMessage', async (m) => [...new Uint8Array(await kit.signBytes(keys.privateKey, new Uint8Array(m)))]);
  await p.exposeFunction('walletSignAndSend', async (b) => {
    const s = await kit.signTransaction([keys], kit.getTransactionDecoder().decode(new Uint8Array(b))); signs++;
    await rpc.sendTransaction(kit.getBase64EncodedWireTransaction(s), { encoding: 'base64', preflightCommitment: 'confirmed' }).send();
    return [...kit.getBase58Encoder().encode(kit.getSignatureFromTransaction(s))];
  });
  await p.addInitScript((a) => {
    const publicKey = { toBase58: () => a, toString: () => a };
    window.phantom = { solana: { isPhantom: true, isConnected: true, publicKey, connect: async () => ({ publicKey }),
      signMessage: async (m) => new Uint8Array(await window.walletSignMessage([...m])) } };
    window.santaWallet = { name: 'Test wallet', chains: ['solana:devnet'], accounts: [{ address: a }],
      features: { 'solana:signAndSendTransaction': { signAndSendTransaction: async ({ transaction }) => [{ signature: new Uint8Array(await window.walletSignAndSend([...transaction])) }] } } };
  }, addr);

  const start = await santa(addr); say(`wallet ${addr}: ${start.toFixed(2)} test SANTA`);
  await p.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  check(await p.waitForFunction(() => window.__sq, null, { timeout: 60000 }).then(() => true, () => false), 'the site loads');
  await p.waitForTimeout(1500);

  // 1. Sign in like a player: the Sign in button, then "Connect wallet", then the wallet approves the message
  await tap('#signin'); await tap('#walletBtn');
  const signedIn = await p.waitForFunction(() => document.querySelector('#signin').classList.contains('in'), null, { timeout: 45000 }).then(() => true, () => false);
  check(signedIn, `signed in with the wallet (name on the button: "${await txt('#signin')}"; note: "${await txt('#acctMsg')}")`);
  await shot('1-signedin');
  if (!signedIn) { await ctx.close(); return { who, out, errors }; }
  await p.keyboard.press('Escape').catch(() => {}); await p.evaluate(() => document.querySelector('#acctClose')?.click()).catch(() => {});
  await p.waitForTimeout(800);
  say(`tickets chip: "${await txt('#tixchip')}"`);

  // 2. Games tab
  await tap('#t-games');
  check(await p.waitForFunction(() => window.__slots && window.__drop && window.__stocking, null, { timeout: 90000 }).then(() => true, () => false), 'the Games tab is ready');
  const buy = async (game, label) => {
    const t0 = Date.now(), before = signs;
    await p.waitForFunction(() => document.querySelector('#buyDlg').open, null, { timeout: 15000 });
    say(`${label}: dialog says "${(await txt('#buyDlg')).replace(/\s+/g, ' ').slice(0, 160)}"`);
    await shot(`buy-${game}`);
    await tap('#buyGo');
    // "opening" turns on while the price is still being fetched, so wait for the wallet to be asked (or a refusal)
    const BAD = /Not paid|cancelled|isn't confirmed|error|couldn't|failed/i;
    let note = '';
    while (Date.now() - t0 < 180000 && signs === before && !BAD.test(note = await txt('#buyNote'))) await p.waitForTimeout(200);
    const asked = Math.round((Date.now() - t0) / 100) / 10;
    check(signs === before + 1, `${label}: the wallet was asked to pay once, ${asked} s after Buy (note "${note}")`);
    return signs === before + 1;
  };

  // 3. Snowball Drop: 10¢ × 5, watched at normal speed
  await p.evaluate(() => document.querySelector('#drop').scrollIntoView({ block: 'start' })); await p.waitForTimeout(500);
  await tap('#drop [data-dbet="0.1"]'); await tap('#drop [data-run="5"]');
  if (await buy('drop', 'Drop 5 × 10¢')) {
    const done = await p.waitForFunction(() => !window.__drop.opening && window.__drop.flying === 0, null, { timeout: 400000 }).then(() => true, () => false);
    check(done, `Drop finished: "${await txt('#drop .res')}" counter "${await txt('#drop [data-runcount] b')}"`);
    await shot('drop-done');
  }

  // 4. Stocking Stuffer: one 10¢ turn, tapping the stockings like a player (touch on the phone, the mouse on desktop)
  await p.evaluate(() => document.querySelector('#stocking').scrollIntoView({ block: 'start' })); await p.waitForTimeout(500);
  await tap('#stocking [data-sbet="0.1"]'); await tap('#stocking [data-run="1"]');
  if (await buy('stocking', 'Stocking 1 × 10¢')) {
    let taps = 0, wrong = 0; const t0 = Date.now();
    while (Date.now() - t0 < 300000) {
      if (!(await p.evaluate(() => window.__stocking.opening))) break;
      const w = await p.evaluate(() => { const b = window.__stocking.board; if (!b?.waiting) return null;
        const cv = document.querySelector('#stocking canvas'); cv.scrollIntoView({ block: 'nearest' });
        const free = b.opened.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0), s = free[Math.floor(Math.random() * free.length)], c = b.centerOf(s), r = cv.getBoundingClientRect();
        return { s, x: r.left + c.x, y: r.top + c.y }; }).catch(() => null);
      if (!w) { await p.waitForTimeout(150); continue; }
      await p.waitForTimeout(400 + Math.random() * 900); // a person looks before tapping
      if (phone) await p.touchscreen.tap(w.x, w.y); else await p.mouse.click(w.x, w.y);
      taps++;
      if (!(await p.waitForFunction((s) => window.__stocking.board.opened[s] !== null, w.s, { timeout: 20000 }).then(() => true, () => false))) wrong++;
    }
    check(!(await p.evaluate(() => window.__stocking.opening)) && wrong === 0, `Stocking finished after ${taps} taps (${wrong} taps that opened nothing): "${await txt('#stocking .res')}"`);
    await shot('stocking-done');
  }

  // 5. Big Hat: one 10¢ pull
  await p.evaluate(() => document.querySelector('#slots').scrollIntoView({ block: 'start' })); await p.waitForTimeout(500);
  await tap('#slots [data-run="1"]');
  if (await buy('slots', 'Big Hat 1 pull')) {
    const done = await p.waitForFunction(() => !window.__slots.busy, null, { timeout: 300000 }).then(() => true, () => false);
    check(done, `Big Hat finished: "${await txt('#slots .res')}"`);
    await shot('slots-done');
  }
  await p.waitForTimeout(3000);
  const end = await santa(addr);
  say(`wallet now ${end.toFixed(2)} test SANTA (${(end - start).toFixed(2)}; winnings arrive from the pool a little later)`);
  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  await ctx.close();
  return { who, addr, start, end, out, errors };
}

const t0 = Date.now();
const results = await Promise.all(Array.from({ length: N }, (_, i) => player(i + 1).catch((e) => { fails.push(`P${i + 1}: crashed: ${e.message.split('\n')[0]}`); console.log(`[P${i + 1}] CRASH ${e.stack}`); return null; })));
console.log(`\n${N} players, ${Math.round((Date.now() - t0) / 1000)} s. Wallets (check the database against these):`);
for (const r of results.filter(Boolean)) console.log(`  ${r.who} ${r.addr} start ${r.start?.toFixed(6)}`);
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
await browser.close(); process.exit(0);
