// The page's side of the shop (Cody, 2026-10-02: every button gets a complete start-to-end path): ONE buy path for every
// purchasable thing — a Store item (special snowball, special gear), a look on the Avatar screen, a level, extra ranked tickets.
//   price (server, 60 s) → the wallet pays once (window.santaPay: 50% burned, 50% to the treasury) → the server checks the
//   payment and grants it → the page reloads what the player owns.
// Remembered in this browser between paying and the server accepting it, so a closed tab or a dropped network never loses a paid
// purchase (resumeShop runs on the next visit). Without the game server (today's site) it says plainly that nothing is sold yet.
import { SERVER, call, walletReady, payError } from './gameserver.js';

const PENDING = 'santa.pendingShop';
const remember = (v) => { try { v ? localStorage.setItem(PENDING, JSON.stringify(v)) : localStorage.removeItem(PENDING); } catch {} };
const usd = (v) => (v < 1 ? Math.round(v * 100) + '¢' : '$' + v.toFixed(2));

// After the wallet paid: the server checks it on chain. A payment can take a few seconds to be final, so keep asking a while.
async function buyPaid(quote, signature) {
  remember({ quote, signature, at: Date.now() }); let b;
  for (let i = 0; i < 40; i++) {
    try { b = await call('shop-buy', { quote, signature }); } catch { b = { error: 'the game server didn\'t answer', retry: true }; }
    if (!b.error || !(b.retry || /not finalized|not found/.test(b.error))) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!b.error || /already used/.test(b.error) || !(b.retry || /not finalized|not found/.test(b.error))) remember(null);
  else b = { error: `Your payment went through but isn't confirmed yet. We'll keep trying when you come back (payment ${signature.slice(0, 8)}…).` };
  return b;
}
// A paid purchase the server hadn't accepted yet (tab closed, network dropped): finish it on the next visit.
export async function resumeShop() {
  let p; try { p = JSON.parse(localStorage.getItem(PENDING) || 'null'); } catch {}
  if (!SERVER || !p?.signature) return null;
  if (Date.now() - p.at > 86_400_000) { remember(null); return null; }
  const b = await call('shop-buy', { quote: p.quote, signature: p.signature });
  if (!b.error || /already used/.test(b.error)) remember(null);
  return b;
}
const done = (b) => (b.refunded ? b.note : b.item ? 'Bought! It\'s yours.' : b.level ? `You're level ${b.level}!` : b.tickets ? `+${b.tickets} ranked ticket${b.tickets === 1 ? '' : 's'}.` : 'Bought!');

// what: { kind: 'item', id } | { kind: 'level' } | { kind: 'tickets', n }. note(text) shows progress next to the button.
// Returns the server's answer when something was granted (or owed back), else null.
export async function shopBuy(what, note) {
  if (!SERVER) { note('Payments open soon. This is the test version: nothing is sold yet.'); return null; }
  note('Getting a price…');
  let q; try { q = await call('shop-quote', what); } catch { q = { error: 'the game server didn\'t answer' }; }
  if (q.error) { note(q.error); return null; }
  await walletReady;
  if (typeof window.santaPay !== 'function') { note('Wallet payments aren\'t connected yet.'); return null; }
  let signature;
  try { note(`Approve ${usd(q.usd)} in your wallet…`); signature = await window.santaPay(q); }
  catch (e) { note(payError(e)); return null; }
  note('Confirming the payment…');
  const b = await buyPaid(q.id, signature);
  if (b.error) { note(b.error); return null; }
  note(done(b));
  return b;
}
