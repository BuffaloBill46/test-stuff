// MY WALLET UNDER THE GAMES (Cody, 2026-10-03: "so players can see without leaving the game"): every game's play buttons have
// a line with the signed-in player's own wallet: its SANTA and about how much that is in dollars. Read by the game server
// ('wallet', server/games.js: the account's linked wallet only, remembered 10 s). Refreshed when the Games page opens, after
// every run, every 30 s while the Games page is on screen, and by its Refresh link. Nothing is guessed: a failed read says so.
import { call } from './gameserver.js?v=896c3a7b98';

const lines = () => document.querySelectorAll('[data-wallet]');
const amount = (raw) => { const n = raw / 1e6; return n >= 1e6 ? +(n / 1e6).toFixed(2) + 'M' : Math.floor(n).toLocaleString(); };
const dollars = (v) => (v < 0.01 ? '<$0.01' : '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
let asking = null, timer = 0, lastAsk = 0;
const AUTO_GAP_MS = 8000; // automatic reads at most every 8 s: a fast 100-play run must never trip the server's speed limit

function show(html) { for (const el of lines()) el.innerHTML = html; }
export function walletHtml(r) {
  if (!r || r.error === 'sign in first') return 'Your wallet: <em>sign in to see it here</em>';
  if (r.wallet === null) return 'Your wallet: <em>none linked to this account</em> (sign in with a Solana wallet to play for SANTA)';
  if (r.error || !Number.isFinite(r.santaRaw)) return 'Your wallet: <em>couldn\'t read it just now</em> <button type="button" data-wallet-refresh>Refresh</button>';
  return `Your wallet <b>${amount(r.santaRaw)} SANTA</b>${Number.isFinite(r.usd) ? ` <em>≈ ${dollars(r.usd)}</em>` : ''}${r.cluster === 'devnet' ? ' <em>(devnet test SANTA)</em>' : ''} <button type="button" data-wallet-refresh>Refresh</button>`;
}
// force: the Refresh link or opening the Games page; otherwise (after a play, the 30 s timer) at most one read per 8 s
export async function refreshWallet(force = false) {
  if (asking) return asking; // one read at a time
  if (!force && Date.now() - lastAsk < AUTO_GAP_MS) return null;
  lastAsk = Date.now();
  asking = call('wallet').catch(() => ({ error: 'no answer' })).then((r) => { show(walletHtml(r)); return r; }).finally(() => { asking = null; });
  return asking;
}
export function initWalletLines() {
  document.addEventListener('click', (e) => { if (e.target.closest('[data-wallet-refresh]')) refreshWallet(true); });
  if (!timer) timer = setInterval(() => { const g = document.querySelector('#tab-games'); if (g && !g.hidden && !document.hidden) refreshWallet(); }, 30_000);
  show(walletHtml(null));
}
