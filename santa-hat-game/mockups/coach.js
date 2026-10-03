// FIRST-MATCH TIPS (Cody, 2026-10-03): the first time someone plays a match in this browser, three short tips, each one done
// by doing it: move, throw, get the hat. A tip moves on when the player does the thing, or after a while if they don't; "Skip
// tips" ends them. Shown once per browser (localStorage 'santa.coached'; a browser that blocks storage sees them each visit,
// which is harmless). The words match the real controls (guide.html "Controls").
const KEY = 'santa.coached', LATER_MS = 12_000;
const seen = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const remember = () => { try { localStorage.setItem(KEY, '1'); } catch {} };

export function createCoach({ touch, el }) {
  const STEPS = [
    { id: 'move', title: 'Move', text: touch ? 'Drag the joystick to run around.' : 'Run with WASD or the arrow keys.' },
    { id: 'throw', title: 'Throw', text: touch ? 'Tap anywhere to throw a snowball there.' : 'Click where you want to throw. Space aims for you.' },
    { id: 'hat', title: 'Get the hat', text: 'Run into the Santa hat to wear it. You score while it\'s on your head; a hit knocks it off.' },
  ];
  let step = seen() ? STEPS.length : 0, since = 0, start = null, threw = false, shown = '';
  const finish = () => { step = STEPS.length; remember(); draw(); };
  el.addEventListener('click', (e) => { if (e.target.closest('[data-coach="skip"]')) finish(); });
  function draw() {
    const s = STEPS[step], html = s ? `<i>Tip ${step + 1} of ${STEPS.length}</i><b>${s.title}</b><span>${s.text}</span><button type="button" data-coach="skip">Skip tips</button>` : '';
    if (html !== shown) { shown = html; el.innerHTML = html; }
    el.hidden = !s;
  }
  // Every frame: v = the match view, mine = my player in it (null when watching or not in a match).
  function update(v, mine, now = Date.now()) {
    if (step >= STEPS.length) return draw();
    if (!v || !mine || v.phase !== 'play') { el.hidden = true; return; }
    if (!since) since = now;
    if (!start) start = { x: mine.x, z: mine.z };
    const s = STEPS[step].id;
    const did = s === 'move' ? Math.hypot(mine.x - start.x, mine.z - start.z) > 2
      : s === 'throw' ? threw
      : v.hat?.st === 'head' && v.hat.holder === mine.id;
    if (did || now - since > LATER_MS) { step++; since = now; if (step >= STEPS.length) return finish(); }
    draw();
  }
  return { update, thrown: () => { threw = true; }, get step() { return step; }, finish };
}
