// Waiting out the game server's speed limit (server/ratelimit.js: 40 requests per player per 10 seconds). A run can be up to 100
// plays (Cody, 2026-10-01), each settled with its own request, and with Skip ahead they go as fast as the server answers, so a
// big run can reach the limit. The server answers "slowDown" BEFORE doing any work, so the same request can simply be sent again
// after the wait it asks for. Without this, those plays showed "couldn't play" and stayed open until the server's tidy-up.
// send() → the server's reply; sleep(ms) → a promise. Gives up after `tries` waits and returns the last reply.
export async function withSlowDown(send, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)), tries = 20 } = {}) {
  for (let i = 0; ; i++) {
    const r = await send();
    if (!r?.slowDown || i >= tries) return r;
    await sleep(Math.min(10, Math.max(1, Number(r.retryAfter) || 1)) * 1000);
  }
}
