// The 15-minute launch watch's log, on Cody's PC (Cody 2026-10-05; the scheduled task santa-launch-watch). One pre-approved
// command for both of the watch's local steps, so it never stops to ask for permission:
//   node C:/test-stuff/santa-hat-game/worker/watchlog.mjs            → prints today's local date (YYYY-MM-DD) and time
//   node C:/test-stuff/santa-hat-game/worker/watchlog.mjs "<text>"   → appends "<HH:MM> <text>" to out/watch/<YYYY-MM-DD>.log
// Writes only inside out/watch; the text is one line, at most 300 characters.
import { appendFileSync, mkdirSync } from 'node:fs';

const now = new Date(), pad = (n) => String(n).padStart(2, '0');
const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
const text = process.argv.slice(2).join(' ').replace(/[\r\n]+/g, ' ').trim().slice(0, 300);
if (!text) { console.log(`${day} ${hm}`); process.exit(0); }
const dir = new URL('../out/watch/', import.meta.url);
mkdirSync(dir, { recursive: true });
appendFileSync(new URL(`${day}.log`, dir), `${hm} ${text}\n`);
console.log(`logged: ${hm} ${text}`);
