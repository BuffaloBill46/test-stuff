-- APPLIED live 2026-10-02 (through the Supabase connector); the worker runs on the Droplet with this login.
-- 020: the payout worker's own database login (worker/worker.mjs on the Droplet; server/payouts.js), 2026-10-02.
-- Cody: "keep going down the list until we can launch" (HANDOFF list #3, the no-paste option: no database password to share).
-- Least privilege. It can: read the three money queues and update ONLY their sending state (status, tx, blockhash, attempts),
-- and read which game a run belongs to. It can NOT: change an amount or a destination wallet, add or delete a payout, read
-- logins/profiles/emails, touch pools, prices, the shop or anything else. So even a stolen worker password can't redirect
-- money: it can only send what the game server already queued, to whom it queued it (and the keys never leave the Droplet).
-- Its PASSWORD is not here: set once with a pre-hashed SCRAM verifier made on the Droplet (as for santa_referee, 017).

create role santa_worker login noinherit;
grant usage on schema public to santa_worker;

grant select on public.payouts, public.pool_transfers, public.lottery_payouts to santa_worker;
grant update (status, tx, blockhash, attempts) on public.payouts, public.pool_transfers, public.lottery_payouts to santa_worker;
grant select (id, kind) on public.runs to santa_worker;

-- row security is on for all four tables: the worker sees every row (it has to find what's queued), and may update any row,
-- but only the four sending-state columns above (the column grants are what limit it)
create policy worker_read on public.payouts for select to santa_worker using (true);
create policy worker_send on public.payouts for update to santa_worker using (true) with check (true);
create policy worker_read on public.pool_transfers for select to santa_worker using (true);
create policy worker_send on public.pool_transfers for update to santa_worker using (true) with check (true);
create policy worker_read on public.lottery_payouts for select to santa_worker using (true);
create policy worker_send on public.lottery_payouts for update to santa_worker using (true) with check (true);
create policy worker_read on public.runs for select to santa_worker using (true);
