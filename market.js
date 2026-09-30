// Live SANTA price and the token's live transfer tax. READ-ONLY: looks things up, never touches a wallet.
// Price: DexScreener (the deepest SANTA pool). Tax: read straight from the token on Solana (Token-2022 "transfer fee"),
// because the token team can change it (LESSONS: never assume 3%). The token keeps an older and a newer fee plus the
// epoch (Solana's ~2-day period) the newer one starts, so we pick whichever is in force now.
export const MINT = '3c7mmVSyEH8jfZXgxvpLsETtko1Y16DyRJ5XYB4snhGt';
export const QUOTE_SECONDS = 60, CUSHION = 0.02; // decided: a quote holds 60 s; a payment within 2% of it counts
const RPCS = ['https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com']; // free, public; first that answers wins

async function getJSON(url, body, ms = 8000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal } : { signal: ctl.signal });
    if (!r.ok) throw new Error(`${url} answered ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function rpc(method, params) {
  let last;
  for (const u of RPCS) {
    try { const j = await getJSON(u, { jsonrpc: '2.0', id: 1, method, params }); if (j.result !== undefined) return j.result; last = new Error(j.error?.message || 'no result'); }
    catch (e) { last = e; }
  }
  throw last;
}

// Pure helpers (tested in node) ---------------------------------------------------------------
// The deepest pool for SANTA (by dollars of liquidity), not just the first one listed.
export function pickPrice(dex) {
  const pairs = (dex?.pairs || []).filter((p) => p.baseToken?.address === MINT && +p.priceUsd > 0);
  if (!pairs.length) return null;
  const best = pairs.reduce((a, b) => ((+b.liquidity?.usd || 0) > (+a.liquidity?.usd || 0) ? b : a));
  return { usd: +best.priceUsd, pool: best.dexId, liquidity: +best.liquidity?.usd || 0 };
}
// The fee in force at `epoch`, from the token's parsed account data.
export function pickFee(info, epoch) {
  const cfg = info?.extensions?.find((e) => e.extension === 'transferFeeConfig')?.state;
  if (!cfg) return { bps: 0, max: Infinity, decimals: info?.decimals }; // no transfer fee on this token
  const f = epoch >= cfg.newerTransferFee.epoch ? cfg.newerTransferFee : cfg.olderTransferFee;
  return { bps: f.transferFeeBasisPoints, max: +f.maximumFee, decimals: info.decimals };
}
// Token-2022's own rule: fee = amount × bps / 10,000, rounded UP, capped at the maximum. Amounts in the token's smallest unit.
export const feeOn = (raw, fee) => Math.min(Math.ceil((raw * fee.bps) / 10000), fee.max);
// How one payment splits (DESIGN_NOTES → "SANTA's 3% tax"): the tax comes first, so the burn % applies to what's left after
// it; the burn itself is not a transfer (no tax); the pool/treasury send gets the remainder, and the token takes its fee
// out of that send. All amounts in the token's smallest unit (whole numbers). burnBps: 1000 = 10%.
export function splitPayment(totalRaw, burnBps, fee) {
  const total = Math.floor(totalRaw);
  const burn = Math.floor((total * burnBps * (10000 - fee.bps)) / 1e8);
  const send = total - burn, tax = feeOn(send, fee);
  return { total, burn, send, tax, arrives: send - tax };
}
export const santaFor = (usd, price) => usd / price.usd;
export const fmtSanta = (n) => Math.round(n).toLocaleString('en-US');

// Live lookups ---------------------------------------------------------------------------------
export async function livePrice() {
  const p = pickPrice(await getJSON(`https://api.dexscreener.com/latest/dex/tokens/${MINT}`));
  if (!p) throw new Error('no SANTA price found');
  return { ...p, at: Date.now() };
}
export async function liveFee() {
  const [acct, ep] = await Promise.all([rpc('getAccountInfo', [MINT, { encoding: 'jsonParsed' }]), rpc('getEpochInfo', [])]);
  return { ...pickFee(acct?.value?.data?.parsed?.info, ep.epoch), epoch: ep.epoch };
}
