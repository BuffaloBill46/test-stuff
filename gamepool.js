// THE SHARED GAME POOL in demo mode (this browser only), plus two page helpers every quick game uses. Big Hat, Snowball Drop and
// Stocking Stuffer all play from it (Cody, 2026-10-02); in server mode the real pool lives on the game server.
// It lived in spinui.js, the page code of the retired Santa Hat Spin, until that game was removed (Cody, 2026-10-04: "delete
// it; if we want a wheel back we'll make a new one"). The pool's saved name stays 'sh_spin_demo', so nobody's demo pool resets;
// on the server and in the database the pool's key also stays 'spin' (it was the Spin pool before every game shared it).
import { POOL_RULES } from './slots.js?v=e693b9fb42';

const KEY = 'sh_spin_demo';
const store = { get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }, set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} } };
const saved = store.get();
const st = saved && Number.isFinite(saved.pool) ? { treasury: 0, ...saved } : { pool: POOL_RULES.start, treasury: 0 };
if (typeof window !== 'undefined') window.__pool = { st }; // tests: the demo Game pool

export const poolState = () => st;
export function savePool() { store.set(st); }
export function resetPool() { Object.assign(st, { pool: POOL_RULES.start, treasury: 0 }); store.set(st); }

// Phones: a game's result line sits under its screen; bring it just into view when the play ends (focus-group finding).
// The bottom tab bar covers the page on phones, so "visible" means above it (a first version missed that).
export const visibleBottom = () => { const t = document.querySelector('#nav .tabs'), r = t?.getBoundingClientRect(); return r && r.top > innerHeight / 2 ? r.top : innerHeight; };
export function showResult(el) { const r = el.getBoundingClientRect(); if (r.bottom > visibleBottom() || r.top < 0) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
