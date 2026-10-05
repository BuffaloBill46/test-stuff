// PAY WITH: SANTA or SOL (Cody, 2026-10-04: "add the sol pay option when they buy stuff. I dont want them to have to do extra
// steps"). No extra step at checkout: the choice is made once, here, and remembered on this device; until 2026-10-05 "Auto" (then the default) pays with
// SANTA when the wallet holds enough and with SOL otherwise (wallet.js chooseMethod). Either way it is ONE wallet approval.
// Shown only on mainnet (online.js, from the server's 'market'): the SOL swap runs on Jupiter, which isn't on devnet.
// (Cody 2026-10-05: "Remove the auto option it confuses people"; "Default to santa"; "move the toggle ... on to the my profile
// button. That way they can change it anywhere in the game without having to scroll".) Just SANTA or SOL, SANTA unless the player
// picks SOL; an "auto" saved by an older page counts as SANTA. The switch lives in the profile sheet ([data-paywith-slot]); under
// each game and in the Store a one-line note says which one is in use ([data-paywith-note]).
const KEY = 'santa.payWith', CHOICES = { santa: 'SANTA', sol: 'SOL' };
let mem = 'santa';
export function payWith() {
  try { const v = localStorage.getItem(KEY); if (v in CHOICES) return v; } catch {}
  return mem;
}
export function setPayWith(v) {
  if (!(v in CHOICES)) return;
  mem = v; try { localStorage.setItem(KEY, v); } catch {}
  render(); document.dispatchEvent(new CustomEvent('santa:paywith')); // the wallet line under each game moves its green (walletline.js)
}
const slots = () => document.querySelectorAll('[data-paywith-slot]'), notes = () => document.querySelectorAll('[data-paywith-note]');
export function payWithHtml(now = payWith()) {
  return `<span class="pwlabel">Pay with</span><span class="pwseg" role="group" aria-label="Pay with">${Object.entries(CHOICES)
    .map(([k, label]) => `<button type="button" data-paywith="${k}" aria-pressed="${k === now}">${label}</button>`).join('')}</span>`
    + `<em class="pwhint">${now === 'sol' ? 'SOL is swapped to SANTA inside the same payment' : 'from the SANTA in your wallet'}</em>`;
}
export const payWithNote = (now = payWith()) => `Paying with <b>${CHOICES[now]}</b> · <button type="button" class="pwchange" data-paywith-open>change</button>`;
function render() { for (const el of slots()) el.innerHTML = payWithHtml(); for (const el of notes()) el.innerHTML = payWithNote(); }
let wired = false;
export function showPayWith() {
  if (!wired) { wired = true; document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-paywith]'); if (b) setPayWith(b.dataset.paywith);
    if (e.target.closest('[data-paywith-open]')) document.querySelector('#signin')?.click(); // "change": the profile sheet, where the switch is
  }); }
  render(); for (const el of [...slots(), ...notes()]) el.hidden = false;
}
