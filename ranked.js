// Ranked match points: the rules written on the Play page (Cody), as code. Pure logic; runs on the server's referee later.
//   Every player adds 2 points PER LEVEL to the pot (level 1 = 2 … level 10 = 20), a bot adds 5 (Cody 2026-10-04, to-do #14: was 10
//   each; "if a low level is playing higher levels they get rewarded better and vice versa"). 3 or fewer players: 1st takes the pot.
//   4 or more: 1st 60%, 2nd 20%, 3rd 20%. Bots can take paid places (their share just isn't paid to anyone). Not placing: −5.
// Claude's picks where the text is silent (DESIGN_NOTES → Ranked points): the pot is created by the match (not taken from
// players, or not placing would cost 10, not 5); tied players split the places they share (whole points, leftovers to the
// earlier place); a player's rank points never go below 0.
// Ranked tickets a player can have at once (Cody 2026-10-02): 25 = the 10 free a day + up to 10 BOUGHT ("I don't want people
// being able to buy 15") + up to 5 GIVEN away by Cody (giveaways: not built yet). supabase/022 enforces the bought cap.
import { clampLevel } from './levels.js?v=2d3bd4b23e';
export const TICKET_MAX = 25, FREE_DAILY = 10, BOUGHT_MAX = 10, GIFT_MAX = 5;
export const RULES = { perLevel: 2, perBot: 5, notPlacing: -5, split3: [1], split4: [0.6, 0.2, 0.2] };
// what one player puts in the pot: 2 × their level (the level the SERVER read from the database), a bot 5
export const stake = (p, R = RULES) => (p.bot ? R.perBot : R.perLevel * clampLevel(p.level));

// players: [{ id, bot, score, level }] → { pot, prizes: [..by place], points: { id: change } } for real players only.
// Largest possible change: 8 players at level 10 → pot 160, 1st 96 (the database allows up to 100 a match, supabase/018).
export function settleRanked(players, R = RULES) {
  const n = players.length, pot = players.reduce((t, p) => t + stake(p, R), 0), shares = n <= 3 ? R.split3 : R.split4;
  const prizes = shares.map((s) => Math.floor(pot * s)); prizes[0] += pot - prizes.reduce((a, b) => a + b, 0); // leftovers to 1st
  const sorted = [...players].sort((a, b) => b.score - a.score), won = new Map();
  for (let i = 0; i < sorted.length && i < prizes.length;) {
    const tied = sorted.filter((p) => p.score === sorted[i].score);         // everyone on this score shares these places
    const places = prizes.slice(i, i + tied.length), total = places.reduce((a, b) => a + b, 0);
    const each = Math.floor(total / tied.length); let left = total - each * tied.length;
    tied.forEach((p) => { won.set(p.id, each + (left-- > 0 ? 1 : 0)); });
    i += tied.length;
  }
  const points = {};
  for (const p of players) if (!p.bot) points[p.id] = won.has(p.id) ? won.get(p.id) : R.notPlacing;
  return { pot, prizes, points, placed: [...won.keys()] };
}
export const applyPoints = (current, change) => Math.max(0, current + change);
