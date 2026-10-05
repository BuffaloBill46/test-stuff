// THE MONEY STRIP (Cody, 2026-10-03): at the top of the Store and Games pages, where a player's SANTA goes, so nobody has to
// guess. The shares come from the rules files (the same numbers the server charges and checks); the live numbers from the
// game server: SANTA burned so far ('burned', server/games.js) and, on Games, the Game pool and its jackpots (games.js fills
// those as the pool moves). A number that can't be read shows "—", never a guess.
import { call } from './gameserver.js?v=aaeb88d212';
import { SHOP_BURN_BPS } from './shoprules.js?v=aaeb88d212';
import { BURN_BPS as LOTTERY_BURN_BPS } from './lottery.js?v=aaeb88d212';
import { GAME_BURN_BPS } from './credits.js?v=aaeb88d212';

const $ = (s) => document.querySelector(s);
const pct = (bps) => +(bps / 100).toFixed(2) + '%';
export const SHARES = { games: { burn: pct(GAME_BURN_BPS), rest: pct(10000 - GAME_BURN_BPS) }, store: { burn: pct(SHOP_BURN_BPS), rest: pct(10000 - SHOP_BURN_BPS) },
  lottery: { burn: pct(LOTTERY_BURN_BPS), rest: pct(10000 - LOTTERY_BURN_BPS) } };
// whole SANTA, short: 1,234 · 56.7K · 8.90M
export function santa(raw) {
  const n = raw / 1e6;
  return n >= 1e6 ? +(n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? +(n / 1e3).toFixed(1) + 'K' : Math.round(n).toLocaleString();
}

let kept = null, at = 0;
export async function refreshBurned() {
  if (!kept || Date.now() - at > 60_000) {
    const r = await call('burned').catch(() => null);
    if (r && Number.isFinite(r.totalRaw)) { kept = r; at = Date.now(); }
  }
  for (const el of document.querySelectorAll('[data-burned]')) el.textContent = kept ? santa(kept.totalRaw) + ' SANTA' : '—';
  return kept;
}

// Fill the shares (from the rules) once; the live numbers on every call.
export function initMoneyStrips() {
  for (const el of document.querySelectorAll('[data-share]')) { const [k, part] = el.dataset.share.split('.'); el.textContent = SHARES[k]?.[part] ?? '—'; }
  refreshBurned();
}
