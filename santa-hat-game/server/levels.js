// SERVER: levels (Cody, 2026-10-01; rules mockups/levels.js, database supabase/010_levels.sql).
//   progress           → this player's level, progress toward the next, and what their level gives (Progress box)
//   finish { match }    → a finished Auto match's places; each player in the top 3 who has an account gets the finish counted
//                         (once per match: the database keys finishes by match id + player)
// TRUST, stated plainly: until the always-on referee server exists (DigitalOcean, decided), the match is refereed in the host
// player's browser, so the places come from that browser; a cheater could report false places. The database still caps it
// (one count per match per player, places 1–3 only, level 9 → 10 needs firsts). Bought levels don't depend on this: they're
// checked against a real payment. When the referee moves to the server, it calls finish itself and nothing else changes.
import { levelInfo, progressLine, countsForLevels } from '../mockups/levels.js';

const MATCH_ID = /^[A-Za-z0-9_-]{8,80}$/;
const UUID = /^[0-9a-f-]{36}$/;

export function createLevels({ db }) {
  async function progress(profile) {
    const r = (await db.query('select level, xp from public.profiles where id = $1', [profile]))[0];
    if (!r) return { error: 'no profile yet' };
    return { ...progressLine(r), gives: levelInfo(r.level) };
  }
  // match: { id, auto: true, places: [profile id or null (a bot or a guest), ...] in finishing order }. Sent by the HOST,
  // who must be one of the places (a player in that match).
  async function finish(host, match) {
    if (!match || typeof match !== 'object') return { error: 'send the match' };
    if (!MATCH_ID.test(String(match.id))) return { error: 'bad match id' };
    if (!countsForLevels(match)) return { counted: [] }; // practice, private rooms: nothing counts (not an error)
    const places = Array.isArray(match.places) ? match.places.slice(0, 8) : [];
    if (!places.some((p) => p === host)) return { error: 'only a player in the match can report it' };
    // Every account's finish counts toward its match stats (games played, top-3 %: the load screen; supabase/013), once per match.
    for (let i = 0; i < places.length; i++) {
      const p = places[i];
      if (p && UUID.test(String(p))) await db.query('select public.record_match_result($1, $2, $3, $4)', [String(match.id), p, i + 1, places.length]);
    }
    const counted = [];
    for (let i = 0; i < Math.min(3, places.length); i++) {
      const p = places[i];
      if (!p || !UUID.test(String(p))) continue; // a bot or a guest: no level to give
      const r = (await db.query('select * from public.record_level_finish($1, $2, $3)', [String(match.id), p, i + 1]))[0];
      if (r) counted.push({ place: i + 1, level: r.level, xp: r.xp, up: r.up, ...(p === host ? { you: true } : {}) });
    }
    return { counted };
  }
  // Public: the load screen's numbers for the players in a room (up to 8 accounts): games played, top-3 %, level, rank points.
  async function stats(ids) {
    const list = (Array.isArray(ids) ? ids : []).filter((x) => UUID.test(String(x))).slice(0, 8);
    if (!list.length) return { players: [] };
    const rows = await db.query('select * from public.player_stats($1::uuid[])', [list]);
    return { players: rows.map((r) => ({ id: r.profile_id, games: r.games, top3: r.top3, top3Pct: r.games ? Math.round((r.top3 / r.games) * 100) : 0, level: r.level, rankPoints: r.rank_points })) };
  }
  return { progress, finish, stats };
}
