// WEEKLY MODES (Cody, 2026-10-03: all four, and they count for levels and the daily tasks like any public match). One mode a
// game week (the week starts like the lottery's: gameclock weekStart), in this order, round and round. A weekly game is a
// public Auto match room of its own kind (room codes PW…: refcore isPublic), so plain Free-for-all is always there too.
// This file is the ONE place the modes' rules live: sim.js plays them, the match server and the page read them.
import { weekStart } from './gameclock.js?v=f4ba83e65c';

export const VARIANTS = {
  // the hat scores double, but it melts the wearer's snowballs: one every MELT_EVERY seconds worn (never below 0)
  hothat: { name: 'Hot Hat', short: 'The hat scores double, but it melts your snowballs.', hatMult: 2, meltEvery: 2 },
  // the ring round the gazebo (ZONE_IN to ZONE_OUT from the middle): ZONE_PTS a second, only while you're the ONLY one in it
  gazebo: { name: 'King of the Gazebo', short: 'Stand alone in the ring round the gazebo to score. Share it and nobody does.', zoneIn: 1.45, zoneOut: 3.4, zonePts: 5 },
  // snowballs refill twice as fast; the storm cuts how far you can see (the page draws it)
  blizzard: { name: 'Blizzard', short: 'A snowstorm: you see less, and snowballs refill twice as fast.', refillMult: 2 },
  // three hats on the field at once (sim.js plays HATS of them)
  hathunt: { name: 'Hat Hunt', short: 'Three hats at once. Every hat on a head scores.', hats: 3 },
};
// Only modes that are BUILT go in the rotation (Hat Hunt joined 2026-10-03, once sim.js and the page played three hats).
export const ROTATION = ['hothat', 'gazebo', 'blizzard', 'hathunt'];
export const VARIANT_IDS = Object.keys(VARIANTS); // snapshot numbers: 0 = none, 1.. = this order (never reorder; add at the end)
const WEEK_MS = 7 * 86400e3, EPOCH = Date.UTC(2026, 9, 4); // the rotation's first week: the game week holding Oct 4 2026

// This week's mode id at time t, taking turns among the modes Cody has switched ON (supabase/034; the admin screen) that are
// built (ROTATION). on: those ids. None on → null: no weekly mode this week (plain Free-for-all only).
export function weeklyAt(t = Date.now(), on = []) {
  const live = ROTATION.filter((id) => on.includes(id)); if (!live.length) return null;
  const n = Math.floor((weekStart(t) - weekStart(EPOCH)) / WEEK_MS + 0.5);
  return live[((n % live.length) + live.length) % live.length];
}
export const variantOf = (id) => VARIANTS[id] || null;
