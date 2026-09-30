-- NOT APPLIED YET. Ranked tickets (rules on the Play page and in TODO): 10 free a day; 1 ticket per ranked match, spent when
-- the match STARTS; leave before it starts and it costs nothing; up to 10 extra tickets can be bought per 24 hours.
-- Joining a lobby HOLDS a ticket (so nobody can join 20 lobbies on 10 tickets); the match starting SPENDS it; leaving
-- before the start RELEASES it. "A day" = 24 hours from when the free tickets were last reset (Claude's pick).
-- Only the ranked server calls these (service role). p_now exists so tests can move the clock.

create table public.tickets (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  free_used int not null default 0 check (free_used between 0 and 10),
  window_start timestamptz not null default now(),       -- the free tickets reset 24 hours after this
  extra int not null default 0 check (extra >= 0)        -- bought tickets (they don't expire)
);
create table public.ticket_holds (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  match_id text not null,
  source text not null check (source in ('free', 'extra')),
  state text not null default 'held' check (state in ('held', 'spent', 'released')),
  at timestamptz not null default now(),
  primary key (profile_id, match_id)
);
create table public.ticket_purchases (
  signature text primary key, profile_id uuid not null references public.profiles (id), n int not null check (n between 1 and 10),
  at timestamptz not null default now()
);
alter table public.tickets enable row level security; alter table public.ticket_holds enable row level security;
alter table public.ticket_purchases enable row level security;
create policy tickets_read_own on public.tickets for select using (profile_id = public.my_profile_id());
revoke insert, update, delete on public.tickets, public.ticket_holds, public.ticket_purchases from anon, authenticated;

-- The player's row, with the free tickets reset if their 24 hours are up. Locks the row (one change at a time per player).
create function public.tickets_row(p_profile uuid, p_now timestamptz) returns public.tickets
language plpgsql security definer set search_path = '' as $$
declare t public.tickets;
begin
  insert into public.tickets (profile_id, window_start) values (p_profile, p_now) on conflict do nothing;
  select * into t from public.tickets where profile_id = p_profile for update;
  if p_now >= t.window_start + interval '24 hours' then
    update public.tickets set free_used = 0, window_start = p_now where profile_id = p_profile returning * into t;
  end if;
  return t;
end $$;

-- What the player can see: free left today, extra, and when the free ones reset.
create function public.ticket_status(p_profile uuid, p_now timestamptz default now())
returns table (free_left int, extra int, held int, resets_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; h int;
begin
  t := public.tickets_row(p_profile, p_now);
  select count(*)::int into h from public.ticket_holds where profile_id = p_profile and state = 'held';
  return query select 10 - t.free_used, t.extra, h, t.window_start + interval '24 hours';
end $$;

-- Join a ranked lobby: hold one ticket (a free one first). False if none are left. Holding twice for one match is refused.
create function public.hold_ticket(p_profile uuid, p_match text, p_now timestamptz default now()) returns text
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; src text;
begin
  t := public.tickets_row(p_profile, p_now);
  if exists (select 1 from public.ticket_holds where profile_id = p_profile and match_id = p_match) then return 'already'; end if;
  if t.free_used < 10 then
    update public.tickets set free_used = free_used + 1 where profile_id = p_profile; src := 'free';
  elsif t.extra > 0 then
    update public.tickets set extra = extra - 1 where profile_id = p_profile; src := 'extra';
  else return 'none'; end if;
  insert into public.ticket_holds (profile_id, match_id, source, at) values (p_profile, p_match, src, p_now);
  return src;
end $$;

-- The match starts: every held ticket for it is spent.
create function public.start_ranked_match(p_match text) returns int
language sql security definer set search_path = '' as $$
  with s as (update public.ticket_holds set state = 'spent' where match_id = p_match and state = 'held' returning 1) select count(*)::int from s
$$;

-- Leave before the start: the ticket comes back (to where it came from). After the start there is nothing to release.
create function public.release_ticket(p_profile uuid, p_match text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare h public.ticket_holds;
begin
  update public.ticket_holds set state = 'released' where profile_id = p_profile and match_id = p_match and state = 'held' returning * into h;
  if h.profile_id is null then return false; end if;
  -- a free ticket from before the last daily reset isn't given back (today's count already started fresh)
  if h.source = 'free' then update public.tickets set free_used = greatest(0, free_used - 1) where profile_id = p_profile and window_start <= h.at;
  else update public.tickets set extra = extra + 1 where profile_id = p_profile; end if;
  return true;
end $$;

-- Extra tickets from a confirmed payment (checked by the server like play credits): at most 10 bought per 24 hours.
create function public.buy_tickets(p_profile uuid, p_n int, p_signature text, p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = '' as $$
declare recent int; t public.tickets;
begin
  t := public.tickets_row(p_profile, p_now);
  select coalesce(sum(n), 0)::int into recent from public.ticket_purchases where profile_id = p_profile and at > p_now - interval '24 hours';
  if recent + p_n > 10 then raise exception 'at most 10 extra tickets per 24 hours (% left)', 10 - recent; end if;
  insert into public.ticket_purchases (signature, profile_id, n, at) values (p_signature, p_profile, p_n, p_now);
  update public.tickets set extra = extra + p_n where profile_id = p_profile returning * into t;
  return t.extra;
end $$;

revoke execute on function public.tickets_row, public.ticket_status, public.hold_ticket, public.start_ranked_match, public.release_ticket, public.buy_tickets from public, anon, authenticated;
