-- One profile can be opened by several logins: an email login and a wallet login.
-- Linking uses a 15-minute code created while signed in one way and redeemed while signed in the
-- other way, which proves the player controls both. A login that already has its own progress
-- is never merged away (refused instead).

create table public.logins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('wallet', 'email')),
  created_at timestamptz not null default now(),
  unique (profile_id, kind)
);
alter table public.logins enable row level security;
revoke all on public.logins from anon, authenticated;

create table public.link_codes (
  code text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  want text not null check (want in ('wallet', 'email')),
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table public.link_codes enable row level security;
revoke all on public.link_codes from anon, authenticated;

insert into public.logins (user_id, profile_id, kind)
select p.id, p.id, case when p.wallet is null then 'email' else 'wallet' end from public.profiles p
on conflict do nothing;

create function public.login_kind() returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from auth.identities i where i.user_id = auth.uid() and i.provider = 'web3') then 'wallet'
    when exists (select 1 from auth.identities i where i.user_id = auth.uid() and i.provider = 'email') then 'email'
  end
$$;

create function public.my_profile_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select profile_id from public.logins where user_id = auth.uid()
$$;

create or replace function public.ensure_profile() returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  k text := public.login_kind();
  pid uuid;
  w text;
  prof public.profiles;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  pid := public.my_profile_id();
  if pid is not null then select * into prof from public.profiles where id = pid; return prof; end if;
  if k is null then raise exception 'Sign in with a wallet or email first'; end if;
  w := case when k = 'wallet' then public.my_wallet() end;
  if w is not null and w !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then raise exception 'That wallet address doesn''t look like Solana'; end if;
  insert into public.profiles (id, wallet, name, avatar)
  values (uid, w,
    case when w is null then 'Player ' || lpad(floor(random() * 10000)::int::text, 4, '0') else 'Player ' || left(w, 4) end,
    '{"shirt":"shirt_red","pants":"pants_navy","face":"face_dots","skin":"skin_2","snow":"snow_white"}')
  returning * into prof;
  insert into public.logins (user_id, profile_id, kind) values (uid, prof.id, k);
  return prof;
end $$;

create or replace function public.save_profile(p_name text, p_avatar jsonb) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := public.my_profile_id();
  n text := public.clean_name(p_name);
  s text;
  clean jsonb := '{}'::jsonb;
  prof public.profiles;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if pid is null then raise exception 'No profile yet'; end if;
  if char_length(n) < 1 then raise exception 'Name can''t be empty'; end if;
  if jsonb_typeof(p_avatar) is distinct from 'object' then raise exception 'Avatar must be an object'; end if;
  foreach s in array array['shirt', 'pants', 'face', 'skin', 'snow'] loop
    if not public.item_usable(pid, p_avatar ->> s, s) then
      raise exception 'Item "%" isn''t unlocked for %', coalesce(p_avatar ->> s, 'none'), s;
    end if;
    clean := clean || jsonb_build_object(s, p_avatar ->> s);
  end loop;
  update public.profiles set name = n, avatar = clean, updated_at = now() where id = pid returning * into prof;
  return prof;
end $$;

drop policy inventory_read_own on public.inventory;
create policy inventory_read_own on public.inventory for select using (profile_id = (select public.my_profile_id()));
grant execute on function public.my_profile_id() to authenticated;

create function public.my_logins() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(kind order by kind), '{}') from public.logins where profile_id = public.my_profile_id()
$$;

create function public.create_link_code(p_want text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := public.my_profile_id();
  c text;
begin
  if pid is null then raise exception 'Sign in first'; end if;
  if p_want not in ('wallet', 'email') then raise exception 'Link a wallet or an email'; end if;
  if exists (select 1 from public.logins where profile_id = pid and kind = p_want) then
    raise exception 'This account already has a linked %', p_want;
  end if;
  delete from public.link_codes where profile_id = pid and used_at is null;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.link_codes (code, profile_id, want, expires_at) values (c, pid, p_want, now() + interval '15 minutes');
  return c;
end $$;

create function public.redeem_link_code(p_code text) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  k text := public.login_kind();
  lc public.link_codes;
  mine uuid;
  old public.profiles;
  prof public.profiles;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  select * into lc from public.link_codes where code = upper(btrim(p_code)) for update;
  if not found or lc.used_at is not null or lc.expires_at < now() then raise exception 'That link code is wrong or has expired. Make a new one.'; end if;
  if k is distinct from lc.want then raise exception 'This code links a %: sign in with a % to use it', lc.want, lc.want; end if;
  mine := public.my_profile_id();
  if mine = lc.profile_id then return (select p from public.profiles p where p.id = mine); end if;
  if exists (select 1 from public.logins where profile_id = lc.profile_id and kind = k) then
    raise exception 'That account already has a linked %', k;
  end if;
  if mine is not null then
    select * into old from public.profiles where id = mine;
    if old.rank_points <> 0 or old.xp > 0 or old.level > 1 or exists (select 1 from public.inventory where profile_id = mine) then
      raise exception 'This % already has its own account with progress, so linking would erase it.', k;
    end if;
    delete from public.profiles where id = mine;
  end if;
  insert into public.logins (user_id, profile_id, kind) values (uid, lc.profile_id, k);
  if k = 'wallet' then update public.profiles set wallet = public.my_wallet(), updated_at = now() where id = lc.profile_id; end if;
  update public.link_codes set used_at = now() where code = lc.code;
  select * into prof from public.profiles where id = lc.profile_id;
  return prof;
end $$;

revoke execute on function public.login_kind(), public.my_logins(), public.create_link_code(text), public.redeem_link_code(text) from public, anon;
revoke execute on function public.login_kind() from authenticated;
grant execute on function public.my_logins(), public.create_link_code(text), public.redeem_link_code(text) to authenticated;
revoke execute on function public.my_profile_id() from public, anon;
