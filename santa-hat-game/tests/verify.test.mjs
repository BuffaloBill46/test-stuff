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

// PAID WITH SOL (Cody 2026-10-04; mockups/pay.js): the same transaction swaps SOL for SANTA into the player's wallet first, so their
// SANTA goes UP (the leftover), then burns and pays as usual. The quote is then the amount; the pool and the burn must cover it.
function solPayment({ bought = expect.quoteRaw + 50_000_000, burnFactor = 1, arriveShort = 0, signed = true, player = PLAYER } = {}) {
  const tx = payment({ burnFactor, arriveShort, signed, player }), s = splitPayment(expect.quoteRaw, 1000, FEE), spent = Math.floor(s.burn * burnFactor) + (expect.quoteRaw - s.burn);
  tx.meta.postTokenBalances[0] = bal(1, player, 50_000_000_000 + bought - spent);
  tx.meta.innerInstructions = [{ index: 1, instructions: [{ program: 'spl-token', parsed: { type: 'transferChecked', info: { destination: 'PLAYERata', mint: MINT, tokenAmount: { amount: String(bought) } } } }] }];
  return tx;
}
const sol = verifyPayment(solPayment(), expect);
assert.ok(sol.ok && sol.sol && sol.paid === expect.quoteRaw, 'a game run paid with SOL: accepted, counted as the quote ' + JSON.stringify(sol));
for (const [name, tx] of Object.entries({ 'SOL: the pool got less than the quote': solPayment({ arriveShort: 1 }), 'SOL: skipped the burn': solPayment({ burnFactor: 0 }),
  'SOL: not signed by the player': solPayment({ signed: false }) })) assert.equal(verifyPayment(tx, expect).ok, false, `should refuse: ${name}`);

// The Store with SOL: only the burn half is swapped and burned; the treasury gets `lamports` of SOL (accountKeys / pre- and
// postBalances line up: that's how Solana reports SOL moving). The pass: no swap, no burn, just SOL.
const TREAS = 'TREASURYwa11et11111111111111111111111111111', LAMPORTS = 4_241_618;
function storeSol({ burnBps = 5000, lamports = LAMPORTS, burnFactor = 1, bought = 0, quoteRaw = expect.quoteRaw } = {}) {
  const s = splitPayment(quoteRaw, burnBps, FEE), burn = Math.floor(s.burn * burnFactor), have = 50_000_000_000;
  return { blockTime: Math.floor((NOW + 5000) / 1000),
    meta: { err: null, innerInstructions: [], preBalances: [3_000_000_000, 1, 10_000_000], postBalances: [3_000_000_000 - lamports - 5000, 1, 10_000_000 + lamports],
      preTokenBalances: [bal(1, PLAYER, have)], postTokenBalances: [bal(1, PLAYER, have + bought - burn)] },
    transaction: { message: { accountKeys: [{ pubkey: PLAYER, signer: true, writable: true }, { pubkey: 'PLAYERata', signer: false }, { pubkey: TREAS, signer: false, writable: true }],
      instructions: burn ? [{ program: 'spl-token', parsed: { type: 'burnChecked', info: { account: 'PLAYERata', authority: PLAYER, mint: MINT, tokenAmount: { amount: String(burn) } } } }] : [] } } };
}
const item = { ...expect, pool: TREAS, burnBps: 5000, lamports: LAMPORTS }, half = splitPayment(expect.quoteRaw, 5000, FEE).burn;
const itemOk = verifyPayment(storeSol({ bought: half + 9_000_000 }), item);
assert.ok(itemOk.ok && itemOk.sol && itemOk.lamports === LAMPORTS && itemOk.burned === half, 'a Store item paid with SOL: burn half bought + burned, SOL to the treasury ' + JSON.stringify(itemOk));
assert.match(verifyPayment(storeSol({ bought: half + 9_000_000, lamports: LAMPORTS - 1 }), item).why, /treasury received/, 'one lamport short: refused');
assert.match(verifyPayment(storeSol({ bought: half + 9_000_000, burnFactor: 0.5 }), item).why, /burned/, 'burned too little: refused');
const pass = { ...expect, pool: TREAS, burnBps: 0, lamports: 16_472_303 };
assert.ok(verifyPayment(storeSol({ burnBps: 0, lamports: 16_472_303 }), pass).ok, 'the pass paid with SOL: a plain transfer');
assert.equal(verifyPayment(storeSol({ burnBps: 0, lamports: 16_000_000 }), pass).ok, false, 'the pass, SOL short: refused');
assert.equal(verifyPayment(storeSol({ burnBps: 0, lamports: 16_472_303 }), { ...pass, lamports: undefined }).ok, false, 'SOL to a quote that offered no SOL price (games, lottery): refused');
console.log('OK: paid with SOL: a game run (swap, burn, pool) and a Store item / the pass (burn half, SOL to the treasury) accepted; short SOL, short pool, short or skipped burn, unsigned: refused');
