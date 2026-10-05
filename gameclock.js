// THE GAME CLOCK (Cody, 2026-10-02: every reset happens at 9 PM Indiana time). The game day runs 9 PM to 9 PM in
// America/Indiana/Indianapolis (Eastern time with daylight saving), the same moment for every player; the game week starts
// Sunday 9 PM (the weekly lottery draw, lottery.js). The database has the same rules (supabase/030: game_day_start,
// game_day_next, game_week_start) for ranked tickets; this file is the page's copy (the Ranks "Today" / "This week" boards).
import { zonedTime, WEEKLY_ZONE } from './lottery.js?v=d0d553f857';

export const RESET_HOUR = 21; // 9 PM
const parts = (t) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: WEEKLY_ZONE, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', weekday: 'short' })
  .formatToParts(new Date(t)).map((p) => [p.type, p.value]));
const at9 = (y, m, d) => { const day = new Date(Date.UTC(y, m - 1, d)); return zonedTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), RESET_HOUR, WEEKLY_ZONE); };

// The most recent 9 PM Indiana time at or before t.
export function dayStart(t = Date.now()) {
  const p = parts(t), today = at9(+p.year, +p.month, +p.day);
  return today <= t ? today : at9(+p.year, +p.month, +p.day - 1);
}
// The next 9 PM Indiana time after t (when the free ranked tickets come back).
export function nextReset(t = Date.now()) {
  const p = parts(t), today = at9(+p.year, +p.month, +p.day);
  return today > t ? today : at9(+p.year, +p.month, +p.day + 1);
}
// The most recent Sunday 9 PM Indiana time at or before t (the Ranks "This week" board).
export function weekStart(t = Date.now()) {
  const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  for (let k = 0; k <= 7; k++) { const p = parts(t), s = at9(+p.year, +p.month, +p.day - k), sp = parts(s);
    if (WD[sp.weekday] === 0 && s <= t) return s; }
  throw new Error('no Sunday found'); // can't happen
}
