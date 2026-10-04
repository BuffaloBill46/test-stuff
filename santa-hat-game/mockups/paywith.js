// PAY WITH: SANTA or SOL (Cody, 2026-10-04: "add the sol pay option when they buy stuff. I dont want them to have to do extra
// steps"). No extra step at checkout: the choice is made once, here, and remembered on this device; "Auto" (the default) pays with
// SANTA when the wallet holds enough and with SOL otherwise (wallet.js chooseMethod). Either way it is ONE wallet approval.
// Shown only on mainnet (online.js, from the server's 'market'): the SOL swap runs on Jupiter, which isn't on devnet.
const KEY = 'santa.payWith', CHOICES = { auto: 'Auto', santa: 'SANTA', sol: 'SOL' };
let mem = 'auto';
export function payWith() {
  try { const v = localStorage.getItem(KEY); if (v in CHOICES) return v; } catch {}
  return mem;
}
export function setPayWith(v) {
  if (!(v in CHOICES)) return;
  mem = v; try { localStorage.setItem(KEY, v); } catch {}
  render();
}
const slots = () => document.querySelectorAll('[data-paywith-slot]');
export function payWithHtml(now = payWith()) {
  return `<span class="pwlabel">Pay with</span><span class="pwseg" role="group" aria-label="Pay with">${Object.entries(CHOICES)
    .map(([k, label]) => `<button type="button" data-paywith="${k}" aria-pressed="${k === now}">${label}</button>`).join('')}</span>`
    + `<em class="pwhint">${now === 'auto' ? 'SANTA if your wallet has enough, otherwise SOL' : now === 'sol' ? 'SOL is swapped to SANTA in the same payment' : 'from your SANTA'}</em>`;
}
function render() { for (const el of slots()) el.innerHTML = payWithHtml(); }
let wired = false;
export function showPayWith() {
  if (!wired) { wired = true; document.addEventListener('click', (e) => { const b = e.target.closest('[data-paywith]'); if (b) setPayWith(b.dataset.paywith); }); }
  render(); for (const el of slots()) el.hidden = false;
}
