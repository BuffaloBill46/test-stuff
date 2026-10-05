// TRAFFIC COUNTER (Cody 2026-10-05: "can you make a traffic counter"; supabase/052). Each page load of the site says hello once per
// visit ('visit', server/http.js). The visitor is counted under a one-way code made from their connection and browser, a secret only
// this server has and the day: no address or identity is ever stored, and the same person can't be linked from one day to the next.
// Search engines and other robots aren't counted. Where they came from is kept as a site name only (x.com, google.com, ...).
import { createHash } from 'node:crypto';

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|pingdom|monitor|curl|wget|python|node-fetch|axios/i;
// a few names point at the same place (X's link shortener is t.co)
const ALIAS = { 't.co': 'x.com', 'twitter.com': 'x.com', 'mobile.twitter.com': 'x.com', 'm.facebook.com': 'facebook.com', 'l.facebook.com': 'facebook.com', 'lm.facebook.com': 'facebook.com', 'www.google.com': 'google.com' };
export function cleanSource(s) {
  let h = String(s || '').toLowerCase().trim();
  try { if (/^https?:\/\//.test(h)) h = new URL(h).hostname; } catch { return null; }
  h = h.replace(/^www\./, '');
  if (!h || !/^[a-z0-9.-]{1,60}$/.test(h) || h === 'santahatgames.com' || h.endsWith('.santahatgames.com')) return null; // our own pages: not a source
  return ALIAS[h] || ALIAS['www.' + h] || h;
}
// secret: any text only this server knows (worker/games.mjs passes one made from its own settings); day: the Eastern date
export function visitorCode(secret, day, address, ua) {
  return createHash('sha256').update(`${secret}|${day}|${address}|${ua}`).digest('hex').slice(0, 32);
}
const easternDay = (t = Date.now()) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Indiana/Indianapolis' });

export function createTraffic({ db, secret, now = () => Date.now() }) {
  if (!secret) throw new Error('traffic: a secret is needed');
  async function record({ address, ua, source, page }) {
    if (!ua || BOT.test(ua)) return { ok: true, counted: false }; // robots and scripts: not visitors
    const code = visitorCode(secret, easternDay(now()), String(address || ''), String(ua).slice(0, 300));
    await db.query('select public.record_visit($1, $2, $3)', [code, cleanSource(source), page === 'guide' ? 'guide' : 'game']);
    return { ok: true, counted: true };
  }
  async function summary() { return { ok: true, ...(await db.query('select public.traffic_summary() as s'))[0].s }; }
  return { record, summary };
}
