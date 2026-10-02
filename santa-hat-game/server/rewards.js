// SERVER (the payout worker): CLAIM REWARDS (Cody, 2026-10-02; supabase/024). Reward tokens sent to SANTA holders (GP, GLDX,
// any later one) land in the pool wallets. When Cody signs "Claim rewards" on the admin screen, a claim row waits here; the
// worker turns it into one sweep per pool and token it finds, and server/payouts.js sends those (never twice) to the treasury.
// What it never does, by construction: sweep SANTA (skipped here, refused by the database and by the chain adapter), sweep
// from anything but the three pools, or send anywhere but the treasury (a sweep has no destination to set).
//   pools       { spin, slots, lottery } → each pool's public address (missing ones are skipped)
//   balances(owner) → [{ mint, program, decimals, amount_raw }] every token account the wallet owns, both token programs
//   isSanta(mint) → true for the game's own token
export async function queueRewardClaims({ db, pools, balances, isSanta }) {
  const out = [];
  for (const c of await db.query(`select id from public.reward_claims where status = 'requested' order by id`)) {
    const found = [];
    for (const [game, owner] of Object.entries(pools)) {
      if (!owner || !['spin', 'slots', 'lottery'].includes(game)) continue;
      // one sweep per token: two accounts of the same mint (unusual) are added up only if their token program matches
      const byMint = new Map();
      for (const b of await balances(owner)) {
        if (isSanta(b.mint) || !(BigInt(b.amount_raw) > 0n)) continue;
        const k = b.mint + '|' + b.program, was = byMint.get(k);
        byMint.set(k, { ...b, amount_raw: (was ? BigInt(was.amount_raw) : 0n) + BigInt(b.amount_raw) });
      }
      for (const b of byMint.values()) {
        // a sweep of this pool and token still on its way: this claim adds nothing for it (the database allows one in flight)
        if ((await db.query(`select 1 from public.reward_sweeps where game = $1 and mint = $2 and status in ('queued', 'sending')`, [game, b.mint])).length) continue;
        await db.query(`insert into public.reward_sweeps (claim_id, game, mint, token_program, decimals, amount_raw) values ($1, $2, $3, $4, $5, $6)`,
          [c.id, game, b.mint, b.program, b.decimals, String(b.amount_raw)]);
        found.push({ game, mint: b.mint, amount_raw: String(b.amount_raw), decimals: b.decimals });
      }
    }
    await db.query(`update public.reward_claims set status = 'queued', found = $2 where id = $1 and status = 'requested'`, [c.id, JSON.stringify(found)]);
    out.push({ claim: +c.id, found });
  }
  return out;
}

// The worker's balances(owner): every token account of the wallet under both token programs, as raw amounts.
export function chainBalances(rpc) {
  const PROGRAMS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];
  return async (owner) => {
    const out = [];
    for (const programId of PROGRAMS) {
      const r = await rpc.getTokenAccountsByOwner(owner, { programId }, { encoding: 'jsonParsed', commitment: 'confirmed' }).send();
      for (const a of r.value) { const i = a.account.data.parsed.info;
        out.push({ mint: i.mint, program: programId, decimals: i.tokenAmount.decimals, amount_raw: BigInt(i.tokenAmount.amount) }); }
    }
    return out;
  };
}
