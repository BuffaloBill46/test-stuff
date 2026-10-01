// What a finished run says on its card (shared by Spin, Snowball Drop and Big Hat). Runs: Cody, 2026-10-01.
// The run's winnings were sent to the player's wallet automatically (demo: to the demo balance), 3% lighter (SANTA's tax).
import { serverMode } from './playcredits.js';
const money = (v) => '$' + (Math.floor(v * 100 + 1e-6) / 100).toFixed(2);
export function runSummary(out, one, many) {
  const what = `${out.n} ${out.n === 1 ? one : many}`;
  if (!out.sent) return `<b>${what}:</b> no win this time. Nothing to send.`;
  const where = serverMode ? 'sent to your wallet' : 'added to your demo balance';
  return `<b>${what}: ${money(out.sent)} back</b> · ${where} <span class="dim">(you get ${money(out.received)} after SANTA's 3% tax)</span>`;
}
