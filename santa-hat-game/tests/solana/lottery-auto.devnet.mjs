// DEVNET: switch the lottery to AUTOMATIC payouts (Cody, 2026-10-02: "make the lottery all auto like the games"), signed like
// the admin screen does with the devnet stand-in for Cody's admin wallet, sent to the LIVE game server. At mainnet Cody's own
// wallet signs the same switch on the admin screen ("Switch to automatic"). Run: node lottery-auto.devnet.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as kit from '@solana/kit';
import { adminMessage } from '../../server/admin.js';
const KEYS = process.env.SANTA_KEYS || 'C:/santa-devnet-keys', SERVER = 'https://olganobdypnxfpmsxibe.supabase.co/functions/v1/games';
const keys = await kit.createKeyPairFromBytes(new Uint8Array(JSON.parse(readFileSync(path.join(KEYS, 'codyAdmin.json'), 'utf8'))));
const wallet = await kit.getAddressFromPublicKey(keys.publicKey);
const call = async (action, settings = {}) => {
  const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const message = adminMessage({ action, game: 'lottery', settings, at: new Date().toISOString(), nonce });
  const sig = await kit.signBytes(keys.privateKey, new TextEncoder().encode(message));
  return (await fetch(SERVER, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://santahatgames.com', 'x-santa-admin': '1' },
    body: JSON.stringify({ wallet, message, signature: [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('') }) })).json();
};
console.log('switch:', JSON.stringify(await call('lottery-mode', { mode: 'auto' })));
console.log('now:', JSON.stringify(await call('lottery-owed')).slice(0, 160));
