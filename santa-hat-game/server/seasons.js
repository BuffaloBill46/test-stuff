// SERVER: a signed-in player's season (Cody, 2026-10-03; rules in mockups/seasons.js, data in supabase/033). Read-only here:
// progress only moves through season_record (server/levels.js, from matches the match server ran) and the pass only through a
// Store purchase (server/shop.js kind 'pass').
import { seasonAt, seasonById, dayKey, dayEnds, seasonDays, tasksFor, freeReward, goldReward, PASS_PRICE } from '../mockups/seasons.js';

export function createSeasons({ db, now = () => Date.now() }) {
  // { season, day, endsAt, dayEndsAt, tasks: [{ id, text, need, have, done }], doors, days: [{ day, door }], streak, pass,
  //   granted: [{ door, track, item, xp }], plan: { free: [...], gold: [...] } } — or { off: true } between seasons.
  async function state(profile) {
    const s = seasonAt(now()); if (!s) return { off: true };
    const day = dayKey(now()), all = seasonDays(s);
    const stored = (await db.query('select tasks from public.season_days where season = $1 and day = $2', [s.id, day]))[0]?.tasks;
    const tasks = (Array.isArray(stored) && stored.length === 3 ? stored : tasksFor(day)).map((t) => ({ id: t.id, stat: t.stat, need: +t.need }));
    const rows = await db.query('select day::text as day, stats, door from public.season_progress where profile_id = $1 and season = $2 order by day', [profile, s.id]);
    const today = rows.find((r) => r.day === day)?.stats || {};
    const doneDays = rows.filter((r) => r.door).map((r) => r.day);
    let streak = 0; for (let i = all.indexOf(doneDays.at(-1)); i >= 0 && doneDays.includes(all[i]); i--) streak++;
    const pass = !!(await db.query('select 1 from public.season_passes where profile_id = $1 and season = $2', [profile, s.id]))[0];
    const granted = await db.query('select door, track, item_id as item, xp from public.season_grants where profile_id = $1 and season = $2 order by door, track', [profile, s.id]);
    const byText = Object.fromEntries(tasksFor(day).map((t) => [t.id, t.text]));
    return {
      season: { id: s.id, name: s.name, icon: s.icon, costume: s.costume, passPrice: PASS_PRICE, endsAt: s.end, startsAt: s.start },
      day, dayEndsAt: dayEnds(now()),
      tasks: tasks.map((t) => ({ id: t.id, text: byText[t.id] || t.id, need: t.need, have: Math.min(t.need, Number(today[t.stat]) || 0), done: (Number(today[t.stat]) || 0) >= t.need })),
      doors: doneDays.length, days: all.map((d) => ({ day: d, door: doneDays.includes(d) })), streak, pass, granted,
      plan: { free: all.map((_, i) => freeReward(s, i + 1)), gold: all.map((_, i) => goldReward(s, i + 1)) },
    };
  }
  return { state, seasonById };
}
