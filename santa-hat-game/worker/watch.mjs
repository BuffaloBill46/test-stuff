// THE LAUNCH WATCH'S ONE-LINE CHECK (Cody 2026-10-05: "check on the game every 15 mins for the first couple days"). The
// scheduled watch runs this on the Droplet every 15 minutes; it prints exactly "OK" when all is well (so a quiet check costs
// almost nothing), or one line per problem. READ-ONLY: it changes nothing, sends nothing, and never prints a secret.
// Run (Droplet): cd /opt/santa/repo/santa-hat-game/worker && node watch.mjs
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const problems = [], say = (s) => problems.push(s);
const sh = (cmd) => { try { return execSync(cmd, { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) { return String(e.stdout || '').trim(); } };

// 1. services and the public addresses
for (const s of ['santa-games', 'santa-referee', 'santa-worker', 'caddy']) { const st = sh(`systemctl is-active ${s}`); if (st !== 'active') say(`service ${s} is ${st || 'unknown'}`); }
const get = async (url, opts = {}) => { try { const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(10000) }); return { status: r.status, text: await r.text() }; } catch (e) { return { status: 0, text: e.message }; } };
const health = await get('https://play.santahatgames.com/health');
if (!/"ok":true/.test(health.text)) say(`match server health: ${health.status} ${health.text.slice(0, 80)}`);
const market = await get('https://api.santahatgames.com', { method: 'POST', headers: { origin: 'https://santahatgames.com', 'content-type': 'application/json' }, body: '{"action":"market"}' });
if (!/"cluster"/.test(market.text)) say(`game server market: ${market.status} ${market.text.slice(0, 80)}`);
for (const u of ['https://santahatgames.com/', 'https://test.santahatgames.com/']) { const r = await get(u); if (r.status !== 200) say(`site ${u} answered ${r.status}`); }

// 2. the last 20 minutes of server logs: errors and restarts (counts, plus the first few distinct lines)
const logs = sh(`journalctl -u santa-games -u santa-worker -u santa-referee --since "-20 min" --no-pager -o cat`);
const bad = logs.split('\n').filter((l) => /error|exception|refused|failed|timed? ?out|ECONN|unhandled/i.test(l) && !/Telegram send failed network/.test(l) && !/payouts {"sent":/.test(l)); // the worker's own summary line (it says "failed":0) is not an error
if (bad.length) { const kinds = [...new Set(bad.map((l) => l.replace(/[0-9a-f-]{8,}|\d+/gi, '#').slice(0, 140)))]; say(`${bad.length} error lines in 20 min, e.g.: ${kinds.slice(0, 3).join(' || ')}`); }
// A restart is news only when it wasn't a deploy (2026-10-05: the watch stalled 4 hours asking to read the git history to tell
// them apart). A deploy = new code checked out in /opt/santa/repo up to 3 minutes before; a crash = systemd counting restarts.
const restarts = (sh(`journalctl -u santa-games -u santa-worker -u santa-referee --since "-20 min" --no-pager -o cat | grep -c "Started "`) || '0');
const crashes = ['santa-games', 'santa-worker', 'santa-referee'].reduce((n, u) => n + (+(sh(`systemctl show -p NRestarts --value ${u}`) || 0)), 0);
// every checkout of the last while (git's own record of HEAD moving, "HEAD@{<unix time>}")
const checkouts = (sh(`runuser -u santa -- git -C /opt/santa/repo reflog -n 40 --date=unix --format=%gd`) || '').split('\n').map((l) => +(l.match(/\{(\d+)\}/)?.[1] || 0) * 1000).filter(Boolean);
const startsAt = ['santa-games', 'santa-worker', 'santa-referee'].map((u) => Date.parse(sh(`systemctl show -p ActiveEnterTimestamp --value ${u}`) || '') || 0);
const byDeploy = startsAt.every((t) => !t || Date.now() - t > 20 * 60_000 || checkouts.some((c) => t >= c && t - c < 3 * 60_000));
if (crashes > 0) say(`${crashes} service crash-restarts (systemd NRestarts)`);
else if (+restarts > 0 && !byDeploy) say(`${restarts} service (re)starts in 20 min, not after a deploy`);

// 3. the money side, from the database (counts and amounts only)
const url = readFileSync('/etc/santa/games.env', 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='))?.slice(13);
if (!url) say('no database settings found'); else {
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 15 });
  try {
    const q = async (text) => (await sql.unsafe(text))[0];
    const late = await q(`select count(*)::int n, coalesce(sum(amount_usd), 0)::numeric usd from public.payouts where status in ('queued', 'sending', 'failed')
      and (attempts >= 2 or status = 'failed' or created_at < now() - interval '5 minutes')`);
    if (late.n) say(`${late.n} winning(s) not sent (≈ $${(+late.usd).toFixed(2)}): late or failing`);
    const held = await q(`select count(*)::int n from public.payouts where status = 'held'`); if (held.n) say(`${held.n} payout(s) HELD for Cody`);
    const tops = await q(`select count(*)::int n from public.pool_transfers where status not in ('sent') and created_at < now() - interval '10 minutes'`); if (tops.n) say(`${tops.n} pool transfer(s) waiting (top-off/skim)`);
    const lot = await q(`select count(*)::int n from public.lottery_payouts where status not in ('sent', 'manual') and created_at < now() - interval '10 minutes'`).catch(() => ({ n: 0 })); if (lot.n) say(`${lot.n} lottery payout(s) waiting`);
    const stuck = await q(`select count(*)::int n from public.plays where state in ('spent', 'open') and spent_at < now() - interval '15 minutes'`).catch(() => ({ n: 0 })); if (stuck.n) say(`${stuck.n} play(s) stuck over 15 min`);
    const alerts = await sql.unsafe(`select left(text, 120) t from public.alerts_sent where sent_at > now() - interval '20 minutes' order by sent_at`);
    if (alerts.length) say(`Cody was alerted: ${alerts.map((a) => a.t).join(' || ')}`);
    const tickets = await q(`select count(*)::int n from public.support_messages where created_at > now() - interval '20 minutes'`).catch(() => ({ n: 0 })); if (tickets.n) say(`${tickets.n} new support ticket(s)`);
    const errs = await q(`select count(*)::int n from public.client_errors where first_seen > now() - interval '20 minutes'`).catch(() => ({ n: 0 })); if (errs.n) say(`${errs.n} new kind(s) of player-page error`);
  } catch (e) { say('database check failed: ' + String(e.message).slice(0, 100)); }
  await sql.end().catch(() => {});
}
console.log(problems.length ? problems.join('\n') : 'OK');
