// The referee's per-player lookups and timings, shared by the page's referee (online.js) and the server referee
// (server/referee.mjs), so the two can never run different rules. Pure logic: no page, no network.
import { SLOTS, BY_ID, cleanAvatar, ballRules, specialsIn } from './catalog.js';
import { levelInfo, clampLevel } from './levels.js';
import { gearIn } from './gear.js';

// Free-plan budget is 100 messages/second and every receiver counts, so fuller rooms send snapshots less often.
export const snapMs = (humans) => (humans <= 4 ? 125 : humans <= 6 ? 170 : 220);
// An Auto match room starts by itself: 15 seconds after 2+ real players are in, or 25 seconds with just 1 (bots fill in).
export const autoStartMs = (humans) => (humans >= 2 ? 15000 : 25000);
// Public rooms: Auto match FFA/TEAM PF1–PF5 / PT1–PT5, and ranked PR1–PR99 (made by the referee server's matching)
export const isPublic = (c) => /^P(?:[FT][1-5]|R[1-9]\d?)$/.test(c);

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
export function botAvatar(id) {
  if (!botAvatars.has(id)) {
    let h = botHash(id + 7); const a = {};
    for (const s of SLOTS) { const opts = [...BY_ID.values()].filter((i) => i.slot === s && !(s === 'face' && i.face === 'beard')); a[s] = opts[h % opts.length].id; h = Math.imul(h ^ (h >>> 13), 1103515245) >>> 0; }
    botAvatars.set(id, a);
  }
  return botAvatars.get(id);
}

// infoOf(e) → { a: look, l: level } of a human entity (what that player announced; the server referee may check it first).
// Returns the createSim options: snowball rules, starting snowballs (level), special snowballs, level, gear.
export function refereeOpts(infoOf) {
  const avatarOf = (e) => (e.bot ? botAvatar(e.id) : cleanAvatar(infoOf(e)?.a));
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
