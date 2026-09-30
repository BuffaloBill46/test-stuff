// SERVER: the web door to the game server (runs inside the Supabase Edge Function; plain JS so it's tested in node too).
// One address, POST JSON { action, ... }:
//   credits                    → your credits per game/size        open   { kind }            → { ticket, commit }
//   quote  { kind, n }         → a 60-second SANTA price quote      settle { ticket, seed }    → result + revealed secret
//   buy    { quote, signature }→ checks the finalized payment, adds credits
//   winners                    → the shared Recent winners list (public, no sign-in)
//   settings { version? }      → public game settings (prices, odds, prizes); any version, for re-checking old plays
//   pools                      → public pool status: balances, settings, pending transfers, change log (admin screen)
// Only signed-in players (a Supabase login token); only our own website may call it from a browser.
export const ALLOWED_ORIGINS = ['https://buffalobill46.github.io', 'http://localhost'];
const allowed = (o) => ALLOWED_ORIGINS.includes(o) || /^http:\/\/localhost:\d+$/.test(o); // localhost = a player's own computer (tests)

// deps: { server (games.js), profileFor(token) → profile id or null, credits(profile) → rows }
export function makeHandler(deps) {
  const cors = (origin) => ({
    'access-control-allow-origin': allowed(origin) ? origin : ALLOWED_ORIGINS[0],
    'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info, x-santa-admin',
    'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin',
  });
  const reply = (origin, status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors(origin) } });

  return async function handle(req) {
    const origin = req.headers.get('origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (req.method !== 'POST') return reply(origin, 405, { error: 'POST only' });
    if (origin && !allowed(origin)) return reply(origin, 403, { error: 'not from the game\'s website' });
    // Admin actions carry their own proof (a wallet-signed message, server/admin.js), so they skip the player sign-in.
    if (deps.admin && (req.headers.get('x-santa-admin') === '1')) {
      let body; try { body = await req.json(); } catch { return reply(origin, 400, { error: 'send JSON' }); }
      try { const out = await deps.admin.run(body || {}); return reply(origin, out?.error ? 400 : 200, out); }
      catch (e) { console.error('admin error', e); return reply(origin, 500, { error: 'something went wrong on our side; please try again' }); }
    }
    let body; try { body = await req.json(); } catch { return reply(origin, 400, { error: 'send JSON' }); }
    if (body?.action === 'pools') { // public: pool balances, settings, pending transfers and the change log
      try { return reply(origin, 200, await deps.server.pools()); } catch (e) { console.error('pools error', e); return reply(origin, 500, { error: 'something went wrong on our side; please try again' }); }
    }
    if (body?.action === 'settings') { // public: the game settings (prices, odds, prizes) by version
      try { return reply(origin, 200, await deps.server.settings(Number.isInteger(body.version) ? body.version : undefined)); } catch (e) { return reply(origin, 400, { error: 'unknown settings version' }); }
    }
    if (body?.action === 'winners') { // public: the shared Recent winners list (names and amounts only)
      try { return reply(origin, 200, { winners: await deps.server.winners() }); } catch (e) { console.error('winners error', e); return reply(origin, 500, { error: 'something went wrong on our side; please try again' }); }
    }
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const profile = token ? await deps.profileFor(token).catch(() => null) : null;
    if (!profile) return reply(origin, 401, { error: 'sign in first' });
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
