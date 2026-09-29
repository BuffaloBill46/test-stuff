-- One profile can be opened by several logins: an email login and a wallet login.
-- Linking uses a 15-minute code created while signed in one way and redeemed while signed in the
-- other way, which proves the player controls both. A login that already has its own progress
-- is never merged away (refused instead). Applied to project santa-hat-arcade as migration 004_linked_logins.

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

-- login_kind(), my_profile_id(), my_logins(), create_link_code(), redeem_link_code(),
-- and updated ensure_profile() / save_profile() / inventory policy: see the applied migration
-- (identical SQL is kept in this project's migration history in Supabase).
