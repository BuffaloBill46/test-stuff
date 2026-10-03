-- APPLIED live 2026-10-03 (password set separately from a SCRAM verifier made on the Droplet).
-- 031: THE DROPLET GAME SERVER'S OWN DATABASE LOGIN (2026-10-03; worker/games.mjs). The game server moved from a Supabase Edge
-- Function to the always-on Droplet (fresh Edge copies froze ~1 request in 10 for 75–150 s). On Supabase it used the built-in
-- postgres login; on the Droplet it gets its own, santa_games, with the same reach over the GAME's data and nothing else:
--   * every table, sequence and function in schema public (the game's own: plays, payments, pools, payouts, lottery, shop…),
--     including the server-only money functions (buy_run, settle_play, …), which no visitor can run;
--   * it skips row security (BYPASSRLS), like the postgres login did: the server enforces who may do what itself;
--   * no other schema (not auth, not storage, not the Supabase internals), no creating roles or databases, no superuser.
-- Its PASSWORD is not here: set once on the Droplet with a pre-hashed SCRAM verifier (as for santa_referee 017 and santa_worker
-- 020), so the plain password exists only in /etc/santa/games.env (readable by root and santa).
-- Default privileges cover tables and functions added by later migrations (made by the postgres login).
create role santa_games login bypassrls noinherit;
grant usage on schema public to santa_games;
grant all on all tables in schema public to santa_games;
grant all on all sequences in schema public to santa_games;
grant execute on all functions in schema public to santa_games;
alter default privileges for role postgres in schema public grant all on tables to santa_games;
alter default privileges for role postgres in schema public grant all on sequences to santa_games;
alter default privileges for role postgres in schema public grant execute on functions to santa_games;
