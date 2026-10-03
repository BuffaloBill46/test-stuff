// Devnet balances (SOL for fees, test SANTA for buying) of the 5 test players in C:\santa-devnet-keys\players.
// Run: node testplayers-balance.mjs
import { readFileSync } from 'fs'; import path from 'path';
const kit = await import('./node_modules/@solana/kit/dist/index.node.mjs');
const T22 = await import('./node_modules/@solana-program/token-2022/dist/src/index.mjs');
const cfg = JSON.parse(readFileSync(new URL('../../devnet.json', import.meta.url), 'utf8'));
const KEYS = process.env.SANTA_KEYS || (process.platform === 'win32' ? 'C:/santa-devnet-keys' : '/mnt/c/santa-devnet-keys');
const rpc = kit.createSolanaRpc(cfg.rpc);
for (let n = 1; n <= 5; n++) {
  const s = await kit.createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(path.join(KEYS, 'players', `testPlayer${n}.json`), 'utf8'))));
  const sol = Number((await rpc.getBalance(s.address).send()).value) / 1e9;
  const [ata] = await T22.findAssociatedTokenPda({ owner: s.address, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS, mint: cfg.mint });
  const santa = await rpc.getTokenAccountBalance(ata).send().then((r) => r.value.uiAmountString, () => 'no account');
  console.log(`testPlayer${n} ${s.address}  SOL ${sol}  SANTA ${santa}`);
}
