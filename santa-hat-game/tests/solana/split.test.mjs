// The one-transaction payment, run on a real Solana engine (LiteSVM) with the REAL Token-2022 program and a test token that
// has SANTA's 3% transfer fee. No network, no real money. Proves on the actual token program:
//   - one transaction burns straight from the player's wallet and sends the rest straight to the pool (no in-between wallet)
//   - the amounts match the game's math (splitPayment) to the last unit, and nothing is lost: burn + arrives + tax = paid
//   - the token enforces the fee (a payment that declares the wrong fee is refused)
//   - all-or-nothing: if any part fails, nothing moves (no burn without the pool payment)
//   - the worked examples in DESIGN_NOTES ($1 spin, $1 ticket, a $2 payout arriving as $1.94)
// Run: cd santa-hat-game/tests/solana && npm install && node split.test.mjs
import assert from 'node:assert/strict';
import { LiteSVM, FailedTransactionMetadata } from 'litesvm';
import { generateKeyPairSigner, createTransactionMessage, setTransactionMessageFeePayerSigner, appendTransactionMessageInstructions, signTransactionMessageWithSigners, pipe, lamports } from '@solana/kit';
import { getCreateAccountInstruction } from '@solana-program/system';
import { TOKEN_2022_PROGRAM_ADDRESS, getMintSize, getInitializeTransferFeeConfigInstruction, getInitializeMint2Instruction, findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction, getMintToInstruction, getBurnCheckedInstruction, getTransferCheckedWithFeeInstruction, decodeToken, decodeMint } from '@solana-program/token-2022';
import { splitPayment, santaFor } from '../../mockups/market.js';
import { IN_PER_DOLLAR } from '../../mockups/slots.js';

const DEC = 6, UNIT = 10 ** DEC, FEE = { bps: 300, max: 1e15 };
const svm = new LiteSVM();
const signer = async () => { const s = await generateKeyPairSigner(); svm.airdrop(s.address, lamports(10_000_000_000n)); return s; };
async function send(feePayer, ixs) {
  const msg = pipe(createTransactionMessage({ version: 0 }), (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => svm.setTransactionMessageLifetimeUsingLatestBlockhash(m), (m) => appendTransactionMessageInstructions(ixs, m));
  const res = svm.sendTransaction(await signTransactionMessageWithSigners(msg));
  svm.expireBlockhash();
  return res instanceof FailedTransactionMetadata ? { ok: false, err: String(res.err?.() ?? res) } : { ok: true };
}
const bal = (ata) => Number(decodeToken(svm.getAccount(ata)).data.amount);
const withheld = (ata) => Number(decodeToken(svm.getAccount(ata)).data.extensions.value?.find((e) => e.__kind === 'TransferFeeAmount')?.withheldAmount ?? 0n);
const supply = (mint) => Number(decodeMint(svm.getAccount(mint)).data.supply);

// A test token with SANTA's settings: 6 decimals, 3% transfer fee.
const admin = await signer(), mint = await generateKeyPairSigner();
const ext = [{ __kind: 'TransferFeeConfig', transferFeeConfigAuthority: admin.address, withdrawWithheldAuthority: admin.address, withheldAmount: 0n,
  olderTransferFee: { epoch: 0n, maximumFee: BigInt(FEE.max), transferFeeBasisPoints: FEE.bps }, newerTransferFee: { epoch: 0n, maximumFee: BigInt(FEE.max), transferFeeBasisPoints: FEE.bps } }];
const space = getMintSize(ext);
let r = await send(admin, [
  getCreateAccountInstruction({ payer: admin, newAccount: mint, lamports: svm.minimumBalanceForRentExemption(BigInt(space)), space, programAddress: TOKEN_2022_PROGRAM_ADDRESS }),
  getInitializeTransferFeeConfigInstruction({ mint: mint.address, transferFeeConfigAuthority: admin.address, withdrawWithheldAuthority: admin.address, transferFeeBasisPoints: FEE.bps, maximumFee: BigInt(FEE.max) }),
  getInitializeMint2Instruction({ mint: mint.address, decimals: DEC, mintAuthority: admin.address, freezeAuthority: null }),
]);
assert.ok(r.ok, 'create the 3%-fee test token: ' + r.err);

const player = await signer(), spinPool = await signer(), treasury = await signer();
const ata = async (owner) => (await findAssociatedTokenPda({ owner: owner.address, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS, mint: mint.address }))[0];
const [pA, sA, tA] = [await ata(player), await ata(spinPool), await ata(treasury)];
r = await send(admin, [pA, sA, tA].map((a, i) => getCreateAssociatedTokenIdempotentInstruction({ payer: admin, ata: a, owner: [player, spinPool, treasury][i].address, mint: mint.address, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS }))
  .concat(getMintToInstruction({ mint: mint.address, token: pA, mintAuthority: admin, amount: 1_000_000n * BigInt(UNIT) })));
assert.ok(r.ok, 'accounts + 1,000,000 test SANTA for the player: ' + r.err);

// The purchase: ONE transaction, signed by the player: burn straight from their wallet, send the rest straight to the pool.
const purchase = (s, dest, overrides = {}) => [
  getBurnCheckedInstruction({ account: pA, mint: mint.address, authority: player, amount: BigInt(s.burn), decimals: DEC }),
  getTransferCheckedWithFeeInstruction({ source: pA, mint: mint.address, destination: dest, authority: player, amount: BigInt(overrides.send ?? s.send), decimals: DEC, fee: BigInt(overrides.tax ?? s.tax) }),
];
async function pay(s, dest) {
  const before = { p: bal(pA), d: bal(dest), w: withheld(dest), sup: supply(mint.address) };
  const res = await send(player, purchase(s, dest));
  assert.ok(res.ok, 'payment: ' + res.err);
  const d = { paid: before.p - bal(pA), arrived: bal(dest) - before.d, tax: withheld(dest) - before.w, burned: before.sup - supply(mint.address) };
  assert.equal(d.paid, s.total, 'exactly the quoted amount leaves the wallet');
  assert.equal(d.burned, s.burn, 'the burn really destroys supply');
  assert.equal(d.arrived, s.arrives, 'what arrives matches the game math');
  assert.equal(d.tax, s.tax, 'the token withheld exactly the 3% the math says');
  assert.equal(d.burned + d.arrived + d.tax, d.paid, 'nothing lost: burn + arrives + tax = paid');
  return d;
}

// 1) $1 spin, worked example: 9.70¢ burned, 90.30¢ sent, 87.59¢ arrives (1 SANTA = $1 here to read it in cents).
let s = splitPayment(1 * UNIT, 1000, FEE);
let d = await pay(s, sA);
assert.deepEqual([d.burned / UNIT, s.send / UNIT, d.arrived / UNIT], [0.097, 0.903, 0.87591]);
assert.ok(Math.abs(d.arrived / UNIT - IN_PER_DOLLAR) < 1e-6, 'matches the IN_PER_DOLLAR the game uses');
// 2) $1 ticket, worked example: 48.50¢ burned, 51.50¢ sent, 49.95¢ arrives in the treasury.
s = splitPayment(1 * UNIT, 5000, FEE); d = await pay(s, tA);
assert.deepEqual([d.burned / UNIT, s.send / UNIT, Math.floor(d.arrived / UNIT * 10000) / 10000], [0.485, 0.515, 0.4995]);
// 3) Buy 10 $1 spins at today's-style price in one payment (odd amounts, rounding lands on the remainder).
const price = { usd: 0.0008508 }, total = Math.round(santaFor(10, price) * UNIT) + 7;
s = splitPayment(total, 1000, FEE); d = await pay(s, sA);
console.log(`10 spins at $${price.usd}: ${(s.total / UNIT).toFixed(2)} SANTA paid → ${(s.burn / UNIT).toFixed(2)} burned, ${(s.arrives / UNIT).toFixed(2)} arrive in the Spin pool, ${(s.tax / UNIT).toFixed(2)} token tax`);
// 4) Many random amounts: the math and the real token never disagree by even one unit.
// 40 payments of up to 20,000 each stay under the 1,000,000 the player holds.
for (let i = 0; i < 40; i++) { const t = 1 + Math.floor(Math.random() * 20_000 * UNIT); await pay(splitPayment(t, [1000, 5000][i % 2], FEE), i % 2 ? tA : sA); }
// 5) The token enforces the fee: declaring a smaller fee is refused, and nothing moves.
s = splitPayment(3 * UNIT, 1000, FEE);
let b0 = [bal(pA), supply(mint.address)];
r = await send(player, purchase(s, sA, { tax: s.tax - 1 }));
assert.equal(r.ok, false, 'a payment with the wrong fee is refused by the token');
assert.deepEqual([bal(pA), supply(mint.address)], b0, 'refused payment: no burn happened either (all-or-nothing)');
// 6) All-or-nothing: if the send part fails (more than the wallet holds), the burn in the same transaction is undone too.
s = splitPayment(bal(pA) + UNIT, 1000, FEE); b0 = [bal(pA), supply(mint.address)];
r = await send(player, purchase(s, sA));
assert.equal(r.ok, false); assert.deepEqual([bal(pA), supply(mint.address)], b0, 'failed payment: nothing burned, nothing sent');
// 7) A $2 win paid from the Spin pool arrives as $1.94 (the winner absorbs the tax, decided).
const win = 2 * UNIT, tax = Math.ceil(win * FEE.bps / 10000), p0 = bal(pA);
r = await send(spinPool, [getTransferCheckedWithFeeInstruction({ source: sA, mint: mint.address, destination: pA, authority: spinPool, amount: BigInt(win), decimals: DEC, fee: BigInt(tax) })]);
assert.ok(r.ok, r.err); assert.equal((bal(pA) - p0) / UNIT, 1.94);
console.log('OK: one-transaction payments on the real Token-2022 program: exact split, nothing lost, fee enforced, all-or-nothing, $2 win arrives as $1.94');
