// Exactly-once check on chain: every payout the worker sends carries the memo "Santa Hat payouts #<id>". This reads the pool
// wallet's recent transactions and counts, per payout id, how many SUCCESSFUL transactions carry it, and how much each paid.
// A payout sent twice shows up as 2. Used after killing the worker mid-send (QA 2026-10-03).
// Run: node payout-memos.mjs <first payout id> <last payout id> [pool wallet = the Game pool]
import { readFileSync } from 'fs';
const cfg = JSON.parse(readFileSync(new URL('../../devnet.json', import.meta.url), 'utf8'));
const [lo, hi] = [+process.argv[2], +process.argv[3]], POOL = process.argv[4] || cfg.wallets.spinPool;
const call = async (method, params) => { for (let i = 0; ; i++) { const r = await fetch(cfg.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (r.status === 429 && i < 8) { await new Promise((s) => setTimeout(s, 1500 * (i + 1))); continue; } return (await r.json()).result; } };
const sigs = await call('getSignaturesForAddress', [POOL, { limit: 60 }]);
const seen = new Map();
for (const s of sigs) {
  if (s.err) continue;
  const memo = (s.memo || '').match(/Santa Hat payouts #(\d+)/); if (!memo) continue;
  const id = +memo[1]; if (id < lo || id > hi) continue;
  const tx = await call('getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
  const t = tx.transaction.message.instructions.find((i) => i.parsed?.type === 'transferCheckedWithFee');
  (seen.get(id) || seen.set(id, []).get(id)).push({ sig: s.signature.slice(0, 8), raw: t?.parsed.info.tokenAmount?.amount, to: t?.parsed.info.destination?.slice(0, 4) });
}
let ok = true;
for (let id = lo; id <= hi; id++) { const l = seen.get(id) || []; if (l.length !== 1) ok = false; console.log(`payout #${id}: ${l.length} on chain ${JSON.stringify(l)}`); }
console.log(ok ? 'EXACTLY ONCE each' : 'NOT exactly once');
