// SHARE A WIN (Cody's list, 2026-10-03): after a run that paid back more than it cost, "Share this win" draws a picture card
// (the game, what came back, what the run cost, a pool jackpot stamp, the site's address) in the game's own look, then opens
// the phone's share sheet with the picture, or downloads it on a computer. Only true numbers: what the run sent and cost.
const GAMES = { big: 'Big Hat', drop: 'Snowball Drop', stocking: 'Stocking Stuffer' };
const money = (v) => (v < 1 ? Math.round(v * 100) + '¢' : '$' + v.toFixed(2));
const SITE = 'santahatgames.com';

// win: { kind, sent, cost, jackpot } → the button's HTML (or '' when the run didn't win more than it cost)
export function shareButton(win) {
  if (!win || !(win.sent > win.cost) || !GAMES[win.kind]) return '';
  const data = { kind: win.kind, sent: +win.sent.toFixed(2), cost: +win.cost.toFixed(2), jackpot: +(win.jackpot || 0).toFixed(2) };
  return ` <button type="button" class="sec sharewin" data-share-win='${JSON.stringify(data).replace(/'/g, '&#39;')}'>Share this win</button>`;
}

const loadImg = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
// The card: 1200×630 (the size link previews and most feeds use).
export async function drawCard(win) {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 630; const g = c.getContext('2d');
  // the game's own fonts, loaded before drawing (a canvas doesn't wait for them by itself)
  try { await Promise.all(['64px "Grenze Gotisch"', '700 26px Silkscreen', '600 38px "Alegreya Sans"'].map((f) => document.fonts.load(f))); } catch {}
  const sky = g.createLinearGradient(0, 0, 0, 630); sky.addColorStop(0, '#121830'); sky.addColorStop(1, '#26305a'); g.fillStyle = sky; g.fillRect(0, 0, 1200, 630);
  g.fillStyle = 'rgba(255,255,255,.75)'; let h = 7; const rnd = () => ((h = Math.imul(h, 1103515245) + 12345 >>> 0) / 4294967296); // the same snow every time
  for (let i = 0; i < 110; i++) { g.beginPath(); g.arc(rnd() * 1200, rnd() * 630, 1 + rnd() * 2.5, 0, Math.PI * 2); g.fill(); } // snow
  g.fillStyle = '#1b2344'; g.strokeStyle = '#0c0f1a'; g.lineWidth = 6; g.fillRect(70, 70, 1060, 490); g.strokeRect(70, 70, 1060, 490); // the plaque
  g.fillStyle = '#cf3128'; g.fillRect(70, 70, 1060, 14);
  const logo = await loadImg('hat-logo.png'); if (logo) g.drawImage(logo, 110, 120, 110, 110);
  g.fillStyle = '#b9cdf2'; g.font = '700 26px Silkscreen, monospace'; g.fillText('SANTA HAT LEGENDS', 240, 165);
  g.fillStyle = '#eef2fb'; g.font = '400 64px "Grenze Gotisch", Georgia, serif'; g.fillText(GAMES[win.kind], 240, 225);
  if (win.jackpot) { g.save(); g.translate(930, 175); g.rotate(-0.08); g.fillStyle = '#cf3128'; g.fillRect(-150, -42, 300, 84); g.fillStyle = '#f5f1e8'; g.font = '700 30px Silkscreen, monospace'; g.textAlign = 'center'; g.fillText('POOL JACKPOT', 0, 11); g.restore(); }
  g.fillStyle = '#ffbe5c'; g.font = '700 150px Silkscreen, monospace'; g.fillText(money(win.sent), 110, 420);
  g.fillStyle = '#eef2fb'; g.font = '600 38px "Alegreya Sans", sans-serif'; g.fillText(`back from a ${money(win.cost)} run`, 115, 485);
  g.fillStyle = '#9aa6c7'; g.font = '600 30px "Alegreya Sans", sans-serif'; g.textAlign = 'right'; g.fillText(SITE, 1090, 530);
  return c;
}

export async function shareWin(win) {
  const c = await drawCard(win), blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  const text = `${money(win.sent)} back from a ${money(win.cost)} run on ${GAMES[win.kind]}${win.jackpot ? ', with a POOL JACKPOT' : ''}! Play at https://${SITE}`;
  const file = new File([blob], 'santa-hat-win.png', { type: 'image/png' });
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return 'shared'; } } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'santa-hat-win.png'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return 'downloaded';
}

export function initShareWins() {
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-share-win]'); if (!b) return;
    let win; try { win = JSON.parse(b.dataset.shareWin); } catch { return; }
    b.disabled = true; const was = b.textContent; b.textContent = 'Making your picture…';
    const how = await shareWin(win).catch(() => 'failed');
    b.textContent = how === 'downloaded' ? 'Saved: post it anywhere' : how === 'failed' ? 'Could not make the picture' : was; b.disabled = false;
  });
}
