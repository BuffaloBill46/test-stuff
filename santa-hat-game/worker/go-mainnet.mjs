// THE MAINNET SWITCH (Cody's GO, 2026-10-03). Runs on the Droplet as root. Two modes:
//   node go-mainnet.mjs            CHECK ONLY (default): changes nothing; says what's ready and what's missing.
//   node go-mainnet.mjs --go       THE SWITCH: refuses unless every check passes, then, in order:
//     1. stop the game server, the payout worker and the alerts/lottery timer (nothing mid-flight; the match server keeps running)
//     2. back up every table to /var/backups/santa/db-<time>.json
//     3. run supabase/ops/mainnet_reset.sql (one transaction; it aborts itself if anything payable is left)
//     4. swap in the mainnet settings (games.env.mainnet / worker.env.mainnet; the devnet ones kept as *.env.devnet)
//     5. start everything again, open the wallets' SANTA accounts (worker/open-accounts.mjs --send), and check it all
// Prints public addresses and yes/no answers only; never a key, a password or the RPC URL.
import { readFileSync, existsSync, writeFileSync, copyFileSync, mkdirSync } from 'fs';
import { JSONB } from './pgjson.mjs';
import { execSync } from 'child_process';
import path from 'path';
import postgres from 'postgres';
import * as kit from '@solana/kit';

const GO = process.argv.includes('--go'), ETC = '/etc/santa', REPO = '/opt/santa/repo/santa-hat-game';
const MAIN = JSON.parse(readFileSync(path.join(REPO, 'mainnet.json'), 'utf8'));
const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const parseEnv = (f) => Object.fromEntries(readFileSync(f, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const problems = [], ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) problems.push(msg); return cond; };
const sh = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

console.log(GO ? '=== MAINNET SWITCH ===' : '=== CHECK ONLY (nothing changes; run with --go to switch) ===');
const g = parseEnv(`${ETC}/games.env.mainnet`), w = parseEnv(`${ETC}/worker.env.mainnet`);
console.log('settings');
for (const [name, e] of [['games', g], ['worker', w]]) {
  ok(!Object.values(e).some((v) => /__[A-Z_]+__/.test(v)), `${name}.env.mainnet has no blanks left (Helius URL, Cody's admin address)`);
  ok(e.SOLANA_CLUSTER === 'mainnet' && e.SANTA_MINT === MAIN.mint, `${name}: mainnet, real SANTA`);
  ok(e.SPIN_POOL_WALLET === MAIN.wallets.gamePool && e.TREASURY_WALLET === MAIN.wallets.treasury, `${name}: the new Game pool and treasury`);
}
ok(g.LOTTERY_WALLET === MAIN.wallets.lotteryPool && w.LOTTERY_POOL_WALLET === MAIN.wallets.lotteryPool, 'the new lottery wallet');
ok(w.KEYS_DIR === `${ETC}/keys-mainnet`, 'the worker signs with the mainnet keys');
ok(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(g.ADMIN_WALLETS || '') && g.ADMIN_WALLETS !== '3jRok1Ah1i4T2NsxsTLC7DWN5uQp6NMSJQCc52dGyNPA', 'admin = one real wallet address (not the devnet stand-in)');

console.log('keys');
const signers = {};
for (const [file, want] of [['spinPool', MAIN.wallets.gamePool], ['slotsPool', MAIN.wallets.slotsPool], ['lotteryPool', MAIN.wallets.lotteryPool], ['treasury', MAIN.wallets.treasury]]) {
  const f = `${ETC}/keys-mainnet/${file}.json`;
  if (!ok(existsSync(f), `${file} key present`)) continue;
  signers[file] = await kit.createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(f, 'utf8'))));
  ok(signers[file].address === want, `${file} key = ${want}`);
}

console.log('network');
let rpc = null;
if (!/__/.test(g.SOLANA_RPC_URL || '__')) {
  rpc = kit.createSolanaRpc(g.SOLANA_RPC_URL);
  const genesis = await rpc.getGenesisHash().send().catch(() => null);
  ok(genesis === MAINNET_GENESIS, 'the RPC answers and is Solana MAINNET');
  ok(g.SOLANA_RPC_URL === w.SOLANA_RPC_URL, 'game server and worker use the same RPC');
  for (const [name, s] of Object.entries(signers)) {
    const sol = Number((await rpc.getBalance(s.address).send()).value) / 1e9, need = { spinPool: 0.1, lotteryPool: 0.02, treasury: 0.01, slotsPool: 0 }[name];
    ok(sol >= need, `${name} has ${sol} SOL (needs ≥ ${need})`);
  }
} else ok(false, 'the Helius mainnet URL is in place');

// THE TEST SITE (to-do #11, 2026-10-05): before the switch it plays through this same game server on test money; after it, this
// server is REAL money and the test site must never reach it (it would be a second real-money site with a TEST banner). Its line
// to the game server is one Caddy file, swapped for a 503 at step 4b.
console.log('test site');
ok(existsSync('/etc/caddy/test-api.caddy') && readFileSync('/etc/caddy/Caddyfile', 'utf8').includes('import /etc/caddy/test-api.caddy'), 'the test site\'s game-server line can be paused (/etc/caddy/test-api.caddy)');

console.log('database');
const sql = postgres(parseEnv(`${ETC}/games.env`).DATABASE_URL, { prepare: false, max: 1, ...JSONB });
const [c] = await sql`select (select count(*) from public.payouts where status not in ('sent')) unsent, (select count(*) from public.lottery_draws where status = 'open') open_draws,
  (select count(*) from public.price_samples where at > now() - interval '10 minutes') samples`;
console.log(`  (now: ${c.unsent} unsent test payouts, ${c.open_draws} open test draws: the reset clears them; ${c.samples} price samples in the last 10 min)`);
ok(+c.samples >= 5, 'at least 5 recent price samples (the game server is sampling)');

if (!GO) { console.log(problems.length ? `\nNOT READY: ${problems.length} problem(s) above.` : '\nREADY. Run with --go at Cody\'s GO.'); await sql.end(); process.exit(problems.length ? 1 : 0); }
if (problems.length) { console.log(`\nREFUSED: ${problems.length} problem(s) above. Nothing was changed.`); await sql.end(); process.exit(1); }

console.log('1. stopping the game server, payout worker and alerts timer');
sh('systemctl stop santa-alerts.timer santa-games santa-worker');
console.log('2. backup');
mkdirSync('/var/backups/santa', { recursive: true, mode: 0o700 });
const tables = (await sql`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`).map((r) => r.relname);
const dump = {}; for (const t of tables) dump[t] = await sql.unsafe('select * from public.' + t);
const bk = `/var/backups/santa/db-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(bk, JSON.stringify({ at: new Date().toISOString(), tables: dump }, (k, v) => (typeof v === 'bigint' ? String(v) : v)), { mode: 0o600 });
console.log(`  ✓ ${tables.length} tables → ${bk}`);
console.log('3. clearing every test money record (one transaction)');
try { await sql.unsafe(readFileSync(path.join(REPO, 'supabase/ops/mainnet_reset.sql'), 'utf8')); }
catch (e) { // the script's own checks failed: nothing was saved. Undo the open transaction, bring the test site back as it was, stop.
  console.log(`  ✗ the reset refused: ${e.message}. Nothing was changed in the database.`);
  await sql.unsafe('rollback').catch(() => {}); await sql.end();
  sh('systemctl start santa-games santa-worker santa-alerts.timer');
  console.log('REFUSED: everything is running again on the TEST settings, as before. Nothing switched.'); process.exit(1);
}
const [after] = await sql`select (select count(*) from public.payouts) payouts, (select count(*) from public.lottery_draws) draws, (select sum(santa_raw) from public.pools) books`;
ok(+after.payouts === 0 && +after.draws === 0 && +after.books === 0, `cleared: ${after.payouts} payouts, ${after.draws} draws, books ${after.books}`);
await sql.end();
console.log('4. mainnet settings');
for (const f of ['games', 'worker']) { copyFileSync(`${ETC}/${f}.env`, `${ETC}/${f}.env.devnet`); copyFileSync(`${ETC}/${f}.env.mainnet`, `${ETC}/${f}.env`); }
console.log('  ✓ swapped (devnet copies kept as *.env.devnet)');
console.log('4b. pausing the test site\'s game server line (it must never reach the real-money server)');
copyFileSync('/etc/caddy/test-api.caddy', '/etc/caddy/test-api.caddy.devnet');
writeFileSync('/etc/caddy/test-api.caddy', '# paused at the mainnet switch (go-mainnet.mjs): the only game server is the real-money one now.\n# The devnet line is kept in test-api.caddy.devnet for when the test site gets its own database.\nheader Content-Type application/json\nrespond `{"error":"the test site is paused while the real game is live"}` 503\n');
sh('systemctl reload caddy');
console.log('5. starting');
sh('systemctl start santa-games santa-worker santa-alerts.timer');
await new Promise((r) => setTimeout(r, 6000));
ok(sh('systemctl is-active santa-games santa-worker santa-referee').split('\n').every((s) => s === 'active'), 'game server, worker, match server running');
console.log(sh(`cd ${REPO}/worker && runuser -u santa -- bash -c 'set -a; . ${ETC}/worker.env; set +a; node open-accounts.mjs --send' 2>&1`));
const m = await (await fetch('http://127.0.0.1:8082/', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://santahatgames.com' }, body: JSON.stringify({ action: 'market' }) })).json();
ok(m.cluster === 'mainnet', `the game server says ${m.cluster}`);
const t = await fetch('https://test.santahatgames.com/api', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://test.santahatgames.com' }, body: '{"action":"market"}' }).then((r) => r.status).catch(() => 0);
ok(t === 503, `the test site no longer reaches the game server (it answers ${t})`);
console.log(problems.length ? `\nSWITCHED WITH ${problems.length} PROBLEM(S): look above.` : '\nSWITCHED. Next: Cody records his deposit on the admin screen, then the 10¢ dry run.');
process.exit(0);
