-- TRAFFIC COUNTER (Cody 2026-10-05: "can you make a traffic counter"). One row per visitor per day (Eastern), counting page loads,
-- where they came from (a site name only, e.g. x.com) and which page first. NO personal data: the visitor is a one-way code the
-- game server makes from the connection + browser and a secret that is never stored here, different every day (server/traffic.js),
-- so a row can't be traced back to a person or linked across days. Kept 90 days. Only the game server writes or reads it.
create table if not exists public.site_visits (
  day date not null,
  visitor text not null check (visitor ~ '^[0-9a-f]{32}$'),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  loads int not null default 1 check (loads >= 1),
  source text check (source is null or source ~ '^[a-z0-9.-]{1,60}$'),
  page text check (page is null or page in ('game', 'guide')),
  primary key (day, visitor)
);
alter table public.site_visits enable row level security; -- no policies: the website can neither read nor write it
revoke all on public.site_visits from public, anon, authenticated;

-- one page load: the first of the day for this visitor adds a row (keeping where they came from and the page), later ones count up
create or replace function public.record_visit(p_visitor text, p_source text, p_page text) returns void
language plpgsql security definer set search_path = '' as $$
declare d date := (now() at time zone 'America/Indiana/Indianapolis')::date;
begin
  insert into public.site_visits (day, visitor, source, page) values (d, p_visitor, p_source, p_page)
    on conflict (day, visitor) do update set loads = public.site_visits.loads + 1, last_at = now();
  if random() < 0.01 then delete from public.site_visits where day < d - 90; end if; -- now and then, drop what's past 90 days
end $$;

-- the admin screen's numbers: unique visitors and page loads for today / 7 days / 30 days (a person visiting on 3 days counts on
-- each day: days can't be linked), the last 14 days one by one, the top places visitors came from, and next to it what players DID
create or replace function public.traffic_summary() returns json
language sql stable security definer set search_path = '' as $$
  with d as (select (now() at time zone 'America/Indiana/Indianapolis')::date as today),
  w as (select v.*, (select today from d) - v.day as ago from public.site_visits v where v.day > (select today from d) - 30)
  select json_build_object(
    'today', json_build_object('visitors', (select count(*) from w where ago = 0), 'loads', (select coalesce(sum(loads), 0) from w where ago = 0)),
    'week', json_build_object('visitors', (select count(*) from w where ago < 7), 'loads', (select coalesce(sum(loads), 0) from w where ago < 7)),
    'month', json_build_object('visitors', (select count(*) from w where ago < 30), 'loads', (select coalesce(sum(loads), 0) from w where ago < 30)),
    'days', (select coalesce(json_agg(x order by x.day desc), '[]') from (select day, count(*) as visitors, sum(loads) as loads from w where ago < 14 group by day) x),
    'sources', (select coalesce(json_agg(s order by s.visitors desc), '[]') from (select coalesce(source, 'direct') as source, count(*) as visitors from w where ago < 30 group by 1 order by 2 desc limit 10) s),
    'players', json_build_object(
      'signedInWeek', (select count(*) from auth.users u join public.profiles p on p.id = u.id where not p.is_bot and u.last_sign_in_at > now() - interval '7 days'),
      'newAccountsWeek', (select count(*) from auth.users u join public.profiles p on p.id = u.id where not p.is_bot and u.created_at > now() - interval '7 days'),
      'matchPlayersWeek', (select count(distinct m.profile_id) from public.match_results m join public.profiles p on p.id = m.profile_id where not p.is_bot and m.at > now() - interval '7 days'),
      'arcadePlayersWeek', (select count(distinct x.profile_id) from public.payments x where x.confirmed_at > now() - interval '7 days'))
  )
$$;
revoke execute on function public.record_visit(text, text, text), public.traffic_summary() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'santa_games') then
    grant execute on function public.record_visit(text, text, text), public.traffic_summary() to santa_games; end if;
end $$;
