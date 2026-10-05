// The referee's per-player lookups and timings, shared by the page's referee (online.js) and the server referee
// (server/referee.mjs), so the two can never run different rules. Pure logic: no page, no network.
import { SLOTS, BY_ID, cleanAvatar, ballRules, specialsIn } from './catalog.js?v=26d67242a9';
import { levelInfo, clampLevel } from './levels.js?v=26d67242a9';
import { gearIn } from './gear.js?v=26d67242a9';

// Free-plan budget is 100 messages/second and every receiver counts, so fuller rooms send snapshots less often.
export const snapMs = (humans) => (humans <= 4 ? 125 : humans <= 6 ? 170 : 220);
// An Auto match room starts by itself: 15 seconds after 2+ real players are in, or 25 seconds with just 1 (bots fill in).
export const autoStartMs = (humans) => (humans >= 2 ? 15000 : 25000);
// Public rooms: Auto match FFA/TEAM PF1–PF5 / PT1–PT5, and ranked PR1–PR99 (made by the referee server's matching)
// Auto match rooms carry their style (Cody, 2026-10-02): PFN1 / PTN1 normal play (plain snowballs, no special snowballs or
// gear: the referee strips them), PFG1 / PTG1 special gear (everything a player owns counts). The older PF1–PF5 / PT1–PT5 count
// as special gear.
// Ranked rooms PR[N|G]1-99 have the same style letter (Cody 2026-10-02); PR1-99 with no letter is an older gear room.
// TEAM PLAY PAUSED (Cody, 2026-10-03): no Nice vs Naughty anywhere (Auto match, private rooms, the match server). Set false to bring it back.
export const TEAM_PAUSED = true;
export const modeAllowed = (m) => m === 'ffa' || (m === 'team' && !TEAM_PAUSED);
// PW[N|G]1-5: this week's mode (weekly.js; Cody 2026-10-03), public Auto match rooms like PF, played as Free-for-all
// PUBLIC_ROOMS of each kind (was 5: 40 Free-for-all seats, so the 41st player pressing Auto match at once was turned away; the
// 50-player simulation found it, 2026-10-04). The match server allows 200 rooms in all (server/referee.js MAX_ROOMS).
export const PUBLIC_ROOMS = 30;
export const isPublic = (c) => /^P(?:[FTW][NG]?(?:[1-9]|[12]\d|30)|R[NG]?[1-9]\d?)$/.test(c);
export const isWeekly = (c) => isPublic(c) && c[1] === 'W';
export const styleOf = (c) => (isPublic(c) && c[2] === 'N' ? 'normal' : 'gear');

// Bots look and sound like players so nobody can pick them out and farm them.
export const BOT_NAMES = ['frostbyte', 'Kaylee_x', 'mikey2012', 'NoScopeNate', 'ghostpepper', 'jollyroger7', 'TannerB', 'lil_snowcone',
  'Ricky.D', 'sn0wday', 'Brooke_22', 'pinecone_pete', 'Icicle', 'BigTay', 'zoe.plays', 'Marcus_77', 'hat_hunter', 'tobiasz',
  'coco.bean', 'SleighDrip', 'justjess', 'DannyDoes', 'yeti_mode', 'Bexxie', 'owen_s', 'crumbsy', 'LunaLux', 'Mr_Mittens',
  'jayjay41', 'nikki.k', 'Frosty_Fin', 'ThatGuyAl', 'kringle', 'Wiggs', 'ellie_b', 'soup_dog', 'TreyTheGreat', 'maple_mo',
  'Gus_G', 'aurora.b', 'Sam_Plays', 'dustin_t', 'mochi', 'Rae', 'krispy_k', 'BenjiBoo', 'noodle_arms', 'Quinn.Z'];
export const botHash = (id) => { let h = (id * 2654435761) >>> 0; h ^= h >>> 15; return Math.imul(h, 2246822519) >>> 0; };
export const botName = (id) => BOT_NAMES[botHash(id) % BOT_NAMES.length];
const botAvatars = new Map();
// Bots look like players (a look picked from their id, same on every screen) so nobody can pick them out and farm them.
// Never a costume piece (catalog.js `set`): the costumes are the level 5 and 10 rewards, and leaving them out keeps every
// bot's look exactly what it was before they were added. Never a season-pass item either (catalog.js `season`: a reward).
export function botAvatar(id) {
  if (!botAvatars.has(id)) {
    let h = botHash(id + 7); const a = {};
    for (const s of SLOTS) { const opts = [...BY_ID.values()].filter((i) => i.slot === s && !i.set && !i.season && !(s === 'face' && i.face === 'beard')); a[s] = opts[h % opts.length].id; h = Math.imul(h ^ (h >>> 13), 1103515245) >>> 0; }
    botAvatars.set(id, a);
  }
  return botAvatars.get(id);
}

// infoOf(e) → { a: look, l: level } of a human entity (what that player announced; the server referee may check it first).
// Returns the createSim options: snowball rules, starting snowballs (level), special snowballs, level, gear.
// personaOf(e) → the HOUSE BOT a bot entity is playing as ({ n, a, l }: name, look, level; server/referee.js assigns them, Cody
// 2026-10-05), or nothing: then the old look from its id. Only the look changes: a bot always PLAYS as level 1 with no gear.
export function refereeOpts(infoOf, personaOf = () => null) {
  const avatarOf = (e) => (e.bot ? (personaOf(e)?.a ? cleanAvatar(personaOf(e).a) : botAvatar(e.id)) : cleanAvatar(infoOf(e)?.a));
  const levelOf = (e) => (e.bot ? 1 : clampLevel(infoOf(e)?.l));
  return {
    avatarOf,
    levelOf,
    rulesOf: (e) => ballRules(avatarOf(e)),
    startOf: (e) => levelInfo(levelOf(e)).start,
    specialsOf: (e) => (e.bot ? [] : specialsIn(avatarOf(e), levelOf(e), levelInfo(levelOf(e)).sb)),
    gearOf: (e) => (e.bot ? [] : gearIn(avatarOf(e), levelOf(e))),
  };
}
