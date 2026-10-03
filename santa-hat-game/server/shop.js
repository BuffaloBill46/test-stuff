// SERVER: the shop (Cody, 2026-10-02): Store items (special snowballs, special gear, looks), buying a level, extra ranked tickets.
// Same steps as a game run or a lottery ticket, so a payment is never taken for something that can't be granted:
//   quote  → the price in SANTA at the live price, held 60 seconds, refused up front if it can't be bought (owned, level 5+,
//            not for sale, the daily ticket limit);
//   (the page's wallet pays ONE transaction: 50% burned, the rest to the treasury; mockups/pay.js);
//   buy    → the payment is checked on chain (verify.js: from this player's wallet, the right amount within the quote's window,
//            the burn, what reached the treasury), then the database grants it once (016 shop_buy: a quote and a payment each
//            buy once; levels via buy_level, tickets via buy_tickets).
import { itemsWith, DEFAULT_SETTINGS } from '../mockups/settings.js';
import { buyPrice } from '../mockups/levels.js';
import { BOUGHT_MAX } from '../mockups/ranked.js';
import { SHOP_BURN_BPS, TICKET_PACKS, forSale } from '../mockups/shoprules.js';
import { MINT, QUOTE_SECONDS, CUSHION } from '../mockups/market.js';
import { verifyPayment } from './verify.js';

const DEC = 1e6, QUOTES_PER_HOUR = 60, isSignature = (s) => /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(String(s));

// treasury: the treasury wallet's address (null = the shop isn't open: nothing can be paid in).
// rankedPaused() → true while Cody has ranked paused (the Droplet's /etc/santa/ranked-paused, like the match server): tickets
// can't be used then, so they aren't sold (launch 2026-10-03). Sales come back by themselves when ranked reopens.
export function createShop({ db, chain, livePrice, liveFee, treasury, mint = MINT, cluster = 'mainnet', rankedPaused = () => false }) {
  const row = async (q, p) => (await db.query(q, p))[0];
  // the items as published from Cody's admin screen (the newest settings), so the Store and the charge always agree
  async function items() {
    const s = (await row('select settings from public.game_settings order by version desc limit 1').catch(() => null))?.settings || DEFAULT_SETTINGS;
    return itemsWith(s);
  }
  async function quote(profile, what = {}) {
    if (!treasury) return { error: 'payments are not open yet' };
    const p = await row('select id, wallet, level from public.profiles where id = $1', [profile]);
    if (!p?.wallet) return { error: 'buying needs a linked wallet' };
    const recent = (await row(`select count(*)::int as n from public.shop_quotes where profile_id = $1 and created_at > now() - interval '1 hour'`, [profile])).n;
    if (recent >= QUOTES_PER_HOUR) return { error: 'too many price quotes; try again in a little while' };
    let usd, cols;
    if (what.kind === 'item') {
      const it = (await items()).find((x) => x.id === what.id);
      if (!forSale(it)) return { error: 'that item isn\'t for sale' };
      const owned = await row('select 1 from public.inventory where profile_id = $1 and item_id = $2', [profile, it.id]);
      const worn = owned && (await row('select public.gear_worn_out($1, $2) as w', [profile, it.id])).w;
      if (owned && !worn) return { error: 'you already own that' };
      usd = it.price; cols = { item_id: it.id };
    } else if (what.kind === 'level') {
      const price = buyPrice(p.level);
      if (price === null) return { error: 'levels above 5 are earned in Auto match games, not bought' };
      usd = price; cols = { to_level: p.level + 1 };
    } else if (what.kind === 'tickets') {
      const n = Number(what.n);
      if (rankedPaused()) return { error: 'Ranked is paused right now, so tickets are not on sale. They will be again when it reopens.' };
      if (!TICKET_PACKS[n]) return { error: 'buy 1, 5 or 10 tickets' };
      const used = (await row(`select coalesce(sum(n), 0)::int as n from public.ticket_purchases where profile_id = $1 and at >= public.game_day_start(now())`, [profile]).catch(() => ({ n: 0 }))).n;
      if (used + n > 10) return { error: `at most 10 extra tickets a day, resetting at 9 PM Indiana time (${10 - used} left)` };
      // at most BOUGHT_MAX bought tickets held (Cody 2026-10-02; supabase/022 at granting). Refused here, BEFORE paying.
      const have = await row('select extra from public.ticket_status($1)', [profile]).catch(() => null), room = BOUGHT_MAX - (have?.extra ?? 0);
      if (have && n > room) return { error: `you can hold at most ${BOUGHT_MAX} bought ranked tickets; room for ${Math.max(0, room)} more` };
      usd = TICKET_PACKS[n]; cols = { n };
    } else return { error: 'buy what?' };
    const price = await livePrice(), santaRaw = Math.round((usd / price.usd) * DEC);
    const q = await row(`insert into public.shop_quotes (profile_id, kind, item_id, to_level, n, usd, santa_raw, price_usd) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, created_at`,
      [profile, what.kind, cols.item_id ?? null, cols.to_level ?? null, cols.n ?? null, usd, santaRaw, price.usd]);
    const fee = await liveFee();
    // the page pays exactly like a game run (mockups/pay.js): the burn and the treasury transfer in one transaction
    return { id: q.id, kind: what.kind, ...cols, usd, santaRaw, price: price.usd, expiresAt: new Date(q.created_at).getTime() + QUOTE_SECONDS * 1000,
      mint, pool: treasury, fee: { bps: fee.bps, max: fee.max }, burnBps: SHOP_BURN_BPS, payer: p.wallet, cluster };
  }
  async function buy(profile, quoteId, signature) {
    if (!/^[0-9a-f-]{36}$/.test(String(quoteId))) return { error: 'unknown quote' };
    if (!isSignature(signature)) return { error: 'that isn\'t a Solana transaction signature' };
    const q = await row('select * from public.shop_quotes where id = $1 and profile_id = $2', [quoteId, profile]);
    if (!q) return { error: 'unknown quote' };
    if (q.used_by) return { error: q.used_by === signature ? 'payment already used' : 'quote already used' };
    const [tx, fee, payer] = await Promise.all([chain.getTransaction(signature), liveFee(), row('select wallet from public.profiles where id = $1', [profile]).then((r) => r?.wallet)]);
    const v = verifyPayment(tx, { mint, player: payer, pool: treasury, quoteRaw: +q.santa_raw, quoteAt: new Date(q.created_at).getTime(),
      quoteSeconds: QUOTE_SECONDS, cushion: CUSHION, burnBps: SHOP_BURN_BPS, fee });
    if (!v.ok) return { error: v.why, retry: /not found|not finalized/.test(v.why) };
    try { const g = (await row('select public.shop_buy($1, $2, $3, $4) as g', [q.id, signature, v.paid, payer])).g;
      return g.refunded ? { ok: true, refunded: true, note: `Paid, but it couldn't be granted (${g.why}), so the full amount is owed back to your wallet.` } : { ok: true, ...g }; }
    catch (e) { return { error: /duplicate key|already used/.test(e.message) ? 'payment already used' : e.message.replace(/^.*?ERROR:\s*/, '') }; }
  }
  // What this player owns (the Store marks it; the Avatar screen unlocks it)
  async function owned(profile) { return { items: (await db.query('select item_id from public.inventory where profile_id = $1', [profile])).map((r) => r.item_id) }; }
  // My ranked tickets (supabase/006 ticket_status): free left today, bought extras, held right now, when the free ones refill.
  async function tickets(profile) {
    const r = (await db.query('select * from public.ticket_status($1)', [profile]))[0];
    return r ? { free: +r.free_left, extra: +r.extra, held: +r.held, resetsAt: new Date(r.resets_at).getTime() } : { error: 'no profile yet' };
  }
  return { quote, buy, owned, tickets };
}
