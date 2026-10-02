// SERVER: levels (Cody, 2026-10-01; rules mockups/levels.js, database supabase/010_levels.sql).
//   progress           → this player's level, progress toward the next, and what their level gives (Progress box)
//   finish { match }    → a finished Auto match's places; each player in the top 3 who has an account gets the finish counted
//                         (once per match: the database keys finishes by match id + player). Also SPECIAL GEAR's 7-day
//                         clock (supabase/015): every account in the match starts the clock of the gear items in its saved
//                         avatar's open gear slots (record_gear_worn; started once, never restarted), and worn-out gear is
//                         taken off every saved avatar (take_off_worn_gear), once per finish.
// TRUST, stated plainly: until the always-on referee server exists (DigitalOcean, decided), the match is refereed in the host
// player's browser, so the places come from that browser; a cheater could report false places. The database still caps it
// (one count per match per player, places 1–3 only, level 9 → 10 needs firsts). Bought levels don't depend on this: they're
// checked against a real payment. When the referee moves to the server, it calls finish itself and nothing else changes.
import { levelInfo, progressLine, countsForLevels } from '../mockups/levels.js';
import { GEAR_SLOTS, BY_ID } from '../mockups/catalog.js';
import { gearIn } from '../mockups/gear.js';

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
    await wearClock(places);
    return { counted };
  }
  // Special gear wears out 7 days after the first match wearing it (Cody). The referee is the host's browser, which reads saved
  // avatars, so the server keeps the clock here, at the end of a counted Auto match (practice and private rooms start nothing,
  // like the level counts above). Worn-out gear comes off first, so it isn't worn again; then each account's gear ITEMS in the
  // slots its level opens, as the match wears them (gear.js gearIn: level rules, no stacking). A Gift Box (Present Box) runs
  // its own clock, whatever it turned into. After the counts on purpose: a gear failure (015 not applied yet) must never
  // cost anyone a level, so it's logged loudly and the finish still answers.
  async function wearClock(places) {
    try {
      await db.query('select public.take_off_worn_gear()');
      for (const p of new Set(places.filter((x) => x && UUID.test(String(x))).map(String))) {
        const r = (await db.query('select avatar, level from public.profiles where id = $1', [p]))[0]; if (!r) continue;
        const a = r.avatar || {}, worn = gearIn(a, r.level);
        const items = GEAR_SLOTS.slice(0, levelInfo(r.level).gear).map((s) => a[s]).filter((id) => worn.includes(BY_ID.get(id)?.gear));
        if (items.length) await db.query('select public.record_gear_worn($1::uuid, $2::text[])', [p, items]);
      }
    } catch (e) { console.error('levels.finish: special gear wear clock failed (is supabase/015 applied?):', e.message); }
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
