// The page's line to the game server (the 'games' Edge Function). Used when the page is opened with ?server=<address>;
// otherwise the Games tab runs the in-browser demo (house.js). Same steps, same order: the server does the work.
// Buying needs a wallet to sign the payment: `window.santaPay(quote)` must return the finalized transaction signature.
// That wallet step can't be built or tested in this workspace (FOR_MAIN_CLAUDE.md); until it exists, buying says so.
import { accounts } from './net.js?v=2d2d4b29af';

const params = new URLSearchParams(location.search);
// LAUNCHED (Cody's GO, mainnet): the public site itself plays through the game server, no ?server= needed, and the demo is gone.
// Only on the real site's own addresses: a test page (localhost) keeps the demo unless it passes ?server= itself.
const LAUNCHED = true; // Cody's GO, 2026-10-05: the public site plays for real (mainnet)
const PUBLIC_SITE = /(^|\.)santahatgames\.com$|^buffalobill46\.github\.io$/.test(location.hostname);
// THE TEST SITE (Cody 2026-10-05, to-do #11): test.santahatgames.com always plays through the TEST game server (devnet, test
// SANTA, no real value), reached at its own /api (Caddy on the Droplet; deploy-test.sh publishes it). Changes go there first.
export const STAGING = location.hostname === 'test.santahatgames.com';
export const SERVER = params.get('server') || (STAGING ? 'https://test.santahatgames.com/api' : LAUNCHED && PUBLIC_SITE ? 'https://api.santahatgames.com' : null);
const testToken = params.get('token'); // tests only, and only against a local server
// The wallet step (window.santaPay): loaded only in server mode, so the demo never fetches the Solana libraries.
export const walletReady = SERVER ? import('./wallet.js?v=2d2d4b29af').catch((e) => { console.warn('wallet step unavailable:', e); }) : Promise.resolve();

export async function token() {
  if (testToken && /^http:\/\/localhost[:/]/.test(SERVER || '')) return testToken;
  try { return (await accounts().session())?.access_token || null; } catch { return null; }
}
// The actions anyone may call without signing in: must match the server's public ones (server/http.js; tests/public-actions.test.mjs).
// (It once listed only three, so guests' lottery cards and draw re-checks never asked the server.)
export const PUBLIC_ACTIONS = ['pools', 'settings', 'stats', 'lottery-tickets', 'lottery', 'winners', 'market', 'burned', 'weekly', 'support', 'support-status', 'support-clear', 'client-error', 'visit'];
// What a player reads when a payment didn't happen (button audit 2026-10-02: a failed wallet-library download showed
// "Failed to fetch dynamically imported module: https://cdn…"). Says "nothing was charged" only where that's certain: the
// player cancelled, or the wallet step never loaded (wallet.js never throws once a payment is sent, except for a payment the
// network rejected, whose own message says no SANTA was taken).
// The wallet step (wallet.js and the Solana code it downloads) couldn't load. A browser remembers a failed download for the
// page's whole life and never asks again (checked in Chrome, live QA 2026-10-03: the 2nd and 3rd tries failed with no request),
// so "try again" alone can't work: the player must reload. Also when window.santaPay never appeared (wallet.js didn't load).
export const WALLET_LOAD_FAILED = "Couldn't load the wallet step. Reload the page, then try again. Nothing was charged.";
export function payError(e) {
  const m = String(e?.message || '');
  if (/reject|cancel|denied/i.test(m)) return 'Payment cancelled. Nothing was charged.';
  if (/dynamically imported module|importing a module/i.test(m)) return WALLET_LOAD_FAILED;
  return 'Not paid: ' + (m || 'the wallet said no');
}
// The server's "sign in first" as a player should meet it (live-site test, 2026-10-02: a guest pressing Pay saw the raw words
// in small red letters): a clear line, then the sign-in sheet opens (after any open dialog closes, so it isn't hidden).
// Returns the text to show, or the server's own message for any other error.
export function forPlayer(err, closeDialog) {
  if (err !== 'sign in first') return err;
  setTimeout(() => { try { closeDialog?.(); } catch {} document.querySelector('#signin')?.click(); }, 900);
  return 'Sign in first: buying needs your account and its wallet. Opening sign-in…';
}
// Ranked tickets are real even on the demo site (the match server uses the real database), so they're read from the game
// server either way: the test link's ?server=, else the live one.
const LIVE_GAMES = 'https://api.santahatgames.com';
// read-only actions that always reach the live game server (my tickets, my season: the match server records them there)
const READ_LIVE = ['tickets', 'season', 'burned', 'wallet', 'winners', 'weekly', 'support', 'support-status', 'support-clear', 'client-error']; // support: messages reach Cody from the demo too
export async function call(action, body = {}) {
  // public answers need no sign-in: don't wait for the sign-in lookup (a slow one held back every public line on the page)
  // (support goes without a sign-in too, but says who wrote when someone is signed in)
  const t = PUBLIC_ACTIONS.includes(action) && !action.startsWith('support') ? null : await token();
  if (!t && !PUBLIC_ACTIONS.includes(action)) return { error: 'sign in first' };
  const r = await fetch(READ_LIVE.includes(action) ? SERVER || LIVE_GAMES : SERVER, { method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: JSON.stringify({ action, ...body }) });
  try { return await r.json(); } catch { return { error: `the game server answered ${r.status}` }; }
}
// Server mode: the published game settings, applied to the page before anything is drawn (settings.js → applyToGame).
// KEEP THIS BELOW call() AND EVERYTHING call() READS (PUBLIC_ACTIONS, READ_LIVE, LIVE_GAMES): it runs while this file is
// still loading, so a name defined further down isn't there yet; the error was swallowed by the catch below and the page
// quietly kept the built-in settings (settings-mode-test caught it, 2026-10-04).
export const settingsReady = SERVER ? (async () => {
  try { const r = await call('settings'); if (r?.settings) { const { applyToGame } = await import('./settings.js?v=2d2d4b29af'); applyToGame(r.settings); return r; } } catch (e) { console.error('published settings not loaded:', e); }
  return null;
})() : Promise.resolve(null);
