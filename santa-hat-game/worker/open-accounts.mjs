// Opens each pool/lottery/treasury wallet's SANTA token account (Token-2022), paid by that wallet's own SOL, so no player ever
// pays the ~0.002 SOL to open it with their first lottery ticket or Store buy (launch, 2026-10-03). Safe to repeat: an account
// that exists is left alone (create-idempotent). Runs on the Droplet, where the keys are; prints public addresses only.
// Run: set -a; . /etc/santa/worker.env(.mainnet); set +a; node open-accounts.mjs          (look only: what exists, SOL left)
//      … node open-accounts.mjs --send                                                       (open the missing ones)
import { readFileSync, existsSync } from 'fs'; import path from 'path';
import * as kit from '@solana/kit';
import * as T22 from '@solana-program/token-2022';
const need = (k) => { const v = process.env[k]; if (!v) throw new Error('missing ' + k); return v; };
const rpcUrl = need('SOLANA_RPC_URL'), mint = kit.address(need('SANTA_MINT')), KEYS = need('KEYS_DIR'), SEND = process.argv.includes('--send');
const rpc = kit.createSolanaRpc(rpcUrl), subs = kit.createSolanaRpcSubscriptions(rpcUrl.replace(/^http/, 'ws'));
for (const name of ['spinPool', 'slotsPool', 'lotteryPool', 'treasury']) {
  const f = path.join(KEYS, name + '.json'); if (!existsSync(f)) { console.log(`${name}: no key here`); continue; }
  const signer = await kit.createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(f, 'utf8'))));
  const [ata] = await T22.findAssociatedTokenPda({ owner: signer.address, mint, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS });
  const sol = Number((await rpc.getBalance(signer.address, { commitment: 'confirmed' }).send()).value) / 1e9;
  const acct = (await rpc.getAccountInfo(ata, { encoding: 'base64', commitment: 'confirmed' }).send()).value;
  if (acct) { console.log(`${name} ${signer.address}: SANTA account open (${ata}); SOL ${sol}`); continue; }
  if (!SEND) { console.log(`${name} ${signer.address}: SANTA account NOT open yet; SOL ${sol}${sol < 0.003 ? ' (needs SOL first)' : ''}`); continue; }
  if (sol < 0.003) { console.log(`${name}: needs SOL before its account can be opened (has ${sol})`); continue; }
  const { value: bh } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  const msg = kit.pipe(kit.createTransactionMessage({ version: 0 }), (m) => kit.setTransactionMessageFeePayerSigner(signer, m),
    (m) => kit.setTransactionMessageLifetimeUsingBlockhash(bh, m),
    (m) => kit.appendTransactionMessageInstruction(T22.getCreateAssociatedTokenIdempotentInstruction({ payer: signer, ata, owner: signer.address, mint, tokenProgram: T22.TOKEN_2022_PROGRAM_ADDRESS }), m));
  const tx = await kit.signTransactionMessageWithSigners(msg);
  await kit.sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions: subs })(tx, { commitment: 'confirmed' });
  console.log(`${name} ${signer.address}: SANTA account OPENED (${ata}) tx ${kit.getSignatureFromTransaction(tx)}`);
}
process.exit(0);
