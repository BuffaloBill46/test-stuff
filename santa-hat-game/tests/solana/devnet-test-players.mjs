// DEVNET ONLY: fake players to test with (Cody, 2026-10-02: "create a few fake players on devnet... share some from the deploy
// wallet"). Makes (or reuses) N player wallets, gives each devnet SOL for fees from the funder (deploy) wallet and test SANTA
// (minted by the test token's authority), and writes their PUBLIC addresses into ../../devnet.json under testPlayers.
// Keys stay outside the repo: <SANTA_KEYS>/players/testPlayerN.json (the Solana CLI format; Phantom can import one: Settings →
// Manage accounts → Import private key, after converting the array to base58, e.g. with tests/solana/key-to-base58.mjs).
// Safe to run again: only tops each wallet back up to the amounts below. Run: cd tests/solana && node devnet-test-players.mjs [N]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSolanaRpc, createSolanaRpcSubscriptions, sendAndConfirmTransactionFactory, createKeyPairSignerFromBytes, createTransactionMessage,
  setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstructions, signTransactionMessageWithSigners,
  getSignatureFromTransaction, pipe, lamports } from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import * as T22 from '@solana-program/token-2022';

const N = Number(process.argv[2]) || 5, SOL_EACH = 200_000_000n, USD_EACH = Number(process.env.USD_EACH) || 100; // 0.2 devnet SOL, $100 of test SANTA (USD_EACH=250 for the 1,000-play QA)
const cfgUrl = new URL('../../devnet.json', import.meta.url), cfg = JSON.parse(readFileSync(cfgUrl, 'utf8'));
if (!/devnet/.test(cfg.rpc)) throw new Error('devnet only');
const KEYS = process.env.SANTA_KEYS || 'C:\\santa-devnet-keys', DIR = join(KEYS, 'players'); mkdirSync(DIR, { recursive: true });
const rpc = createSolanaRpc(cfg.rpc), confirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions: createSolanaRpcSubscriptions(cfg.rpc.replace(/^http/, 'ws')) });
// the free public devnet RPC answers 429 when asked too fast: wait and ask again (sending a signed transaction twice is harmless)
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn) { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= 6 || !/429|Too Many/i.test(String(e?.message) + JSON.stringify(e?.context || {}))) throw e; await pause(2000 * 2 ** i); } } }
const load = (f) => createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(f, 'utf8'))));
async function key(name) {
  const f = join(DIR, name + '.json');
  if (!existsSync(f)) {
    const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const priv = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey)).slice(-32), pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    writeFileSync(f, JSON.stringify([...priv, ...pub]));
  }
  return load(f);
}
async function send(payer, ixs) { await pause(1200); return retry(() => send1(payer, ixs)); }
async function send1(payer, ixs) {
  const { value: bh } = await retry(() => rpc.getLatestBlockhash({ commitment: 'confirmed' }).send());
  const tx = await signTransactionMessageWithSigners(pipe(createTransactionMessage({ version: 0 }), (x) => setTransactionMessageFeePayerSigner(payer, x),
    (x) => setTransactionMessageLifetimeUsingBlockhash(bh, x), (x) => appendTransactionMessageInstructions(ixs, x)));
  await confirm(tx, { commitment: 'confirmed' }); return getSignatureFromTransaction(tx);
}
const funder = await load(join(KEYS, 'funder.json')), admin = await load(join(KEYS, 'admin.json')), mint = cfg.mint;
// the price the game uses (the server's own reading), so "$100" means what the game means by it
const price = (await (await fetch('https://api.santahatgames.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"action":"market"}' })).json()).usd;
if (!(price > 0)) throw new Error('no SANTA price from the game server');
const wantRaw = BigInt(Math.round((USD_EACH / price) * 1e6));
const ata = async (o) => (await T22.findAssociatedTokenPda({ owner: o, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS, mint }))[0];
const out = [];
for (let i = 1; i <= N; i++) {
  const p = await key('testPlayer' + i), a = await ata(p.address);
  const sol = (await retry(() => rpc.getBalance(p.address, { commitment: 'confirmed' }).send())).value;
  const ixs = [];
  if (sol < SOL_EACH / 2n) ixs.push(getTransferSolInstruction({ source: funder, destination: p.address, amount: lamports(SOL_EACH - sol) }));
  if (ixs.length) await send(funder, ixs);
  await send(admin, [T22.getCreateAssociatedTokenIdempotentInstruction({ payer: admin, ata: a, owner: p.address, mint, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS })]);
  const have = BigInt((await retry(() => rpc.getTokenAccountBalance(a, { commitment: 'confirmed' }).send())).value.amount);
  if (have < wantRaw / 2n) await send(admin, [T22.getMintToInstruction({ mint, token: a, mintAuthority: admin, amount: wantRaw - have }, { programAddress: T22.TOKEN_2022_PROGRAM_ADDRESS })]);
  const santa = BigInt((await retry(() => rpc.getTokenAccountBalance(a, { commitment: 'confirmed' }).send())).value.amount), solNow = (await retry(() => rpc.getBalance(p.address, { commitment: 'confirmed' }).send())).value;
  out.push({ name: 'testPlayer' + i, address: p.address, sol: Number(solNow) / 1e9, santa: Number(santa) / 1e6, usd: +(Number(santa) / 1e6 * price).toFixed(2) });
  console.log(`testPlayer${i}  ${p.address}  ${(Number(solNow) / 1e9).toFixed(2)} SOL  ${(Number(santa) / 1e6).toLocaleString()} test SANTA (~$${(Number(santa) / 1e6 * price).toFixed(2)})`);
}
cfg.testPlayers = Object.fromEntries(out.map((p) => [p.name, p.address]));
cfg.labels.testPlayers = 'Fake players for testing (devnet only): SOL for fees from the funder, test SANTA; keys in <SANTA_KEYS>/players/';
writeFileSync(cfgUrl, JSON.stringify(cfg, null, 2) + '\n');
console.log(`funder left: ${(Number((await retry(() => rpc.getBalance(funder.address, { commitment: 'confirmed' }).send())).value) / 1e9).toFixed(2)} devnet SOL`);
