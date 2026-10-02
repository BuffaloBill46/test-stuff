// Ranked match points: the rules written on the Play page (Cody), as code. Pure logic; runs on the server's referee later.
//   Every player adds 10 points to the pot, bots included. 3 or fewer players: 1st takes the whole pot.
//   4 or more: 1st 60%, 2nd 20%, 3rd 20%. Bots can take paid places (their share just isn't paid to anyone). Not placing: −5.
// Claude's picks where the text is silent (DESIGN_NOTES → Ranked points): the pot is created by the match (not taken from
// players, or not placing would cost 10, not 5); tied players split the places they share (whole points, leftovers to the
// earlier place); a player's rank points never go below 0.
// Ranked tickets a player can have at once (Cody 2026-10-02): 25 = the 10 free a day + up to 10 BOUGHT ("I don't want people
// being able to buy 15") + up to 5 GIVEN away by Cody (giveaways: not built yet). supabase/022 enforces the bought cap.
export const TICKET_MAX = 25, FREE_DAILY = 10, BOUGHT_MAX = 10, GIFT_MAX = 5;
export const RULES = { perPlayer: 10, notPlacing: -5, split3: [1], split4: [0.6, 0.2, 0.2] };

// players: [{ id, bot, score }] → { pot, prizes: [..by place], points: { id: change } } for real players only.
export function settleRanked(players, R = RULES) {
  const n = players.length, pot = n * R.perPlayer, shares = n <= 3 ? R.split3 : R.split4;
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
