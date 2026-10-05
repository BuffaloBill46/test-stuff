// SUPPORT (Cody, 2026-10-04): the Support button sits next to the game's X link at the bottom of the sign-in sheet. It opens a
// short form (what happened, and optionally how to reach you); the message goes to the game server ('support', server/support.js),
// which keeps it and sends it to Cody's Telegram bot at once; he marks it handled on the admin screen. Works signed in or not
// (players who can't sign in need it most), on the demo site too (it always reaches the live game server).
import { call } from './gameserver.js?v=896c3a7b98';

const $ = (s) => document.querySelector(s);
// MY TICKETS (Cody 2026-10-04: "put the ticket number under the support button with pending or resolved"): each message sent
// from this browser is kept here with its secret ticket code (server/support.js), newest first, at most 20, so it can be followed
// without signing in; signed in, the server adds all of the player's own. Shown under Support, refreshed when the sheet opens.
const KEY = 'santa.supportTickets';
const mine = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const remember = (t) => { try { localStorage.setItem(KEY, JSON.stringify([t, ...mine().filter((x) => x.id !== t.id)].slice(0, 20))); } catch {} };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export async function showTickets() {
  const box = $('#supportTickets'); if (!box) return;
  const r = await call('support-status', { tickets: mine() }).catch(() => null);
  const list = r?.ok ? r.tickets : [];
  box.hidden = !list.length;
  // a RESOLVED ticket gets an × to clear it from the list (so the player has seen the answer first); a pending one has none (Cody)
  box.innerHTML = list.map((t) => `<li class="${t.status}"><b>Ticket #${t.id}</b><span class="st">${t.status === 'resolved' ? 'Resolved' : 'Pending'}${t.status === 'resolved'
    ? `<button type="button" class="tclear" data-clear="${t.id}" aria-label="Remove ticket #${t.id} from the list">×</button>` : ''}</span>
    <small>${esc(t.about)}${t.about.length >= 60 ? '…' : ''}</small>${t.note ? `<em>${esc(t.note)}</em>` : ''}</li>`).join('');
}
async function clearTicket(id) {
  const r = await call('support-clear', { id, tickets: mine() }).catch(() => null);
  if (r?.ok) { try { localStorage.setItem(KEY, JSON.stringify(mine().filter((t) => t.id !== id))); } catch {} }
  showTickets();
}
const where = () => document.querySelector('section.page:not([hidden])')?.id?.replace(/^tab-/, '') || location.hash.slice(1) || 'home';
function setOpen(open) {
  $('#supportForm').hidden = !open; $('#supportBtn').setAttribute('aria-expanded', String(open));
  if (open) { $('#supportNote').textContent = ''; $('#supportNote').className = ''; $('#supportMsg').focus(); }
}
export function initSupport() {
  if (!$('#supportBtn')) return;
  $('#supportBtn').addEventListener('click', () => setOpen($('#supportForm').hidden));
  $('#supportCancel').addEventListener('click', () => setOpen(false));
  $('#supportTickets')?.addEventListener('click', (e) => { const b = e.target.closest('[data-clear]'); if (b) { b.disabled = true; clearTicket(+b.dataset.clear); } });
  // the sheet opening (sign in / my account): fetch my tickets' status fresh each time
  new MutationObserver(() => { if (!$('#acct').hidden) showTickets(); }).observe($('#acct'), { attributes: true, attributeFilter: ['hidden'] });
  $('#supportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = $('#supportNote'), send = $('#supportSend'), message = $('#supportMsg').value.trim();
    if (!message) { note.className = 'bad'; note.textContent = 'Write what happened first.'; return; }
    send.disabled = true; note.className = ''; note.textContent = 'Sending…';
    const r = await call('support', { message, contact: $('#supportContact').value.trim(), page: where() }).catch(() => ({ error: 'couldn\'t reach the game server; check your connection and try again' }));
    send.disabled = false;
    if (r?.ok) { $('#supportMsg').value = ''; if (r.key) remember({ id: r.id, key: r.key }); showTickets();
      note.textContent = `Sent: ticket #${r.id}. Thanks! Its status shows below: Pending until we've looked at it, then Resolved.`; }
    else { note.className = 'bad'; note.textContent = 'Not sent: ' + (r?.error || 'something went wrong'); }
  });
}
initSupport();
