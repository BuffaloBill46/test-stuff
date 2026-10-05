// The custom run under each game's 1 / 5 / 10 buttons (Cody, 2026-10-01: "a custom fill box with arrows. That way if people want
// to spin more than 10 times they can. Maybe set a max of 100"). ▼ ▲ step by one (hold to keep going), or type a number. Its
// Play button is an ordinary [data-run] button, so the game's own click handler, price labels and busy state treat it like the
// others; this only keeps its number, label and price in step with the box.
import { MAX_RUN } from './credits.js?v=167023048e';

// A run's price as the buttons show it: 50¢, $2, $2.50.
export const priceLabel = (usd) => { const v = Math.round(usd * 100) / 100; return v < 1 ? Math.round(v * 100) + '¢' : '$' + (Number.isInteger(v) ? v : v.toFixed(2)); };
export const clampRun = (v) => Math.min(MAX_RUN, Math.max(1, Math.round(Number(v)) || 1));

// box: the .runpick element; verb: 'Pull' / 'Drop'; priceOf(n) → the price label for n plays at the game's current size.
export function initRunPick(box, { verb, priceOf }) {
  const input = box.querySelector('input'), go = box.querySelector('[data-run]');
  input.max = MAX_RUN;
  const set = (v) => { const n = clampRun(v); input.value = n; go.dataset.run = n; go.querySelector('b').textContent = `${verb} ${n}`; go.querySelector('small').textContent = priceOf(n); };
  for (const b of box.querySelectorAll('[data-step]')) {
    const step = () => set(clampRun(input.value) + Number(b.dataset.step));
    let wait = 0, every = 0, held = false;
    const stop = () => { clearTimeout(wait); clearInterval(every); };
    b.addEventListener('pointerdown', () => { held = false; stop(); wait = setTimeout(() => { held = true; every = setInterval(step, 70); }, 450); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
    b.addEventListener('click', () => { if (!held) step(); held = false; }); // a tap, or Enter/Space on the keyboard
  }
  // typing: the label follows each valid number; leaving the box (or Enter) settles it into 1–100
  input.addEventListener('input', () => { const n = Number(input.value); if (Number.isInteger(n) && n >= 1 && n <= MAX_RUN) set(n); });
  input.addEventListener('change', () => set(input.value));
  // Enter only settles the number (moving focus to Play here let the same key press buy the run: the dialog opened)
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); set(input.value); } });
  set(input.value);
  return { set, refresh: () => set(input.value) };
}
