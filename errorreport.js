// ERRORS PLAYERS HIT (Cody, 2026-10-04 to-do #3): an unexpected error on the page is reported to the game server ('client-error',
// server/clienterrors.js), which groups repeats into one row with a count and tells Cody's Telegram about NEW kinds only. Only the
// game's own errors (not browser extensions' or another site's), each kind once per visit, at most 5 a visit; nothing about the
// player beyond the tab, the site's build and a short browser name. Sending never shows anything or breaks anything.
import { call } from './gameserver.js?v=2cca0899bc';

const MAX = 5, sent = new Set();
const NOISE = /ResizeObserver loop|^Script error\.?$|Non-Error promise rejection captured|Load failed$|cancelled/i;
const ours = (file) => !file || file.startsWith(location.origin); // the game's own files (an extension's or another site's are not ours)
const browser = () => { const u = navigator.userAgent; const b = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Firefox\//.test(u) ? 'Firefox' : /CriOS|Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Other';
  const os = /Android/.test(u) ? 'Android' : /iPhone|iPad|iPod/.test(u) ? 'iOS' : /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'Other';
  return `${b} on ${os}${/Phantom/i.test(u) ? ' (Phantom)' : ''}`; };
function send(message, source, stack) {
  message = String(message || '').slice(0, 300);
  if (!message || NOISE.test(message) || sent.size >= MAX || sent.has(message)) return;
  sent.add(message); // the same message once a visit, wherever it was thrown from
  const page = document.querySelector('section.page:not([hidden])')?.id?.replace(/^tab-/, '') || location.hash.slice(1) || 'home';
  call('client-error', { message, source, stack: String(stack || '').slice(0, 1200), page, build: document.documentElement.dataset.build || '', ua: browser() }).catch(() => {});
}
addEventListener('error', (e) => {
  if (!e.message || !ours(e.filename)) return; // a resource that failed to load, an extension, another site's script: not ours to fix
  send(e.message, `${(e.filename || '').replace(location.origin, '').replace(/\?.*$/, '')}:${e.lineno || 0}:${e.colno || 0}`, e.error?.stack);
});
addEventListener('unhandledrejection', (e) => {
  const r = e.reason, stack = r?.stack || '';
  if (stack && !stack.includes(location.host) && /extension:\/\//.test(stack)) return;
  const at = (stack.match(/\/([\w-]+\.js)(?:\?[^:]*)?:(\d+):(\d+)/) || []).slice(1).join(':');
  send(r?.message || String(r), at, stack);
});
