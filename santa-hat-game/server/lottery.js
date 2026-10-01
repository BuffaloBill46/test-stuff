// SERVER: the Santa Lottery (Cody, 2026-10-01). Rules: mockups/lottery.js. Database: supabase/011_lottery.sql.
//   draws               → public: every lottery's open draw (pot, tickets, fingerprint) and recent results (re-checkable)
//   quote { kind, n }   → a 60-second SANTA price for n tickets in the open draw (sales close 5 min before the draw)
//   buy { quote, signature } → checks the finalized payment (10% burned, the rest to the lottery wallet), numbers the tickets
//   runDraws()          → draws every draw whose time has passed (called on each lottery request and by the scheduler)
// Fairness without an outside randomness service (Cody: no VRF): each draw's secret is made when the draw opens and only its
// fingerprint is published; at the draw the numbers come from that secret + a Solana blockhash from AFTER sales closed + the
// public ticket list; then the secret is revealed so anyone can re-run mockups/lottery.js drawWinners and get the same winners.
// Payouts: lottery_settings.payout_mode 'auto' → the payout worker sends them; 'manual' → they wait for Cody (admin screen).
import { LOTTERIES, nextDraw, salesFor, splitPot, drawWinners, BURN_BPS } from '../mockups/lottery.js';
import * as fair from '../mockups/fair.js';
import { MINT, QUOTE_SECONDS, CUSHION } from '../mockups/market.js';
import { verifyPayment } from './verify.js';

const DEC = 1e6, isSignature = (s) => /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(String(s));
export const LOTTERY_QUOTES_PER_HOUR = 30;

// chain: { getTransaction(sig), latestBlock() → { blockhash, slot } (finalized) }. wallet: the lottery wallet's PUBLIC address.
// schedule: the real one (midnight UTC etc.); tests pass { nextDraw, salesFor } with draws seconds apart, against the real database.
export function createLottery({ db, chain, livePrice, liveFee, wallet, mint = MINT, cluster = 'mainnet', now = () => Date.now(), f = fair, schedule = { nextDraw, salesFor } }) {
  const row = async (q, p) => (await db.query(q, p))[0];
  const walletOf = async (profile) => (await row('select wallet from public.profiles where id = $1', [profile]))?.wallet;

  // The open draw for this lottery at time t (made, with its sealed secret, the first time anyone needs it).
  async function drawFor(kind, t) {
    const at = schedule.nextDraw(kind, t); if (at === null) return null;
    const iso = new Date(at).toISOString();
    let d = await row('select * from public.lottery_draws where kind = $1 and draws_at = $2', [kind, iso]);
    if (!d) {
      const secret = f.newSeed(), commit = await f.fingerprint(secret);
      await db.query('insert into public.lottery_draws (kind, draws_at, commit, secret) values ($1, $2, $3, $4) on conflict (kind, draws_at) do nothing', [kind, iso, commit, secret]);
      d = await row('select * from public.lottery_draws where kind = $1 and draws_at = $2', [kind, iso]);
    }
    return d;
  }

  async function quote(profile, kind, n) {
    const L = LOTTERIES[kind]; if (!L) return { error: 'unknown lottery' };
    if (!Number.isInteger(n) || n < 1 || n > 10000) return { error: 'buy between 1 and 10,000 tickets at a time' };
    if (!wallet) return { error: 'the lottery is not open yet' };
    const payer = await walletOf(profile);
    if (!payer) return { error: 'buying tickets needs a linked wallet (prizes are sent to it)' };
    const recent = (await row(`select count(*)::int as n from public.lottery_quotes where profile_id = $1 and created_at > now() - interval '1 hour'`, [profile])).n;
    if (recent >= LOTTERY_QUOTES_PER_HOUR) return { error: 'too many price quotes; try again in a little while' };
    const t = now(), s = schedule.salesFor(kind, t);
    if (!s.open) return { closed: true, why: s.why };
    await runDraws();
    const d = await drawFor(kind, t), price = await livePrice();
    const usd = Math.round(L.ticket * n * 100) / 100, santaRaw = Math.round((usd / price.usd) * DEC);
    const q = await row(`insert into public.lottery_quotes (profile_id, draw_id, n, usd, santa_raw, price_usd) values ($1, $2, $3, $4, $5, $6) returning id, created_at`,
      [profile, d.id, n, usd, santaRaw, price.usd]);
    const fee = await liveFee();
    return { id: q.id, lottery: kind, n, usd, santaRaw, price: price.usd, expiresAt: new Date(q.created_at).getTime() + QUOTE_SECONDS * 1000,
      drawsAt: new Date(d.draws_at).getTime(), commit: d.commit,
      mint, pool: wallet, fee: { bps: fee.bps, max: fee.max }, burnBps: BURN_BPS, payer, cluster }; // the page pays exactly like a game run (pay.js)
  }

  async function buy(profile, quoteId, signature) {
    if (!/^[0-9a-f-]{36}$/.test(String(quoteId))) return { error: 'unknown quote' };
    if (!isSignature(signature)) return { error: 'that isn\'t a Solana transaction signature' };
    const q = await row('select q.*, d.kind from public.lottery_quotes q join public.lottery_draws d on d.id = q.draw_id where q.id = $1 and q.profile_id = $2', [quoteId, profile]);
    if (!q) return { error: 'unknown quote' };
    if (q.used_by) return { error: 'quote already used' };
    const [tx, fee, payer] = await Promise.all([chain.getTransaction(signature), liveFee(), walletOf(profile)]);
    const v = verifyPayment(tx, { mint, player: payer, pool: wallet, quoteRaw: +q.santa_raw, quoteAt: new Date(q.created_at).getTime(),
      quoteSeconds: QUOTE_SECONDS, cushion: CUSHION, burnBps: BURN_BPS, fee });
    if (!v.ok) return { error: v.why };
    await runDraws();
    const next = await drawFor(q.kind, now()); // where late tickets go if this quote's draw already ran (none for Christmas)
    let drawId;
    try { drawId = (await row('select public.buy_lottery($1, $2, $3, $4, $5, $6, $7) as d', [q.id, signature, payer, v.paid, v.burned, v.arrived, next && next.id !== +q.draw_id ? next.id : null])).d; }
    catch (e) { return { error: /duplicate key|already used/.test(e.message) ? 'payment already used' : e.message }; }
    if (drawId === null) return { ok: true, refunded: true, note: 'That draw had already run, so your payment will be refunded in full.' };
    const b = await row('select first_no, n, moved_from from public.lottery_buys where signature = $1', [signature]);
    const d = await row('select draws_at from public.lottery_draws where id = $1', [drawId]);
    return { ok: true, lottery: q.kind, tickets: { first: b.first_no, last: b.first_no + b.n - 1 }, drawsAt: new Date(d.draws_at).getTime(), moved: !!b.moved_from };
  }

  // Every draw whose time has passed: the ticket list (in sale order), a finalized blockhash from after sales closed, the fair
  // winners, the exact pot split. Safe to call any number of times: a draw is finished once (the database refuses twice).
  async function runDraws() {
    const due = await db.query(`select * from public.lottery_draws where status = 'open' and draws_at <= $1 order by draws_at`, [new Date(now()).toISOString()]);
    const done = [];
    for (const d of due) {
      const buys = await db.query('select first_no, n, profile_id, wallet from public.lottery_buys where draw_id = $1 order by first_no', [d.id]);
      const tickets = buys.flatMap((b) => Array.from({ length: b.n }, (_, i) => ({ id: b.first_no + i, wallet: b.wallet, profile: b.profile_id })));
      const block = await chain.latestBlock();
      const L = LOTTERIES[d.kind], winners = await drawWinners({ secret: d.secret, blockhash: block.blockhash, tickets, drawId: +d.id, places: L.split.length });
      const shares = splitPot(+d.pot_raw, L.split, winners.length);
      const list = winners.map((w, i) => ({ place: w.place, profile: w.ticket.profile, wallet: w.ticket.wallet, amount_raw: String(shares[i]) })).filter((w) => w.amount_raw !== '0');
      try { await db.query('select public.finish_lottery_draw($1, $2, $3, $4)', [d.id, block.blockhash, block.slot, JSON.stringify(list)]); done.push(+d.id); }
      catch (e) { if (!/already drawn/.test(e.message)) throw e; } // another request drew it first: fine
    }
    return done;
  }

  async function draws() {
    await runDraws();
    const t = now(), open = [];
    for (const kind of Object.keys(LOTTERIES)) { const d = await drawFor(kind, t); if (d) open.push({ lottery: kind, name: LOTTERIES[kind].name, ticket: LOTTERIES[kind].ticket,
      split: LOTTERIES[kind].split, drawsAt: new Date(d.draws_at).getTime(), pot_raw: +d.pot_raw, tickets: d.tickets, commit: d.commit, sales: schedule.salesFor(kind, t) }); }
    const recent = await db.query(`select id, kind, draws_at, secret, commit, blockhash, block_slot, pot_raw, tickets from public.lottery_draws where status = 'drawn' order by draws_at desc limit 10`);
    const wins = await db.query(`select p.draw_id, p.place, pr.name, p.amount_raw from public.lottery_payouts p join public.profiles pr on pr.id = p.profile_id where p.place > 0 and p.draw_id = any($1::bigint[]) order by p.place`, [recent.map((r) => r.id)]);
    return { open, recent: recent.map((r) => ({ ...r, id: +r.id, pot_raw: +r.pot_raw, winners: wins.filter((w) => +w.draw_id === +r.id).map((w) => ({ place: w.place, name: w.name, amount_raw: +w.amount_raw })) })) };
  }

  return { quote, buy, runDraws, draws, drawFor };
}
