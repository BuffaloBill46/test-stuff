// window.santaPay(quote): the player's wallet signs and sends the ONE purchase transaction (pay.js: burn 10% straight from
// their wallet + send the rest straight to the pool), then we wait until the network has FINALIZED it, because the server
// only accepts finalized payments. Returns the transaction signature. Loaded only in server mode (gameserver.js).
// Wallets are found through the Wallet Standard (Phantom, Solflare, Backpack all speak it): we hand the wallet the raw
// transaction bytes and it shows the player what they're approving, signs and sends.
// Safety: the quote names the ONE wallet the server will accept a payment from (`payer`, the account's linked wallet) and
// the network (`cluster`). We refuse to ask for a signature from any other wallet or on any other network, so a player can
// never pay for plays the server would then refuse.
import { purchaseInstructions, solPurchaseInstructions, purchaseMessage } from './pay.js?v=c2b42ea65b';
import { payWith } from './paywith.js?v=c2b42ea65b';

const KIT = 'https://cdn.jsdelivr.net/npm/@solana/kit@8.4.0/+esm';
const T22 = 'https://cdn.jsdelivr.net/npm/@solana-program/token-2022@0.19.0/+esm';
// Where the wallet step reads Solana: a public server first; if it can't be reached at all, through our own game server
// (server/relay.js). Found 2026-10-04: publicnode is blocked on some home networks (ERR_SSL_PROTOCOL_ERROR) and Solana's own
// public server refuses browsers (403), so with one public server every payment failed there. A server that ANSWERS with an
// error (e.g. "no such account") is an answer, not a reason to ask elsewhere.
export const RPC = { mainnet: ['https://solana-rpc.publicnode.com'], devnet: ['https://api.devnet.solana.com'] };
const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? Number(x) : x)));
const viaGameServer = async ({ payload }) => {
  const { call } = await import('./gameserver.js?v=c2b42ea65b');
  const r = await call('rpc', { method: payload.method, params: plain(payload.params) });
  if (!r?.jsonrpc) throw new Error(r?.error || 'the game server could not read Solana');
  return { ...r, id: payload.id };
};
export function rpcFor(kit, cluster) {
  const ts = [...RPC[cluster].map((url) => kit.createDefaultRpcTransport({ url })), viaGameServer];
  return kit.createSolanaRpcFromTransport(async (req) => { let last; for (const t of ts) { try { return await t(req); } catch (e) { last = e; } } throw last; });
}
const FINAL_WAIT_MS = 90_000;

// Wallet Standard discovery (the same handshake @wallet-standard/app does): wallets announce themselves on an event.
const found = new Set();
const register = (...ws) => { ws.forEach((w) => found.add(w)); return () => ws.forEach((w) => found.delete(w)); };
window.addEventListener('wallet-standard:register-wallet', (e) => { try { e.detail({ register }); } catch {} });
try { window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: { register } })); } catch {}

const canPay = (w, chain) => w.features?.['solana:signAndSendTransaction'] && (w.chains || []).includes(chain);

// The wallet + account that can pay this quote, connecting if needed. Tests may set window.santaWallet to a Standard wallet.
async function payingAccount(quote) {
  const chain = 'solana:' + quote.cluster;
  const wallets = [window.santaWallet, ...found].filter((w) => w && canPay(w, chain));
  if (!wallets.length) throw new Error(`no Solana wallet found that can pay on ${quote.cluster}`);
  for (const w of wallets) {
    let acct = w.accounts.find((a) => a.address === quote.payer);
    if (!acct && w.features['standard:connect']) {
      const r = await w.features['standard:connect'].connect();
      acct = (r?.accounts || w.accounts).find((a) => a.address === quote.payer);
    }
    if (acct) return { w, acct, chain };
  }
  throw new Error(`switch your wallet to ${short(quote.payer)} (the wallet on your account) to pay`);
}
const short = (a) => a.slice(0, 4) + '…' + a.slice(-4);

// SANTA or SOL for this payment (paywith.js; Cody 2026-10-04). Only on mainnet; "Auto" looks at the wallet's SANTA: enough for
// this price → SANTA, otherwise SOL (also when the wallet has no SANTA account at all). If the balance can't be read for another
// reason, SANTA, as before SOL existed.
export async function chooseMethod(quote, rpc, t22, owner, pref = payWith()) {
  if (quote.cluster !== 'mainnet') return 'santa';
  if (pref !== 'auto') return pref;
  try {
    const ata = (await t22.findAssociatedTokenPda({ owner, tokenProgram: t22.TOKEN_2022_PROGRAM_ADDRESS, mint: quote.mint }))[0];
    const { value } = await rpc.getTokenAccountBalance(ata).send();
    return BigInt(value.amount) >= BigInt(quote.santaRaw) ? 'santa' : 'sol';
  } catch (e) { return /could not find account/i.test(`${e?.message} ${e?.context?.__serverMessage}`) ? 'sol' : 'santa'; } // the browser build may shorten the message; the context keeps the server's words
}
const json = async (r) => { if (!r.ok) throw new Error('the swap service answered ' + r.status); return r.json(); };
const jupiter = { get: (u) => fetch(u, { signal: AbortSignal.timeout(10_000) }).then(json),
  post: (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b), signal: AbortSignal.timeout(10_000) }).then(json) };

export async function santaPay(quote) {
  if (!quote?.payer || !RPC[quote?.cluster]) throw new Error('this price can\'t be paid (missing wallet or network)');
  const [kit, t22] = await Promise.all([import(KIT), import(T22)]);
  const { w, acct, chain } = await payingAccount(quote);
  const rpc = rpcFor(kit, quote.cluster);
  const player = kit.createNoopSigner(kit.address(acct.address)); // the wallet signs; this only marks who must
  const method = await chooseMethod(quote, rpc, t22, player.address);
  const built = method === 'sol' ? await solPurchaseInstructions({ ...t22, ...jupiter }, quote, player) : await purchaseInstructions(t22, quote, player);
  const msg = await purchaseMessage(kit, rpc, player.address, built);
  const bytes = kit.getTransactionEncoder().encode(kit.compileTransaction(msg));
  const [out] = await w.features['solana:signAndSendTransaction'].signAndSendTransaction({ account: acct, chain, transaction: new Uint8Array(bytes), options: { preflightCommitment: 'confirmed' } });
  const signature = kit.getBase58Decoder().decode(out.signature);
  // Wait for FINALIZED (about 15–30 s). A failed transaction moved nothing: say so. If it's slow, hand the signature on anyway:
  // the page keeps asking the server, which accepts it the moment it's final.
  // From here the payment is SENT: nothing below may lose the signature. A network hiccup while asking is retried (it used to
  // throw, so a paid run never reached the server: found 2026-10-02 after the button audit); only a payment the network
  // REJECTED (s.err: nothing moved) is an error. Whatever happens, the server checks the payment before accepting it.
  const t0 = Date.now();
  while (Date.now() - t0 < FINAL_WAIT_MS) {
    let s = null;
    try { [s] = (await rpc.getSignatureStatuses([signature]).send()).value; } catch { /* asking failed, not the payment: ask again */ }
    if (s?.err) throw new Error(`the payment failed on the network; no ${method === 'sol' ? 'SOL or ' : ''}SANTA was taken`);
    if (s?.confirmationStatus === 'finalized') break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return signature;
}
window.santaPay ||= santaPay; // never replaces one already set (a test's stand-in), whichever loads first
