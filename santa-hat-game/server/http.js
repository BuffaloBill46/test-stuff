// SERVER: the web door to the game server (runs inside the Supabase Edge Function; plain JS so it's tested in node too).
// One address, POST JSON { action, ... }:
//   quote  { kind, n, bet }    → a 60-second SANTA price for a run of 1 to 100 plays at one size
//   buy    { quote, signature }→ checks the finalized payment → the run's plays, each with its locked fingerprint
//   settle { ticket, seed }    → result + revealed secret; the run's last play also says what was sent to the wallet
//   winners                    → the shared Recent winners list (public, no sign-in)
//   settings { version? }      → public game settings (prices, odds, prizes); any version, for re-checking old plays
//   market                     → public: the SANTA price quotes use now (10-minute median) and the token's tax
//   pools                      → public pool status: balances, settings, pending transfers, change log (admin screen)
//   progress                   → my level and progress toward the next (server/levels.js)
//   finish { match }           → the host reports a finished Auto match's places; top-3 players' finishes count toward levels
//   lottery                    → public: every lottery's open draw and recent results (server/lottery.js; runs due draws)
//   lottery-quote { lottery, n } → a 60-second price for n tickets      lottery-buy { quote, signature } → checks the payment, numbers the tickets
//   shop-quote { kind: 'item' | 'level' | 'tickets', id?, n? } → a 60-second price      shop-buy { quote, signature } → checks it, grants it
//   shop-owned → the items this player owns      tickets → my ranked tickets (free left, extra, held, refill time)
// Only signed-in players (a Supabase login token); only our own website may call it from a browser.
// Speed limit (server/ratelimit.js): every request counts against its internet connection, every signed-in request against its
// player too; over the limit → 429 "slow down, try again in N seconds".
export const ALLOWED_ORIGINS = ['https://buffalobill46.github.io', 'http://localhost'];
const allowed = (o) => ALLOWED_ORIGINS.includes(o) || /^http:\/\/localhost:\d+$/.test(o); // localhost = a player's own computer (tests)

// deps: { server (games.js), profileFor(token) → profile id or null, limiter (ratelimit.js; null = none, tests only),
//         addressOf(req) → the caller's internet address (default: the first x-forwarded-for entry) }
export function makeHandler(deps) {
  // No limiter by accident would look protected while it isn't: it must be passed, or switched off on purpose with null.
  if (deps.limiter === undefined) throw new Error('makeHandler needs a limiter (server/ratelimit.js), or limiter: null on purpose');
  const addressOf = deps.addressOf || ((req) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown');
  const cors = (origin) => ({
    'access-control-allow-origin': allowed(origin) ? origin : ALLOWED_ORIGINS[0],
    'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info, x-santa-admin',
    'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin',
  });
  const reply = (origin, status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors(origin) } });
  const slowDown = (origin, l) => new Response(JSON.stringify({ error: `slow down: too many requests. Try again in ${l.retryAfter} seconds.`, slowDown: true, retryAfter: l.retryAfter }),
    { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(l.retryAfter), ...cors(origin) } });

  return async function handle(req) {
    const origin = req.headers.get('origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (req.method !== 'POST') return reply(origin, 405, { error: 'POST only' });
    if (origin && !allowed(origin)) return reply(origin, 403, { error: 'not from the game\'s website' });
    if (deps.limiter) { const l = await deps.limiter.connection(addressOf(req)); if (!l.ok) return slowDown(origin, l); } // before any database work
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
    if (body?.action === 'stats' && deps.levels) { // public: the match load screen's numbers for a room's players
      try { return reply(origin, 200, await deps.levels.stats(body.profiles)); } catch (e) { console.error('stats error', e); return reply(origin, 500, { error: 'something went wrong on our side; please try again' }); }
    }
    if (body?.action === 'lottery-tickets' && deps.lottery) { // public: a drawn draw's ticket list, to re-check it
      try { const out = await deps.lottery.tickets(body.draw); return reply(origin, out.error ? 400 : 200, out); } catch (e) { console.error('lottery error', e); return reply(origin, 500, { error: 'something went wrong on our side; please try again' }); }
    }
    if (body?.action === 'lottery' && deps.lottery) { // public: open draws and recent results (anyone can re-check a draw)
      try { return reply(origin, 200, await deps.lottery.draws()); } catch (e) { console.error('lottery error', e); return reply(origin, 500, { error: 'something went wrong on our side; please try again' }); }
    }
    if (body?.action === 'market') { // public: the price quotes use and the token's tax (the page's info line)
      try { return reply(origin, 200, await deps.server.market()); } catch (e) { console.error('market error', e); return reply(origin, 500, { error: 'something went wrong on our side; please try again' }); }
    }
    if (body?.action === 'winners') { // public: the shared Recent winners list (names and amounts only)
      try { return reply(origin, 200, { winners: await deps.server.winners() }); } catch (e) { console.error('winners error', e); return reply(origin, 500, { error: 'something went wrong on our side; please try again' }); }
    }
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const profile = token ? await deps.profileFor(token).catch(() => null) : null;
    if (!profile) return reply(origin, 401, { error: 'sign in first' });
    if (deps.limiter) { const l = await deps.limiter.player(profile); if (!l.ok) return slowDown(origin, l); }
    const s = deps.server;
    try {
      let out;
      switch (body?.action) {
        case 'quote': out = await s.quote(profile, String(body.kind), Number(body.n), Number(body.bet)); break;
        case 'buy': out = await s.buy(profile, String(body.quote), String(body.signature)); break;
        case 'settle': out = await s.settle(profile, String(body.ticket), String(body.seed)); break;
        // levels (server/levels.js): a player's own progress; the host reporting a finished Auto match
        case 'progress': if (!deps.levels) return reply(origin, 400, { error: 'unknown action' }); out = await deps.levels.progress(profile); break;
        case 'lottery-quote': if (!deps.lottery) return reply(origin, 400, { error: 'unknown action' }); out = await deps.lottery.quote(profile, String(body.lottery), Number(body.n)); break;
        case 'lottery-buy': if (!deps.lottery) return reply(origin, 400, { error: 'unknown action' }); out = await deps.lottery.buy(profile, String(body.quote), String(body.signature)); break;
        // the shop (server/shop.js): Store items, a level, extra ranked tickets
        case 'shop-quote': if (!deps.shop) return reply(origin, 400, { error: 'unknown action' }); out = await deps.shop.quote(profile, { kind: String(body.kind), id: body.id == null ? undefined : String(body.id), n: Number(body.n) }); break;
        case 'shop-buy': if (!deps.shop) return reply(origin, 400, { error: 'unknown action' }); out = await deps.shop.buy(profile, String(body.quote), String(body.signature)); break;
        case 'shop-owned': if (!deps.shop) return reply(origin, 400, { error: 'unknown action' }); out = await deps.shop.owned(profile); break;
        case 'tickets': if (!deps.shop) return reply(origin, 400, { error: 'unknown action' }); out = await deps.shop.tickets(profile); break;
        case 'finish': if (!deps.levels) return reply(origin, 400, { error: 'unknown action' }); out = await deps.levels.finish(profile, body.match); break;
        default: return reply(origin, 400, { error: 'unknown action' });
      }
      return reply(origin, out?.error ? 400 : 200, out);
    } catch (e) {
      console.error('games server error', e); // details stay in the server log; players get a plain message
      return reply(origin, 500, { error: 'something went wrong on our side; please try again' });
    }
  };
}
