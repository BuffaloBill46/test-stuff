-- FAST ARCADE PAYMENTS (2026-10-05): the payout worker sends a run's winnings only once that run's PAYMENT is finalized
-- (server/paymentgate.js), so it must read which payment a run was: the run's id and its payment signature, nothing else (the
-- signature is public on Solana anyway). Found live: without this, every payout pass failed "permission denied for table runs"
-- and Cody's winnings waited (they were sent the moment this was applied). Column-level, read-only.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'santa_worker') then grant select (id, signature) on public.runs to santa_worker; end if;
end $$;
