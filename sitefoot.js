// THE BOTTOM OF EVERY PAGE + "HOW TO GET SANTA" (Cody, 2026-10-04 to-do #10 and #10b). One footer for the game page and the guide:
// the version and build, the copyright, the game's X account, Support and "How to get SANTA". That last one (and the same link in
// the sign-in sheet) opens a pop-up with the steps: a wallet, SOL into it, SOL swapped for SANTA. The pop-up is also reachable
// as #get-santa (a link anyone can share); #support opens the Support form on the game page (the guide's Support link uses it).
// Paying with SOL directly is only mentioned once the game says it takes SOL (online.js calls setSolPay on mainnet).
import { BUILD } from './buildcheck.js?v=f4ba83e65c';
import { MINT } from './market.js?v=f4ba83e65c';

export const VERSION = '1.0';          // the release players see; raise it for a real release (the build id changes every publish)
export const YEAR = 2026;
const START = location.hash;           // read now: the game page rewrites the address to its tab right after loading
const X_URL = 'https://x.com/Santahatgame';
const X_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L2.8 2h6.4l4.4 5.9L18.9 2Zm-1.1 18.1h1.7L7.7 3.8H5.9l11.9 16.3Z"/></svg>';
const HELP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 15.6a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Zm1.4-5.1c-.6.4-.8.6-.8 1.2v.4h-2.3v-.5c0-1.4.6-2 1.5-2.6.7-.5 1.1-.8 1.1-1.5 0-.7-.6-1.2-1.4-1.2-.9 0-1.5.5-1.6 1.4L7.6 9.4C7.9 7.4 9.6 6.2 12 6.2c2.3 0 3.9 1.3 3.9 3.2 0 1.5-.8 2.3-2.5 3.1Z"/></svg>';
const SANTA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 15.5c.8 1 2.2 1.6 4 1.6 2.4 0 3.9-1.1 3.9-2.8 0-3.5-7.2-2-7.2-4.8 0-.9.9-1.5 2.4-1.5 1.2 0 2.2.4 2.9 1.1" fill="none" stroke="var(--ink, #0c0f1a)" stroke-width="2" stroke-linecap="round"/></svg>';

const CSS = `
.sitefoot { margin: 28px 0 8px; padding: 12px 16px; background: rgba(12,15,26,.86); border: 2px solid var(--ink, #0c0f1a); /* on a plaque: the game page's sky behind it is light */ display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px;
  color: var(--dim, #9aa6c7); font: 500 15px/1.4 var(--body, sans-serif); }
.sitefoot .links { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; }
.sitefoot a, .sitefoot button { display: inline-flex; align-items: center; gap: 7px; color: var(--text, #eef2fb); font: 700 15px/1.2 var(--body, sans-serif);
  background: none; border: 0; padding: 4px 0; cursor: pointer; text-decoration: none; }
.sitefoot a:hover span, .sitefoot button:hover span, .sitefoot a:focus-visible span, .sitefoot button:focus-visible span { text-decoration: underline; }
.sitefoot svg { width: 17px; height: 17px; fill: currentColor; flex: none; }
.sitefoot .getsanta { color: var(--lamp, #ffbe5c); }
.sitefoot .legal { margin-left: auto; font: 700 11px/1.6 var(--digits, monospace); letter-spacing: .5px; color: var(--frost, #b9cdf2); }
.testribbon { position: fixed; z-index: 9999; left: 0; right: 0; top: 0; pointer-events: none; text-align: center; padding: 1px 8px 2px;
  font: 700 10px/1.3 var(--digits, monospace); letter-spacing: 1px; color: #0c0f1a; background: repeating-linear-gradient(135deg, #ffbe5c 0 14px, #f5d08a 14px 28px); }
@media (max-width: 640px) { .sitefoot .legal { margin-left: 0; width: 100%; } }
#getSantaDlg { width: min(640px, calc(100vw - 24px)); max-height: calc(100vh - 32px); overflow: auto; padding: 16px 18px 18px; color: var(--text, #eef2fb);
  background: #1b2344; border: 2px solid var(--ink, #0c0f1a); font: 400 17px/1.5 var(--body, sans-serif); }
#getSantaDlg::backdrop { background: rgba(8,10,20,.72); }
#getSantaDlg .gshead { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
#getSantaDlg .gseye { font: 700 11px/1 var(--digits, monospace); letter-spacing: 1.5px; text-transform: uppercase; color: var(--lamp, #ffbe5c); }
#getSantaDlg h2 { font: 800 32px/1.05 var(--display, serif); color: var(--brim, #f5f1e8); margin: 6px 0 0; }
#getSantaDlg h3 { font: 800 22px/1.2 var(--display, serif); color: var(--brim, #f5f1e8); margin: 16px 0 6px; }
#getSantaDlg ol { margin: 0; padding-left: 0; list-style: none; counter-reset: gs; display: grid; gap: 10px; }
#getSantaDlg ol > li { counter-increment: gs; display: grid; grid-template-columns: 30px 1fr; gap: 10px; }
#getSantaDlg ol > li::before { content: counter(gs); font: 700 14px/28px var(--digits, monospace); text-align: center; height: 28px; color: var(--ink, #0c0f1a);
  background: var(--lamp, #ffbe5c); border: 2px solid var(--ink, #0c0f1a); }
#getSantaDlg a { color: var(--lamp, #ffbe5c); }
#getSantaDlg .mint { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 6px; }
#getSantaDlg code { font: 500 13px/1.4 ui-monospace, Consolas, monospace; background: #121830; border: 1px solid #2c3766; padding: 4px 6px; word-break: break-all; }
#getSantaDlg .sec, #getSantaDlg .gsclose { font: 700 15px/1 var(--body, sans-serif); color: var(--text, #eef2fb); background: var(--plaque-hi, #26305a);
  border: 2px solid var(--ink, #0c0f1a); padding: 8px 12px; cursor: pointer; }
#getSantaDlg .solpay { margin-top: 14px; padding: 10px 12px; border-left: 4px solid #5fb8f0; background: #16204a; }
#getSantaDlg .warn { margin-top: 14px; color: var(--dim, #9aa6c7); font-size: 15px; }
`;

const DIALOG = `
<div class="gshead"><div><div class="gseye">SANTA · the game's coin</div><h2 id="getSantaTitle">How to get SANTA</h2></div>
  <button type="button" class="gsclose" data-gs-close>Close</button></div>
<p>Everything you pay for in the Arcade and the Store is paid in SANTA, a coin on Solana. Four steps, about five minutes the first time.</p>
<ol>
  <li><div><b>Get a Solana wallet.</b> <a href="https://phantom.com" target="_blank" rel="noopener">Phantom</a> or
    <a href="https://solflare.com" target="_blank" rel="noopener">Solflare</a>, as a phone app or a browser extension. Write your secret phrase on paper and
    keep it to yourself.</div></li>
  <li><div><b>Put SOL in it.</b> SOL is Solana's own coin. Tap <b>Buy</b> in the wallet (card, Apple Pay or Google Pay, through the wallet's payment partner),
    or send SOL from an exchange such as Coinbase or Kraken to your wallet's address. Keep a little SOL (about 0.01) for network fees.</div></li>
  <li><div><b>Swap SOL for SANTA.</b> In the wallet's <b>Swap</b>, pick SOL, then paste SANTA's address as the coin to receive, or use
    <a data-gs-jup href="https://jup.ag/swap/SOL-${MINT}" target="_blank" rel="noopener">Jupiter</a>.
    <b>Check the address matches</b>: look-alike coins use the same name.
    <div class="mint"><code data-gs-mint>${MINT}</code><button type="button" class="sec" data-gs-copy>Copy</button></div></div></li>
  <li><div><b>Sign in here with that wallet.</b> Tap <b>Sign in</b>, then <b>Connect wallet</b>. Every payment shows its exact amount in your wallet
    before you approve it.</div></li>
</ol>
<div class="solpay" data-gs-solpay hidden><b>Or skip step 3:</b> the Arcade and the Store also take SOL. Pick <b>SOL</b> under the price; the game swaps it
  for you inside the same payment (one approval), and you pay exactly the price.</div>
<p class="warn">SANTA takes a small tax on every transfer, built into the coin (<span data-gs-fee>set by the coin's team</span>). SANTA is for playing the game, not an investment: only buy what you're happy
  to spend on fun. Nobody from Santa Hat will ever ask for your secret phrase or DM you first.</p>`;

const $ = (s) => document.querySelector(s);
let dlg = null;

function dialog() {
  if (dlg) return dlg;
  dlg = document.createElement('dialog');
  dlg.id = 'getSantaDlg'; dlg.className = 'plaque'; dlg.setAttribute('aria-labelledby', 'getSantaTitle'); dlg.innerHTML = DIALOG;
  const close = () => (dlg.close ? dlg.close() : dlg.removeAttribute('open'));
  dlg.querySelector('[data-gs-close]').addEventListener('click', close);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); }); // a tap on the dimmed backdrop closes it
  dlg.querySelector('[data-gs-copy]').addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(MINT); e.target.textContent = 'Copied'; }
    catch { getSelection()?.selectAllChildren(dlg.querySelector('[data-gs-mint]')); e.target.textContent = 'Selected: copy it'; }
    setTimeout(() => { e.target.textContent = 'Copy'; }, 2500);
  });
  document.body.append(dlg);
  return dlg;
}

export function openGetSanta() { const d = dialog(); setSolPay(solPay); showFee(); if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', ''); }

// the coin's transfer tax: never assumed (the token's team can change it). The game server reads it from Solana (its 'market'
// answer; a browser on our site can't ask Solana's public node, it answers 403) and online.js passes it on, on mainnet only (on the
// test network the tax is the test coin's, not real SANTA's). Until then: "set by the coin's team".
let fee = null;
export function setCoinFee(f) { fee = f?.bps >= 0 ? f : null; showFee(); }
function showFee() { const n = dlg?.querySelector('[data-gs-fee]'); if (n && fee) n.textContent = (fee.bps / 100) + '% right now'; }

// the game takes SOL directly (mainnet only): mention it in the pop-up
let solPay = false;
export function setSolPay(on) { solPay = !!on; const n = dlg?.querySelector('[data-gs-solpay]'); if (n) n.hidden = !solPay; }

// Support: on the game page, open the sign-in sheet's Support form; anywhere else, go to the game page's #support
function support() {
  if ($('#supportBtn') && $('#signin')) {
    $('#signin').click();
    setTimeout(() => { if ($('#supportForm')?.hidden) $('#supportBtn').click(); $('#supportMsg')?.focus(); }, 50);
  } else location.href = './#support';
}

function footer() {
  const f = document.createElement('footer');
  f.className = 'sitefoot';
  f.innerHTML = `<div class="links">
      <button type="button" class="getsanta" data-get-santa>${SANTA_ICON}<span>How to get SANTA</span></button>
      <a href="${X_URL}" target="_blank" rel="noopener" aria-label="Santa Hat Legends on X">${X_ICON}<span>@Santahatgame</span></a>
      <button type="button" data-site-support>${HELP_ICON}<span>Support</span></button></div>
    <div class="legal">v${VERSION}${BUILD !== 'dev' ? ' · build ' + BUILD : ''} · © ${YEAR} Santa Hat Legends</div>`;
  f.querySelector('[data-site-support]').addEventListener('click', support);
  return f;
}

// where the footer goes: the bottom of the game's pages (under whichever tab is open), or the bottom of the guide
export function initSiteFoot() {
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  ($('#pages') || $('main') || document.body).append(footer());
  // any "How to get SANTA" link on the page (the footer's, the sign-in sheet's) opens the pop-up
  document.addEventListener('click', (e) => {
    const t = e.target.closest?.('[data-get-santa]'); if (!t) return;
    e.preventDefault(); openGetSanta();
  });
  // the test site says so on every screen (to-do #11): nobody mistakes it for the real game
  if (location.hostname === 'test.santahatgames.com') { const r = document.createElement('div'); r.className = 'testribbon'; r.setAttribute('role', 'note');
    r.textContent = 'TEST SITE · test SANTA, no real value'; document.body.append(r); }
  if (START === '#get-santa') openGetSanta();
  if (START === '#support') setTimeout(support, 300);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSiteFoot, { once: true }); else initSiteFoot();
}
