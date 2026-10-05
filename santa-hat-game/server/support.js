// SERVER: support messages (Cody, 2026-10-04; supabase/046). A player sends one from the sign-in sheet (signed in or not); it is
// kept, and Cody's Telegram bot (the alerts bot) sends it to him straight away. The admin screen lists the open ones and Cody
// marks each handled (an admin-wallet-signed action, server/admin.js). Capped so nobody can flood him: at most PER_HOUR messages
// an hour from one player or one connection; a message is 1 to 1,000 characters.
import { createHash } from 'node:crypto';

export const PER_HOUR = 5, MAX_MESSAGE = 1000, MAX_CONTACT = 120;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const short = (w) => (w ? w.slice(0, 4) + '…' + w.slice(-4) : '');

// telegram: { send(text) } or null (not set up: the message is still kept, and shows on the admin screen)
export function createSupport({ db, telegram = null, salt = 'santa-support' }) {
  async function submit({ profile = null, address = '', message, contact, page }) {
    const text = clean(message, MAX_MESSAGE + 1), how = clean(contact, MAX_CONTACT + 1) || null, where = clean(page, 40) || null;
    if (!text) return { error: 'write a message first' };
    if (text.length > MAX_MESSAGE) return { error: `please keep it under ${MAX_MESSAGE} characters` };
    if (how && how.length > MAX_CONTACT) return { error: 'that contact is too long' };
    const hash = createHash('sha256').update(salt + '|' + address).digest('hex').slice(0, 32);
    const [{ n }] = await db.query(`select count(*)::int as n from public.support_messages where created_at > now() - interval '1 hour'
      and (address_hash = $1 or ($2::uuid is not null and profile_id = $2::uuid))`, [hash, profile]);
    if (n >= PER_HOUR) return { error: 'you have sent several messages this hour; we\'ll get to them, please wait a little before sending more' };
    const [row] = await db.query(`insert into public.support_messages (profile_id, contact, message, page, address_hash) values ($1, $2, $3, $4, $5) returning id`,
      [profile, how, text, where, hash]);
    const who = profile ? (await db.query('select name, wallet from public.profiles where id = $1', [profile]))[0] : null;
    if (telegram) {
      const head = `🎅 Santa Hat: SUPPORT #${row.id} from ${who ? `${who.name || 'a player'}${who.wallet ? ` (${short(who.wallet)})` : ' (email account)'}` : 'a guest (not signed in)'}`;
      telegram.send(`${head}${how ? `\nReach them: ${how}` : '\nNo contact given'}${where ? `\nOn: ${where}` : ''}\n\n${text}`).catch((e) => console.error('support telegram', e.message));
    }
    return { ok: true, id: +row.id };
  }
  // the admin screen (server/admin.js, admin-wallet-signed): open messages first, then the 20 most recently handled
  async function list() {
    const rows = await db.query(`select s.*, p.name, p.wallet from public.support_messages s left join public.profiles p on p.id = s.profile_id
      where s.status = 'open' or s.id in (select id from public.support_messages where status = 'handled' order by handled_at desc limit 20)
      order by (s.status = 'open') desc, s.created_at desc`);
    return { ok: true, messages: rows.map((r) => ({ id: +r.id, at: new Date(r.created_at).getTime(), name: r.name || null, wallet: r.wallet || null, contact: r.contact,
      message: r.message, page: r.page, status: r.status, handledAt: r.handled_at ? new Date(r.handled_at).getTime() : null, note: r.note })) };
  }
  async function handle(id, wallet, note) {
    const [r] = await db.query(`update public.support_messages set status = 'handled', handled_at = now(), handled_by = $2, note = $3 where id = $1 and status = 'open' returning id`,
      [Number(id), wallet, clean(note, 300) || null]);
    return r ? { ok: true, id: +r.id } : { error: 'no open support message with that number' };
  }
  return { submit, list, handle };
}
