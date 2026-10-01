// The page's list of actions it may send without a sign-in (mockups/gameserver.js PUBLIC_ACTIONS) must be exactly the server's
// public actions (server/http.js: the ones answered before the sign-in check). A missing one silently breaks that feature for
// guests (it happened: the lottery and the load-screen stats); an extra one would just get "sign in first" from the server.
// Run: node public-actions.test.mjs
import { readFileSync } from 'fs';
const http = readFileSync(new URL('../server/http.js', import.meta.url), 'utf8'), page = readFileSync(new URL('../mockups/gameserver.js', import.meta.url), 'utf8');
const beforeAuth = http.slice(0, http.indexOf("return reply(origin, 401, { error: 'sign in first' })"));
if (beforeAuth.length === http.length) { console.error('FAIL: could not find the sign-in check in server/http.js'); process.exit(1); }
const server = [...beforeAuth.matchAll(/body\?\.action === '([a-z-]+)'/g)].map((m) => m[1]).sort();
const list = page.match(/export const PUBLIC_ACTIONS = \[([^\]]*)\]/); if (!list) { console.error('FAIL: no PUBLIC_ACTIONS in gameserver.js'); process.exit(1); }
const client = [...list[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort();
if (server.join() !== client.join()) { console.error('FAIL: server public', server, 'page public', client); process.exit(1); }
console.log('OK: the page and the server agree on the public actions:', server.join(', '));
