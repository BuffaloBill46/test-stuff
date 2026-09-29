-- Player profiles tied to a Solana wallet (Supabase "Sign in with Web3").
-- Players may change only their name and avatar, and only through save_profile(),
-- which checks every item is unlocked. Level, XP and rank points are server-only.

create table public.items (
  id text primary key check (id ~ '^[a-z0-9_]{3,40}$'),
  slot text not null check (slot in ('shirt', 'pants', 'face', 'skin', 'snow')),
  name text not null,
  unlock_level int check (unlock_level >= 1),
  price_usd numeric(10, 2) check (price_usd > 0),
  check ((unlock_level is null) <> (price_usd is null))
);
alter table public.items enable row level security;
create policy items_read on public.items for select using (true);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  wallet text not null unique check (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  name text not null check (char_length(name) between 1 and 14),
  avatar jsonb not null,
  level int not null default 1 check (level >= 1),
  xp int not null default 0 check (xp >= 0),
  rank_points int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select using (true);
revoke insert, update, delete on public.profiles from anon, authenticated;

create table public.inventory (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  item_id text not null references public.items (id),
  acquired_at timestamptz not null default now(),
  primary key (profile_id, item_id)
);
alter table public.inventory enable row level security;
create policy inventory_read_own on public.inventory for select using (profile_id = (select auth.uid()));
revoke insert, update, delete on public.inventory from anon, authenticated;

-- The signed-in user's Solana address, from their Web3 identity.
create function public.my_wallet() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(i.identity_data ->> 'address', split_part(i.provider_id, ':', 3))
  from auth.identities i
  where i.user_id = auth.uid() and i.provider = 'web3'
  order by i.created_at
  limit 1
$$;

create function public.item_usable(p_profile uuid, p_item text, p_slot text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.items it join public.profiles pr on pr.id = p_profile
    where it.id = p_item and it.slot = p_slot
      and ((it.unlock_level is not null and it.unlock_level <= pr.level)
        or exists (select 1 from public.inventory inv where inv.profile_id = p_profile and inv.item_id = it.id)))
$$;

create function public.clean_name(p text) returns text
language sql immutable set search_path = '' as $$
  select left(btrim(regexp_replace(coalesce(p, ''), '[[:cntrl:]​-‏‪-‮⁦-⁩]', '', 'g')), 14)
$$;

create function public.save_profile(p_name text, p_avatar jsonb) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  n text := public.clean_name(p_name);
  s text;
  clean jsonb := '{}'::jsonb;
  prof public.profiles;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'No profile yet'; end if;
  if char_length(n) < 1 then raise exception 'Name can''t be empty'; end if;
  if jsonb_typeof(p_avatar) is distinct from 'object' then raise exception 'Avatar must be an object'; end if;
  foreach s in array array['shirt', 'pants', 'face', 'skin', 'snow'] loop
    if not public.item_usable(uid, p_avatar ->> s, s) then
      raise exception 'Item "%" isn''t unlocked for %', coalesce(p_avatar ->> s, 'none'), s;
    end if;
    clean := clean || jsonb_build_object(s, p_avatar ->> s);
  end loop;
  update public.profiles set name = n, avatar = clean, updated_at = now() where id = uid returning * into prof;
  return prof;
end $$;

create function public.ensure_profile() returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  w text;
  prof public.profiles;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  select * into prof from public.profiles where id = uid;
  if found then return prof; end if;
  w := public.my_wallet();
  if w is null or w !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then raise exception 'This account has no Solana wallet'; end if;
  insert into public.profiles (id, wallet, name, avatar)
  values (uid, w, 'Player ' || left(w, 4),
    '{"shirt":"shirt_red","pants":"pants_navy","face":"face_dots","skin":"skin_2","snow":"snow_white"}')
  returning * into prof;
  return prof;
end $$;

revoke execute on function public.my_wallet(), public.item_usable(uuid, text, text), public.clean_name(text) from public, anon, authenticated;
revoke execute on function public.save_profile(text, jsonb), public.ensure_profile() from public, anon;
grant execute on function public.save_profile(text, jsonb), public.ensure_profile() to authenticated;
