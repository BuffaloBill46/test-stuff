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
async function rpc(method, params, urls = RPCS) {
  let last;
  for (const u of urls) {
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
// mint / urls: the server passes the token it accepts and its own network (the devnet test token on devnet), so the tax it
// checks payments against is that token's, never real SANTA's by accident. The page uses the defaults (real SANTA, mainnet).
export async function liveFee(mint = MINT, urls = RPCS) {
  const [acct, ep] = await Promise.all([rpc('getAccountInfo', [mint, { encoding: 'jsonParsed' }], urls), rpc('getEpochInfo', [], urls)]);
  return { ...pickFee(acct?.value?.data?.parsed?.info, ep.epoch), epoch: ep.epoch };
}
// The server's tax lookup, remembered (found 2026-10-03, 3 test players buying at once): asking Solana on every price and every
// payment check got "too many requests" (429) from the public node, the payment check failed, and two PAID pulls were never
// played. Asked again at most once a minute (once per player at most matters little: the tax changes only at an epoch, ~2 days,
// and the token says in advance when). If Solana doesn't answer, the last good answer from the past 10 minutes is used.
export function keptFee(lookup, { fresh = 60_000, stale = 600_000, now = () => Date.now() } = {}) {
  let kept = null, asking = null;
  return async () => {
    if (kept && now() - kept.at < fresh) return kept.fee;
    asking ||= lookup().then((fee) => { kept = { fee, at: now() }; return fee; }).finally(() => { asking = null; });
    try { return await asking; } catch (e) { if (kept && now() - kept.at < stale) return kept.fee; throw e; }
  };
}
// The live SOL price in dollars (Jupiter's free price service), for paying with SOL (Cody 2026-10-04): the Store quotes the
// treasury's share in SOL from it (server/shop.js). READ-ONLY. The server keeps it a minute (keptFee works for any lookup).
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';
export async function liveSolPrice() {
  const usd = +(await getJSON(`https://lite-api.jup.ag/price/v3?ids=${WSOL_MINT}`))?.[WSOL_MINT]?.usdPrice;
  if (!(usd > 0)) throw new Error('no SOL price found');
  return { usd, at: Date.now() };
}
// Lamports (a billionth of a SOL) for `usd` dollars, rounded UP so the treasury never gets less than the dollars quoted.
export const lamportsFor = (usd, solUsd) => Math.ceil((usd / solUsd) * 1e9);
// PAYING WITH SOL, the player pays EXACTLY the price (Cody 2026-10-04: "they are only charged $1 and whatever makes it to the pool
// is what it gets"). How a price in SOL (lamports) splits, built by the page (pay.js) and checked by the server (verify.js):
// games and the lottery swap ALL of it to SANTA; the Store swaps the burn share (50%; the pass 0%) and the rest goes to the
// treasury AS SOL. SOL_FLOOR: a SOL payment must still deliver at least 85% of what the quote's SANTA would (the swap's fees
// are ~8-10% today): anything built to deliver less is refused, and the page won't sign one that would land under it.
export const SOL_FLOOR = 0.85;
export const solShares = (lamports, burnBps, store) => {
  const treasury = store ? Math.floor((lamports * (10000 - burnBps)) / 10000) : 0;
  return { swap: lamports - treasury, treasury };
};
