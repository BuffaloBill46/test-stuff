// SERVER: a signed-in player's season (Cody, 2026-10-03; SEASON POINTS 2026-10-04: rules in mockups/seasons.js, data in
// supabase/033 + 039). Reading a signed-in player's season records today's "Log in" task (season_login, once a day, the only
// way it can be ticked). Match progress only moves through season_record (server/levels.js, from matches the match server
// ran) and the pass only through a Store purchase (server/shop.js kind 'pass').
import { seasonAt, seasonById, dayKey, dayEnds, seasonDays, tasksFor, freeReward, goldReward, doorsFor, PASS_PRICE, DOORS, DOOR_POINTS, POINTS } from '../mockups/seasons.js';

export function createSeasons({ db, now = () => Date.now() }) {
  // { season, day, endsAt, dayEndsAt, tasks: [{ id, text, need, have, done }], points, today: { points, matches, top3, max },
  //   doors, nextAt, days: [{ day, perfect, points }], streak, pass, granted: [{ door, track, item, xp, tickets }],
  //   plan: { free: [...30], gold: [...30] } } — or { off: true } between seasons.
  async function state(profile) {
    const s = seasonAt(now()); if (!s) return { off: true };
    const day = dayKey(now()), all = seasonDays(s);
    const stored = (await db.query('select tasks from public.season_days where season = $1 and day = $2', [s.id, day]))[0]?.tasks;
    const tasks = (Array.isArray(stored) && stored.length >= 3 ? stored : tasksFor(day)).map((t) => ({ id: t.id, stat: t.stat, need: +t.need }));
    // "Log in": a signed-in player reading their season today (a failure never stops the season from showing)
    try { await db.query('select public.season_login($1, $2, $3, $4)', [profile, s.id, day, JSON.stringify(tasks)]); }
    catch (e) { console.error('seasons: login task failed (is supabase/039 applied?):', e.message); }
    const rows = await db.query('select day::text as day, stats, door, points, matches_scored, top3_scored from public.season_progress where profile_id = $1 and season = $2 order by day', [profile, s.id]);
    const today = rows.find((r) => r.day === day), st = today?.stats || {};
    const perfectDays = rows.filter((r) => r.door).map((r) => r.day);
    let streak = 0; for (let i = all.indexOf(perfectDays.at(-1)); i >= 0 && perfectDays.includes(all[i]); i--) streak++;
    const points = rows.reduce((a, r) => a + (+r.points || 0), 0), doors = doorsFor(points);
    const pass = !!(await db.query('select 1 from public.season_passes where profile_id = $1 and season = $2', [profile, s.id]))[0];
    const granted = await db.query('select door, track, item_id as item, xp, tickets from public.season_grants where profile_id = $1 and season = $2 order by door, track', [profile, s.id]);
    const byText = Object.fromEntries(Object.values(tasksFor(day)).map((t) => [t.id, t.text]));
    const doorsList = Array.from({ length: DOORS }, (_, i) => i + 1);
    return {
      season: { id: s.id, name: s.name, icon: s.icon, costume: s.costume, passPrice: PASS_PRICE, endsAt: s.end, startsAt: s.start },
      day, dayEndsAt: dayEnds(now()),
      tasks: tasks.map((t) => ({ id: t.id, text: byText[t.id] || t.id, need: t.need, have: Math.min(t.need, Number(st[t.stat]) || 0), done: (Number(st[t.stat]) || 0) >= t.need })),
      points, doors, doorPoints: DOOR_POINTS, nextAt: doors < DOORS ? (doors + 1) * DOOR_POINTS : null,
      today: { points: +today?.points || 0, matches: +today?.matches_scored || 0, top3: +today?.top3_scored || 0, max: tasks.length * POINTS.task + POINTS.matchesPerDay * (POINTS.match + POINTS.top3) },
      days: all.map((d) => { const r = rows.find((x) => x.day === d); return { day: d, perfect: !!r?.door, points: +r?.points || 0 }; }),
      streak, pass, granted,
      plan: { free: doorsList.map((d) => freeReward(s, d)), gold: doorsList.map((d) => goldReward(s, d)) },
    };
  }
  return { state, seasonById };
}
