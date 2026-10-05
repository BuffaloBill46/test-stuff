// SUPPORT (Cody, 2026-10-04): the Support button sits next to the game's X link at the bottom of the sign-in sheet. It opens a
// short form (what happened, and optionally how to reach you); the message goes to the game server ('support', server/support.js),
// which keeps it and sends it to Cody's Telegram bot at once; he marks it handled on the admin screen. Works signed in or not
// (players who can't sign in need it most), on the demo site too (it always reaches the live game server).
import { call } from './gameserver.js?v=061ef3d1d2';

const $ = (s) => document.querySelector(s);
const where = () => document.querySelector('section.page:not([hidden])')?.id?.replace(/^tab-/, '') || location.hash.slice(1) || 'home';
function setOpen(open) {
  $('#supportForm').hidden = !open; $('#supportBtn').setAttribute('aria-expanded', String(open));
  if (open) { $('#supportNote').textContent = ''; $('#supportNote').className = ''; $('#supportMsg').focus(); }
}
export function initSupport() {
  if (!$('#supportBtn')) return;
  $('#supportBtn').addEventListener('click', () => setOpen($('#supportForm').hidden));
  $('#supportCancel').addEventListener('click', () => setOpen(false));
  $('#supportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = $('#supportNote'), send = $('#supportSend'), message = $('#supportMsg').value.trim();
    if (!message) { note.className = 'bad'; note.textContent = 'Write what happened first.'; return; }
    send.disabled = true; note.className = ''; note.textContent = 'Sending…';
    const r = await call('support', { message, contact: $('#supportContact').value.trim(), page: where() }).catch(() => ({ error: 'couldn\'t reach the game server; check your connection and try again' }));
    send.disabled = false;
    if (r?.ok) { $('#supportMsg').value = ''; note.textContent = `Sent (#${r.id}). Thanks! We'll look at it soon${$('#supportContact').value.trim() ? ' and get back to you' : ''}.`; }
    else { note.className = 'bad'; note.textContent = 'Not sent: ' + (r?.error || 'something went wrong'); }
  });
}
initSupport();
