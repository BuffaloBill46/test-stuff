// SERVER: the page's backup way to READ from Solana (found 2026-10-04): the page asks a public Solana server directly
// (publicnode), but some home networks block it (ERR_SSL_PROTOCOL_ERROR), and Solana's own public server refuses browsers (403),
// so for those players every payment failed before the wallet even opened. Then the page asks through the game server, which
// players reach anyway. Only the few READ-ONLY lookups the wallet step needs are relayed; nothing can be sent, signed or
// changed through it. Signed-in players only, under the per-player speed limit (server/http.js).
export const RELAY_METHODS = ['getLatestBlockhash', 'getTokenAccountBalance', 'getMultipleAccounts', 'getAccountInfo', 'getSignatureStatuses'];
const MAX_PARAMS = 8000; // characters: the biggest real one (a lookup-table read) is far smaller

// rpc(method, params) → the server's own Solana answer ({ result } or { error }), as worker/games.mjs's rpc gives it.
export function makeRelay(rpc) {
  return async (method, params) => {
    if (!RELAY_METHODS.includes(method)) return { error: 'that lookup is not relayed' };
    if (!Array.isArray(params) || JSON.stringify(params).length > MAX_PARAMS) return { error: 'bad lookup' };
    const j = await rpc(method, params);
    return j?.error ? { jsonrpc: '2.0', error: j.error } : { jsonrpc: '2.0', result: j?.result ?? null };
  };
}
