// THE X SERIES (Cody 2026-10-06: "make some X content videos ... about 10-15 ... a video for each match type that we have turned
// off ... maybe do break down about how the game works"). Writes marketing/timelines/x01..x12.json for compose.html
// (render each: node tests/browser/promo-compose.mjs marketing/timelines/<file>.json <name>). Every fact on screen comes from
// the game itself (mockups/sim.js PTS, specials.js, gear.js + catalog.js names and prices, levels.js, weekly.js, server/tourney.js,
// docs/money-flow.html). The look: the earlier videos' (2-steal-the-hat): a hook card, the footage with step captions, an end card.
// Run: node marketing/make-x-series.mjs
import { writeFileSync } from 'node:fs';

const C = { brim: '#f5f1e8', red: '#ff7a66', lamp: '#ffbe5c', frost: '#b9cdf2', pine: '#7fe0a0' };
const SITE = { text: 'santahatgames.com', font: 'body', size: 70, weight: 800, color: C.lamp };
// the opening card: 2-3 short lines, the second arriving a beat later
const hook = (dur, a, b, sub) => ({ t: 0, dur, fur: true, lines: [
  { text: a, y: 680, size: a.length > 12 ? 130 : 160, color: C.brim, at: -1 },
  ...(b ? [{ text: b, y: 880, size: b.length > 14 ? 104 : 128, color: C.red, at: 0.6 }] : []),
  ...(sub ? [{ text: sub, y: 1060, font: 'pixel', size: sub.length > 18 ? 34 : 42, weight: 700, color: C.frost, at: 1.0 }] : []),
  { ...SITE, y: 1300, at: -1 } ] });
// footage: a clip (src) or a picture (img); kicker + label under it
const clip = (t, dur, src, from, o = {}) => ({ t, dur, src, from, mute: true, zoom0: 1.25, zoom1: 1.12, fadeIn: 0.08, fadeOut: 0.12, vignette: 0.3, ...o });
const pic = (t, dur, img, o = {}) => ({ t, dur, img, zoom0: 1.0, zoom1: 1.06, fadeIn: 0.12, fadeOut: 0.15, vignette: 0.15, ...o });
// a caption band at the top: a small step label and the big line (and an optional second line)
const cap = (t, dur, step, line, line2, low = false) => { const o = low ? 1330 : 0; return { t: t + 0.1, dur: dur - 0.2, band: [170 + o, line2 ? 330 : 250], lines: [
  { text: step, y: 230 + o, font: 'pixel', size: 42, weight: 700, color: C.lamp },
  { text: line, y: 330 + o, size: line.length > 18 ? 92 : 112, color: C.brim },
  ...(line2 ? [{ text: line2, y: 440 + o, font: 'body', size: 54, weight: 700, color: C.frost }] : []) ] }; };
// the closing card over the last footage
const end = (t, dur, a, b) => ({ t: t + 0.1, dur, band: [1360, 430], lines: [
  { text: a, y: 1470, size: a.length > 16 ? 104 : 128, color: C.brim },
  ...(b ? [{ text: b, y: 1590, font: 'body', size: 60, weight: 700, color: C.frost }] : []),
  { ...SITE, y: 1700, size: 82 } ] });
const music = (len, steps) => ({ bpm: 112, parts: [
  { drone: true, t: 0, end: 2.4, note: 38, v: 0.12 }, { bells: true, t: 0.05, notes: [74, 77, 81, 86], every: 1, v: 0.14 },
  { roll: true, t: 1.2, end: 2.4 }, { boom: true, t: 2.4, v: 1 },
  { groove: true, t: 2.4, end: len, bass: [38, 38, 41, 43, 38, 38, 45, 43] },
  ...steps.map((t, i) => ({ hit: true, t, v: 0.5 + 0.05 * i })), { stab: true, t: len - 3.2, root: 50, v: 0.08 } ] });
// a video: the hook, then footage pieces of `each` seconds with one caption each, then the end card on the last piece
function video(name, hk, pieces, endA, endB, each = 2.6) {
  const H = hk.dur, segs = [hk], over = [], steps = [];
  pieces.forEach((p, i) => { const t = H + i * each; segs.push({ ...p.seg(t, each + (i === pieces.length - 1 ? 1.6 : 0)), ...(i === 0 ? { flash: 0.8 } : {}) });
    if (p.cap) over.push(cap(t, each, ...p.cap.slice(0, 3).concat(p.cap.length < 3 ? [undefined] : []), !!p.low)); steps.push(t); });
  const len = H + pieces.length * each + 1.6;
  over.push(end(len - 3.0, 2.9, endA, endB));
  return { name, clipVolume: 0.3, segments: segs, overlays: over, music: music(len, steps) };
}
const raw = (f) => `raw/${f}`, still = (f) => `stills/${f}`;
const M = (m) => raw(`gameplay-mode-${m}.webm`);
const G = (from) => (t, d) => clip(t, d, M(from % 2 < 1 ? 'gazebo' : 'hothat'), Math.min(13, from), { zoom0: 1.15, zoom1: 1.05 }); // close-up practice footage
const Gc = (from) => (t, d) => clip(t, d, raw('gameplay-c.webm'), from);
const Mo = (m, from) => (t, d) => clip(t, d, M(m), from, { zoom0: 1.15, zoom1: 1.05 });
const P = (f, o) => (t, d) => pic(t, d, still(f), o);

const series = {
  // ---- the switched-off match types: "which one first?" (asking for a reply is X's best reach)
  'x01-hot-hat': video('Hot Hat (coming soon?)', hook(2.4, 'HOT HAT', 'Coming soon?', 'A NEW WAY TO PLAY'),
    [{ seg: Mo('hothat', 1.0), cap: ['THE TWIST', 'The hat scores DOUBLE'] }, { seg: Mo('hothat', 4.5), cap: ['THE CATCH', 'It melts your snowballs'] },
     { seg: Mo('hothat', 8.0), cap: ['SO', 'Hold it or throw?'] }, { seg: Mo('hothat', 11.0) }], 'Switch it on?', 'Reply YES and it goes live'),
  'x02-gazebo': video('King of the Gazebo (coming soon?)', hook(2.4, 'KING OF THE', 'GAZEBO', 'COMING SOON?'),
    [{ seg: Mo('gazebo', 1.0), cap: ['THE RULE', 'Stand in the ring', 'round the gazebo'] }, { seg: Mo('gazebo', 4.5), cap: ['ALONE?', 'You score'] },
     { seg: Mo('gazebo', 8.0), cap: ['SHARE IT?', 'Nobody scores'] }, { seg: Mo('gazebo', 11.0) }], 'Switch it on?', 'Reply YES and it goes live'),
  'x03-blizzard': video('Blizzard (coming soon?)', hook(2.4, 'BLIZZARD', 'Coming soon?', 'A SNOWSTORM HITS THE SQUARE'),
    [{ seg: Mo('blizzard', 1.0), cap: ['THE STORM', 'You see less'] }, { seg: Mo('blizzard', 4.5), cap: ['THE UPSIDE', 'Snowballs refill', '2x as fast'] },
     { seg: Mo('blizzard', 8.0), cap: ['SO', 'Throw blind. Throw a lot.'] }, { seg: Mo('blizzard', 11.0) }], 'Switch it on?', 'Reply YES and it goes live'),
  'x04-hat-hunt': video('Hat Hunt (coming soon?)', hook(2.4, 'HAT HUNT', '3 hats. 1 arena.', 'COMING SOON?'),
    [{ seg: Mo('hathunt', 1.0), cap: ['THE RULE', 'Three hats at once'] }, { seg: Mo('hathunt', 4.5), cap: ['SCORING', 'Every hat on a head', 'scores'] },
     { seg: Mo('hathunt', 8.0), cap: ['SO', 'Steal one. Keep it.'] }, { seg: Mo('hathunt', 11.0) }], 'Switch it on?', 'Reply YES and it goes live'),
  'x05-nice-vs-naughty': video('Nice vs Naughty (coming soon?)', hook(2.4, 'NICE vs', 'NAUGHTY', 'TEAM MODE · COMING SOON?'),
    [{ seg: Mo('team', 1.0), cap: ['TWO TEAMS', 'Nice vs Naughty'] }, { seg: Mo('team', 4.5), cap: ['ONE HAT', 'Your team holds it,', 'your team scores'] },
     { seg: Mo('team', 8.0), cap: ['SO', 'Bring friends.'] }, { seg: Mo('team', 11.0) }], 'Pick a side', 'Nice or Naughty? Reply below'),
  // ---- how the game works
  'x06-how-to-score': video('How a match works', hook(2.2, 'How to win', 'in 60 seconds', 'SNOWBALL SQUARE · UP TO 8 PLAYERS'),
    [{ seg: Gc(0.6), cap: ['WEAR THE HAT', '+10 every second'] }, { seg: Gc(4.4), cap: ['KNOCK IT OFF', '+10'] },
     { seg: G(2.0), cap: ['CATCH IT IN THE AIR', '+25'] }, { seg: G(6.0), cap: ['HIT SOMEONE', '+5', 'get hit: -1'] }, { seg: Gc(11.0) }], 'Free to play', 'In your browser · no download'),
  'x07-special-snowballs': video('Special snowballs', hook(2.2, '6 snowballs', 'that change everything', 'SPECIAL SNOWBALLS'),
    [{ seg: G(1.0), cap: ['ICE BALL', '2-second freeze'] }, { seg: G(3.6), cap: ['SPLIT BALL', 'Splits into 3'] }, { seg: Gc(2.0), cap: ['GIANT BALL', '3x the size'] },
     { seg: Gc(6.0), cap: ['FIRE BALL', '2x the speed'] }, { seg: G(8.0), cap: ['SKY BALL', 'Rains on where you aim'] }, { seg: Gc(12.0), cap: ['SNOWBALL RAIN', 'The whole ring, 3 seconds', 'level 5+'] }],
    'Yours forever', 'From $1 · the Store', 2.3),
  'x08-special-gear': video('Special gear', hook(2.2, 'Gear up.', 'Then grab the hat.', 'SPECIAL GEAR'),
    [{ seg: G(0.5), cap: ['KEVLAR VEST', 'Takes 1 extra hit'] }, { seg: G(3.0), cap: ['SANTA COSTUME', '2 extra hits', 'level 3+'] }, { seg: Gc(1.5), cap: ['TOY SACK', '+50% snowballs held'] },
     { seg: Gc(5.0), cap: ['ELF SHOES', '+25% speed'] }, { seg: G(7.5), cap: ['ELF HAT', 'Half your size'] }, { seg: Gc(9.5), cap: ['GIFT BOX', 'A surprise every match'] }],
    'From 50 cents', 'Lasts 7 days · the Store', 2.3),
  'x09-level-up': video('Levels and costumes', hook(2.2, 'Finish top 3.', 'Level up.', 'LEVELS 1-10'),
    [{ seg: G(1.0), cap: ['EVERY LEVEL', 'More snowballs', '5 at level 1, 12 at level 10'] }, { seg: Gc(3.0), cap: ['MORE SLOTS', 'Up to 3 special snowballs', 'and 2 gear'] },
     { seg: (t, d) => clip(t, d, raw('grok-nutcracker.mp4'), 0.6, { zoom0: 1.05, zoom1: 1.12 }), cap: ['LEVEL 5', 'Nutcracker costume'] },
     { seg: (t, d) => clip(t, d, raw('grok-frostking.mp4'), 0.6, { zoom0: 1.05, zoom1: 1.12 }), cap: ['LEVEL 10', 'Frost King costume'] }], 'Start at level 1', 'Free · santahatgames.com', 2.8),
  'x10-where-the-money-goes': video('Where your SANTA goes', hook(2.4, 'Where does', 'your SANTA go?', 'NO SECRETS'),
    [{ seg: P('money-flow.png', { dx: -882, zoom0: 1.0, zoom1: 1.04, vignette: false }), cap: ['ARCADE', '10% burned forever', '90% to the Game pool'] },
     { seg: P('money-flow.png', { dx: -882, zoom0: 1.04, zoom1: 1.08, vignette: false }), cap: ['THE GAME POOL', 'Pays every Arcade win'] },
     { seg: P('money-flow.png', { dx: -882, zoom0: 1.08, zoom1: 1.1, vignette: false }), cap: ['YOUR WINS', 'Straight to your wallet', 'in SANTA'] },
     { seg: P('money-flow.png', { dx: 882, zoom0: 1.1, zoom1: 1.12, vignette: false }), cap: ['PAY YOUR WAY', 'SANTA or SOL', 'one wallet approval'] }], 'Every payment, on-chain', 'Solana · $SANTA', 2.8),
  // ---- new this week
  'x11-tournament-night': video('Tournament night', hook(2.4, 'Tournament', 'night.', 'FREE ENTRY'),
    [{ seg: P('tour-bar.png', { dy: 208, zoom0: 1.0, zoom1: 1.05 }), low: true, cap: ['60 SECONDS', 'Tap the bar to join'] },
     { seg: P('tour-waiting.png', { zoom0: 1.0, zoom1: 1.04 }), low: true, cap: ['THE BRACKET', 'Everyone gets a seat'] },
     { seg: G(5.0), cap: ['90-SECOND GAMES', 'Top 2 go through'] },
     { seg: P('tour-bracket.png', { zoom0: 1.0, zoom1: 1.04 }), low: true, cap: ['ROUND BY ROUND', 'Until the final'] },
     { seg: P('tour-standings.png', { zoom0: 1.0, zoom1: 1.04 }), cap: ['THE FINAL', 'Top 8 placed'] }], 'Watch for the next one', 'Follow so you see the countdown', 2.6),
  'x12-family-game-night': video('Family game night', hook(2.4, 'Game night', 'code: SMITH', 'PRIVATE ROOMS'),
    [{ seg: P('code-lobby.png', { zoom0: 1.0, zoom1: 1.05 }), low: true, cap: ['STEP 1', 'Pick your own code'] },
     { seg: P('code-room.png', { zoom0: 1.0, zoom1: 1.04 }), low: true, cap: ['STEP 2', 'Everyone types it'] },
     { seg: Gc(4.0), cap: ['STEP 3', 'Snowball fight'] }, { seg: G(9.0), cap: ['NEXT WEEK', 'Same code. Same room.'] }], 'Free. No download.', 'Phones, tablets, computers', 2.7),
};
for (const [file, tl] of Object.entries(series)) writeFileSync(new URL(`timelines/${file}.json`, import.meta.url), JSON.stringify(tl, null, 1));
console.log('wrote', Object.keys(series).length, 'timelines:', Object.keys(series).join(', '));
