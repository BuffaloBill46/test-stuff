// SERVER: the game server's steps for Spin and Slots with play credits. NOT DEPLOYED. The same game rules as the demo
// (mockups/*.js), the payment checker (verify.js) and the database functions in supabase/005_credits_plays.sql.
//   quote  → lock a SANTA price for 60 s                 open   → pool check, spend a credit, THEN make + lock the secret
//   buy    → check the finalized payment, add credits     settle → player's number in, draw, pay, reveal the secret
// `db` = { query(sql, params) → rows, tx(fn) } on a direct Postgres connection (a transaction holds the pool row lock).
// `chain.getTransaction(sig)` = Solana getTransaction (jsonParsed, finalized). Keys and secrets never leave the server.
import { KINDS, costOf } from '../mockups/credits.js';
import { spin, canSpin } from '../mockups/spin.js';
import { pull, canPull, FEE } from '../mockups/slots.js';
import * as fair from '../mockups/fair.js';
import { NUMS } from '../mockups/house.js';
import { MINT, QUOTE_SECONDS, CUSHION } from '../mockups/market.js';
import { verifyPayment } from './verify.js';

export const PAYOUT_CAP = 205;
export const QUOTES_PER_HOUR = 30; // per player (a quote is free to ask for; this stops database spam)
// Audit fixes (2026-09-30): only real game names (not "toString" etc. that every JS object has), well-formed ids only.
const isKind = (k) => typeof k === 'string' && Object.hasOwn(KINDS, k);
const isTicket = (t) => /^[0-9]{1,18}$/.test(String(t));
const isSignature = (s) => /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(String(s)); // a single payout above this (the biggest normal pull) is held for Cody, unless it's the pool jackpot
const DEC = 1e6;

// mint: which token is SANTA here (defaults to real SANTA; set to the test token on devnet, e.g. the SANTA_MINT secret).
export function createGameServer({ db, chain, livePrice, liveFee, poolWallets, f = fair, mint = MINT }) {
  const row = async (q, p) => (await db.query(q, p))[0];
  const walletOf = async (profile) => (await row('select wallet from public.profiles where id = $1', [profile]))?.wallet;
  // Pools hold SANTA (Cody): the game rules work in dollars, so a pool is valued at the live price for each decision.
  const poolState = (r, price) => ({ pool: (+r.santa_raw / DEC) * price, treasury: 0, rules: r.rules, prepaid: true });
  const toRaw = (usd, price) => Math.round((usd / price) * DEC);

  async function quote(profile, kind, n) {
    if (!isKind(kind) || !Number.isInteger(n) || n < 1 || n > 10) return { error: 'buy 1 to 10' };
    const recent = (await row(`select count(*)::int as n from public.quotes where profile_id = $1 and created_at > now() - interval '1 hour'`, [profile])).n;
    if (recent >= QUOTES_PER_HOUR) return { error: 'too many price quotes; try again in a little while' };
    const price = await livePrice(), usd = costOf(kind, n), santaRaw = Math.round((usd / price.usd) * DEC);
    const q = await row(`insert into public.quotes (profile_id, kind, n, usd, santa_raw, price_usd) values ($1, $2, $3, $4, $5, $6) returning id, created_at`,
      [profile, kind, n, usd, santaRaw, price.usd]);
    // where to pay: the page builds the one transaction from this (mockups/pay.js); the live tax so its fee matches the token
    const fee = await liveFee();
    return { id: q.id, kind, n, usd, santaRaw, price: price.usd, expiresAt: new Date(q.created_at).getTime() + QUOTE_SECONDS * 1000,
      mint, pool: poolWallets?.[KINDS[kind].game] || null, fee: { bps: fee.bps, max: fee.max }, burnBps: 1000 };
  }

  async function buy(profile, quoteId, signature) {
    if (!/^[0-9a-f-]{36}$/.test(String(quoteId))) return { error: 'unknown quote' };
    if (!isSignature(signature)) return { error: 'that isn\'t a Solana transaction signature' };
    const q = await row('select * from public.quotes where id = $1 and profile_id = $2', [quoteId, profile]);
    if (!q) return { error: 'unknown quote' };
    if (!poolWallets?.[KINDS[q.kind].game]) return { error: 'payments are not open yet' }; // no pool wallet set: nobody can pay in
    if (q.used_by) return { error: 'quote already used' };
    const [tx, fee, wallet] = await Promise.all([chain.getTransaction(signature), liveFee(), walletOf(profile)]);
    if (!wallet) return { error: 'buying needs a linked wallet' };
    const v = verifyPayment(tx, { mint, player: wallet, pool: poolWallets[KINDS[q.kind].game], quoteRaw: +q.santa_raw,
      quoteAt: new Date(q.created_at).getTime(), quoteSeconds: QUOTE_SECONDS, cushion: CUSHION, burnBps: 1000, fee });
    if (!v.ok) return { error: v.why };
    try {
      const r = await row('select public.buy_credits($1, $2, $3, $4, $5) as left_n', [q.id, signature, v.paid, v.burned, v.arrived]);
      return { ok: true, kind: q.kind, left: r.left_n };
    } catch (e) { return { error: /duplicate key|already used/.test(e.message) ? 'payment already used' : e.message }; }
  }

  // Stuck plays (the page closed mid-play, or the server hiccupped): run before each new play, for that player only.
  // 'spent' for a minute with no secret → the credit is refunded. 'open' for a minute (secret locked, the player's number
  // never came) → finished with a server-made number and paid as normal. No paid play is ever lost.
  async function tidy(profile, stuckSeconds = 60) {
    const stuck = await db.query(`select id, state from public.plays where profile_id = $1 and state in ('spent', 'open')
      and coalesce(opened_at, spent_at) < now() - make_interval(secs => $2)`, [profile, stuckSeconds]);
    const done = [];
    for (const p of stuck) {
      if (p.state === 'spent') { await db.query('select public.refund_play($1)', [p.id]); done.push({ id: p.id, refunded: true }); }
      else done.push({ id: p.id, ...(await settle(profile, String(p.id), f.newSeed(16))) });
    }
    return done;
  }

  async function open(profile, kind) {
    if (!isKind(kind)) return { error: 'unknown game' };
    const K = KINDS[kind];
    if (!(await walletOf(profile))) return { error: 'playing for SANTA needs a linked wallet (winnings are paid to it)' };
    await tidy(profile);
    const p = await row('select * from public.pools where game = $1', [K.game]);
    let price; try { price = (await livePrice()).usd; } catch (e) { return { failed: true, why: 'no live SANTA price right now' }; }
    const can = K.game === 'spin' ? canSpin(poolState(p, price), K.bet) : canPull(poolState(p, price), kind);
    if (!can.ok) return { refused: true, stopped: !!can.stopped };                       // 1. pool check: credit untouched
    const playId = (await row('select public.spend_credit($1, $2) as id', [profile, kind])).id; // 2. spend one credit
    if (!playId) return { noCredit: true };
    if (+playId === -1) return { busy: true }; // one play at a time per player
    try {                                                                                 // 3. only now: the secret
      const secret = f.newSeed(), commit = await f.fingerprint(secret);
      await db.query('select public.lock_play($1, $2, $3)', [playId, commit, secret]);
      return { ticket: String(playId), commit };
    } catch (e) { await db.query('select public.refund_play($1)', [playId]); return { failed: true, why: e.message }; }
  }

  async function settle(profile, ticket, playerSeed) {
    if (!/^[0-9a-f]{8,64}$/.test(playerSeed || '')) return { error: 'bad player number' };
    if (!isTicket(ticket)) return { error: 'no open play with that ticket' };
    const wallet = await walletOf(profile);
    let price = null; try { price = (await livePrice()).usd; } catch {}
    return db.tx(async (t) => {
      const one = async (q, p) => (await t.query(q, p))[0];
      const pl = await one(`select * from public.plays where id = $1 and profile_id = $2 and state = 'open' for update`, [ticket, profile]);
      if (!pl) return { error: 'no open play with that ticket' };
      const K = KINDS[pl.kind];
      const p = await one('select * from public.pools where game = $1 for update', [K.game]);    // lock the pool: plays settle one at a time
      let r, state;
      try {
        if (!price) throw new Error('no live SANTA price right now');
        state = poolState(p, price);
        const rand = fair.randFrom(await f.numbers(pl.secret, playerSeed, +pl.play_no, NUMS));  // 4. the player's number goes in
        r = K.game === 'spin' ? spin(state, K.bet, rand) : pull(state, pl.kind, rand);
      } catch (e) { await t.query('select public.refund_play($1)', [pl.id]); return { failed: true, why: e.message }; }
      if (r.paused) { await t.query('select public.refund_play($1)', [pl.id]); return { refused: true, stopped: !!r.stopped }; }
      const cap = r.jackpot ? r.pay : PAYOUT_CAP; // jackpots are expected to be big; still logged and paid through the queue
      // Every movement in exact SANTA at this play's price; the pool changes by exactly these amounts.
      const skimRaw = toRaw(r.skim || 0, price), topRaw = toRaw(r.topOff || 0, price);
      const payRaw = Math.min(toRaw(r.pay, price), +p.santa_raw + topRaw - skimRaw); // never more than the pool holds
      const poolDelta = topRaw - skimRaw - payRaw, treasuryDelta = Math.round(skimRaw * (1 - FEE)) - Math.round(topRaw / (1 - FEE));
      const result = K.game === 'spin' ? { slice: r.slice, mult: r.mult } : { stops: r.stops, jackpot: r.jackpot, wins: r.wins.length, hats: r.hats };
      await t.query('select public.settle_play($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',  // skims/top-offs queued as real transfers
        [pl.id, playerSeed, JSON.stringify(result), Math.round(r.pay * 100) / 100, payRaw, price, poolDelta, treasuryDelta, wallet, cap, skimRaw, topRaw]);
      return { r, payRaw, poolDelta, price, poolUsd: state.pool, proof: { kind: pl.kind, commit: pl.commit, secret: pl.secret, playerSeed, playNo: +pl.play_no } };  // 5. revealed
    });
  }
  // Recent winners for everyone: settled plays that paid more than they cost (display names only, never wallets).
  let winnersCache = { at: 0, list: null };
  async function winners(limit = 30) {
    if (winnersCache.list && Date.now() - winnersCache.at < 10_000) return winnersCache.list; // public: cached 10 s
    const rows = await db.query(`select pr.name, pl.kind, pl.pay, pl.settled_at, pl.result from public.plays pl join public.profiles pr on pr.id = pl.profile_id
      where pl.state = 'settled' and pl.pay > case pl.kind when 'spin10' then 0.10 else 1 end order by pl.settled_at desc, pl.id desc limit $1`, [limit]);
    const list = rows.map((w) => { const bet = KINDS[w.kind].bet, pay = +w.pay;
      return { game: w.kind === 'big' ? 'slots' : w.kind, name: w.name, amount: pay, gainPct: ((pay - bet) / bet) * 100, at: new Date(w.settled_at).getTime(),
        note: w.result?.jackpot ? 'pool jackpot' : w.result?.mult ? `${w.result.mult}×` : '', big: pay >= 10 * bet }; });
    winnersCache = { at: Date.now(), list }; return list;
  }
  return { quote, buy, open, settle, tidy, winners };
}
