// DEVNET SETUP for the live test (devnet = Solana's free test network: its SOL and tokens are worth nothing).
// Makes (or reuses) everything the rehearsal (rehearsal.mjs) made in memory, but on the real devnet:
//   - a test SANTA: Token-2022, 6 decimals, 3% (300 bps) transfer fee, like the real one
//   - wallets: admin (mints the test token, pays setup fees), Spin pool, Slots pool, Lottery pool, treasury, a test player
//   - each wallet gets a token account and a little devnet SOL for fees; the pools get their starting SANTA
// Keys are kept OUTSIDE the repo (default C:\santa-devnet-keys, or SANTA_KEYS=<folder>); only public addresses are printed and
// written to ../../devnet.json. Safe to run again: existing keys and accounts are reused, balances only topped up.
// Fees are paid from a funded devnet key (FUNDER=<keypair json>; default: funder.json in the keys folder, Santa's own devnet
// funding wallet 3dGDmcfu7f6DTjYtyL2xZV9E5qzKiCBWMD88aZEakGog; else the Solana CLI's id.json inside WSL).
// Run: cd tests/solana && node devnet-setup.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSolanaRpc, createSolanaRpcSubscriptions, sendAndConfirmTransactionFactory, createKeyPairSignerFromBytes, createTransactionMessage,
  setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstructions, signTransactionMessageWithSigners,
  getSignatureFromTransaction, pipe, lamports } from '@solana/kit';
import { getCreateAccountInstruction, getTransferSolInstruction } from '@solana-program/system';
import * as T22 from '@solana-program/token-2022';

const here = dirname(fileURLToPath(import.meta.url));
const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
if (!/devnet/.test(RPC)) throw new Error('devnet only: SOLANA_RPC_URL must be a devnet URL');
const KEYS = process.env.SANTA_KEYS || 'C:\\santa-devnet-keys';
// Santa's own devnet funding wallet (Cody sends devnet SOL to it); else the Solana CLI's key inside WSL.
const FUNDER = process.env.FUNDER || (existsSync(join(KEYS, 'funder.json')) ? join(KEYS, 'funder.json') : '\\\\wsl.localhost\\Ubuntu\\root\\.config\\solana\\id.json');
const DEC = 6, BPS = 300, MAX_FEE = 10n ** 15n;
const POOLS_USD = { spin: 50, slots: 500, lottery: 0 }; // demo starting pools (DESIGN_NOTES); the lottery's pots start empty
const PLAYER_USD = 100, SOL_EACH = 50_000_000n; // 0.05 devnet SOL per wallet for fees

const rpc = createSolanaRpc(RPC), subs = createSolanaRpcSubscriptions(RPC.replace(/^http/, 'ws'));
const confirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions: subs });
const say = (...a) => console.log('  ' + a.join(' '));

mkdirSync(KEYS, { recursive: true });
async function key(name) {
  const f = join(KEYS, name + '.json');
  if (!existsSync(f)) {
    const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const priv = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey)).slice(-32), pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    writeFileSync(f, JSON.stringify([...priv, ...pub])); // the Solana CLI's keypair format (64 numbers)
  }
  return createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(f, 'utf8'))));
}
async function send(payer, ixs) {
  const { value: bh } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  const m = pipe(createTransactionMessage({ version: 0 }), (x) => setTransactionMessageFeePayerSigner(payer, x), (x) => setTransactionMessageLifetimeUsingBlockhash(bh, x), (x) => appendTransactionMessageInstructions(ixs, x));
  const tx = await signTransactionMessageWithSigners(m);
  await confirm(tx, { commitment: 'confirmed' });
  return getSignatureFromTransaction(tx);
}
const sol = async (a) => (await rpc.getBalance(a, { commitment: 'confirmed' }).send()).value;
const exists = async (a) => (await rpc.getAccountInfo(a, { encoding: 'base64', commitment: 'confirmed' }).send()).value !== null;

console.log('1. Keys (kept in ' + KEYS + ', never in the repo)');
const funder = await createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(FUNDER, 'utf8'))));
const w = {};
for (const n of ['admin', 'mint', 'spinPool', 'slotsPool', 'lotteryPool', 'treasury', 'player']) w[n] = await key(n);
say(`funder ${funder.address}: ${Number(await sol(funder.address)) / 1e9} devnet SOL`);

console.log('2. Devnet SOL for fees');
const needs = [['admin', 300_000_000n], ...['spinPool', 'slotsPool', 'lotteryPool', 'treasury', 'player'].map((n) => [n, SOL_EACH])];
const top = [];
for (const [n, want] of needs) { const have = await sol(w[n].address); if (have < want / 2n) top.push(getTransferSolInstruction({ source: funder, destination: w[n].address, amount: lamports(want - have) })); }
if (top.length) { await send(funder, top); say(`topped up ${top.length} wallet(s)`); } else say('every wallet already has enough');

console.log('3. Test SANTA (Token-2022, 6 decimals, 3% transfer fee)');
const mint = w.mint.address;
if (!(await exists(mint))) {
  const ext = [{ __kind: 'TransferFeeConfig', transferFeeConfigAuthority: w.admin.address, withdrawWithheldAuthority: w.admin.address, withheldAmount: 0n,
    olderTransferFee: { epoch: 0n, maximumFee: MAX_FEE, transferFeeBasisPoints: BPS }, newerTransferFee: { epoch: 0n, maximumFee: MAX_FEE, transferFeeBasisPoints: BPS } }];
  const space = T22.getMintSize(ext), rent = await rpc.getMinimumBalanceForRentExemption(BigInt(space)).send();
  await send(w.admin, [getCreateAccountInstruction({ payer: w.admin, newAccount: w.mint, lamports: rent, space, programAddress: T22.TOKEN_2022_PROGRAM_ADDRESS }),
    T22.getInitializeTransferFeeConfigInstruction({ mint, transferFeeConfigAuthority: w.admin.address, withdrawWithheldAuthority: w.admin.address, transferFeeBasisPoints: BPS, maximumFee: MAX_FEE }),
    T22.getInitializeMint2Instruction({ mint, decimals: DEC, mintAuthority: w.admin.address, freezeAuthority: null })]);
  say('made the test token ' + mint);
} else say('reusing the test token ' + mint);

console.log('4. Token accounts and starting balances');
const ata = async (o) => (await T22.findAssociatedTokenPda({ owner: o, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS, mint }))[0];
const holders = ['spinPool', 'slotsPool', 'lotteryPool', 'treasury', 'player'];
await send(w.admin, await Promise.all(holders.map(async (n) => T22.getCreateAssociatedTokenIdempotentInstruction({ payer: w.admin, ata: await ata(w[n].address), owner: w[n].address, mint, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS }))));
const bal = async (n) => BigInt((await rpc.getTokenAccountBalance(await ata(w[n].address), { commitment: 'confirmed' }).send()).value.amount);
// Starting amounts in test SANTA at real SANTA's live price (the server quotes the real price for the test token too).
const r = await fetch('https://api.dexscreener.com/latest/dex/tokens/3c7mmVSyEH8jfZXgxvpLsETtko1Y16DyRJ5XYB4snhGt').then((x) => x.json());
const price = Number([...(r.pairs || [])].sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0]?.priceUsd);
if (!(price > 0)) throw new Error('could not read the SANTA price');
const raw = (usd) => BigInt(Math.round((usd / price) * 10 ** DEC));
const want = { spinPool: raw(POOLS_USD.spin), slotsPool: raw(POOLS_USD.slots), lotteryPool: 0n, treasury: 0n, player: raw(PLAYER_USD) };
const mints = [];
for (const n of holders) { const have = await bal(n); if (have < want[n]) mints.push(T22.getMintToInstruction({ mint, token: await ata(w[n].address), mintAuthority: w.admin, amount: want[n] - have })); }
if (mints.length) await send(w.admin, mints);
const out = { network: 'devnet', rpc: RPC, mint, priceUsdAtSetup: price, wallets: {} };
for (const n of holders) { out.wallets[n] = w[n].address; say(`${n.padEnd(11)} ${w[n].address}  ${(Number(await bal(n)) / 1e6).toLocaleString()} test SANTA`); }
out.wallets.admin = w.admin.address;
writeFileSync(join(here, '..', '..', 'devnet.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`OK: devnet ready (SANTA price $${price}); public addresses in santa-hat-game/devnet.json`);
process.exit(0);
