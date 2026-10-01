// The page's line to the game server (the 'games' Edge Function). Used when the page is opened with ?server=<address>;
// otherwise the Games tab runs the in-browser demo (house.js). Same steps, same order: the server does the work.
// Buying needs a wallet to sign the payment: `window.santaPay(quote)` must return the finalized transaction signature.
// That wallet step can't be built or tested in this workspace (FOR_MAIN_CLAUDE.md); until it exists, buying says so.
import { accounts } from './net.js';

const params = new URLSearchParams(location.search);
export const SERVER = params.get('server') || null;
const testToken = params.get('token'); // tests only, and only against a local server
// The wallet step (window.santaPay): loaded only in server mode, so the demo never fetches the Solana libraries.
export const walletReady = SERVER ? import('./wallet.js').catch((e) => { console.warn('wallet step unavailable:', e); }) : Promise.resolve();

export async function token() {
  if (testToken && /^http:\/\/localhost[:/]/.test(SERVER || '')) return testToken;
  try { return (await accounts().session())?.access_token || null; } catch { return null; }
}
// Server mode: the published game settings, applied to the page before anything is drawn (settings.js → applyToGame).
export const settingsReady = SERVER ? (async () => {
  try { const r = await call('settings'); if (r?.settings) { const { applyToGame } = await import('./settings.js'); applyToGame(r.settings); return r; } } catch {}
  return null;
})() : Promise.resolve(null);
export async function call(action, body = {}) {
  const t = await token();
  if (!t && !['winners', 'settings', 'pools'].includes(action)) return { error: 'sign in first' }; // public ones
  const r = await fetch(SERVER, { method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: JSON.stringify({ action, ...body }) });
  try { return await r.json(); } catch { return { error: `the game server answered ${r.status}` }; }
}
