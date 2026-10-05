// SERVER: errors players hit (Cody, 2026-10-04 to-do #3; supabase/048). The page reports an unexpected error (mockups/errorreport.js);
// it is grouped by fingerprint (what went wrong + where in the code) into one row with a count. A NEW kind of error (or a fixed
// one coming back) is sent to Cody's Telegram, at most TELEGRAM_PER_HOUR an hour; the admin screen lists them and marks one
// fixed. Nobody can flood it: at most PER_ADDRESS_HOUR reports an hour from one connection, and every field is length-capped.
import { createHash } from 'node:crypto';

export const PER_ADDRESS_HOUR = 20, TELEGRAM_PER_HOUR = 5;
const cut = (s, n) => (s == null ? null : String(s).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n) || null);

export function createClientErrors({ db, telegram = null, now = () => Date.now() }) {
  const perAddress = new Map(); let tgHour = { start: 0, n: 0 };
  async function report({ address = '', message, source, stack, page, build, ua }) {
    const msg = cut(message, 300); if (!msg) return { error: 'nothing to report' };
    const t = now(), a = perAddress.get(address) || { start: t, n: 0 };
    if (t - a.start > 3600e3) { a.start = t; a.n = 0; }
    if (++a.n > PER_ADDRESS_HOUR) return { ok: true, dropped: true }; // quietly: the page has nothing to do about it
    perAddress.set(address, a); if (perAddress.size > 5000) perAddress.clear();
    const src = cut(source, 200), fp = createHash('sha256').update(msg.replace(/\d+/g, '#') + '|' + (src || '').replace(/\?v=\w+/, '')).digest('hex').slice(0, 24);
    const [row] = await db.query(`insert into public.client_errors (fingerprint, message, source, stack, page, build, ua) values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (fingerprint) do update set count = public.client_errors.count + 1, last_seen = now(), page = excluded.page, build = excluded.build, ua = excluded.ua,
        status = 'open', fixed_at = null
      returning count, (xmax = 0) as is_new, (select status from public.client_errors c where c.fingerprint = $1) as was`,
      [fp, msg, src, cut(stack, 1200), cut(page, 40), cut(build, 20), cut(ua, 120)]);
    const fresh = row.is_new || row.was === 'fixed';
    if (fresh && telegram) {
      if (t - tgHour.start > 3600e3) tgHour = { start: t, n: 0 };
      if (++tgHour.n <= TELEGRAM_PER_HOUR) telegram.send(`🎅 Santa Hat: a ${row.is_new ? 'NEW' : 'FIXED one came back:'} page error players hit\n${msg}${src ? `\nAt: ${src}` : ''}${page ? `\nOn: ${page}` : ''}\n(admin screen → Errors players hit)`).catch(() => {});
    }
    return { ok: true };
  }
  async function list() {
    const rows = await db.query(`select * from public.client_errors order by (status = 'open') desc, last_seen desc limit 100`);
    return { ok: true, errors: rows.map((r) => ({ id: r.fingerprint, message: r.message, source: r.source, stack: r.stack, page: r.page, build: r.build, ua: r.ua,
      count: r.count, firstSeen: new Date(r.first_seen).getTime(), lastSeen: new Date(r.last_seen).getTime(), status: r.status })) };
  }
  async function fixed(id) {
    const [r] = await db.query(`update public.client_errors set status = 'fixed', fixed_at = now() where fingerprint = $1 and status = 'open' returning fingerprint`, [String(id)]);
    return r ? { ok: true, id: r.fingerprint } : { error: 'no open error with that id' };
  }
  return { report, list, fixed };
}
