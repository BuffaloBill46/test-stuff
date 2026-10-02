// Plaza themes (Cody, 2026-10-01): same ring, hat, snowballs, scoring and bots; only the look changes. Each player picks
// their own on the Avatar screen and only they see it (no network, referee or fairness change), remembered in 'sh_theme'.
// plaza.js reads everything below; `props` names the set of props it builds. Christmas is the default and must stay
// exactly the plaza it was before themes existed (tests/browser/theme-christmas-same.mjs compares it pixel for pixel).
export const THEMES = {
  christmas: {
    name: 'Christmas', props: 'christmas',
    sky: ['#0b1024', '#1c2548', '#3b3f6a'], fog: [0x232c52, 26, 78],
    lights: { hemi: 1.35, moonI: 1.3 }, // kit.js lights() defaults for the rest
    ground: 0xe6ecf5, hills: 0xe6ecf5, floor: 0xd7deec, // deep snow everywhere; the paved square is a bluer white
    stars: 500, aurora: true, moon: { pos: [-60, 55, -110], color: 0xf2f5ff, glow: 0xdfe8ff, size: 26, opacity: 0.5, r: 4 },
    snowfall: 1400, // falling flakes (online.js draws this many of its 1400)
  },
  // "With less snow, like a real Halloween" (Cody): a late-October dusk. Frosted grass with thin snow patches (so the snowball
  // piles still make sense), bare trees, a low orange harvest moon, jack-o'-lanterns, scarecrows, harvest stalls, a few graves.
  halloween: {
    name: 'Halloween', props: 'halloween',
    sky: ['#140d2b', '#3d2150', '#b3592e'], fog: [0x3a2440, 26, 78], // indigo overhead to a burnt-orange horizon; plum haze
    lights: { hemi: 1.3, sky: 0xb7a0e0, ground: 0x3b2c22, moon: 0xffd2a8, moonI: 1.3 }, // dusk: violet sky light, warm low moon
    ground: 0x6f7a4f, hills: 0x56603c, floor: 0x9aa283, // frosty grass; the square is trampled frost-pale grass
    stars: 160, aurora: false, moon: { pos: [-70, 24, -115], color: 0xffcf8a, glow: 0xffa860, size: 30, opacity: 0.45, r: 6 },
    snowfall: 140, // a few stray flurries, not a snowstorm
  },
};
export const THEME_IDS = Object.keys(THEMES);
export const DEFAULT_THEME = 'christmas';
export const themeOf = (id) => THEMES[id] || THEMES[DEFAULT_THEME];

// Remembered per player on this device. Storage can throw (private windows, blocked site data): then it's just Christmas.
export function savedTheme() { try { const t = localStorage.getItem('sh_theme'); return THEMES[t] ? t : DEFAULT_THEME; } catch { return DEFAULT_THEME; } }
export function saveTheme(id) { try { localStorage.setItem('sh_theme', id); } catch {} }
