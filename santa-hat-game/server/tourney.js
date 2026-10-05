// TOURNAMENTS (Cody 2026-10-05; DESIGN_NOTES "TOURNAMENTS"): the bracket's pure rules, no sockets, no rooms (server/referee.js
// runs the games with these). A tournament is made by the admin wallet, gets a code, takes entries until its first game
// starts, then plays rounds of 90 s matches:
//   more than FINAL_MAX real players left: games of 4-6 real players, the top 2 REAL players of each go through;
//   FINAL_MAX or fewer: the final, one game, places 1-8 count.
// Bots only fill seats (the match code puts in at least 2, and enough for 4 bodies) and never go through.
// Ranked points: POT_PER_BODY for every player and bot in round 1, split among the final's top 8 by FINAL_SHARE.

export const MAX_ENTRANTS = 64, MIN_ENTRANTS = 2, FINAL_MAX = 8, GAME_MAX = 6, ADVANCE = 2;
export const ROUND_SECONDS = 90, COUNTDOWN_MS = 60_000, BREAK_MS = 20_000, JOIN_MS = 20_000;
export const POT_PER_BODY = 5, FINAL_SHARE = [30, 20, 14, 11, 9, 7, 5, 4]; // % of the pot for places 1-8
export const RULE_MODES = ['ffa', 'team'], RULE_STYLES = ['normal', 'gear'];

// A code people can read out and type: 5 characters with no 0/O or 1/I/L to mix up.
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makeCode(rand = Math.random, len = 5) { let c = ''; for (let i = 0; i < len; i++) c += LETTERS[Math.floor(rand() * LETTERS.length)]; return c; }
export const cleanTourCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

// The rules picked when the tournament is made (anything unknown falls back to FFA, special gear).
export function cleanRules(r = {}, modeAllowed = (m) => m === 'ffa') {
  const mode = RULE_MODES.includes(r.mode) && modeAllowed(r.mode) ? r.mode : 'ffa';
  const style = RULE_STYLES.includes(r.style) ? r.style : 'gear';
  return { mode, style };
}

// Shuffle (Fisher-Yates) with the given random numbers.
export function shuffle(list, rand = Math.random) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// The games of a round for these real players: { final, groups: [[id…]…] }. Over FINAL_MAX: as few games of at most GAME_MAX as
// will hold them, sizes as even as possible (so every game has 4-6: 9 → 5+4; 64 → 11 games of 5-6). FINAL_MAX or fewer: one final.
export function planRound(ids, rand = Math.random) {
  const order = shuffle(ids, rand);
  if (order.length <= FINAL_MAX) return { final: true, groups: [order] };
  const g = Math.ceil(order.length / GAME_MAX), groups = Array.from({ length: g }, () => []);
  order.forEach((id, i) => groups[i % g].push(id));
  return { final: false, groups };
}

// How many rounds a tournament of n real players takes (for "Round 1 of 3" before it's played).
export function roundsFor(n) { let r = 1; while (n > FINAL_MAX) { n = Math.ceil(n / GAME_MAX) * ADVANCE; r++; } return r; }

// Who goes through from one game: finish = the game's bodies in finishing order, each { id (a player's id or null for a bot),
// present (still in the game at the end) }. The top ADVANCE real players who were there at the end.
export function advancers(finish) { return finish.filter((x) => x.id && x.present).slice(0, ADVANCE).map((x) => x.id); }

// The pot's split over the final's finishing order (each { account: profile id or null }): whole points, places 1-8 by
// FINAL_SHARE (re-weighted when fewer than 8 played), what rounding leaves over goes to 1st. A place with no account (a plain bot
// with no house account) earns nothing. → { [account]: points }
export function potShares(pot, finish) {
  const places = finish.slice(0, FINAL_SHARE.length), w = FINAL_SHARE.slice(0, places.length), total = w.reduce((a, b) => a + b, 0) || 1;
  const pts = w.map((x) => Math.floor((pot * x) / total)); if (pts.length) pts[0] += pot - pts.reduce((a, b) => a + b, 0);
  const out = {};
  places.forEach((p, i) => { if (p.account && pts[i] > 0) out[p.account] = (out[p.account] || 0) + pts[i]; });
  return out;
}
