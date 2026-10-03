// Shared by the live-site tests: a devnet test player (C:\santa-devnet-keys\players\testPlayerN.json) with a stand-in wallet
// in the page. It does the wallet's two jobs, the way Phantom does after the player taps Approve: sign the sign-in message, and
// sign + SEND a purchase to devnet (real transactions, test money). Nothing else about the site is faked.
import { createRequire } from 'module'; import { readFileSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
export const { chromium } = require(process.env.PW ? path.join(process.env.PW, 'node_modules/playwright') : path.join(execSync('npm root -g').toString().trim(), 'playwright'));
export const kit = await import('../solana/node_modules/@solana/kit/dist/index.node.mjs');
const T22 = await import('../solana/node_modules/@solana-program/token-2022/dist/src/index.mjs');
export const cfg = JSON.parse(readFileSync(new URL('../../devnet.json', import.meta.url), 'utf8'));
const KEYS = process.env.SANTA_KEYS || (process.platform === 'win32' ? 'C:/santa-devnet-keys' : '/mnt/c/santa-devnet-keys');
export const SITE = process.env.SITE || 'https://santahatgames.com/?server=https://api.santahatgames.com';
export const rpc = kit.createSolanaRpc(cfg.rpc);
const ata = async (o) => (await T22.findAssociatedTokenPda({ owner: o, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS, mint: cfg.mint }))[0];
export const santaRaw = async (o) => BigInt((await rpc.getTokenAccountBalance(await ata(o), { commitment: 'confirmed' }).send()).value.amount);

// Adds the wallet to a page (before it loads). Returns { addr, signs() }: how many purchases the wallet was asked to pay.
export async function withWallet(p, n) {
  const bytes = new Uint8Array(JSON.parse(readFileSync(path.join(KEYS, 'players', `testPlayer${n}.json`), 'utf8')));
  const keys = await kit.createKeyPairFromBytes(bytes), addr = (await kit.createKeyPairSignerFromBytes(bytes)).address;
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
  return { addr, signs: () => signs };
}

// Sign in like a player: Sign in → Connect wallet → the wallet approves. True when the button shows the player's name.
export async function signIn(p) {
  await p.click('#signin'); await p.click('#walletBtn');
  const ok = await p.waitForFunction(() => document.querySelector('#signin').classList.contains('in'), null, { timeout: 45000 }).then(() => true, () => false);
  await p.click('#acctClose').catch(() => {});
  return ok;
}
