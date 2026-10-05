// The whole offline browser suite on WINDOWS, several tests at once, in the real Chrome (win-chrome.mjs). In WSL it took ~1.5 h
// with timeouts; here each test runs ~2× faster and 4 run side by side. Tests that open the same fixed port never run together.
// Run: PW=<folder with node_modules/playwright> node run-suite.mjs [how many at once=4] [only these tests…]
// Logs: out/suite/<test>.log; a test passes when it exits 0 and prints no ✗ / FAILED / error.
import { spawn } from 'child_process'; import { mkdirSync, createWriteStream, readFileSync } from 'fs';
// (spin-test.mjs is gone: Santa Hat Spin was removed altogether, 2026-10-04)
const TESTS = ['admin-test', 'controls-test', 'costumes-test', 'drop-test', 'finish-test', 'games-test', 'joystick-test', 'link-test', 'loadout-test',
  'lobby-test', 'lottery-test', 'match-intro-test', 'plinko-test', 'progress-or-test', 'referee-ranked-test', 'referee-server-test', 'runpick-test',
  'server-mode-test', 'settings-mode-test', 'sfx-test', 'shop-test', 'skip-toggle-test', 'stocking-test', 'store-gear-test', 'tabs-test',
  'theme-test', 'visuals-gear-test', 'button-audit', 'specials-play', 'gear-play', 'games-howto-shots', 'sb-lock-test', 'guide-test',
  'season-test', 'wallet-line-test', 'sol-pay-page', 'support-test'];
// the fixed local port each one opens (two tests with the same port wait for each other)
const PORTS = { 'admin-test': 8788, 'shop-test': 8788, 'settings-mode-test': 8787, 'server-mode-test': 8787, 'button-audit': 8787, 'finish-test': 8794,
  'lottery-test': 8795, 'referee-ranked-test': 8094, 'referee-server-test': 8092, 'guide-test': 8793, 'season-test': 8786 };
// joystick-test plays the published site (it has no server of its own)
const ENV = { 'joystick-test': { SITE: 'https://santahatgames.com/' } };
const N = +(process.argv[2] || 4), only = process.argv.slice(3), list = only.length ? only : TESTS, OUT = './out/suite/';
mkdirSync(OUT, { recursive: true });
const busy = new Set(), results = [], t0 = Date.now(), queue = [...list];
const bad = (log) => /✗|FAILED|^Error|TimeoutError|SyntaxError/m.test(log);
function run(name) {
  return new Promise((done) => {
    const s = Date.now(), log = createWriteStream(OUT + name + '.log');
    const child = spawn(process.execPath, ['--import', './win-chrome.mjs', name + '.mjs'], { env: { ...process.env, ...(ENV[name] || {}) } });
    child.stdout.pipe(log); child.stderr.pipe(log);
    const timer = setTimeout(() => child.kill(), 20 * 60 * 1000);
    child.on('close', (code) => { clearTimeout(timer); log.end(() => {
      const text = readFileSync(OUT + name + '.log', 'utf8'), ok = code === 0 && !bad(text);
      results.push({ name, ok, secs: Math.round((Date.now() - s) / 1000) });
      console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (${Math.round((Date.now() - s) / 1000)} s)${ok ? '' : ': ' + (text.match(/^.*(✗|FAILED|Error|Timeout).*$/m)?.[0] || 'exit ' + code).trim().slice(0, 160)}`);
      done(); }); });
  });
}
async function worker() {
  while (queue.length) {
    const i = queue.findIndex((t) => !PORTS[t] || !busy.has(PORTS[t]));
    if (i < 0) { await new Promise((r) => setTimeout(r, 500)); continue; }
    const [name] = queue.splice(i, 1); if (PORTS[name]) busy.add(PORTS[name]);
    await run(name); if (PORTS[name]) busy.delete(PORTS[name]);
  }
}
await Promise.all(Array.from({ length: N }, worker));
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} passed in ${Math.round((Date.now() - t0) / 60000 * 10) / 10} min` + (fails.length ? `; failed: ${fails.map((f) => f.name).join(', ')}` : ''));
