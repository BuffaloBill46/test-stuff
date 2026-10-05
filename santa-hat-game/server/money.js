// SERVER: the money dashboard (Cody, 2026-10-04 to-do #8: "add a money dashboard to the admin tab under its own button"). One
// read-only summary for the admin screen (admin-wallet-signed: server/admin.js 'money-summary'), for today (since the 9 PM
// reset), the last 7 days and all time:
//   Arcade   runs bought, SANTA paid, burned, reached the Game pool, winnings SENT, and the real payback (sent ÷ paid) to set
//            beside the ~78% design
//   Store    purchases (items, levels, tickets, passes), SANTA value paid, dollars, refunds owed
//   Lottery  ticket purchases, SANTA paid, prizes SENT
// and right now: the Game pool's books, the treasury's net, the SANTA price. Amounts in SANTA's smallest unit (the page shows
// SANTA and ≈ dollars at the live price). Paid with SOL: counted at the SANTA value recorded for it.
import { dayStart } from '../mockups/gameclock.js';

export function createMoney({ db, livePrice = null, now = () => Date.now() }) {
  const one = async (q, p) => (await db.query(q, p).catch(() => [{}]))[0] || {};
  async function period(since) {
    const t = new Date(since).toISOString();
    const arcade = await one(`select count(*)::int as runs, coalesce(sum(paid_raw), 0)::text as paid, coalesce(sum(burned_raw), 0)::text as burned,
      coalesce(sum(arrived_raw), 0)::text as arrived from public.payments where confirmed_at >= $1`, [t]);
    const out = await one(`select coalesce(sum(amount_raw), 0)::text as sent, count(*)::int as n from public.payouts where status = 'sent' and created_at >= $1`, [t]);
    const store = await one(`select count(*)::int as n, coalesce(sum(santa_raw), 0)::text as paid, coalesce(sum(usd), 0)::text as usd,
      count(*) filter (where kind = 'item')::int as items, count(*) filter (where kind = 'level')::int as levels,
      count(*) filter (where kind = 'tickets')::int as tickets, count(*) filter (where kind = 'pass')::int as passes
      from public.shop_quotes where used_by is not null and created_at >= $1`, [t]);
    const lot = await one(`select count(*)::int as n, coalesce(sum(paid_raw), 0)::text as paid from public.lottery_buys where at >= $1`, [t]);
    const prizes = await one(`select coalesce(sum(amount_raw), 0)::text as sent from public.lottery_payouts where status = 'sent' and created_at >= $1`, [t]);
    const paid = +arcade.paid || 0, sent = +out.sent || 0;
    return { arcade: { runs: arcade.runs || 0, paid, burned: +arcade.burned || 0, arrived: +arcade.arrived || 0, sent, payouts: out.n || 0, payback: paid ? sent / paid : null },
      store: { n: store.n || 0, paid: +store.paid || 0, usd: +store.usd || 0, items: store.items || 0, levels: store.levels || 0, tickets: store.tickets || 0, passes: store.passes || 0 },
      lottery: { n: lot.n || 0, paid: +lot.paid || 0, prizes: +prizes.sent || 0 } };
  }
  async function summary() {
    const t = now(), [today, week, all] = await Promise.all([period(dayStart(t)), period(t - 7 * 864e5), period(0)]);
    const pool = await one(`select santa_raw::text as books, treasury_net_raw::text as treasury from public.pools where game = 'spin'`);
    const owed = await one(`select count(*)::int as n, coalesce(sum(amount_raw), 0)::text as raw from public.shop_refunds where status = 'owed'`);
    const price = livePrice ? await livePrice().then((p) => p.usd, () => null) : null;
    return { ok: true, at: t, price, today, week, all, now: { poolRaw: +pool.books || 0, treasuryNetRaw: +pool.treasury || 0, refundsOwed: owed.n || 0, refundsOwedRaw: +owed.raw || 0 } };
  }
  return { summary };
}
