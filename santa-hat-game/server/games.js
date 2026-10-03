// SERVER: the game server's steps for Spin, Snowball Drop and Big Hat with RUNS (Cody, 2026-10-01: buy 1, 5 or 10 plays that
// play straight away; no stored credits; when the run's last play is done its winnings are sent automatically). NOT DEPLOYED.
// The same game rules as the demo (mockups/*.js), the payment checker (verify.js) and supabase/005_credits_plays.sql.
//   quote  → pool check, lock a SANTA price for 60 s for n plays at one size
//   buy    → check the finalized payment → the run and its plays are recorded → THEN a secret is made + locked per play
//   settle → the player's number in, draw, record, reveal the secret; the run's last play queues ONE payout (finish_run)
// `db` = { query(sql, params) → rows, tx(fn) } on a direct Postgres connection (a transaction holds the pool row lock).
// `chain.getTransaction(sig)` = Solana getTransaction (jsonParsed, finalized). Keys and secrets never leave the server.
import { KINDS, MAX_RUN, isRunSize } from '../mockups/credits.js';
import { BETS as DROP_SIZES } from '../mockups/plinko.js';
const near = (a, b) => Math.abs(a - b) < 1e-9;
import { play as dropPlay, canPlay as canDrop, MAX_MULT as DROP_TOP, MAX_MULT_BOARD as DROP_TOP_ON } from '../mockups/plinko.js';
// Stocking Stuffer (Cody, 2026-10-02): plays from the Game pool; its pay table and jackpot % come from the play's settings
import { play as stockPlay, canPlay as canStock, topMult as stockTop, BETS as STOCK_SIZES } from '../mockups/stocking.js';
import { DEFAULT_SETTINGS, build, LIMITS } from '../mockups/settings.js';
import { spin, canSpin, topMult } from '../mockups/spin.js';
import { pull, canPull, FEE, MAX_FIXED, poolJackpot } from '../mockups/slots.js';
import * as fair from '../mockups/fair.js';
import { NUMS, proofExtras } from '../mockups/house.js';
import { MINT, QUOTE_SECONDS, CUSHION } from '../mockups/market.js';
import { verifyPayment } from './verify.js';

// The most ONE play can ever pay (jackpot aside), worked out from the prize table the play ran on, never from what a
// simulation happened to see (Cody, 2026-10-01: "I don't want a hold on a player that wins"). Big Hat: every line at the top
// line prize + a hat on every square; Spin: the wheel's top result; Snowball Drop: the edge present (25×; the centre is the
// pool jackpot since 2026-10-02); Stocking Stuffer: 7 gifts (50× with Cody's table; 8 gifts is the pool jackpot). A real win
// can't pass it.
export function maxPerPlay(cfg, kind, bet) {
  if (kind === 'drop') return DROP_TOP * bet;
  if (kind === 'stocking') return stockTop(cfg.stocking2.pays) * bet;
  if (kind === 'spin') return topMult(cfg.wheel) * bet;
  const m = cfg.machine; return (m.lines.length * MAX_FIXED(m) / m.bet + m.reels * m.rows * (m.hatBonus || 0)) * bet;
}
// The most ONE settled play may pay, from what it recorded: a refused play its price; a POOL JACKPOT its recorded share of the
// Game pool at that moment (the % capped at the guard rail's 50%; × the play's size for Drop and Stocking, × 1 for Big Hat),
// so a real jackpot always passes and an amount that doesn't match its own pool can't; a drop or turn played on an older board
// that board's top prize; anything else maxPerPlay. Old Big Hat jackpots (before 2026-10-02) recorded no pool: their pay.
export function playCap(cfg, kind, bet, pl) {
  if (pl.state === 'refunded') return bet;
  const r = pl.result || {};
  if (r.jackpot) return typeof r.pool === 'number' && typeof r.pct === 'number' ? poolJackpot(r.pool, Math.min(r.pct, LIMITS.jackpotPct[1]), kind === 'big' ? 1 : bet) : +pl.pay;
  if (kind === 'drop') return (DROP_TOP_ON[r.board ?? 1] ?? DROP_TOP) * bet;
  if (kind === 'stocking' && (r.board ?? 1) === 1) return stockTop(cfg.stocking.pays) * bet;
  return Math.max(maxPerPlay(cfg, kind, bet), bet);
}
export const QUOTES_PER_HOUR = 30; // per player (a quote is free to ask for; this stops database spam)
// Audit fixes (2026-09-30): only real game names (not "toString" etc. that every JS object has), well-formed ids only.
const isKind = (k) => typeof k === 'string' && Object.hasOwn(KINDS, k);
const isTicket = (t) => /^[0-9]{1,18}$/.test(String(t));
const isSignature = (s) => /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(String(s));
// The safety cap on a run's payout: n × the most one play can pay (or its refunded price), + any pool jackpot it won. Only
// an amount the game could NOT have produced (a bug or a break-in) is frozen for Cody; he can release it on the admin screen.
const DEC = 1e6;

// mint: which token is SANTA here (defaults to real SANTA; set to the test token on devnet, e.g. the SANTA_MINT secret).
// cluster: the network the page must sign on ('mainnet' | 'devnet'); it goes in every quote with the wallet that must pay.
// Games that can no longer be bought (Cody, 2026-10-01: Santa Hat Spin removed, "not very fun"). Its code stays; runs already
// bought still finish and pay. Tests that exercise the Spin code pass retired: [] on purpose.
export const RETIRED = ['spin'];
export function createGameServer({ db, chain, livePrice, liveFee, poolWallets, f = fair, mint = MINT, cluster = 'mainnet', retired = RETIRED }) {
  const row = async (q, p) => (await db.query(q, p))[0];
  // Game settings (Cody's admin screen): the newest version for new plays; each play settles on the version it started with.
  const built = new Map(); let latest = { at: 0, version: 0 };
  async function settingsVersion() {
    if (Date.now() - latest.at > 15_000) latest = { at: Date.now(), version: +((await row('select coalesce(max(version), 0) as v from public.game_settings')).v) };
    return latest.version;
  }
  async function cfgFor(version) {
    if (!built.has(version)) {
      const s = version === 0 ? DEFAULT_SETTINGS : (await row('select settings from public.game_settings where version = $1', [version]))?.settings;
      if (!s) throw new Error('unknown settings version ' + version);
      built.set(version, { settings: s, ...build(s) });
    }
    return built.get(version);
  }
  const walletOf = async (profile) => (await row('select wallet from public.profiles where id = $1', [profile]))?.wallet;
  // Pools hold SANTA (Cody): the game rules work in dollars, so a pool is valued at the live price for each decision.
  const poolState = (r, price) => ({ pool: (+r.santa_raw / DEC) * price, treasury: 0, rules: r.rules, prepaid: true });
  const toRaw = (usd, price) => Math.round((usd / price) * DEC);
  // The sizes each game can be played at under these settings (Spin's come from the admin prices).
  const sizesFor = (kind, cfg) => (kind === 'spin' ? [cfg.prices.spin10, cfg.prices.spin100] : kind === 'drop' ? DROP_SIZES : kind === 'stocking' ? STOCK_SIZES : [cfg.prices.big]);
  // Every game: a play starts only if the Game pool (after a top-off) covers its biggest FIXED prize (Big Hat $100, Stocking
  // Stuffer 50×, Snowball Drop 25×); the top-off point ($200) covers them all. The pool jackpots are a share of the pool.
  const canTake = (kind, state, bet, cfg) => (kind === 'drop' ? canDrop(state, bet) : kind === 'stocking' ? canStock(state, bet, cfg.stocking2.pays) : kind === 'spin' ? canSpin(state, bet, cfg.wheel) : canPull(state, { ...cfg.machine, bet }));

  // A price for a run of n plays (1 to 100) of `kind` at size `bet`. Refused up front if the pool can't take a play now,
  // or if this player's last run isn't finished, so a payment is never taken for plays that would be refused.
  async function quote(profile, kind, n, bet) {
    if (!isKind(kind)) return { error: 'unknown game' };
    if (retired.includes(kind)) return { error: 'that game has been retired' };
    if (!isRunSize(n)) return { error: `buy 1 to ${MAX_RUN} plays` };
    const payer = await walletOf(profile);
    if (!payer) return { error: 'playing for SANTA needs a linked wallet (winnings are sent to it)' };
    const recent = (await row(`select count(*)::int as n from public.quotes where profile_id = $1 and created_at > now() - interval '1 hour'`, [profile])).n;
    if (recent >= QUOTES_PER_HOUR) return { error: 'too many price quotes; try again in a little while' };
    const cfg = await cfgFor(await settingsVersion());
    if (!sizesFor(kind, cfg).some((x) => near(x, bet))) return { error: 'unknown size' };
    await tidy(profile);
    if ((await row(`select count(*)::int as n from public.plays where profile_id = $1 and state in ('spent', 'open')`, [profile])).n) return { busy: true };
    const price = await livePrice(), p = await row('select * from public.pools where game = $1', [KINDS[kind].game]);
    const can = canTake(kind, poolState(p, price.usd), bet, cfg);
    if (!can.ok) return { refused: true, stopped: !!can.stopped };
    const usd = Math.round(bet * n * 100) / 100, santaRaw = Math.round((usd / price.usd) * DEC);
    const q = await row(`insert into public.quotes (profile_id, kind, n, bet, usd, santa_raw, price_usd) values ($1, $2, $3, $4, $5, $6, $7) returning id, created_at`,
      [profile, kind, n, bet, usd, santaRaw, price.usd]);
    // where to pay: the page builds the one transaction from this (mockups/pay.js); the live tax so its fee matches the token
    const fee = await liveFee();
    return { id: q.id, kind, n, bet, usd, santaRaw, price: price.usd, expiresAt: new Date(q.created_at).getTime() + QUOTE_SECONDS * 1000,
      mint, pool: poolWallets?.[KINDS[kind].game] || null, fee: { bps: fee.bps, max: fee.max }, burnBps: 1000,
      // only a payment FROM this wallet is accepted (verify.js): the page refuses to sign with any other, so nobody pays for nothing
      payer, cluster };
  }

  async function buy(profile, quoteId, signature) {
    if (!/^[0-9a-f-]{36}$/.test(String(quoteId))) return { error: 'unknown quote' };
    if (!isSignature(signature)) return { error: 'that isn\'t a Solana transaction signature' };
    const q = await row('select * from public.quotes where id = $1 and profile_id = $2', [quoteId, profile]);
    if (!q) return { error: 'unknown quote' };
    if (!poolWallets?.[KINDS[q.kind].game]) return { error: 'payments are not open yet' }; // no pool wallet set: nobody can pay in
    if (q.used_by) return { error: 'quote already used' };
    const [tx, fee, wallet] = await Promise.all([chain.getTransaction(signature), liveFee(), walletOf(profile)]);
    if (!wallet) return { error: 'buying needs a linked wallet' };
    const v = verifyPayment(tx, { mint, player: wallet, pool: poolWallets[KINDS[q.kind].game], quoteRaw: +q.santa_raw,
      quoteAt: new Date(q.created_at).getTime(), quoteSeconds: QUOTE_SECONDS, cushion: CUSHION, burnBps: 1000, fee });
    if (!v.ok) return { error: v.why };
    let runId;
    try { runId = +(await row('select public.buy_run($1, $2, $3, $4, $5, $6) as id', [q.id, signature, v.paid, v.burned, v.arrived, await settingsVersion()])).id; }
    catch (e) { return { error: /duplicate key|already used/.test(e.message) ? 'payment already used' : e.message }; }
    // ONLY NOW, after the payment is confirmed and recorded: a fresh secret per play, its fingerprint locked and returned.
    const plays = [];
    for (const pl of await db.query(`select id from public.plays where run_id = $1 order by play_no`, [runId])) {
      try {
        const secret = f.newSeed(), commit = await f.fingerprint(secret);
        await db.query('select public.lock_play($1, $2, $3)', [pl.id, commit, secret]);
        plays.push({ ticket: String(pl.id), commit });
      } catch (e) { await refundPlay(db, pl.id, +q.bet, +q.price_usd); }
    }
    const done = plays.length < +q.n ? await finishRun(db, runId, wallet) : null; // a play couldn't start: maybe the run is already done
    return { ok: true, kind: q.kind, run: String(runId), n: +q.n, bet: +q.bet, plays, ...(done ? sentOf(done) : {}) };
  }
  // A refused or failed play: its price goes back with the run, in SANTA at the given price, from the pool it was paid into.
  async function refundPlay(t, playId, bet, price) {
    const pl = (await t.query('select kind from public.plays where id = $1', [playId]))[0];
    const p = (await t.query('select santa_raw from public.pools where game = $1', [KINDS[pl.kind].game]))[0];
    await t.query('select public.refund_play($1, $2, $3)', [playId, Math.min(toRaw(bet, price), +p.santa_raw), price]);
  }
  // The run's last play is done → ONE payout of everything it won + refunded (finish_run is safe to call any time: it pays a
  // run once, and only when no play is left). Returns the dollars sent (0 if nothing), or null while plays are unfinished.
  const sentOf = (x) => (x?.held ? { sent: x.usd, held: true } : { sent: x }); // what the page is told about the run's payout
  async function finishRun(t, runId, wallet) {
    const r = (await t.query('select kind, bet, settings_version from public.runs where id = $1', [runId]))[0];
    const plays = await t.query('select state, pay, result from public.plays where run_id = $1', [runId]), cfg = await cfgFor(+r.settings_version);
    // the most each play could pay (playCap: its own jackpot share, or its board's top prize), + a cent each: pays are stored to the cent
    const cap = plays.reduce((a, pl) => a + playCap(cfg, r.kind, +r.bet, pl) + 0.01, 0);
    const id = (await t.query('select public.finish_run($1, $2, $3) as id', [runId, wallet, cap]))[0].id;
    if (id === null) return null;
    if (+id === 0) return 0;
    const po = (await t.query('select amount_usd, status from public.payouts where id = $1', [id]))[0];
    return po.status === 'held' ? { usd: +po.amount_usd, held: true } : +po.amount_usd;
  }

  // Stuck plays (the page closed mid-play, or the server hiccupped): run before each new play, for that player only.
  // 'spent' for a minute with no secret → its price goes back with the run. 'open' for a minute (secret locked, the player's
  // number never came) → finished with a server-made number as normal. No paid play is ever lost; the run is then paid.
  async function tidy(profile, stuckSeconds = 60) {
    const stuck = await db.query(`select id, state from public.plays where profile_id = $1 and state in ('spent', 'open')
      and coalesce(opened_at, spent_at) < now() - make_interval(secs => $2)`, [profile, stuckSeconds]);
    const done = [];
    for (const p of stuck) {
      if (p.state === 'spent') {
        const x = await row(`select pl.bet, pl.run_id, q.price_usd from public.plays pl join public.runs r on r.id = pl.run_id join public.payments pa on pa.signature = r.signature
          join public.quotes q on q.id = pa.quote_id where pl.id = $1`, [p.id]);
        // refunded at the run's locked price (see settle), then the run is finished and paid
        await refundPlay(db, p.id, +x.bet, +x.price_usd); await finishRun(db, x.run_id, await walletOf(profile)); done.push({ id: p.id, refunded: true });
      }
      else done.push({ id: p.id, ...(await settle(profile, String(p.id), f.newSeed(16))) });
    }
    return done;
  }


  async function settle(profile, ticket, playerSeed) {
    if (!/^[0-9a-f]{8,64}$/.test(playerSeed || '')) return { error: 'bad player number' };
    if (!isTicket(ticket)) return { error: 'no open play with that ticket' };
    const wallet = await walletOf(profile);
    return db.tx(async (t) => {
      const one = async (q, p) => (await t.query(q, p))[0];
      const pl = await one(`select * from public.plays where id = $1 and profile_id = $2 and state = 'open' for update`, [ticket, profile]);
      if (!pl) return { error: 'no open play with that ticket' };
      // THE RUN'S LOCKED PRICE (Cody, 2026-10-01: "the Santa price is locked at start of each run and that is what the payout price
      // is converted with"): every play of a run turns dollars into SANTA at the price its quote locked, the price the player paid
      // at, never the live price at the moment the play settles. So a run's winnings, refunds, skims and top-offs all use one
      // price however long the run takes. (Prizes that are a share of the pool, like the Pool jackpot, pay the same SANTA at any
      // price.) It also means a play never fails because the live price feed is down.
      const price = await quotePrice(t, pl.run_id);
      // after the result: if this was the run's last play, its ONE payout is queued (sent automatically, Cody)
      const withRun = async (o) => { const sent = await finishRun(t, pl.run_id, wallet); return sent === null ? o : { ...o, runDone: true, ...sentOf(sent) }; };
      const K = KINDS[pl.kind];
      const p = await one('select * from public.pools where game = $1 for update', [K.game]);    // lock the pool: plays settle one at a time
      let r, state;
      try {
        if (!(price > 0)) throw new Error('this run has no locked price');
        state = poolState(p, price);
        const rand = fair.randFrom(await f.numbers(pl.secret, playerSeed, +pl.play_no, NUMS));  // 4. the player's number goes in
        const cfg = await cfgFor(+pl.settings_version), bet = +pl.bet;                         // the play's own settings and price
        r = pl.kind === 'drop' ? dropPlay(state, bet, rand, undefined, cfg.drop.jackpotPct) : pl.kind === 'stocking' ? stockPlay(state, bet, rand, undefined, cfg.stocking2.pays, cfg.stocking2.jackpotPct) : pl.kind === 'spin' ? spin(state, bet, rand, undefined, cfg.wheel) : pull(state, { ...cfg.machine, bet }, rand);
      } catch (e) { await refundPlay(t, pl.id, +pl.bet, price); return withRun({ failed: true, why: e.message, refunded: +pl.bet }); }
      if (r.paused) { await refundPlay(t, pl.id, +pl.bet, price); return withRun({ refused: true, stopped: !!r.stopped, refunded: +pl.bet }); }
      // Every movement in exact SANTA at the run's locked price; the pool changes by exactly these amounts.
      const skimRaw = toRaw(r.skim || 0, price), topRaw = toRaw(r.topOff || 0, price);
      const payRaw = Math.min(toRaw(r.pay, price), +p.santa_raw + topRaw - skimRaw); // never more than the pool holds
      const poolDelta = topRaw - skimRaw - payRaw, treasuryDelta = Math.round(skimRaw * (1 - FEE)) - Math.round(topRaw / (1 - FEE));
      // a pool jackpot records the Game pool at that moment and its %, so it re-checks (and the payout cap re-works it) exactly
      const jp = r.jackpot ? { jackpot: true, pool: r.jackpotPool, pct: r.pct } : {};
      const result = pl.kind === 'drop' ? { path: r.path, bin: r.bin, mult: r.mult, board: r.board, ...jp } : pl.kind === 'stocking' ? { opened: r.opened, found: r.found, coal: r.coal, mult: r.mult, board: r.board, ...jp } : pl.kind === 'spin' ? { slice: r.slice, ...(r.bonusSlice !== undefined ? { bonusSlice: r.bonusSlice } : {}), mult: r.mult } : { stops: r.stops, jackpot: r.jackpot, wins: r.wins.length, hats: r.hats, ...jp };
      await t.query('select public.settle_play($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',  // skims/top-offs queued as real transfers
        [pl.id, playerSeed, JSON.stringify(result), Math.round(r.pay * 100) / 100, payRaw, price, poolDelta, treasuryDelta, wallet, 0, skimRaw, topRaw]);
      return withRun({ r, payRaw, poolDelta, price, poolUsd: state.pool, proof: { kind: pl.kind, bet: +pl.bet, commit: pl.commit, secret: pl.secret, playerSeed, playNo: +pl.play_no, settingsVersion: +pl.settings_version, ...proofExtras(pl.kind, r) } });  // revealed
    });
  }
  const quotePrice = async (t, runId) => +(await t.query(`select q.price_usd from public.runs r join public.payments pa on pa.signature = r.signature
    join public.quotes q on q.id = pa.quote_id where r.id = $1`, [runId]))[0].price_usd;
  // Recent winners for everyone: settled plays that paid more than they cost (display names only, never wallets).
  let winnersCache = { at: 0, list: null };
  async function winners(limit = 30) {
    if (winnersCache.list && Date.now() - winnersCache.at < 10_000) return winnersCache.list; // public: cached 10 s
    const rows = await db.query(`select pr.name, pl.kind, pl.pay, pl.bet, pl.settled_at, pl.result from public.plays pl join public.profiles pr on pr.id = pl.profile_id
      where pl.state = 'settled' and pl.pay > pl.bet order by pl.settled_at desc, pl.id desc limit $1`, [limit]);
    // the exact prize where the result has a multiplier (the pay column is whole cents: Stocking Stuffer's 1.75 × 10¢ = 17.5¢
    // is stored as 18¢, but the SANTA sent is the exact 17.5¢)
    const list = rows.map((w) => { const bet = +w.bet || KINDS[w.kind].bet, pay = typeof w.result?.mult === 'number' ? w.result.mult * bet : +w.pay;
      return { game: w.kind === 'big' ? 'slots' : w.kind === 'drop' ? (bet >= 1 ? 'drop100' : 'drop10') : w.kind === 'stocking' ? (bet >= 1 ? 'stock100' : 'stock10') : w.kind === 'spin' ? (bet >= 1 ? 'spin100' : 'spin10') : w.kind, name: w.name, amount: pay, gainPct: ((pay - bet) / bet) * 100, at: new Date(w.settled_at).getTime(),
        note: w.result?.jackpot ? 'pool jackpot' : w.kind === 'stocking' && w.result?.found ? `${w.result.found} gifts · ${w.result.mult}×` : w.result?.mult ? `${w.result.mult}×` : '', big: pay >= 10 * bet }; });
    winnersCache = { at: Date.now(), list }; return list;
  }
  // Public pool status (for the admin screen, and for anyone who wants to check): balances, settings, pending transfers, log.
  async function pools() {
    const ps = await db.query('select game, santa_raw, rules, updated_at from public.pools order by game');
    const pending = await db.query(`select game, kind, status, amount_raw from public.pool_transfers where status <> 'sent' order by id desc limit 50`);
    const log = await db.query('select game, what, by_wallet, at, details from public.pool_log order by id desc limit 30');
    // Frozen run payouts (above what the run could possibly win), for Cody's admin screen: who, how much, Release.
    // This answer is public, so the wallet is shortened (first 4 … last 4).
    const held = await db.query(`select po.id, po.amount_usd, po.amount_raw, po.to_wallet, po.created_at, r.kind, r.n, r.bet, pr.name
      from public.payouts po join public.runs r on r.id = po.run_id join public.profiles pr on pr.id = r.profile_id where po.status = 'held' order by po.id`);
    return { pools: ps.map((p) => ({ game: p.game, santaRaw: +p.santa_raw, rules: p.rules || {}, updatedAt: p.updated_at, wallet: poolWallets?.[p.game] || null })),
      pending, log: log.map((l) => ({ game: l.game, what: l.what, by: l.by_wallet, at: l.at, after: l.details?.after })),
      held: held.map((h) => ({ id: +h.id, usd: +h.amount_usd, santaRaw: +h.amount_raw, name: h.name, wallet: h.to_wallet.slice(0, 4) + '…' + h.to_wallet.slice(-4), at: h.created_at, kind: h.kind, n: +h.n, bet: +h.bet, game: KINDS[h.kind]?.game || 'spin' })) };
  }
  // Public: the settings new plays use (and any older version, so a play can be re-checked on the odds it ran on).
  async function settings(version) {
    const v = Number.isInteger(version) && version >= 0 ? version : await settingsVersion(), c = await cfgFor(v);
    return { version: v, settings: c.settings };
  }
  // Public: the SANTA price quotes use right now (the 10-minute median) and the token's tax, for the page's info line (the page's
  // own lookups go through free public services that fail on the live site: TODO "live tax line"). Each half is left out when it
  // can't be read, never guessed. The tax is kept a minute, so a busy page doesn't spend a network call per visitor.
  let feeKept = { at: 0, fee: null };
  async function market() {
    const [p, f] = await Promise.allSettled([livePrice(), Date.now() - feeKept.at < 60_000 ? feeKept.fee : liveFee()]);
    if (f.status === 'fulfilled' && f.value) feeKept = { at: Date.now(), fee: f.value };
    return { cluster, ...(p.status === 'fulfilled' ? { usd: p.value.usd } : {}), ...(f.status === 'fulfilled' && f.value ? { fee: { bps: f.value.bps, max: f.value.max } } : {}) };
  }
  // Called when Cody publishes new settings, so the very next play uses them (no 15-second wait).
  const settingsChanged = () => { latest = { at: 0, version: 0 }; };
  return { quote, buy, settle, tidy, winners, pools, settings, market, settingsChanged };
}
