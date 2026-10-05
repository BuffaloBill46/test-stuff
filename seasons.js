// SEASONS (Cody, 2026-10-03): Halloween (to October 31), Thanksgiving (November), Christmas (December 1 to New Year's Day).
// SEASON POINTS (Cody, 2026-10-04, replacing "finish the day's tasks to open that day's door"): players earn points and the
// season is a TRACK OF 30 DOORS, one every 300 points, each showing its free prize and its pass prize.
//   Points each game day (9 PM to 9 PM Indiana time, gameclock.js), at most 700:
//     5 daily tasks, 100 each: "Log in" and "Play 2 Auto matches" every day, plus 3 that rotate;
//     each of the day's first 10 public Auto matches: +10, and +10 more for a top-3 finish in it.
//   ONE PRIZE A DOOR FOR EVERYONE, mixed (Cody, 2026-10-04: "1 main reward for everyone mixed"; fewer level ticks, "giving all
//     those free level ticks they max level quick"): 5 season looks, 2 cheap special gear items (door 15, halfway, and door 30),
//     8 level ticks (one step of level progress, like a top-3 finish: "+1 level tick", never a whole level) and a ranked ticket
//     on the other 15 doors. Season tickets go in their own bank with no cap (the 'buy at most 10' rule is unchanged).
//   The PASS ($2, paid in SANTA like a Store item; $5 until 2026-10-04): only the season's costume, one piece on 6 of the doors
//     ("the season bonus is the costume at certain doors"). Buying the pass late gives the pieces of every door already reached.
//   The CALENDAR stays (Cody: "keep both"): a day with all 5 tasks done is a perfect day; 7 perfect days in a row: +1 level tick.
// Matches count only in public Auto matches run by the match server (practice runs in the player's own browser and could be
// faked); "Log in" counts when the game server reads a signed-in player's season. This file is the ONE place the rules live: the
// page shows them, the server and database (supabase/039) apply them, tests/db/seasons-db.test.mjs checks they agree.
import { dayStart, nextReset } from './gameclock.js?v=9fcd4d2d68';
import { zonedTime, WEEKLY_ZONE } from './lottery.js?v=9fcd4d2d68';

const at9 = (y, m, d) => zonedTime(y, m, d, 21, WEEKLY_ZONE); // 9 PM Indiana on that date

export const PASS_PRICE = 2; // dollars, paid in SANTA (Cody, 2026-10-04: was $5; lowered to $2)
export const DOORS = 30, DOOR_POINTS = 300; // 30 doors, one every 300 points (9,000 to finish the track)
export const POINTS = { task: 100, match: 10, top3: 10, matchesPerDay: 10 }; // at most 5 × 100 + 10 × (10 + 10) = 700 a day
export const STREAK_EVERY = 7; // a bonus level tick every 7 perfect days in a row
// Everyone's prize on each door, the same shape every season (the looks' doors are each season's `free`): the 2 gear items,
// 8 level ticks and a ranked ticket on every other door (5 + 2 + 8 + 15 = 30). The pass: a costume piece on PIECE_DOORS.
export const GEAR_DOORS = [15, 30], TICK_DOORS = [3, 7, 11, 17, 21, 24, 27, 29], PIECE_DOORS = [2, 6, 10, 14, 18, 22];
export const SEASON_GEAR = ['gear_elfhat', 'gear_kevlar']; // the two cheapest special gear items ($0.50 each in the Store)
export const doorsFor = (points) => Math.min(DOORS, Math.floor((Number(points) || 0) / DOOR_POINTS));

// The seasons, back to back. start/end: the 9 PM Indiana moments the season opens and closes (end: the last day's reset).
// free: the season looks, by door number (the other doors: GEAR_DOORS, TICK_DOORS, else a ranked ticket). gold: the pass's costume
// pieces, in order (one on each of PIECE_DOORS).
export const SEASONS = [
  { id: 'halloween', name: 'Halloween', icon: '🎃', start: at9(2026, 9, 30), end: at9(2026, 10, 31), costume: 'Pumpkin King',
    free: { 2: 'snow_candycorn', 5: 'shirt_jackolantern', 9: 'pants_midnight', 14: 'snow_ghostly', 20: 'pants_pumpkin' },
    gold: ['face_pumpkinking', 'hat_pumpkinking', 'shirt_pumpkinking', 'pants_pumpkinking', 'pack_pumpkinking', 'snow_pumpkinking'] },
  // Thanksgiving (2026-10-03): 5 autumn looks free, and the pass's turkey costume, The Gobbler (catalog.js, supabase/035 + 036)
  { id: 'thanksgiving', name: 'Thanksgiving', icon: '🦃', start: at9(2026, 10, 31), end: at9(2026, 11, 30), costume: 'Gobbler',
    free: { 2: 'snow_cranberry', 5: 'shirt_pumpkinpie', 9: 'pants_harvestgold', 14: 'snow_mapleleaf', 20: 'shirt_cornhusk' },
    gold: ['face_gobbler', 'hat_gobbler', 'shirt_gobbler', 'pants_gobbler', 'pack_gobbler', 'snow_gobbler'] },
  // Christmas (2026-10-03): 5 festive looks free, and the pass's costume, Gingerbread (catalog.js, supabase/037 + 038)
  { id: 'christmas', name: 'Christmas', icon: '🎄', start: at9(2026, 11, 30), end: at9(2027, 1, 1), costume: 'Gingerbread',
    free: { 2: 'snow_candycane', 5: 'shirt_peppermint', 9: 'pants_evergreen', 14: 'snow_silverflake', 20: 'pants_hollyred' },
    gold: ['face_gingerbread', 'hat_gingerbread', 'shirt_gingerbread', 'pants_gingerbread', 'pack_gingerbread', 'snow_gingerbread'] },
];
export const seasonById = (id) => SEASONS.find((s) => s.id === id) || null;
// The season running at time t, or null (between seasons).
export const seasonAt = (t = Date.now()) => SEASONS.find((s) => t >= s.start && t < s.end) || null;

// A game day's name: the calendar date (Indiana) it mostly covers. 9 PM Oct 3 to 9 PM Oct 4 is "2026-10-04".
export function dayKey(t = Date.now()) {
  const mid = dayStart(t) + 12 * 3600e3;
  return new Intl.DateTimeFormat('en-CA', { timeZone: WEEKLY_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(mid));
}
export const dayEnds = (t = Date.now()) => nextReset(t);
// Every game day of a season, in order (the calendar's doors).
export function seasonDays(s) {
  const out = []; for (let t = s.start + 1000; t < s.end; t = nextReset(t) + 1000) out.push(dayKey(t));
  return out;
}

// THE TASKS. stat: the count it reads (the match server's per-player counts, sim.js tally; games, top3 and wins from the finish;
// login from the game server when a signed-in player's season is read).
export const TASKS = {
  login: { stat: 'login', need: 1, text: 'Log in' },
  games: { stat: 'games', need: 2, text: 'Play 2 Auto matches' },
  wins: { stat: 'wins', need: 1, text: 'Win an Auto match (finish 1st)' }, // (Cody, 2026-10-04: "make up another")
  top3: { stat: 'top3', need: 1, text: 'Finish top 3 in an Auto match' },
  hits: { stat: 'hits', need: 10, text: 'Hit 10 players with snowballs' },
  hatSec: { stat: 'hatSec', need: 15, text: 'Wear the Santa hat for 15 seconds' },
  steals: { stat: 'steals', need: 1, text: 'Knock the hat off someone' },
  catches: { stat: 'catches', need: 1, text: 'Catch the flying hat on your head' },
  specials: { stat: 'specials', need: 3, text: 'Throw 3 special snowballs' },
};
export const STATS = ['login', 'games', 'top3', 'wins', 'hits', 'hatSec', 'steals', 'catches', 'specials'];
export const TASKS_PER_DAY = 5;
// The day's 5 tasks: the same for everyone that day (picked from the day's name, so the page and the server agree). "Log in" and
// "Play 2 Auto matches" every day; 3 of the other 7 rotate.
export function tasksFor(day) {
  let h = 2166136261; for (const c of String(day)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const pool = ['top3', 'wins', 'hits', 'hatSec', 'steals', 'catches', 'specials'], picked = [];
  for (let k = 0; k < 3; k++) { const i = h % pool.length; picked.push(pool.splice(i, 1)[0]); h = Math.imul(h ^ (h >>> 13), 1103515245) >>> 0; }
  return ['login', 'games', ...picked].map((id) => ({ id, ...TASKS[id] }));
}
export const taskDone = (task, stats) => (Number(stats?.[task.stat]) || 0) >= task.need;
export const dayDone = (day, stats) => tasksFor(day).every((t) => taskDone(t, stats));

// A day's points (the database's season_record works it out the same way; seasons-db.test checks): tasksDone of the day's
// tasks, and of the day's first 10 Auto matches how many were played and how many finished top 3.
export const dayPoints = ({ tasksDone = 0, matches = 0, top3 = 0 }) => Math.min(TASKS_PER_DAY, tasksDone) * POINTS.task
  + Math.min(POINTS.matchesPerDay, matches) * POINTS.match + Math.min(POINTS.matchesPerDay, matches, top3) * POINTS.top3;

// What door n (1–30) gives. freeReward: everyone's prize, { kind: 'item', item } (a look or gear), { kind: 'xp', n: 1 } (a level
// tick) or { kind: 'tickets', n: 1 } (a ranked ticket, into the season bank). goldReward: the pass's costume piece, or null.
export function freeReward(s, door) {
  if (s.free[door]) return { kind: 'item', item: s.free[door] };
  const g = GEAR_DOORS.indexOf(door);
  if (g >= 0) return { kind: 'item', item: SEASON_GEAR[g], gear: true };
  if (TICK_DOORS.includes(door)) return { kind: 'xp', n: 1 };
  return door >= 1 && door <= DOORS ? { kind: 'tickets', n: 1 } : null;
}
export function goldReward(s, door) { const p = PIECE_DOORS.indexOf(door); return p >= 0 && s.gold[p] ? { kind: 'item', item: s.gold[p] } : null; }
// The current streak of perfect days (all 5 tasks) at the end of a list of perfect days, plus the season's day list.
export function streakOf(doneDays, allDays, upTo) {
  const done = new Set(doneDays); let n = 0;
  for (let i = allDays.indexOf(upTo); i >= 0 && done.has(allDays[i]); i--) n++;
  return n;
}
