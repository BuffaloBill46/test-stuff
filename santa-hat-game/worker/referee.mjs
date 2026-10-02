// The SERVER REFEREE's web door on the Droplet (rooms and rules: server/referee.js). Players' pages connect here with a
// WebSocket (a live two-way line) instead of Supabase Realtime; Caddy in front gives it https (wss://) and passes the visitor's
// address in x-forwarded-for. Settings (environment): PORT (default 8081), HOST, ORIGINS (extra allowed websites, comma-separated).
// Run: node referee.mjs        Health check: GET /health → { rooms, players }
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createReferee } from '../server/referee.js';
import { ALLOWED_ORIGINS } from '../server/http.js';

const PORT = Number(process.env.PORT) || 8081, TICK_MS = 1000 / 30;
const MAX_MSG = 4096, MAX_PER_SEC = 40, MAX_PER_ADDRESS = 16; // a page sends ~6 reports a second; a full lobby tab is 1 line
const origins = new Set([...ALLOWED_ORIGINS, ...(process.env.ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)]);
const okOrigin = (o) => origins.has(o) || /^http:\/\/localhost(:\d+)?$/.test(o || '');
// Only Caddy on this machine may tell us the visitor's address; anyone else is who they connected as.
const addressOf = (req) => { const direct = req.socket.remoteAddress || ''; return /^(::ffff:)?127\.0\.0\.1$|^::1$/.test(direct) ? String(req.headers['x-forwarded-for'] || direct).split(',')[0].trim() : direct; };

const ref = createReferee();
const perAddress = new Map();
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    const rooms = [...ref.rooms.values()];
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: rooms.length, players: rooms.reduce((n, r) => n + r.conns.size, 0) })); return;
  }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({ server, maxPayload: MAX_MSG, perMessageDeflate: false });
wss.on('connection', (ws, req) => {
  const addr = addressOf(req);
  if (!okOrigin(req.headers.origin)) { ws.close(1008, 'not from the game\'s website'); return; }
  const n = (perAddress.get(addr) || 0) + 1;
  if (n > MAX_PER_ADDRESS) { ws.close(1008, 'too many connections from your address'); return; }
  perAddress.set(addr, n);
  let sec = 0, count = 0;
  ws.alive = true; ws.on('pong', () => { ws.alive = true; });
  const h = ref.connect({ send: (s) => { if (ws.readyState === 1) ws.send(s); }, close: () => ws.close() });
  ws.on('message', (data, binary) => {
    const now = Math.floor(Date.now() / 1000); if (now !== sec) { sec = now; count = 0; }
    if (++count > MAX_PER_SEC) { ws.close(1008, 'slow down'); return; }
    if (!binary) h.message(String(data));
  });
  ws.on('close', () => { h.gone(); const left = (perAddress.get(addr) || 1) - 1; if (left) perAddress.set(addr, left); else perAddress.delete(addr); });
});
// Every 20 s: a line that stopped answering (closed laptop, lost network) is closed, so its player leaves the room.
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); } }, 20000);
let last = performance.now();
setInterval(() => { const now = performance.now(), dt = Math.min((now - last) / 1000, 1 / 20); last = now; ref.tick(dt); }, TICK_MS);
// HOST: on the Droplet 127.0.0.1, so only Caddy (https) can reach it; tests leave it open on every address of this machine.
server.listen(PORT, process.env.HOST || undefined, () => console.log(`referee listening on ${PORT}`));
