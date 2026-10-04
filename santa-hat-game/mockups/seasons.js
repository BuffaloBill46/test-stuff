// SEASONS (Cody, 2026-10-03): Halloween (to October 31), Thanksgiving (November), Christmas (December 1 to New Year's Day).
// Each season is a calendar of DOORS. Every game day (9 PM to 9 PM Indiana time, gameclock.js) has 3 daily tasks; finishing
// all 3 opens that day's door.
//   FREE track (everyone): every door gives something: a season look on some doors, one step of level progress on the others
//     (counted like a top-3 finish), plus a bonus step every 7 days in a row (the streak).
//   GOLD track (the $5 season pass, paid in SANTA like a Store item): the season's costume, one piece every 3 doors, until
//     the whole outfit is owned. Buying the pass late still counts the doors already opened. Earned pieces are kept forever.
// Tasks count only in public Auto matches run by the match server (practice runs in the player's own browser and could be
// faked). This file is the ONE place the rules live: the page shows them, the server and database apply them.
import { dayStart, nextReset } from './gameclock.js';
import { zonedTime, WEEKLY_ZONE } from './lottery.js';

const at9 = (y, m, d) => zonedTime(y, m, d, 21, WEEKLY_ZONE); // 9 PM Indiana on that date

export const PASS_PRICE = 5; // dollars, paid in SANTA (Cody)
export const PIECE_EVERY = 3; // a costume piece every 3 doors (6 pieces: door 18 completes the outfit)
export const STREAK_EVERY = 7; // a streak bonus every 7 days in a row
// a free door with no look, and each streak bonus: one step of level progress (supabase/033 season_xp)

// The seasons, back to back. start/end: the 9 PM Indiana moments the season opens and closes (end: the last day's reset).
// free: the free-track looks, by door number (other doors give a step of level progress). gold: the costume pieces, in order.
export const SEASONS = [
  { id: 'halloween', name: 'Halloween', icon: '🎃', start: at9(2026, 9, 30), end: at9(2026, 10, 31), costume: 'Pumpkin King',
    free: { 2: 'snow_candycorn', 5: 'shirt_jackolantern', 9: 'pants_midnight', 14: 'snow_ghostly', 20: 'pants_pumpkin' },
    gold: ['face_pumpkinking', 'hat_pumpkinking', 'shirt_pumpkinking', 'pants_pumpkinking', 'pack_pumpkinking', 'snow_pumpkinking'] },
  // Thanksgiving (2026-10-03): 5 autumn looks free, and the pass's turkey costume, The Gobbler (catalog.js, supabase/035 + 036)
  { id: 'thanksgiving', name: 'Thanksgiving', icon: '🦃', start: at9(2026, 10, 31), end: at9(2026, 11, 30), costume: 'Gobbler',
    free: { 2: 'snow_cranberry', 5: 'shirt_pumpkinpie', 9: 'pants_harvestgold', 14: 'snow_mapleleaf', 20: 'shirt_cornhusk' },
    gold: ['face_gobbler', 'hat_gobbler', 'shirt_gobbler', 'pants_gobbler', 'pack_gobbler', 'snow_gobbler'] },
  { id: 'christmas', name: 'Christmas', icon: '🎄', start: at9(2026, 11, 30), end: at9(2027, 1, 1), costume: null, free: {}, gold: [] },
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

// THE TASKS. stat: the match count it reads (the match server's per-player counts, sim.js tally; games and top3 from the finish).
export const TASKS = {
  games: { stat: 'games', need: 2, text: 'Play 2 Auto matches' },
  top3: { stat: 'top3', need: 1, text: 'Finish top 3 in an Auto match' },
  hits: { stat: 'hits', need: 10, text: 'Hit 10 players with snowballs' },
  hatSec: { stat: 'hatSec', need: 15, text: 'Wear the Santa hat for 15 seconds' },
  steals: { stat: 'steals', need: 1, text: 'Knock the hat off someone' },
  catches: { stat: 'catches', need: 1, text: 'Catch the flying hat on your head' },
  specials: { stat: 'specials', need: 3, text: 'Throw 3 special snowballs' },
};
export const STATS = ['games', 'top3', 'hits', 'hatSec', 'steals', 'catches', 'specials'];
// The day's 3 tasks: the same for everyone that day (picked from the day's name, so the page and the server agree). The first
// is always "play 2 Auto matches"; the other two vary. Throwing specials needs a special snowball, so it's never the only hard one.
export function tasksFor(day) {
  let h = 2166136261; for (const c of String(day)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const pool = ['top3', 'hits', 'hatSec', 'steals', 'catches', 'specials'];
  const a = pool[h % pool.length], rest = pool.filter((k) => k !== a), b = rest[(h >>> 8) % rest.length];
  return ['games', a, b].map((id) => ({ id, ...TASKS[id] }));
}
export const taskDone = (task, stats) => (Number(stats?.[task.stat]) || 0) >= task.need;
export const dayDone = (day, stats) => tasksFor(day).every((t) => taskDone(t, stats));

// What door n gives on each track: 'item' (a look id), or 'xp' (a step of level progress).
export function freeReward(s, door) { const item = s.free[door]; return item ? { kind: 'item', item } : { kind: 'xp', n: 1 }; }
export function goldReward(s, door) { const k = door / PIECE_EVERY; return Number.isInteger(k) && k >= 1 && k <= s.gold.length ? { kind: 'item', item: s.gold[k - 1] } : null; }
// The current streak at the end of a list of done days (sorted keys of every day with its door open, plus the day list).
export function streakOf(doneDays, allDays, upTo) {
  const done = new Set(doneDays); let n = 0;
  for (let i = allDays.indexOf(upTo); i >= 0 && done.has(allDays[i]); i--) n++;
  return n;
}
