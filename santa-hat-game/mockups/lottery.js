// SANTA LOTTERY rules (Cody, 2026-10-01; DESIGN_NOTES → "Santa Lottery"). Pure: no network, no graphics. The server, the page
// and the "check this draw" panel all use these, so a draw can be re-checked by anyone from public facts.
//   Five lotteries: Daily 10¢ / Daily $1 (1 winner), Weekly 10¢ / Weekly $1 and Christmas $1 (top 3: 60 / 25 / 15).
//   Draws at 00:00 UTC; weekly on Sunday; Christmas once, at 00:00 UTC on December 24, 2026 (7 PM US Eastern on the 23rd).
//   Sales close 5 minutes before a draw. No ticket cap. 10% of each ticket is burned at purchase; the pot is what ARRIVED.
//   Each ticket is one equal chance; a wallet wins at most one place; places nobody can fill go to 1st.
//   The draw: sha256(secret | blockhash after sales close | the ticket list) → numbers → winning tickets (fair.js style).
export const LOTTERIES = {
  'daily-10': { name: 'Daily 10¢', ticket: 0.1, every: 'day', split: [100] },
  'daily-100': { name: 'Daily $1', ticket: 1, every: 'day', split: [100] },
  'weekly-10': { name: 'Weekly 10¢', ticket: 0.1, every: 'week', split: [60, 25, 15] },
  'weekly-100': { name: 'Weekly $1', ticket: 1, every: 'week', split: [60, 25, 15] },
  christmas: { name: 'Christmas', ticket: 1, every: 'once', at: Date.UTC(2026, 11, 24), split: [60, 25, 15] },
};
export const SALES_CLOSE_MS = 5 * 60 * 1000, BURN_BPS = 1000;
const DAY = 86_400_000;

// The next draw time (ms, UTC) strictly after `now` for this lottery, or null when there's none (Christmas, after it ran).
export function nextDraw(kind, now) {
  const L = LOTTERIES[kind]; if (!L) throw new Error('unknown lottery ' + kind);
  if (L.every === 'once') return now < L.at ? L.at : null;
  const midnight = Math.floor(now / DAY) * DAY + DAY; // the next 00:00 UTC after now
  if (L.every === 'day') return midnight;
  const dow = new Date(midnight).getUTCDay(); // 0 = Sunday
  return midnight + ((7 - dow) % 7) * DAY;
}
// Which draw a ticket bought at `now` belongs to, and whether sales are open for it. A ticket in the last 5 minutes is refused
// (no quote), so a payment can't race the draw.
export function salesFor(kind, now) {
  const at = nextDraw(kind, now);
  if (at === null) return { open: false, why: 'this lottery has been drawn' };
  if (at - now <= SALES_CLOSE_MS) return { open: false, at, why: 'sales are closed for this draw; the next one opens right after it' };
  return { open: true, at };
}

// The pot split among places, in the token's smallest units, exactly: places that can't be filled go to 1st, and the
// remainder of the division goes to 1st too, so the sum is always exactly the pot (nothing left over, nothing invented).
export function splitPot(potRaw, split, filled) {
  const pot = BigInt(potRaw), n = Math.max(0, Math.min(filled, split.length));
  if (n === 0) return [];
  const shares = split.slice(0, n).map((pct) => (pot * BigInt(pct)) / 100n);
  shares[0] += pot - shares.reduce((a, b) => a + b, 0n);
  return shares;
}

// Picks winning tickets from fair numbers. tickets: [{ id, wallet }] in the order they were sold (public list).
// numbers(i): the i-th fair number in [0, 1). A wallet wins at most one place: after each winner, that wallet's other tickets
// are set aside and the next place is drawn from the rest. (Same odds as "redraw if they already won", but it always takes
// exactly one number per place: with no ticket cap, one wallet could hold nearly every ticket, and redrawing could run for ever.)
export function pickWinners(tickets, places, numbers) {
  const winners = []; let pool = tickets;
  for (let place = 1; place <= places && pool.length; place++) {
    const t = pool[Math.floor(numbers(place - 1) * pool.length)];
    winners.push({ place, ticket: t });
    pool = pool.filter((x) => x.wallet !== t.wallet);
  }
  return winners;
}

// The draw's fair numbers. The secret was fixed (its fingerprint published) when the draw opened, before any ticket; the
// blockhash comes from AFTER sales closed (nobody, us included, knew it in advance); the ticket list is public. Changing any
// one of them changes every number, so a draw can't be steered once tickets are sold. Re-check: same inputs, same winners.
import { numbers } from './fair.js';
export async function ticketsHash(tickets) {
  const text = tickets.map((t) => `${t.id}:${t.wallet}`).join('\n');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function drawWinners({ secret, blockhash, tickets, drawId, places }) {
  if (!tickets.length) return [];
  const nums = await numbers(secret, `${blockhash}:${await ticketsHash(tickets)}`, drawId, places);
  return pickWinners(tickets, places, (i) => { if (i >= nums.length) throw new Error('fair: ran out of numbers'); return nums[i]; });
}
