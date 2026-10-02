// The referee's web door (referee.mjs) for real: it starts the door, then connects like a page does. Other websites are
// refused, a room sends players and snapshots, /health answers, and a flood of messages gets the line closed.
// Needs: npm install here. Run: node referee.door.test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const PORT = 8091, door = spawn(process.execPath, [fileURLToPath(new URL('./referee.mjs', import.meta.url))], { env: { ...process.env, PORT: String(PORT) }, stdio: 'inherit' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/health`); break; } catch { await wait(150); } }
  const open = (origin) => new Promise((res) => { const ws = new WebSocket(`ws://localhost:${PORT}`, { origin }); const got = []; ws.on('message', (d) => got.push(JSON.parse(d))); ws.on('open', () => res({ ws, got })); ws.on('close', (c) => res({ closed: c, got })); });
  const bad = await open('https://evil.example'); await wait(300);
  assert.ok(bad.closed === 1008 || bad.ws?.readyState === 3, 'another website is refused');
  const a = await open('https://buffalobill46.github.io');
  a.ws.send(JSON.stringify({ t: 'join', code: 'PF3', me: { id: 'doortest1', n: 'Door', a: {}, l: 2 } }));
  await wait(1500);
  const snaps = a.got.filter((m) => m.t === 'snap');
  assert.deepEqual(a.got.find((m) => m.t === 'peers')?.ps.map((p) => p.id), ['doortest1']);
  assert.ok(snaps.length >= 8, 'about 8 snapshots a second: ' + snaps.length);
  assert.ok(snaps.at(-1).d.cd > 20, 'the 25 s auto-start countdown for one player');
  assert.deepEqual(await (await fetch(`http://localhost:${PORT}/health`)).json(), { ok: true, rooms: 1, players: 1 });
  for (let i = 0; i < 60; i++) a.ws.send('{"t":"rep","d":{}}');
  await wait(400); assert.equal(a.ws.readyState, 3, 'a flood of messages closes the line');
  await wait(200); assert.deepEqual(await (await fetch(`http://localhost:${PORT}/health`)).json(), { ok: true, rooms: 0, players: 0 }, 'and the player left the room');
  console.log('OK: referee door: other websites refused, room + ~8 snapshots/s, health, floods closed and cleaned up');
} finally { door.kill(); }
