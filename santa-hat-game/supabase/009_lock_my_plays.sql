-- Applied to the live project 2026-10-01 (right after 005/007). Found by Supabase's security advisor + a live privilege check.
-- Supabase gives anon and signed-in users ALL rights on every new table and view in `public`. 005's `my_plays` view reads
-- plays with its owner's rights (so a player sees their own plays, secrets only once settled) and is simple enough to be
-- written THROUGH, so a signed-in player could have changed or deleted their own plays (prize, state, seed, result),
-- skipping the plays table's row security. Reading stays as it was; writing through the view is taken away.
-- Same tidy-up for rights the website never needs (row security already blocked these; now the rights are gone too).
revoke insert, update, delete, truncate, references, trigger on public.my_plays from anon, authenticated;
revoke all on public.my_plays from anon;
revoke insert, update, delete, truncate on public.price_samples from anon, authenticated;
revoke all on sequence public.runs_id_seq, public.plays_id_seq, public.pool_log_id_seq, public.payouts_id_seq,
  public.pool_transfers_id_seq from anon, authenticated;
