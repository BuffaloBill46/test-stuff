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

// A BIG win on a single play (Cody 2026-10-04: "share buttons for big wins"): a pool jackpot, or 10× the stake or more (the
// celebration's BIG WIN tier and up, celebrate.js) puts "Share this win" on the game's result line, right away.
export const bigShare = (kind, pay, bet, jackpot = false) => (jackpot || pay >= 10 * bet ? shareButton({ kind, sent: pay, cost: bet, jackpot: jackpot ? pay : 0 }) : '');
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

// The shared frame of every card: night sky, snow, the plaque, the hat logo and the game's name; returns the canvas and its pen
async function frame(title) {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 630; const g = c.getContext('2d');
  try { await Promise.all(['64px "Grenze Gotisch"', '700 26px Silkscreen', '600 38px "Alegreya Sans"'].map((f) => document.fonts.load(f))); } catch {}
  const sky = g.createLinearGradient(0, 0, 0, 630); sky.addColorStop(0, '#121830'); sky.addColorStop(1, '#26305a'); g.fillStyle = sky; g.fillRect(0, 0, 1200, 630);
  g.fillStyle = 'rgba(255,255,255,.75)'; let h = 7; const rnd = () => ((h = Math.imul(h, 1103515245) + 12345 >>> 0) / 4294967296);
  for (let i = 0; i < 110; i++) { g.beginPath(); g.arc(rnd() * 1200, rnd() * 630, 1 + rnd() * 2.5, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#1b2344'; g.strokeStyle = '#0c0f1a'; g.lineWidth = 6; g.fillRect(70, 70, 1060, 490); g.strokeRect(70, 70, 1060, 490);
  g.fillStyle = '#cf3128'; g.fillRect(70, 70, 1060, 14);
  const logo = await loadImg('hat-logo.png'); if (logo) g.drawImage(logo, 110, 120, 110, 110);
  g.fillStyle = '#b9cdf2'; g.font = '700 26px Silkscreen, monospace'; g.fillText('SANTA HAT LEGENDS', 240, 165);
  g.fillStyle = '#eef2fb'; g.font = '400 64px "Grenze Gotisch", Georgia, serif'; g.fillText(title, 240, 225);
  g.fillStyle = '#9aa6c7'; g.font = '600 30px "Alegreya Sans", sans-serif'; g.textAlign = 'right'; g.fillText(SITE, 1090, 530); g.textAlign = 'left';
  return { c, g };
}
const ORD = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
// AFTER A MATCH (Cody 2026-10-04: "after the game where they can share the score"): place, score, and my aim
export async function drawMatchCard(m) {
  const { c, g } = await frame('Snowball Square');
  g.fillStyle = '#ffbe5c'; g.font = '700 150px Silkscreen, monospace'; g.fillText(ORD(m.place), 110, 420);
  g.fillStyle = '#eef2fb'; g.font = '600 44px "Alegreya Sans", sans-serif'; g.fillText(`of ${m.players} · ${m.score} points`, 520, 345);
  if (m.thrown != null) { g.fillStyle = '#b9cdf2'; g.font = '600 34px "Alegreya Sans", sans-serif';
    g.fillText(`${m.thrown} thrown · ${m.hits} hit · ${m.thrown ? Math.min(100, Math.round((100 * m.hits) / m.thrown)) : 0}%`, 520, 405); }
  g.fillStyle = '#eef2fb'; g.font = '600 32px "Alegreya Sans", sans-serif'; g.fillText(m.place === 1 ? 'Kept the Santa hat. Come take it.' : 'Think you can beat that?', 115, 490);
  return c;
}
// A NEW COSTUME (Cody 2026-10-04: "when they acquire a costume"): its name and the player in it (img: a picture of the look)
let portraitOf = null; // (set) → a picture of the costume on the model; tabs.js hands it over (it owns the 3D renderer)
export const usePortraits = (fn) => { portraitOf = fn; };
export async function drawCostumeCard(k) {
  const { c, g } = await frame('New costume!');
  const src = k.img || (k.set && portraitOf ? portraitOf(k.set) : null), img = src ? await loadImg(src) : null; if (img) g.drawImage(img, 770, 128, 350, 350); // clear of the site name below
  g.fillStyle = '#ffbe5c'; g.font = '400 84px "Grenze Gotisch", Georgia, serif'; g.fillText(k.name, 110, 360);
  g.fillStyle = '#eef2fb'; g.font = '600 36px "Alegreya Sans", sans-serif'; g.fillText(k.how || 'Unlocked in Snowball Square', 115, 430);
  return c;
}
async function shareCanvas(c, text, file) {
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/png')), f = new File([blob], file, { type: 'image/png' });
  try { if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f], text }); return 'shared'; } } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return 'downloaded';
}
export const shareMatch = async (m) => shareCanvas(await drawMatchCard(m), `${ORD(m.place)} of ${m.players} with ${m.score} points in Snowball Square! Play at https://${SITE}`, 'santa-hat-match.png');
export const shareCostume = async (k) => shareCanvas(await drawCostumeCard(k), `I got the ${k.name} costume in Santa Hat Legends! Play at https://${SITE}`, 'santa-hat-costume.png');
export const matchShareButton = (m) => ` <button type="button" class="sec" data-share-match='${JSON.stringify(m).replace(/'/g, '&#39;')}'>Share my score</button>`;
export const costumeShareButton = (k, label = 'Share it') => ` <button type="button" class="sec" data-share-costume='${JSON.stringify(k).replace(/'/g, '&#39;')}'>${label}</button>`;

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
    const b = e.target.closest('[data-share-win], [data-share-match], [data-share-costume]'); if (!b) return;
    let data; try { data = JSON.parse(b.dataset.shareWin || b.dataset.shareMatch || b.dataset.shareCostume); } catch { return; }
    const go = b.dataset.shareWin ? shareWin : b.dataset.shareMatch ? shareMatch : shareCostume;
    b.disabled = true; const was = b.textContent; b.textContent = 'Making your picture…';
    const how = await go(data).catch(() => 'failed');
    b.textContent = how === 'downloaded' ? 'Saved: post it anywhere' : how === 'failed' ? 'Could not make the picture' : was; b.disabled = false;
  });
}
