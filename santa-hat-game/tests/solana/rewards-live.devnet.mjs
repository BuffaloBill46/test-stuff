// CLAIM REWARDS on the LIVE devnet system (Cody, 2026-10-02): a pretend reward token is put in the real devnet Drop pool (the
// books count SANTA only, so they don't move), the admin claim is SIGNED with the devnet stand-in for Cody's admin wallet and
// sent to the live game server, and the live payout worker on the Droplet sends the token to the devnet treasury. DEVNET ONLY.
// Run (Windows or WSL): cd tests/solana && node rewards-live.devnet.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as kit from '@solana/kit';
import * as T22 from '@solana-program/token-2022';
import { getCreateAccountInstruction } from '@solana-program/system';
import { adminMessage } from '../../server/admin.js';

const cfg = JSON.parse(readFileSync(new URL('../../devnet.json', import.meta.url), 'utf8')), RPC = cfg.rpc;
if (!/devnet/.test(RPC)) throw new Error('devnet only');
const SERVER = 'https://olganobdypnxfpmsxibe.supabase.co/functions/v1/games', KEYS = process.env.SANTA_KEYS || 'C:\\santa-devnet-keys';
const bytes = (n) => new Uint8Array(JSON.parse(readFileSync(path.join(KEYS, n + '.json'), 'utf8')));
const funder = await kit.createKeyPairSignerFromBytes(bytes('funder')), codyKeys = await kit.createKeyPairFromBytes(bytes('codyAdmin'));
const cody = await kit.getAddressFromPublicKey(codyKeys.publicKey);
const rpc = kit.createSolanaRpc(RPC), confirm = kit.sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions: kit.createSolanaRpcSubscriptions(RPC.replace(/^http/, 'ws')) });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const send = async (ixs) => { const { value: bh } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  await confirm(await kit.signTransactionMessageWithSigners(kit.pipe(kit.createTransactionMessage({ version: 0 }), (x) => kit.setTransactionMessageFeePayerSigner(funder, x), (x) => kit.setTransactionMessageLifetimeUsingBlockhash(bh, x), (x) => kit.appendTransactionMessageInstructions(ixs, x))), { commitment: 'confirmed' }); };
const P = T22.TOKEN_2022_PROGRAM_ADDRESS, ata = async (o, m) => (await T22.findAssociatedTokenPda({ owner: o, mint: m, tokenProgram: P }))[0];
const bal = async (o, m) => { try { return BigInt((await rpc.getTokenAccountBalance(await ata(o, m), { commitment: 'confirmed' }).send()).value.amount); } catch { return 0n; } };
const POOL = cfg.wallets.spinPool, TREASURY = cfg.wallets.treasury;

// 1. a pretend reward token in the real devnet Drop pool
const reward = await kit.generateKeyPairSigner(), space = T22.getMintSize(), AMT = 1_234_567n;
await send([getCreateAccountInstruction({ payer: funder, newAccount: reward, lamports: await rpc.getMinimumBalanceForRentExemption(BigInt(space)).send(), space, programAddress: P }),
  T22.getInitializeMint2Instruction({ mint: reward.address, decimals: 6, mintAuthority: funder.address, freezeAuthority: null }),
  T22.getCreateAssociatedTokenIdempotentInstruction({ payer: funder, ata: await ata(POOL, reward.address), owner: POOL, mint: reward.address, tokenProgram: P }),
  T22.getMintToInstruction({ mint: reward.address, token: await ata(POOL, reward.address), mintAuthority: funder, amount: AMT })]);
const santaBefore = await bal(POOL, cfg.mint);
console.log(`1. pretend reward ${reward.address}: ${AMT} raw in the devnet Drop pool (which holds ${santaBefore} raw test SANTA)`);

// 2. the admin claim, signed like the admin screen does, to the LIVE game server
const call = async (action) => {
  const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const message = adminMessage({ action, game: 'all', settings: {}, at: new Date().toISOString(), nonce });
  const sig = await kit.signBytes(codyKeys.privateKey, new TextEncoder().encode(message));
  const r = await fetch(SERVER, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://santahatgames.com', 'x-santa-admin': '1' },
    body: JSON.stringify({ wallet: cody, message, signature: [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('') }) });
  return r.json();
};
const c = await call('claim-rewards');
assert.ok(c.ok, 'the live server took the signed claim: ' + JSON.stringify(c));
console.log(`2. claim #${c.claim} accepted by the live game server`);

// 3. the live worker on the Droplet sends it (it looks every few seconds; devnet confirms in a few more)
let st, mine;
for (let i = 0; i < 30; i++) { await pause(5000); st = await call('rewards-status'); mine = st.sweeps?.find((w) => w.mint === reward.address); if (mine?.status === 'sent') break; }
assert.equal(mine?.status, 'sent', 'the live worker swept it: ' + JSON.stringify(st?.sweeps?.slice(0, 3)));
await pause(3000);
assert.equal(await bal(TREASURY, reward.address), AMT, 'it arrived in the devnet treasury, in full');
assert.equal(await bal(POOL, reward.address), 0n, 'the pool has none left');
assert.equal(await bal(POOL, cfg.mint), santaBefore, 'the pool\'s SANTA did not move');
console.log(`OK: LIVE devnet Claim rewards: signed claim → live game server → Droplet worker → ${AMT} raw in the treasury (tx ${mine.tx.slice(0, 10)}…); pool SANTA untouched`);
