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
