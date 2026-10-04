// Payment checker: a good payment passes; every way to cheat is refused. Transactions are shaped exactly like Solana's
// getTransaction "jsonParsed" output (checked against a real SANTA transaction on mainnet, 2026-09-30).
import assert from 'node:assert/strict';
import { verifyPayment } from '../server/verify.js';
import { splitPayment, MINT } from '../mockups/market.js';

const FEE = { bps: 300, max: 1e15 }, TOKEN22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const PLAYER = 'PLAYERwallet111111111111111111111111111111', POOL = 'SPINpool11111111111111111111111111111111111', NOW = 1_790_000_000_000;
const expect = { mint: MINT, player: PLAYER, pool: POOL, quoteRaw: 11_753_640_000, quoteAt: NOW, quoteSeconds: 60, cushion: 0.02, burnBps: 1000, fee: FEE };
const bal = (idx, owner, amount, mint = MINT) => ({ accountIndex: idx, mint, owner, programId: TOKEN22, uiTokenAmount: { amount: String(amount), decimals: 6 } });

// A payment built the way the game builds it: burn + transferCheckedWithFee in one transaction.
function payment({ total = expect.quoteRaw, player = PLAYER, pool = POOL, mint = MINT, burnFactor = 1, arriveShort = 0, signed = true, err = null, at = NOW + 5000 } = {}) {
  const s = splitPayment(total, 1000, FEE), burn = Math.floor(s.burn * burnFactor), send = total - burn;
  const arrives = send - Math.ceil(send * FEE.bps / 10000) - arriveShort;
  return {
    blockTime: Math.floor(at / 1000),
    meta: { err, innerInstructions: [],
      preTokenBalances: [bal(1, player, 50_000_000_000, mint), bal(2, pool, 900_000_000_000, mint)],
      postTokenBalances: [bal(1, player, 50_000_000_000 - total, mint), bal(2, pool, 900_000_000_000 + arrives, mint)] },
    transaction: { message: {
      accountKeys: [{ pubkey: player, signer: signed, writable: true }, { pubkey: 'PLAYERata', signer: false }, { pubkey: 'POOLata', signer: false }],
      instructions: [
        { program: 'spl-token', programId: TOKEN22, parsed: { type: 'burnChecked', info: { account: 'PLAYERata', authority: player, mint, tokenAmount: { amount: String(burn), decimals: 6 } } } },
        { program: 'spl-token', programId: TOKEN22, parsed: { type: 'transferCheckedWithFee', info: { source: 'PLAYERata', destination: 'POOLata', authority: player, mint, tokenAmount: { amount: String(send), decimals: 6 } } } },
      ] } },
  };
}

const good = verifyPayment(payment(), expect);
assert.ok(good.ok, good.why);
assert.ok(verifyPayment(payment({ total: Math.round(expect.quoteRaw * 0.985) }), expect).ok, 'within the 2% cushion is fine');

const refused = {
  'failed on-chain': payment({ err: { InstructionError: [0, 'x'] } }),
  'not signed by the player': payment({ signed: false }),
  'someone else\'s payment': payment({ player: 'SOMEONEelse1111111111111111111111111111111' }),
  'fake token (not SANTA)': payment({ mint: 'FAKEmint111111111111111111111111111111111111' }),
  'paid 3% too little': payment({ total: Math.round(expect.quoteRaw * 0.97) }),
  'paid to the wrong pool': payment({ pool: 'SLOTSpool1111111111111111111111111111111111' }),
  'skipped the burn': payment({ burnFactor: 0 }),
  'burned too little': payment({ burnFactor: 0.9 }),
  'pool got less than the split': payment({ arriveShort: 1 }),
  'paid long after the quote': payment({ at: NOW + 3 * 60_000 }),
  'paid before the quote existed': payment({ at: NOW - 5 * 60_000 }),
};
for (const [name, tx] of Object.entries(refused)) { const r = verifyPayment(tx, expect); assert.equal(r.ok, false, `should refuse: ${name}`); }
assert.equal(verifyPayment(null, expect).ok, false, 'not found');
console.log(`OK: good payment accepted (${good.paid} paid, ${good.burned} burned, ${good.arrived} arrived); ${Object.keys(refused).length + 1} cheating attempts refused`);

// PAID WITH SOL (Cody 2026-10-04: "they are only charged $1 and whatever makes it to the pool is what it gets"; mockups/pay.js).
// The player spends EXACTLY the price in SOL (sol.lamports), through Jupiter; the SANTA the swap gives is burned 10% and sent to
// the pool, so the pool gets a little under the quote (swap fees, the house's cost); at least SOL_FLOOR (85%) of it, or refused.
import { SOL_FLOOR } from '../mockups/market.js';
import { JUPITER } from '../server/verify.js';
const LAM = 8_200_000, FEE_TX = 5000, jupIx = { programId: JUPITER, accounts: [], data: '' };
function solGame({ got = 0.9, lamports = LAM, jup = true, signed = true, leftover = 30_000_000 } = {}) {
  const T = Math.floor(expect.quoteRaw * got), s = splitPayment(T, 1000, FEE), have = 50_000_000_000;
  return { blockTime: Math.floor((NOW + 5000) / 1000),
    meta: { err: null, fee: FEE_TX, innerInstructions: [], preBalances: [3e9, 0, 0], postBalances: [3e9 - lamports - FEE_TX, 0, 0],
      preTokenBalances: [bal(1, PLAYER, have), bal(2, POOL, 9e11)], postTokenBalances: [bal(1, PLAYER, have + leftover), bal(2, POOL, 9e11 + s.arrives)] },
    transaction: { message: { accountKeys: [{ pubkey: PLAYER, signer: signed, writable: true }, { pubkey: 'PLAYERata', signer: false }, { pubkey: 'POOLata', signer: false }],
      instructions: [...(jup ? [jupIx] : []), { program: 'spl-token', parsed: { type: 'burnChecked', info: { account: 'PLAYERata', authority: PLAYER, mint: MINT, tokenAmount: { amount: String(s.burn) } } } }] } } };
}
const gameSol = { ...expect, sol: { lamports: LAM, store: false } }, q90 = splitPayment(Math.floor(expect.quoteRaw * 0.9), 1000, FEE);
const g = verifyPayment(solGame(), gameSol);
assert.ok(g.ok && g.sol && g.arrived === q90.arrives && g.burned === q90.burn && g.paid === q90.burn + q90.arrives, 'a game run paid with SOL, 90% arrived: accepted, the pool gets what arrived ' + JSON.stringify(g));
assert.ok(verifyPayment(solGame({ got: SOL_FLOOR + 0.005 }), gameSol).ok, 'just over the floor: accepted');
for (const [name, tx, exp, why] of [
  ['under the 85% floor', solGame({ got: 0.8 }), gameSol, /under 85%/],
  ['no real swap (no Jupiter)', solGame({ jup: false }), gameSol, /Jupiter/],
  ['spent less SOL than the price', solGame({ lamports: LAM - 1 }), gameSol, /lamports of SOL, the price was/],
  ['not signed by the player', solGame({ signed: false }), gameSol, /not signed/],
  ['SOL on a quote with no SOL price (devnet)', solGame(), expect, /no SANTA left/],
]) { const r = verifyPayment(tx, exp); assert.ok(!r.ok && why.test(r.why), `should refuse: ${name} (${r.why})`); }

// The Store with SOL: exactly the burn share (50%) is swapped and ALL of it burned; the other 50% of the price goes to the treasury
// AS SOL (accountKeys / pre- and postBalances line up: that's how Solana reports SOL moving). The pass: no swap, just SOL.
const TREAS = 'TREASURYwa11et11111111111111111111111111111';
function storeSol({ burnBps = 5000, lamports = LAM, toTreasury = Math.floor(lamports * (10000 - burnBps) / 10000), got = 0.9, jup = burnBps > 0 } = {}) {
  const burn = Math.floor(expect.quoteRaw * burnBps / 10000 * got), have = 50_000_000_000;
  return { blockTime: Math.floor((NOW + 5000) / 1000),
    meta: { err: null, fee: FEE_TX, innerInstructions: [], preBalances: [3e9, 1, 10_000_000], postBalances: [3e9 - lamports - FEE_TX, 1, 10_000_000 + toTreasury],
      preTokenBalances: [bal(1, PLAYER, have)], postTokenBalances: [bal(1, PLAYER, have)] },
    transaction: { message: { accountKeys: [{ pubkey: PLAYER, signer: true, writable: true }, { pubkey: 'PLAYERata', signer: false }, { pubkey: TREAS, signer: false, writable: true }],
      instructions: [...(jup ? [jupIx] : []), ...(burn ? [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { account: 'PLAYERata', authority: PLAYER, mint: MINT, tokenAmount: { amount: String(burn) } } } }] : [])] } } };
}
const item = { ...expect, pool: TREAS, burnBps: 5000, sol: { lamports: LAM, store: true } };
const it = verifyPayment(storeSol(), item);
assert.ok(it.ok && it.sol && it.lamports === LAM / 2 && it.burned === Math.floor(expect.quoteRaw * 0.45) && it.paid === expect.quoteRaw, 'a Store item paid with SOL: half the price swapped and burned (90% of the SANTA), half to the treasury as SOL ' + JSON.stringify(it));
for (const [name, tx, why] of [['the treasury a lamport short', storeSol({ toTreasury: LAM / 2 - 1 }), /treasury received/], ['burned under the floor', storeSol({ got: 0.8 }), /burned/],
  ['no real swap', storeSol({ jup: false }), /Jupiter/]]) { const r = verifyPayment(tx, item); assert.ok(!r.ok && why.test(r.why), `should refuse: ${name} (${r.why})`); }
const pass = { ...expect, pool: TREAS, burnBps: 0, sol: { lamports: 16_472_303, store: true } };
{ const r = verifyPayment(storeSol({ burnBps: 0, lamports: 16_472_303 }), pass); assert.ok(r.ok, 'the pass paid with SOL: a plain transfer, no swap needed ' + r.why); }
assert.equal(verifyPayment(storeSol({ burnBps: 0, lamports: 16_000_000, toTreasury: 16_000_000 }), pass).ok, false, 'the pass, SOL short: refused');
console.log('OK: paid with SOL at the price: a game run (pool gets what arrived, ≥85%) and a Store item / the pass (half burned, half SOL to the treasury) accepted; under the floor, no Jupiter, short SOL, short treasury, unsigned, devnet quote: refused');
// S1b (security pass 2026-10-04): a "SOL payment" whose SANTA was moved into the player's account by a wallet that signed (their
// own second wallet), with a token Jupiter step to look like a swap, is refused; SANTA arriving from a swap vault (no signer) is fine.
{ const second = 'SECONDwa11et11111111111111111111111111111111';
  const fake = solGame(); fake.transaction.message.accountKeys.push({ pubkey: second, signer: true, writable: true });
  fake.meta.innerInstructions = [{ index: 0, instructions: [{ program: 'spl-token', parsed: { type: 'transferChecked', info: { source: 'SECONData', destination: 'PLAYERata', authority: second, mint: MINT, tokenAmount: { amount: '99' } } } }] }];
  const r = verifyPayment(fake, gameSol); assert.ok(!r.ok && /moved in from a wallet that signed/.test(r.why), 'SANTA from a second wallet that signed: refused (' + r.why + ')');
  const real = solGame(); real.meta.innerInstructions = [{ index: 0, instructions: [{ program: 'spl-token', parsed: { type: 'transferChecked', info: { source: 'VAULTata', destination: 'PLAYERata', authority: 'POOLauthorityPDA', mint: MINT, tokenAmount: { amount: '99' } } } }] }];
  assert.ok(verifyPayment(real, gameSol).ok, 'SANTA from the swap pool\'s vault (nobody signs for it): accepted'); }
console.log('OK: a SOL payment whose SANTA came from a wallet that signed (not a swap) is refused');
