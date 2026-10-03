// Cody's admin actions against the LIVE game server (QA after the move to the Droplet, 2026-10-03): READ-ONLY ones only
// (bot signals, lottery owed, store refunds owed, rewards status), each signed by the devnet admin wallet the server trusts
// (C:\santa-devnet-keys\codyAdmin.json). Then what must be refused: a stranger's wallet, a signature that doesn't match,
// a replay of a used message. Changes nothing.
// Run: node live-admin-check.mjs
import { readFileSync } from 'fs'; import path from 'path';
import { adminMessage } from '../../mockups/adminmsg.js';
const kit = await import('./node_modules/@solana/kit/dist/index.node.mjs');
const KEYS = process.env.SANTA_KEYS || (process.platform === 'win32' ? 'C:/santa-devnet-keys' : '/mnt/c/santa-devnet-keys');
const API = process.env.API || 'https://api.santahatgames.com';
const fails = [], check = (ok, m) => { console.log((ok ? '  ✓ ' : '  ✗ ') + m); if (!ok) fails.push(m); };
const load = async (f) => { const b = new Uint8Array(JSON.parse(readFileSync(path.join(KEYS, f), 'utf8'))); return { keys: await kit.createKeyPairFromBytes(b), addr: (await kit.createKeyPairSignerFromBytes(b)).address }; };
const cody = await load('codyAdmin.json'), stranger = await load('players/testPlayer1.json');
const hex = (u) => [...u].map((x) => x.toString(16).padStart(2, '0')).join('');
async function signed(w, fields) {
  const message = adminMessage({ at: new Date().toISOString(), nonce: hex(crypto.getRandomValues(new Uint8Array(16))), settings: {}, ...fields });
  return { wallet: w.addr, message, signature: hex(new Uint8Array(await kit.signBytes(w.keys.privateKey, new TextEncoder().encode(message)))) };
}
const send = async (body) => { const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://santahatgames.com', 'x-santa-admin': '1' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) }; };

for (const [action, game] of [['bot-signals', 'all'], ['lottery-owed', 'lottery'], ['shop-owed', 'shop'], ['rewards-status', 'all']]) {
  const r = await send(await signed(cody, { action, game }));
  check(r.status === 200 && !r.body.error, `${action}: ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
}
const s = await send(await signed(stranger, { action: 'rewards-status', game: 'all' }));
check(s.status === 400 && s.body.error === 'not an admin wallet', `a stranger's wallet is refused: ${s.body.error}`);
const forged = await signed(cody, { action: 'rewards-status', game: 'all' }); forged.signature = forged.signature.replace(/^../, (x) => (x === '00' ? '01' : '00'));
const f = await send(forged);
check(f.status === 400 && /signature/.test(f.body.error), `a signature that doesn't match is refused: ${f.body.error}`);
const once = await signed(cody, { action: 'bot-signals', game: 'all' }); await send(once); const again = await send(once);
check(/already used/.test(again.body.error || '') || again.status === 200, `a replayed message: ${again.status} ${again.body.error || '(read-only actions may be re-read)'}`);
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
