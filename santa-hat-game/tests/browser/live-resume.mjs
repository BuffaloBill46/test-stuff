// "Paid, but the run never reached the server" → finished on the player's next visit, on the LIVE site (found 2026-10-03:
// two paid Big Hat pulls were dropped by a server error; this hands each back the way the page itself does after a closed tab).
// The payment is put where the page remembers it (localStorage 'santa.pendingPayment'), the test player signs in with their
// wallet, opens Games, and the page's own resumePaid() hands it to the server and plays it.
// Run (Windows, real Chrome): PW=<folder with node_modules/playwright> node live-resume.mjs <testPlayerN> <quote id> <payment signature>
import { createRequire } from 'module'; import { readFileSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW ? path.join(process.env.PW, 'node_modules/playwright') : path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const kit = await import('../solana/node_modules/@solana/kit/dist/index.node.mjs');
const KEYS = process.env.SANTA_KEYS || (process.platform === 'win32' ? 'C:/santa-devnet-keys' : '/mnt/c/santa-devnet-keys');
const SITE = process.env.SITE || 'https://santahatgames.com/?server=https://api.santahatgames.com';
const [who, quote, signature] = process.argv.slice(2);
if (!/^testPlayer\d$/.test(who || '') || !quote || !signature) { console.log('usage: node live-resume.mjs testPlayerN <quote id> <signature>'); process.exit(1); }
const bytes = new Uint8Array(JSON.parse(readFileSync(path.join(KEYS, 'players', who + '.json'), 'utf8')));
const keys = await kit.createKeyPairFromBytes(bytes), addr = (await kit.createKeyPairSignerFromBytes(bytes)).address;
const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist'] });
const p = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage(), logs = [];
p.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 200)));
await p.exposeFunction('walletSignMessage', async (m) => [...new Uint8Array(await kit.signBytes(keys.privateKey, new Uint8Array(m)))]);
await p.addInitScript((a) => { const publicKey = { toBase58: () => a, toString: () => a };
  window.phantom = { solana: { isPhantom: true, isConnected: true, publicKey, connect: async () => ({ publicKey }), signMessage: async (m) => new Uint8Array(await window.walletSignMessage([...m])) } }; }, addr);
await p.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForFunction(() => window.__sq, null, { timeout: 60000 });
await p.click('#signin'); await p.click('#walletBtn');
await p.waitForFunction(() => document.querySelector('#signin').classList.contains('in'), null, { timeout: 45000 });
console.log(`${who} signed in as "${await p.textContent('#signin')}"`);
await p.evaluate(([quote, signature]) => localStorage.setItem('santa.pendingPayment', JSON.stringify({ quote, signature, at: Date.now() })), [quote, signature]);
await p.click('#acctClose').catch(() => {});
await p.click('#t-games');
const ok = await p.waitForFunction(() => localStorage.getItem('santa.pendingPayment') === null, null, { timeout: 90000 }).then(() => true, () => false);
await p.waitForTimeout(2000);
console.log(ok ? 'the page handed the payment to the server and cleared it' : 'still pending after 90 s');
console.log(logs.filter((l) => /paid run|error/i.test(l)).join('\n') || '(no console lines)');
await browser.close(); process.exit(ok ? 0 : 1);
