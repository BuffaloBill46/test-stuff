// SERVER: the speed limit (stops scripted floods; Cody 2026-10-01: "build it but plan to move it to an always-on game server").
// Not about winning (the games can't be beaten by playing fast); about one script using up the free plan's calls or slowing
// the game for everyone. Two limits, counted in 10-second windows:
//   per internet connection: every request (incl. the public winners / pools / settings answers, and many accounts on one computer)
//   per signed-in player:    every signed-in request
// Over the limit: "slow down, try again in N seconds". Nothing is banned; the count starts again in the next window.
// An honest run of 10 is about 12 requests (quote, buy, 10 settles) over several seconds, far under either limit.
//
// WHERE THE COUNTS LIVE is separate from the rules, so moving servers changes one line in the wiring:
//   dbStore(db)    today, on the Supabase Edge Function: each call may run in a fresh copy that remembers nothing,
//                  so the counts are kept in the database (table rate_hits, supabase/007_rate_limits.sql).
//   memoryStore()  on the planned always-on game server: one long-running program keeps the counts in its own memory
//                  (faster, no database writes). Only while there is ONE server program; with several, keep dbStore.
// The same rules are tested on both stores (tests/db/ratelimit.test.mjs).

// The numbers, in one place (Claude's starting picks, generous on purpose; Cody can change them).
export const RATE_RULES = { windowSeconds: 10, perConnection: 60, perPlayer: 40 };

export function memoryStore() {
  const counts = new Map(); let lastClean = 0;
  return {
    async hit(key, windowStart, now) {
      if (now - lastClean > 60_000) { // forget windows over an hour old, at most once a minute
        lastClean = now; for (const k of counts.keys()) if (+k.slice(0, k.indexOf('|')) < now / 1000 - 3600) counts.delete(k);
      }
      const k = windowStart + '|' + key, n = (counts.get(k) || 0) + 1; counts.set(k, n); return n;
    },
  };
}

export function dbStore(db) {
  let lastClean = 0;
  return {
    async hit(key, windowStart, now) {
      if (now - lastClean > 60_000) { // counts over an hour old are deleted (they hold internet addresses; keep nothing longer)
        lastClean = now; await db.query('delete from public.rate_hits where window_start < $1', [Math.floor(now / 1000) - 3600]);
      }
      const [r] = await db.query(`insert into public.rate_hits (key, window_start, n) values ($1, $2, 1)
        on conflict (key, window_start) do update set n = public.rate_hits.n + 1 returning n`, [key, windowStart]);
      return +r.n;
    },
  };
}

// limiter.connection(address) / limiter.player(profileId) → { ok: true } or { ok: false, retryAfter: seconds }
export function makeLimiter({ store, rules = RATE_RULES, now = () => Date.now(), log = console.error }) {
  async function check(kind, id, limit) {
    const t = now(), w = rules.windowSeconds, windowStart = Math.floor(t / 1000 / w) * w;
    let n;
    try { n = await store.hit(kind + ':' + id, windowStart, t); }
    catch (e) { log('speed limit: counting failed, letting the request through', e); return { ok: true, uncounted: true }; } // a counting fault never locks players out
    if (n <= limit) return { ok: true, n };
    return { ok: false, retryAfter: Math.max(1, Math.ceil(windowStart + w - t / 1000)) };
  }
  return {
    rules,
    connection: (address) => check('ip', address || 'unknown', rules.perConnection),
    player: (profile) => check('player', profile, rules.perPlayer),
  };
}
