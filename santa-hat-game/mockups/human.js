// "Are you human?" at sign-in (Cody, 2026-10-02: Cloudflare Turnstile, sign-in only for now). Supabase Auth checks the token
// when its CAPTCHA setting is on (Auth → Attack Protection, with the Turnstile SECRET key, which only Cody pastes there).
// OFF until SITE_KEY is set: no widget, no token, sign-in works as before. Order when turning it on: publish the page with the
// site key FIRST, then switch on Supabase's CAPTCHA (the other way round, nobody could sign in).
const LIVE_KEY = null; // Cloudflare → Turnstile → the santahatgames.com widget's site key (public; not the secret key)
// tests on this computer only: ?hk=<a Cloudflare TEST site key> switches it on (the live site ignores it)
export const SITE_KEY = (location.hostname === 'localhost' && new URLSearchParams(location.search).get('hk')) || LIVE_KEY;

let loading = null, widgetId = null;
const load = () => loading || (loading = new Promise((res, rej) => {
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true;
  s.onload = () => res(window.turnstile); s.onerror = () => { loading = null; rej(new Error("couldn't load the are-you-human check; check your connection")); };
  document.head.append(s);
}));
// Shows the check in `box` (the sign-in sheet), once.
export function mountHumanCheck(box) {
  if (!SITE_KEY || !box || widgetId !== null) return;
  box.hidden = false;
  load().then((t) => { if (widgetId === null) widgetId = t.render(box, { sitekey: SITE_KEY, theme: 'dark', size: 'flexible' }); }).catch(() => {});
}
// The token for one sign-in (undefined while the check is off). Each token works once: resetHumanCheck() after every attempt.
export async function humanToken() {
  if (!SITE_KEY) return undefined;
  const t = await load(), v = widgetId !== null ? t.getResponse(widgetId) : '';
  if (!v) throw new Error('tick the "are you human?" box first');
  return v;
}
export function resetHumanCheck() { if (SITE_KEY && window.turnstile && widgetId !== null) window.turnstile.reset(widgetId); }
