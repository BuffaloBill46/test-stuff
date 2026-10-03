// Escrow admin controls on real Postgres: only a signed message from an admin wallet works; replays, other wallets, tampering,
// stale messages and bad settings are refused; the emergency stop really stops plays; every change is logged.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createAdmin, adminMessage, b58encode, b58decode, checkRules } from '../../server/admin.js';
import { createGameServer } from '../../server/games.js';
import { pull, POOL_RULES } from '../../mockups/slots.js';

const pg = new PGlite();
await pg.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), last_sign_in_at timestamptz);
  create table auth.identities (id uuid primary key default gen_random_uuid(), provider_id text, user_id uuid references auth.users, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
for (const f of ['001_profiles.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql', '026_shared_pool.sql']) await pg.exec(readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8'));
const db = { query: async (q, p) => (await pg.query(q, p)).rows, tx: (fn) => pg.transaction((t) => fn({ query: async (q, p) => (await t.query(q, p)).rows })) };
await db.query(`insert into public.pools (game, santa_raw, rules) values ('spin', 58823529411, '{}'), ('slots', 588235294117, '{}')`);

// Wallets are Ed25519 keys, like Solana's. Cody's is the admin; another is not.
const wallet = async () => { const k = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  return { k, address: b58encode(new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey))) }; };
const cody = await wallet(), stranger = await wallet();
assert.deepEqual([...b58decode(cody.address)].length, 32);
const nonce = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
async function signed(w, fields) {
  const message = adminMessage({ at: new Date().toISOString(), nonce: nonce(), ...fields });
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', w.k.privateKey, new TextEncoder().encode(message)));
  return { wallet: w.address, message, signature: [...sig].map((b) => b.toString(16).padStart(2, '0')).join('') };
}
const admin = createAdmin({ db, adminWallets: [cody.address] });
const rules = async (g) => (await db.query('select rules from public.pools where game = $1', [g]))[0].rules;
const logs = async () => (await db.query('select count(*)::int as n from public.pool_log'))[0].n;

// Emergency stop: the game server takes no new payment (no quote), then resumes.
const me = (await db.query('insert into auth.users default values returning id'))[0].id;
await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, 'PLAYERwa11et111111111111111111111111111111', 'P', '{}')`, [me]);
const server = createGameServer({ db, chain: {}, livePrice: async () => ({ usd: 0.00085 }), liveFee: async () => ({ bps: 300, max: 1e15 }), poolWallets: {} });
// ONE GAME POOL (Cody, 2026-10-02): Big Hat plays from the shared pool ('spin'), so stopping the OLD Slots pool doesn't stop it
assert.ok((await admin.run(await signed(cody, { action: 'pause', game: 'slots' }))).ok);
assert.ok((await server.quote(me, 'big', 1, 1)).id, 'the old Slots pool is not where Big Hat plays any more');
assert.ok((await admin.run(await signed(cody, { action: 'resume', game: 'slots' }))).ok);
await db.query('delete from public.quotes'); await db.query("delete from public.pool_log"); await db.query("update public.pools set rules = '{}'");
const pause = await signed(cody, { action: 'pause', game: 'spin' });
assert.deepEqual(await admin.run(pause), { ok: true, game: 'spin', rules: { paused: true } });
assert.deepEqual(await server.quote(me, 'big', 1, 1), { refused: true, stopped: true }, 'a stopped pool takes no payment');
assert.equal((await admin.run(pause)).error, 'this signed message was already used', 'a copied signature can\'t be replayed');
for (const k of ['drop', 'stocking']) assert.deepEqual(await server.quote(me, k, 1, 0.1), { refused: true, stopped: true }, 'one stop stops every game on the Game pool: ' + k);
assert.ok((await admin.run(await signed(cody, { action: 'resume', game: 'spin' }))).ok);
assert.ok((await server.quote(me, 'big', 1, 1)).id, 'resumed: plays can be bought again');

// Refused: another wallet, a tampered message, a stale message, a signature from a different message, junk.
assert.equal((await admin.run(await signed(stranger, { action: 'pause', game: 'spin' }))).error, 'not an admin wallet');
const good = await signed(cody, { action: 'pause', game: 'spin' });
assert.equal((await admin.run({ ...good, message: good.message.replace('game: spin', 'game: slots') })).error, 'signature doesn\'t match the wallet', 'tampered');
assert.equal((await admin.run(await signed(cody, { action: 'pause', game: 'spin', at: new Date(Date.now() - 10 * 60_000).toISOString() }))).error, 'message too old (sign a fresh one)');
const other = await signed(cody, { action: 'resume', game: 'spin' });
assert.equal((await admin.run({ ...good, signature: other.signature })).error, 'signature doesn\'t match the wallet');
assert.equal((await admin.run({ wallet: cody.address, message: 'hello', signature: '00' })).error, 'not an admin message');
assert.equal((await rules('spin')).paused, false, 'none of those changed anything (still resumed)');

// Settings: sane changes apply; silly ones are refused and change nothing.
for (const bad of [{ skim: 2000 }, { topOffBelow: 600 }, { jackpotPct: 0.9 }, { paused: true }, { hatBonus: 1 }, { skimAt: -5 }]) {
  assert.ok(checkRules('slots', bad).length > 0, 'refuses ' + JSON.stringify(bad));
  assert.ok((await admin.run(await signed(cody, { action: 'set-rules', game: 'slots', settings: bad }))).error);
}
assert.deepEqual(await rules('slots'), {}, 'refused settings changed nothing');
assert.ok((await admin.run(await signed(cody, { action: 'set-rules', game: 'slots', settings: { jackpotPct: 0.14, skimAt: 1500 } }))).ok);
const r = await rules('slots'); assert.equal(r.jackpotPct, 0.14);
const st = { pool: 1750, rules: r, prepaid: true };
assert.ok(Math.abs(pull(st, 'big', Math.random, 'JACKPOT').pay - 1750 * 0.14) < 1e-9, 'the game uses the new jackpot %');
// the shared Game pool ('spin') takes a jackpot % too (all three games' pool jackpots), and its thresholds must keep the newest
// settings inside their guard rails: a $5,000 skim point would let the Drop's jackpot pay back over 98% (refused, nothing changed)
assert.match((await admin.run(await signed(cody, { action: 'set-rules', game: 'spin', settings: { skimAt: 5000 } }))).error, /Snowball Drop would pay back 10\d\.\d% with the jackpot at a \$5000 Game pool/);
assert.equal((await rules('spin')).skimAt, undefined, 'refused: the Game pool rules are unchanged');
assert.ok((await admin.run(await signed(cody, { action: 'set-rules', game: 'spin', settings: { jackpotPct: 0.2 } }))).ok, 'the Game pool jackpot % can be set');
{ const { play: dropPlay } = await import('../../mockups/plinko.js'), { play: stockPlay } = await import('../../mockups/stocking.js');
  const g = { pool: 1000, rules: await rules('spin'), prepaid: true };
  assert.equal(dropPlay(g, 1, Math.random, [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]).pay, 200, 'the Drop jackpot uses the Game pool\'s 20%');
  assert.equal(stockPlay({ pool: 1000, rules: g.rules, prepaid: true }, 0.1, Math.random, 8).pay, 20, 'and Stocking Stuffer\'s (× the 10¢ size)'); }
assert.equal(await logs(), 4, 'every applied change is in the public log: pause, resume, settings, the Game pool %');
// Top-offs are paid by Cody sending SANTA himself (Cody, 2026-09-30), then recording the deposit. The server books exactly what
// ARRIVED in the pool wallet (read from the chain's balance record); invariant: wallet = book + owed out − owed in, every step.
{
  const { reconcile } = await import('../../server/reconcile.js');
  const { MINT } = await import('../../mockups/market.js');
  const POOL = 'SP1Npoo1wa11et1111111111111111111111111111', sig = (c) => c.repeat(88);
  const txs = new Map(); // a finalized transaction as getTransaction returns it: only the balance records matter here
  const deposit = (s, raw, { to = POOL, mint = MINT, err = null } = {}) => txs.set(s, { meta: { err,
    preTokenBalances: [{ mint, owner: to, uiTokenAmount: { amount: '1000' } }], postTokenBalances: [{ mint, owner: to, uiTokenAmount: { amount: String(1000 + raw) } }] } });
  const adm = createAdmin({ db, adminWallets: [cody.address], chain: { getTransaction: async (s) => txs.get(s) ?? null }, poolWallets: { spin: POOL } });
  const book = async () => +(await db.query(`select santa_raw from public.pools where game = 'spin'`))[0].santa_raw;
  const check = async (walletRaw, why) => {
    const transfers = await db.query(`select * from public.pool_transfers where game = 'spin'`);
    const rc = reconcile({ bookRaw: await book(), walletRaw, transfers });
    assert.equal(rc.drift, 0, 'books = wallet: ' + why); return rc;
  };
  // Two plays each queued a top-off (the game kept running on the books); the wallet doesn't have that SANTA yet.
  await db.query(`insert into public.pool_transfers (game, kind, amount_raw, status) values ('spin', 'top-off', 300, 'needs_approval'), ('spin', 'top-off', 500, 'needs_approval')`);
  let wallet = (await book()) - 800;
  assert.equal((await check(wallet, 'before any deposit')).owedIn, 800);
  const rec = async (tx, game = 'spin') => adm.run(await signed(cody, { action: 'record-deposit', game, settings: { tx } }));
  // Refused, changing nothing: not a signature, unknown transaction, SANTA sent elsewhere, a failed transaction, another token, no wallet set.
  deposit(sig('A'), 400, { to: 'SomeoneE1se11111111111111111111111111111111' }); deposit(sig('B'), 400, { err: { x: 1 } }); deposit(sig('C'), 400, { mint: 'OtherMint111111111111111111111111111111111' });
  for (const [tx, why] of [['hello', 'paste the transaction'], [sig('Z'), 'no SANTA arrived'], [sig('A'), 'no SANTA arrived'], [sig('B'), 'no SANTA arrived'], [sig('C'), 'no SANTA arrived']]) assert.match((await rec(tx)).error, new RegExp(why), tx);
  assert.match((await rec(sig('A'), 'slots')).error, /doesn't know this pool/);
  assert.equal((await adm.run(await signed(stranger, { action: 'record-deposit', game: 'spin', settings: { tx: sig('D') } }))).error, 'not an admin wallet');
  await check(wallet, 'refusals changed nothing');
  // Short deposit: 400 arrives → the 300 top-off is paid, 100 of the 500 one; 400 still owed; the book is untouched.
  deposit(sig('D'), 400); wallet += 400;
  const b0 = await book();
  assert.deepEqual(await rec(sig('D')), { ok: true, game: 'spin', arrived: 400, coveredTopOffs: 400, addedToPool: 0 });
  assert.equal(await book(), b0, 'a top-off was already in the book');
  assert.equal((await check(wallet, 'after a short deposit')).owedIn, 400);
  assert.equal((await rec(sig('D'))).error, 'that deposit was already recorded');
  await check(wallet, 'recording twice changed nothing');
  // Generous deposit: 1,000 arrives → the last 400 is paid and 600 extra goes into the pool.
  deposit(sig('E'), 1000); wallet += 1000;
  assert.deepEqual(await rec(sig('E')), { ok: true, game: 'spin', arrived: 1000, coveredTopOffs: 400, addedToPool: 600 });
  assert.equal(await book(), b0 + 600);
  assert.equal((await check(wallet, 'after an extra deposit')).owedIn, 0);
  const logged = await db.query(`select details from public.pool_log where what = 'deposit' order by id`);
  assert.deepEqual(logged.map((l) => l.details.arrived), [400, 1000], 'both deposits in the public log');
}
// Frozen payouts (Cody, 2026-10-01: never hold a real winner; a Release button just in case). A payout is frozen only above
// the most its run could possibly win; it shows on the admin screen (player, short wallet, amount) and Cody can release it.
{
  const Q = async (kind, n, bet) => (await db.query(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, $2, $3, $4, $5, 1, 0.00085) returning id`, [me, kind, n, bet, n * bet]))[0].id;
  const runWith = async (sig, pay) => {
    const run = +(await db.query(`select public.buy_run($1, $2, 1, 0, 0, 0) as id`, [await Q('big', 1, 1), sig]))[0].id;
    const pl = (await db.query('select id from public.plays where run_id = $1', [run]))[0].id;
    await db.query(`select public.lock_play($1, $2, 's')`, [pl, 'c'.repeat(64)]);
    await db.query(`select public.settle_play($1, 'x', '{"stops":[1,2,3,4,5]}', $2, $3, 0.00085, 0, 0, 'w', 0)`, [pl, pay, Math.round(pay / 0.00085 * 1e6)]);
    return run;
  };
  const { maxPerPlay } = await import('../../server/games.js'), { build, DEFAULT_SETTINGS } = await import('../../mockups/settings.js');
  const cap = maxPerPlay(build(DEFAULT_SETTINGS), 'big', 1) + 0.01; // one $1 pull, no jackpot (as finishRun works it out)
  const big = await runWith('RUNbig' + '5'.repeat(80), 430), bad = await runWith('RUNbad' + '5'.repeat(80), 5000);
  await db.query('select public.finish_run($1, $2, $3)', [big, 'PLAYERwa11et111111111111111111111111111111', cap]);
  await db.query('select public.finish_run($1, $2, $3)', [bad, 'PLAYERwa11et111111111111111111111111111111', cap]);
  const st = async (run) => (await db.query('select id, status from public.payouts where run_id = $1', [run]))[0];
  assert.equal((await st(big)).status, 'queued', 'a real $430 win (above the old $205 guess) is NOT frozen');
  const frozen = await st(bad); assert.equal(frozen.status, 'held', 'a $5,000 single pull (impossible from the prize table) is frozen');
  const shown = (await server.pools()).held;
  assert.deepEqual(shown.map((h) => [h.id, h.usd, h.name, h.wallet, h.kind, h.game]), [[+frozen.id, 5000, 'P', 'PLAY…1111', 'big', 'spin']], 'the admin screen sees who and how much (wallet shortened)');
  const rel = async (w, game, payout) => admin.run(await signed(w, { action: 'release-payout', game, settings: { payout } }));
  assert.equal((await rel(stranger, 'spin', frozen.id)).error, 'not an admin wallet');
  assert.match((await rel(cody, 'slots', frozen.id)).error, /paid from the spin pool/, 'a Big Hat payout is paid from the shared Game pool now');
  assert.match((await rel(cody, 'spin', (await st(big)).id)).error, /isn't frozen/, 'only a frozen payout can be released');
  assert.match((await rel(cody, 'spin', 'abc')).error, /which payout/);
  const once = await signed(cody, { action: 'release-payout', game: 'spin', settings: { payout: frozen.id } });
  assert.deepEqual(await admin.run(once), { ok: true, game: 'spin', payout: +frozen.id, usd: 5000 });
  assert.equal((await st(bad)).status, 'queued', 'released: the payout worker sends it on its next pass');
  assert.equal((await admin.run(once)).error, 'this signed message was already used');
  assert.deepEqual((await server.pools()).held, [], 'nothing frozen any more');
  assert.equal((await db.query(`select count(*)::int as n from public.pool_log where what = 'release payout'`))[0].n, 1, 'the release is in the public log');
}
console.log('OK: frozen payouts: a real big win is never frozen; an impossible amount is, shows player + amount, and only Cody can release it (once, logged)');
console.log('OK: deposits (Cody pays top-offs himself): booked exactly as arrived on the chain, short and extra deposits, books = wallet at every step, no double recording');
console.log('OK: admin controls: wallet-signed only; replay, stranger, tampering, stale and bad settings refused; stop really stops plays; jackpot % adjustable; all logged');

// WEEKLY MODES (supabase/034; Cody 2026-10-03: a switch for each, all off to start): signed on/off, logged; Hat Hunt (not built)
// can't be switched on; a stranger can't switch anything; the game server's public answer follows at once.
{ await pg.exec(readFileSync(new URL('../../supabase/034_weekly_modes.sql', import.meta.url), 'utf8'));
  await pg.exec(readFileSync(new URL('../../supabase/034_weekly_modes.sql', import.meta.url), 'utf8')); // safe twice
  const { createGameServer } = await import('../../server/games.js');
  const gs = createGameServer({ retired: [], db, chain: {}, livePrice: async () => ({ usd: 0.001 }), liveFee: async () => ({ bps: 300, max: 1e15 }), poolWallets: {} });
  const adm = createAdmin({ db, adminWallets: [cody.address], onWeekly: () => gs.weeklyChanged() });
  let w = await gs.weekly();
  assert.deepEqual([w.modes.every((m) => !m.on), w.now], [true, null], 'all four start OFF: no weekly mode');
  const n0 = await logs();
  let r = await adm.run(await signed(cody, { action: 'weekly-mode', game: 'weekly', settings: { mode: 'gazebo', on: true } }));
  assert.ok(r.ok, JSON.stringify(r)); w = await gs.weekly();
  assert.deepEqual([w.modes.find((m) => m.id === 'gazebo').on, w.now], [true, 'gazebo'], 'the Gazebo on: it is this week\'s mode (the only one on)');
  assert.equal(await logs(), n0 + 1, 'the switch is in the public log');
  r = await adm.run(await signed(cody, { action: 'weekly-mode', game: 'weekly', settings: { mode: 'hathunt', on: true } }));
  assert.ok(/isn't built yet/.test(r.error || ''), 'Hat Hunt can\'t be switched on yet');
  r = await adm.run(await signed(stranger, { action: 'weekly-mode', game: 'weekly', settings: { mode: 'hothat', on: true } }));
  assert.ok(r.error, 'a stranger can\'t switch a mode');
  r = await adm.run(await signed(cody, { action: 'weekly-mode', game: 'weekly', settings: { mode: 'gazebo', on: false } }));
  w = await gs.weekly(); assert.deepEqual([r.ok, w.now], [true, null], 'switched off again: no weekly mode'); }
console.log('OK: weekly modes: all off to start; Cody switches each on/off (signed, logged); Hat Hunt refused until built; strangers refused; the public answer follows');
