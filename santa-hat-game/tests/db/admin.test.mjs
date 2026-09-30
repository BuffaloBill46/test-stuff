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
for (const f of ['001_profiles.sql', '003_email_profiles.sql', '004_linked_logins.sql', '005_credits_plays.sql']) await pg.exec(readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8'));
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

// Emergency stop: the game server refuses plays (credits untouched), then resumes.
const me = (await db.query('insert into auth.users default values returning id'))[0].id;
await db.query(`insert into public.profiles (id, wallet, name, avatar) values ($1, 'PLAYERwa11et111111111111111111111111111111', 'P', '{}')`, [me]);
await db.query(`insert into public.credits (profile_id, kind, left_n, bought) values ($1, 'big', 1, 1)`, [me]);
const server = createGameServer({ db, chain: {}, livePrice: async () => ({ usd: 0.00085 }), liveFee: async () => ({ bps: 300, max: 1e15 }), poolWallets: {} });
const pause = await signed(cody, { action: 'pause', game: 'slots' });
assert.deepEqual(await admin.run(pause), { ok: true, game: 'slots', rules: { paused: true } });
assert.deepEqual(await server.open(me, 'big'), { refused: true, stopped: true }, 'stopped pool refuses the pull');
assert.equal((await admin.run(pause)).error, 'this signed message was already used', 'a copied signature can\'t be replayed');
assert.ok((await admin.run(await signed(cody, { action: 'resume', game: 'slots' }))).ok);
assert.ok((await server.open(me, 'big')).ticket, 'resumed: plays work again');

// Refused: another wallet, a tampered message, a stale message, a signature from a different message, junk.
assert.equal((await admin.run(await signed(stranger, { action: 'pause', game: 'spin' }))).error, 'not an admin wallet');
const good = await signed(cody, { action: 'pause', game: 'spin' });
assert.equal((await admin.run({ ...good, message: good.message.replace('game: spin', 'game: slots') })).error, 'signature doesn\'t match the wallet', 'tampered');
assert.equal((await admin.run(await signed(cody, { action: 'pause', game: 'spin', at: new Date(Date.now() - 10 * 60_000).toISOString() }))).error, 'message too old (sign a fresh one)');
const other = await signed(cody, { action: 'resume', game: 'spin' });
assert.equal((await admin.run({ ...good, signature: other.signature })).error, 'signature doesn\'t match the wallet');
assert.equal((await admin.run({ wallet: cody.address, message: 'hello', signature: '00' })).error, 'not an admin message');
assert.equal((await rules('spin')).paused, undefined, 'none of those changed anything');

// Settings: sane changes apply; silly ones are refused and change nothing.
for (const bad of [{ skim: 2000 }, { topOffBelow: 600 }, { jackpotPct: 0.9 }, { paused: true }, { hatBonus: 1 }, { skimAt: -5 }]) {
  assert.ok(checkRules('slots', bad).length > 0, 'refuses ' + JSON.stringify(bad));
  assert.ok((await admin.run(await signed(cody, { action: 'set-rules', game: 'slots', settings: bad }))).error);
}
assert.deepEqual(await rules('slots'), { paused: false }, 'refused settings changed nothing');
assert.ok((await admin.run(await signed(cody, { action: 'set-rules', game: 'slots', settings: { jackpotPct: 0.14, skimAt: 1500 } }))).ok);
const r = await rules('slots'); assert.equal(r.jackpotPct, 0.14);
const st = { pool: 1750, rules: r, prepaid: true };
assert.ok(Math.abs(pull(st, 'big', Math.random, 'JACKPOT').pay - 1750 * 0.14) < 1e-9, 'the game uses the new jackpot %');
assert.equal(await logs(), 3, 'every applied change is in the public log: pause, resume, settings');
console.log('OK: admin controls: wallet-signed only; replay, stranger, tampering, stale and bad settings refused; stop really stops plays; jackpot % adjustable; all logged');
