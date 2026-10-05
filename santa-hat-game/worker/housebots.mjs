// HOUSE BOTS' OWN MATCHES on the Droplet (Cody 2026-10-05: "simulate 10 games against each other"; server/housebots.js): real
// simulated matches of 4-5 house bots, recorded to their accounts through the match server's limited database login.
// Run: cd /opt/santa/repo/santa-hat-game/worker && set -a && . /etc/santa/referee.env && set +a && node housebots.mjs [rounds=10]
// Prints each match (names, places, points) and the board after. Touches no money.
import postgres from 'postgres';
import { JSONB } from './pgjson.mjs';
import { createLevels } from '../server/levels.js';
import { houseBots, playRounds } from '../server/housebots.js';

if (!process.env.DATABASE_URL) throw new Error('load /etc/santa/referee.env first');
const rounds = Math.max(1, Math.min(50, Number(process.argv[2]) || 10));
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, ...JSONB });
const db = { query: (q, p = []) => sql.unsafe(q, p) };
const ms = await playRounds({ db, levels: createLevels({ db }), rounds,
  log: (m) => console.log(m.id, m.places.map((p, i) => `${i + 1}.${p.name}(${p.change >= 0 ? '+' : ''}${p.change})`).join(' ')) });
console.log(`\n${ms.length} matches played. The house bots now:`);
for (const b of (await houseBots(db)).sort((a, b) => b.points - a.points)) console.log(`  ${b.name.padEnd(14)} level ${b.level}  ${b.points} pts`);
await sql.end();
