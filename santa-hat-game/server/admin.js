// SERVER: escrow admin controls (Cody, required before real pools). NOT DEPLOYED.
// Only an admin wallet can act, by SIGNING a plain message (free; not a transaction). The server checks:
//   the signature matches the wallet · the wallet is an admin · the message is fresh (5 minutes) · its one-time number
//   was never used (a copied signature can't be replayed) · the new settings are sane.
// Actions: pause (emergency stop: no plays, no top-offs), resume, set-rules (thresholds, jackpot %).
// Changes take the pool's row lock, so they wait for any play being settled: never mid-pull. Every change is logged publicly.
// NOT here (needs the pool key; FOR_MAIN_CLAUDE.md): the emergency withdrawal transfer itself.
import { POOL_RULES } from '../mockups/slots.js';
import { SPIN_RULES } from '../mockups/spin.js';

export const ACTIONS = ['pause', 'resume', 'set-rules'];
export const FRESH_SECONDS = 300;
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58decode(s) {
  let n = 0n; for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new Error('bad address'); n = n * 58n + BigInt(i); }
  const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of s) { if (c === '1') out.unshift(0); else break; }
  return new Uint8Array(out);
}
export function b58encode(bytes) {
  let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
  let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b === 0) s = '1' + s; else break; }
  return s;
}
const unhex = (h) => new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)));

// The exact text the wallet signs: one shared function for the admin screen and the server.
import { adminMessage } from '../mockups/adminmsg.js';
export { adminMessage };
function parse(message) {
  const lines = message.split('\n'); if (lines[0] !== 'Santa Hat Arcade admin' || lines.length !== 6) return null;
  const get = (i, k) => (lines[i].startsWith(k + ': ') ? lines[i].slice(k.length + 2) : null);
  try { return { action: get(1, 'action'), game: get(2, 'game'), settings: JSON.parse(get(3, 'settings')), at: get(4, 'at'), nonce: get(5, 'nonce') }; } catch { return null; }
}
export async function signatureOk(wallet, message, sigHex) {
  try {
    const key = await crypto.subtle.importKey('raw', b58decode(wallet), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, unhex(sigHex), new TextEncoder().encode(message));
  } catch { return false; }
}
// Sane settings only. Money thresholds are dollars (pools are valued at the live SANTA price).
export function checkRules(game, rules) {
  const base = game === 'spin' ? SPIN_RULES : POOL_RULES, R = { ...base, ...rules }, bad = [];
  const allowed = new Set([...Object.keys(base).filter((k) => k !== 'paused'), ...(game === 'slots' ? ['jackpotPct'] : [])]);
  for (const k of Object.keys(rules)) if (!allowed.has(k)) bad.push(`${k} can't be set here`);
  for (const k of ['start', 'skimAt', 'skim', 'topOffBelow', 'topOffTo']) if (!(Number.isFinite(R[k]) && R[k] >= 0 && R[k] <= 100000)) bad.push(`${k} must be 0–100,000`);
  if (!(R.skim < R.skimAt)) bad.push('the skim must be smaller than the skim point');
  if (!(R.topOffBelow < R.topOffTo)) bad.push('top-off must fill above where it starts');
  if (!(R.topOffTo < R.skimAt - R.skim)) bad.push('a top-off must not trigger a skim straight away');
  if (game === 'slots' && 'jackpotPct' in R && !(R.jackpotPct > 0 && R.jackpotPct <= 0.5)) bad.push('jackpot % must be above 0 and at most 50%');
  return bad;
}

export function createAdmin({ db, adminWallets, now = () => Date.now() }) {
  async function run({ wallet, message, signature }) {
    const m = parse(message || '');
    if (!m || message !== adminMessage(m)) return { error: 'not an admin message' };
    if (!adminWallets.includes(wallet)) return { error: 'not an admin wallet' };
    if (!(await signatureOk(wallet, message, signature || ''))) return { error: 'signature doesn\'t match the wallet' };
    if (!(Math.abs(now() - Date.parse(m.at)) <= FRESH_SECONDS * 1000)) return { error: 'message too old (sign a fresh one)' };
    if (!ACTIONS.includes(m.action) || !['spin', 'slots'].includes(m.game)) return { error: 'unknown action or game' };
    if (!/^[0-9a-f]{16,64}$/.test(m.nonce)) return { error: 'bad one-time number' };
    if (m.action === 'set-rules') { const bad = checkRules(m.game, m.settings); if (bad.length) return { error: bad.join('; ') }; }
    return db.tx(async (t) => {
      if ((await t.query('select 1 from public.pool_log where nonce = $1', [m.nonce])).length) return { error: 'this signed message was already used' };
      const [p] = await t.query('select * from public.pools where game = $1 for update', [m.game]); // waits for any play being settled
      const rules = { ...(p.rules || {}) };
      if (m.action === 'pause') rules.paused = true;
      else if (m.action === 'resume') rules.paused = false;
      else Object.assign(rules, m.settings);
      try {
        await t.query(`insert into public.pool_log (game, what, by_wallet, nonce, details) values ($1, $2, $3, $4, $5)`,
          [m.game, m.action, wallet, m.nonce, JSON.stringify({ before: p.rules, after: rules, message, signature })]);
      } catch (e) { if (/duplicate|unique/.test(e.message)) return { error: 'this signed message was already used' }; throw e; }
      await t.query('update public.pools set rules = $2, updated_at = now() where game = $1', [m.game, JSON.stringify(rules)]);
      return { ok: true, game: m.game, rules };
    });
  }
  return { run };
}
