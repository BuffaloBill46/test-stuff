// DEVNET ONLY: give a wallet test money to play with: devnet SOL for fees from the funder (deploy) wallet and test SANTA minted
// by the test token's authority. For Cody's own Phantom (2026-10-02) and anyone testing. Nothing here is worth anything.
// Run: cd tests/solana && node devnet-gift.mjs <wallet address> [dollars of test SANTA, default 100] [devnet SOL, default 0.5]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSolanaRpc, createSolanaRpcSubscriptions, sendAndConfirmTransactionFactory, createKeyPairSignerFromBytes, createTransactionMessage,
  setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstructions, signTransactionMessageWithSigners,
  pipe, lamports, address } from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import * as T22 from '@solana-program/token-2022';

const [to, usdArg, solArg] = process.argv.slice(2);
if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(to || '')) throw new Error('usage: node devnet-gift.mjs <wallet address> [dollars] [SOL]');
const usd = Number(usdArg) || 100, sol = Number(solArg) || 0.5;
if (usd > 1000 || sol > 2) throw new Error('keep it small: at most $1000 of test SANTA and 2 devnet SOL');
const cfg = JSON.parse(readFileSync(new URL('../../devnet.json', import.meta.url), 'utf8'));
if (!/devnet/.test(cfg.rpc)) throw new Error('devnet only');
const KEYS = process.env.SANTA_KEYS || 'C:\\santa-devnet-keys';
const load = (n) => createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(join(KEYS, n + '.json'), 'utf8'))));
const rpc = createSolanaRpc(cfg.rpc), confirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions: createSolanaRpcSubscriptions(cfg.rpc.replace(/^http/, 'ws')) });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn) { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= 6 || !/429|Too Many/i.test(String(e?.message) + JSON.stringify(e?.context || {}))) throw e; await pause(2000 * 2 ** i); } } }
async function send(payer, ixs) {
  await pause(1200);
  return retry(async () => {
    const { value: bh } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
    const tx = await signTransactionMessageWithSigners(pipe(createTransactionMessage({ version: 0 }), (x) => setTransactionMessageFeePayerSigner(payer, x), (x) => setTransactionMessageLifetimeUsingBlockhash(bh, x), (x) => appendTransactionMessageInstructions(ixs, x)));
    await confirm(tx, { commitment: 'confirmed' });
  });
}
const funder = await load('funder'), admin = await load('admin'), mint = cfg.mint, owner = address(to);
const price = (await (await fetch('https://api.santahatgames.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"action":"market"}' })).json()).usd;
const raw = BigInt(Math.round((usd / price) * 1e6));
const ata = (await T22.findAssociatedTokenPda({ owner, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS, mint }))[0];
await send(funder, [getTransferSolInstruction({ source: funder, destination: owner, amount: lamports(BigInt(Math.round(sol * 1e9))) })]);
await send(admin, [T22.getCreateAssociatedTokenIdempotentInstruction({ payer: admin, ata, owner, mint, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS }),
  T22.getMintToInstruction({ mint, token: ata, mintAuthority: admin, amount: raw }, { programAddress: T22.TOKEN_2022_PROGRAM_ADDRESS })]);
const bal = await retry(() => rpc.getTokenAccountBalance(ata, { commitment: 'confirmed' }).send()), solNow = await retry(() => rpc.getBalance(owner, { commitment: 'confirmed' }).send());
console.log(`${to}: ${(Number(solNow.value) / 1e9).toFixed(3)} devnet SOL, ${(Number(bal.value.amount) / 1e6).toLocaleString()} test SANTA (~$${(Number(bal.value.amount) / 1e6 * price).toFixed(2)} at the game's price)`);
