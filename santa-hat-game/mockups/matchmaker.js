// Ranked Auto match: who plays whom. Pure logic (no network); runs on the server with the referee, so players can't pick
// opponents or fake points. Rules (Cody, DESIGN_NOTES → Auto match): similar rank points first, then wider, then any real
// players, then bots at 30 seconds. At least 2 real players, 1–3 bots, 3–8 players in all.
// Search width by how long the longest-waiting player has waited (proposal in DESIGN_NOTES, open question 1):
//   0–10 s: ±50 points · 10–20 s: ±150 · 20 s+: any real player. At 30 s the match starts with bots.
// Bots: fill toward 6 players, always 1–3 (Claude's pick; 2 real → 3 bots, 5 real → 1 bot, 7 real → 1 bot).
export const RULES = { windows: [[10, 50], [20, 150]], botsAt: 30, minReal: 2, maxReal: 7, minBots: 1, maxBots: 3, fillTo: 6 };

export const widthAfter = (waited, R = RULES) => { for (const [s, w] of R.windows) if (waited < s) return w; return Infinity; };
export const botsFor = (real, R = RULES) => Math.max(R.minBots, Math.min(R.maxBots, R.fillTo - real));

// queue: [{ id, points, since (seconds) }]. Returns { matches: [{ players: [ids], bots }], queue: the rest }.
// A match starts as soon as 7 real players fit together (full room), or at 30 s with whoever fits (2+ real).
export function formMatches(queue, now, R = RULES) {
  const left = [...queue].sort((a, b) => a.since - b.since), matches = [];
  for (let i = 0; i < left.length; i++) {
    const anchor = left[i], waited = now - anchor.since, width = widthAfter(waited, R);
    const fit = left.filter((p) => Math.abs(p.points - anchor.points) <= width)
      .sort((a, b) => Math.abs(a.points - anchor.points) - Math.abs(b.points - anchor.points) || a.since - b.since).slice(0, R.maxReal);
    if (!fit.includes(anchor)) fit.unshift(anchor);
    const ready = fit.length >= R.maxReal || (waited >= R.botsAt && fit.length >= R.minReal);
    if (!ready) continue;
    matches.push({ players: fit.map((p) => p.id), bots: botsFor(fit.length, R) });
    for (const p of fit) left.splice(left.indexOf(p), 1);
    i = -1; // start over with who's left
  }
  return { matches, queue: left };
}
