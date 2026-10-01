-- NOT APPLIED YET. Request counts for the server's speed limit (server/ratelimit.js, dbStore). One row per key (an internet
-- address or a player) per 10-second window; the server deletes rows over an hour old. Not needed once the game server
-- runs as one always-on program (it counts in memory then; see server/ratelimit.js).
-- Server only: row security on with no policies, so the website can neither read (it holds internet addresses) nor write it.
create table public.rate_hits (
  key text not null,
  window_start bigint not null,          -- seconds since 1970, a multiple of the window length
  n int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_hits enable row level security;
revoke all on public.rate_hits from anon, authenticated;
