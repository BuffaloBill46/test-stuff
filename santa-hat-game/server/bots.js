// SERVER: bot signals (TODO: "flag wallets pulling at perfectly regular intervals for hours; review before acting (a real
// grinder is fine)"). SIGNALS ONLY: nothing happens to a flagged player automatically. Cody looks on the admin screen
// (wallet-signed, private: a guess is never shown publicly) and decides. Pure: tested in tests/bots.test.mjs.
//
// What it measures: the player's REACTION TIME, from a run finishing (its last play settled, runs.paid_at) to that player
// asking for the next price (the next quote). Both moments are on our server, so the chain's confirmation time (a few seconds,
// different every payment, for bots too) doesn't blur it. A person reads the result, taps Play and confirms: ~1 s to a minute,
// different every time. A script on a timer reacts in almost the same time, every time.
//   clockwork       (strong) 30+ reactions nearly identical: spread (standard deviation ÷ average) under 15%.
//   instant         (strong) typical (median) reaction under 1 second: faster than reading a result and tapping twice.
//   no breaks       (weak)   4+ hours of runs without a 10-minute pause.
//   round the clock (weak)   played in 20 or more of the last 24 hours.
// Weak signals alone mean "worth a look": a dedicated human can trip them. A script that adds human-like randomness to its
// timing won't look like clockwork: these are signals, not proof, and the numbers are a first guess to tune on real play.

// The numbers, in one place (Claude's picks; Cody can change them).
export const BOT_RULES = { hours: 24, minRuns: 30, breakMinutes: 10, clockworkSpread: 0.15, instantSeconds: 1, noBreakHours: 4, roundTheClockHours: 20 };

// runs: [{ profile, name, wallet, quoteAt (ms), paidAt (ms or null: not finished) }]; now (ms). Flagged players, strongest first.
export function botSignals(runs, now, rules = BOT_RULES) {
  const from = now - rules.hours * 3600e3, by = new Map();
  for (const r of runs) { if (r.quoteAt < from || r.quoteAt > now) continue; if (!by.has(r.profile)) by.set(r.profile, []); by.get(r.profile).push(r); }
  const out = [];
  for (const [profile, list] of by) {
    if (list.length < rules.minRuns) continue;
    list.sort((a, b) => a.quoteAt - b.quoteAt);
    const brk = rules.breakMinutes * 60e3, reactions = [], sessions = [];
    let start = list[0].quoteAt;
    for (let i = 1; i < list.length; i++) {
      if (list[i].quoteAt - list[i - 1].quoteAt >= brk) { sessions.push(list[i - 1].quoteAt - start); start = list[i].quoteAt; continue; }
      const prev = list[i - 1].paidAt;
      if (prev != null && list[i].quoteAt >= prev) reactions.push(list[i].quoteAt - prev);
    }
    sessions.push(list.at(-1).quoteAt - start);
    const n = reactions.length, mean = n ? reactions.reduce((s, x) => s + x, 0) / n : 0;
    const enough = n >= rules.minRuns - 1;
    const spread = enough && mean > 0 ? Math.sqrt(reactions.reduce((s, x) => s + (x - mean) ** 2, 0) / n) / mean : null;
    const median = enough ? [...reactions].sort((a, b) => a - b)[Math.floor(n / 2)] : null;
    const longest = Math.max(...sessions) / 3600e3, hoursActive = new Set(list.map((r) => Math.min(rules.hours - 1, Math.floor((now - r.quoteAt) / 3600e3)))).size;
    const reasons = [];
    if (spread !== null && spread < rules.clockworkSpread) reasons.push({ signal: 'clockwork', strong: true, why: `${n} reactions all about ${(mean / 1000).toFixed(1)} s, spread only ${Math.round(spread * 100)}% (people are usually 40%+)` });
    if (median !== null && median < rules.instantSeconds * 1000) reasons.push({ signal: 'instant', strong: true, why: `typical reaction ${(median / 1000).toFixed(2)} s after a run ends (reading the result and tapping twice takes longer)` });
    if (longest >= rules.noBreakHours) reasons.push({ signal: 'no breaks', strong: false, why: `played ${longest.toFixed(1)} hours without a ${rules.breakMinutes}-minute pause` });
    if (hoursActive >= rules.roundTheClockHours) reasons.push({ signal: 'round the clock', strong: false, why: `active in ${hoursActive} of the last ${rules.hours} hours` });
    if (!reasons.length) continue;
    out.push({ profile, name: list[0].name, wallet: list[0].wallet, runs: list.length, medianReactionSeconds: median === null ? null : Math.round(median / 100) / 10,
      spread: spread === null ? null : Math.round(spread * 100) / 100, longestHours: Math.round(longest * 10) / 10, hoursActive, reasons });
  }
  const score = (f) => f.reasons.filter((r) => r.strong).length * 10 + f.reasons.length;
  return out.sort((a, b) => score(b) - score(a) || b.runs - a.runs);
}
