// SERVER: alerts to Cody's Telegram (decided 2026-10-01: his Telegram, not Sentry; set up 2026-10-02). The game server runs
// run() every 5 minutes (a timer on the Droplet calls the public 'alerts' action; supabase/021). Each finding is sent once,
// then again every REPEAT_HOURS while it lasts. Without TELEGRAM_BOT_TOKEN (a Supabase secret only Cody pastes) it's off.
// Findings (FOR_MAIN_CLAUDE "Cody's calls on servers"): a payout frozen by the safety cap, a send failed 5 times, winnings
// waiting over 10 minutes (the payout worker stopped?), a top-off waiting for Cody's deposit, an emergency stop, the match
// server not answering, books ≠ wallet (server/reconcile.js), a STRONG bot signal (server/bots.js).
import { reconcile } from './reconcile.js';
import { botSignals, BOT_RULES } from './bots.js';

export const REPEAT_HOURS = 6, STUCK_MINUTES = 10;
const RAW = 1e6, santa = (raw) => (Number(raw) / RAW).toLocaleString('en-US', { maximumFractionDigits: 0 });
// The pools' names for Cody: 'spin' is the shared Game pool every game plays from (Cody, 2026-10-02); 'slots' the old Slots pool
const POOL = (g) => (g === 'spin' ? 'Game' : g === 'slots' ? 'old Slots' : g);

// telegram: { send(text) }; walletRaw(game) → the pool wallet's SANTA (raw) on the chain; refereeHealth() → throws if down.
export function createAlerts({ db, telegram, walletRaw, refereeHealth, games = ['spin', 'slots'], now = () => Date.now() }) {
  async function findings() {
    const out = [], add = (key, text) => out.push({ key, text });
    for (const p of await db.query(`select id, amount_usd from public.payouts where status = 'held' order by id`)) add(`held:${p.id}`, `A payout was FROZEN by the safety cap: payout #${p.id}, $${(+p.amount_usd).toFixed(2)}. Look at it in the admin screen (Release if it's real).`);
    for (const t of ['payouts', 'pool_transfers', 'lottery_payouts']) {
      for (const p of await db.query(`select id from public.${t} where status = 'failed' order by id`)) add(`failed:${t}:${p.id}`, `A send FAILED 5 times: ${t} #${p.id}. It needs a look (wallet empty? network down?).`);
      const [s] = await db.query(`select count(*)::int as n from public.${t} where status in ('queued', 'sending') and created_at < now() - make_interval(mins => $1)`, [STUCK_MINUTES]);
      if (s.n) add(`stuck:${t}`, `${s.n} ${t.replace('_', ' ')} waiting over ${STUCK_MINUTES} minutes: is the payout worker running on the Droplet?`);
    }
    for (const t of await db.query(`select id, game, amount_raw from public.pool_transfers where kind = 'top-off' and status = 'needs_approval' order by id`)) add(`topoff:${t.id}`, `The ${POOL(t.game)} pool needs a TOP-OFF of ${santa(t.amount_raw)} SANTA from the treasury. Send it, then record the deposit in the admin screen.`);
    for (const p of await db.query(`select game from public.pools where (rules->>'paused')::boolean is true`)) add(`paused:${p.game}`, `EMERGENCY STOP is on for the ${POOL(p.game)} pool (plays refused). Resume it in the admin screen when ready.`);
    if (refereeHealth) { try { await refereeHealth(); } catch (e) { add('referee-down', `The MATCH SERVER isn't answering (${String(e.message).slice(0, 80)}). Players can't join matches.`); } }
    if (walletRaw) for (const game of games) {
      const [pool] = await db.query('select santa_raw from public.pools where game = $1', [game]); if (!pool) continue;
      let wallet; try { wallet = await walletRaw(game); } catch { continue; } // the chain didn't answer: try again next time, not an alarm
      if (wallet === null || wallet === undefined) continue;
      // every run's payout is sent from the shared Game pool's wallet (worker gameOfRun; 026), so they all count against 'spin'
      const payouts = await db.query(`select po.id, po.status, po.amount_raw from public.payouts po where $1 = 'spin' and po.status <> 'sent'`, [game]);
      const transfers = await db.query(`select id, kind, status, amount_raw from public.pool_transfers where game = $1 and status <> 'sent'`, [game]);
      const r = reconcile({ bookRaw: +pool.santa_raw, walletRaw: Number(wallet), payouts, transfers });
      if (!r.ok) add(`drift:${game}:${r.drift}`, `BOOKS DON'T MATCH the ${POOL(game)} pool wallet: the wallet has ${santa(Math.abs(r.drift))} SANTA ${r.drift > 0 ? 'MORE' : 'LESS'} than the books say. (More: a deposit not recorded yet? Less: look now.)`);
    }
    const rows = await db.query(`select r.profile_id, pr.name, pr.wallet, q.created_at as quote_at, r.paid_at from public.runs r
      join public.payments pa on pa.signature = r.signature join public.quotes q on q.id = pa.quote_id join public.profiles pr on pr.id = r.profile_id
      where q.created_at > now() - make_interval(hours => $1) order by q.created_at`, [BOT_RULES.hours]);
    const runs = rows.map((r) => ({ profile: r.profile_id, name: r.name, wallet: r.wallet, quoteAt: new Date(r.quote_at).getTime(), paidAt: r.paid_at ? new Date(r.paid_at).getTime() : null }));
    for (const f of botSignals(runs, now())) {
      const strong = f.reasons.filter((x) => x.strong); if (!strong.length) continue;
      add(`bot:${f.profile}`, `Possible BOT: ${f.name || 'a player'} (${String(f.wallet || '').slice(0, 4)}…): ${strong.map((x) => x.why).join('; ')}. Details in the admin screen (Bot signals).`);
    }
    return out;
  }
  // Sends what's new (or due again). Returns counts only (the action is public: no details leave this way).
  async function run() {
    if (!telegram) return { off: true };
    const list = await findings(), due = [];
    for (const f of list) {
      const [last] = await db.query('select sent_at from public.alerts_sent where key = $1', [f.key]);
      if (last && now() - new Date(last.sent_at).getTime() < REPEAT_HOURS * 3600e3) continue;
      due.push(f);
    }
    let sent = 0;
    for (const f of due) {
      try { await telegram.send('🎅 Santa Hat: ' + f.text); sent++; }
      catch (e) { console.error('alerts: Telegram send failed', e.message); continue; } // not recorded: tried again next time
      await db.query(`insert into public.alerts_sent (key, sent_at, text) values ($1, $2, $3) on conflict (key) do update set sent_at = excluded.sent_at, text = excluded.text`, [f.key, new Date(now()).toISOString(), f.text]);
    }
    return { ok: true, found: list.length, sent };
  }
  return { findings, run };
}

// Telegram: the bot token from the environment; the chat is TELEGRAM_CHAT_ID if set, else the chat that last sent the bot a
// message (Cody sends his new bot /start once), remembered in public.alert_settings. fetchFn: fetch (tests pass a stand-in).
/** @param {{ token?: string | null, chatId?: string | null, db: any, fetchFn?: typeof fetch }} opts */
export function makeTelegram({ token, chatId = null, db, fetchFn = fetch }) {
  if (!token) return null;
  const api = (method, body) => fetchFn(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }).then((r) => r.json());
  async function chat() {
    if (chatId) return chatId;
    const [row] = await db.query(`select v from public.alert_settings where k = 'telegram_chat_id'`);
    if (row?.v) return (chatId = row.v);
    const u = await api('getUpdates', {});
    const msg = [...(u.result || [])].reverse().map((x) => x.message || x.my_chat_member).find((m) => m?.chat?.type === 'private');
    if (!msg) throw new Error('no chat yet: send your Santa Hat bot /start in Telegram');
    chatId = String(msg.chat.id);
    await db.query(`insert into public.alert_settings (k, v) values ('telegram_chat_id', $1) on conflict (k) do update set v = excluded.v`, [chatId]);
    return chatId;
  }
  return { async send(text) { const r = await api('sendMessage', { chat_id: await chat(), text, disable_web_page_preview: true }); if (!r.ok) throw new Error(r.description || 'Telegram said no'); }, chat };
}
