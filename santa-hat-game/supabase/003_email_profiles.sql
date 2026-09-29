-- Profiles can belong to a wallet (can buy) or an email-only account (plays and ranks, can't buy).
alter table public.profiles alter column wallet drop not null;

create or replace function public.ensure_profile() returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  w text;
  has_email boolean;
  prof public.profiles;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  select * into prof from public.profiles where id = uid;
  if found then return prof; end if;
  w := public.my_wallet();
  if w is not null and w !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then raise exception 'That wallet address doesn''t look like Solana'; end if;
  select exists (select 1 from auth.identities i where i.user_id = uid and i.provider = 'email') into has_email;
  if w is null and not has_email then raise exception 'Sign in with a wallet or email first'; end if;
  insert into public.profiles (id, wallet, name, avatar)
  values (uid, w,
    case when w is null then 'Player ' || lpad(floor(random() * 10000)::int::text, 4, '0') else 'Player ' || left(w, 4) end,
    '{"shirt":"shirt_red","pants":"pants_navy","face":"face_dots","skin":"skin_2","snow":"snow_white"}')
  returning * into prof;
  return prof;
end $$;

revoke execute on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;
