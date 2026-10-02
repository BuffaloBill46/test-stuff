// DEVNET TEST KEYS ONLY: turn a key file (the Solana CLI's 64-number array) into the text Phantom imports (base58), written to a
// file next to it (never printed, so it doesn't end up in logs). Phantom: Settings → Manage accounts → Add / Connect wallet →
// Import private key → paste the file's contents. Run: node key-to-base58.mjs <key file>   e.g. C:\santa-devnet-keys\players\testPlayer1.json
import { readFileSync, writeFileSync } from 'node:fs';
const f = process.argv[2]; if (!f || !/\.json$/.test(f)) throw new Error('usage: node key-to-base58.mjs <key .json file>');
if (/spinPool|slotsPool|lotteryPool|treasury|admin|funder|mint/i.test(f)) throw new Error('only test player keys (not the game\'s own wallets)');
const bytes = Uint8Array.from(JSON.parse(readFileSync(f, 'utf8'))); if (bytes.length !== 64) throw new Error('not a 64-byte key');
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
let n = BigInt('0x' + Buffer.from(bytes).toString('hex')), s = '';
while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; }
for (const b of bytes) { if (b) break; s = '1' + s; }
const out = f.replace(/\.json$/, '.phantom.txt'); writeFileSync(out, s, { mode: 0o600 });
console.log('Phantom import text written to ' + out);
