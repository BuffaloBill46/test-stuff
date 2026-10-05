// HOUSE BOTS' OWN MATCHES (Cody, 2026-10-05: "add 15-20 bots on the Leaderboard, start at level 1 and have them simulate 10 games
// against each other to get points, levels"; "bot matches only use 4-5 players"). Each match is a REAL match run by the game's own
// match code (mockups/sim.js), 4 or 5 house bots, nobody else. Its places, snowballs thrown and hits are recorded for each bot's
// account exactly as the match server records a real match (levels.finishByReferee: games played, top-3, level ticks, season),
// and its ranked points as a ranked match would give them (mockups/ranked.js settleRanked: 2 points a level each, 60/20/20).
// No money anywhere. db: { query }; levels: createLevels({ db }); rand: [0,1) numbers (tests pass a seeded one).
import { createSim, aimOf } from '../mockups/sim.js';
import { settleRanked } from '../mockups/ranked.js';

export async function houseBots(db) {
  return (await db.query('select * from public.house_bots()')).map((r) => ({ id: r.id, name: r.name, level: +r.level, points: +r.rank_points }));
}

// One match among `bots` (4-5 of them): returns { id, places: [{ id, name, score, thrown, hits, change }] } in finishing order.
// allIds: every house bot's id (each bot's own aim, sim.js aimOf, is spread over all of them)
export async function playHouseMatch({ db, levels, bots, allIds = bots.map((b) => b.id), rand = Math.random }) {
  if (!(bots.length >= 4 && bots.length <= 5)) throw new Error('a house match has 4 or 5 bots');
  const sim = createSim(rand);
  sim.syncRoster([]); sim.S.wantBots = bots.length; sim.startMatch('ffa');
  const ents = sim.S.ents.filter((e) => e.bot);
  if (ents.length !== bots.length) throw new Error(`the match made ${ents.length} bots, not ${bots.length}`);
  const who = new Map(ents.map((e, i) => { e.hb = true; e.shot = aimOf(bots[i].id, allIds); return [e.id, bots[i]]; })); // each body is one house bot account
  for (let i = 0; i < 30 * 180 && sim.S.phase !== 'end'; i++) sim.step(1 / 30);
  if (sim.S.phase !== 'end') throw new Error('the match did not finish');
  const order = [...ents].sort((a, b) => b.score - a.score), mid = 'hb-' + sim.S.mid;
  const { points } = settleRanked(order.map((e) => ({ id: who.get(e.id).id, score: e.score, level: who.get(e.id).level })));
  const places = order.map((e) => ({ id: who.get(e.id).id, name: who.get(e.id).name, score: e.score, thrown: e.st?.thrown || 0, hits: e.st?.hits || 0, change: points[who.get(e.id).id] }));
  await levels.finishByReferee({ id: mid, auto: true, places: places.map((p) => p.id), stats: places.map((p) => ({ thrown: p.thrown, hits: p.hits })) });
  for (const p of places) await db.query('select public.record_ranked_result($1, $2, $3)', [mid, p.id, p.change]);
  return { id: mid, places };
}

// `rounds` matches for every bot: each match takes the 4-5 bots that have played the fewest so far (random among ties), so
// everyone ends with the same number of games, give or take one.
export async function playRounds({ db, levels, rounds = 10, rand = Math.random, log = () => {} }) {
  const all = await houseBots(db), played = new Map(all.map((b) => [b.id, 0])), out = [];
  if (all.length < 4) throw new Error('fewer than 4 house bots');
  while (Math.min(...played.values()) < rounds) {
    const size = rand() < 0.5 ? 4 : 5;
    const pick = [...all].sort((a, b) => played.get(a.id) - played.get(b.id) || rand() - 0.5).slice(0, size);
    const fresh = await houseBots(db), lv = new Map(fresh.map((b) => [b.id, b.level])); // levels grow between matches
    const m = await playHouseMatch({ db, levels, rand, allIds: all.map((b) => b.id), bots: pick.map((b) => ({ ...b, level: lv.get(b.id) || 1 })) });
    for (const b of pick) played.set(b.id, played.get(b.id) + 1);
    out.push(m); log(m);
  }
  return out;
}
