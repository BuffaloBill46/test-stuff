// SERVER: the web door to the game server (runs inside the Supabase Edge Function; plain JS so it's tested in node too).
// One address, POST JSON { action, ... }:
//   credits                    → your credits per game/size        open   { kind }            → { ticket, commit }
//   quote  { kind, n }         → a 60-second SANTA price quote      settle { ticket, seed }    → result + revealed secret
//   buy    { quote, signature }→ checks the finalized payment, adds credits
// Only signed-in players (a Supabase login token); only our own website may call it from a browser.
export const ALLOWED_ORIGINS = ['https://buffalobill46.github.io', 'http://localhost'];
const allowed = (o) => ALLOWED_ORIGINS.includes(o) || /^http:\/\/localhost:\d+$/.test(o); // localhost = a player's own computer (tests)

// deps: { server (games.js), profileFor(token) → profile id or null, credits(profile) → rows }
export function makeHandler(deps) {
  const cors = (origin) => ({
    'access-control-allow-origin': allowed(origin) ? origin : ALLOWED_ORIGINS[0],
    'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin',
  });
  const reply = (origin, status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors(origin) } });

  return async function handle(req) {
    const origin = req.headers.get('origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (req.method !== 'POST') return reply(origin, 405, { error: 'POST only' });
    if (origin && !allowed(origin)) return reply(origin, 403, { error: 'not from the game\'s website' });
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const profile = token ? await deps.profileFor(token).catch(() => null) : null;
    if (!profile) return reply(origin, 401, { error: 'sign in first' });
    let body; try { body = await req.json(); } catch { return reply(origin, 400, { error: 'send JSON' }); }
    const s = deps.server;
    try {
      let out;
      switch (body?.action) {
        case 'credits': out = { credits: await deps.credits(profile) }; break;
        case 'quote': out = await s.quote(profile, String(body.kind), Number(body.n)); break;
        case 'buy': out = await s.buy(profile, String(body.quote), String(body.signature)); break;
        case 'open': out = await s.open(profile, String(body.kind)); break;
        case 'settle': out = await s.settle(profile, String(body.ticket), String(body.seed)); break;
        default: return reply(origin, 400, { error: 'unknown action' });
      }
      return reply(origin, out?.error ? 400 : 200, out);
    } catch (e) {
      console.error('games server error', e); // details stay in the server log; players get a plain message
      return reply(origin, 500, { error: 'something went wrong on our side; please try again' });
    }
  };
}
