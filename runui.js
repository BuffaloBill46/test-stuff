// What a finished run says on its card (shared by Spin, Snowball Drop and Big Hat). Runs: Cody, 2026-10-01.
// The run's winnings were sent to the player's wallet automatically (demo: to the demo balance), 3% lighter (SANTA's tax).
import { serverMode } from './playcredits.js?v=4028a8e4cb';
const money = (v) => '$' + (Math.floor(v * 100 + 1e-6) / 100).toFixed(2);
export function runSummary(out, one, many) {
  const what = `${out.n} ${out.n === 1 ? one : many}`;
  if (!out.sent) return `<span><b>${what}:</b> no win this time. Nothing to send.</span>`; // one span: the result line is a flex row
  // Frozen by the safety cap (more than the run could possibly win: a fault, never a big win): say so plainly, not "sent".
  if (out.held) return `<span><b>${what}: ${money(out.sent)} back</b> · being checked before it's sent (an amount the game can't normally pay). It goes to your wallet once it's cleared.</span>`;
  const where = serverMode ? 'sent to your wallet' : 'added to your demo balance';
  // a run that hit a POOL JACKPOT (any game, Cody 2026-10-02) keeps saying so after its last play, so the summary doesn't hide it
  const jp = (out.results || []).filter((s) => s?.r?.jackpot).reduce((a, s) => a + s.r.pay, 0);
  if (jp) return `<span><b>${what}: ${money(out.sent)} back, with a POOL JACKPOT of ${money(jp)}!</b> · ${where} <span class="dim">(you get ${money(out.received)} after SANTA's 3% tax)</span></span>`;
  return `<span><b>${what}: ${money(out.sent)} back</b> · ${where} <span class="dim">(you get ${money(out.received)} after SANTA's 3% tax)</span></span>`;
}
