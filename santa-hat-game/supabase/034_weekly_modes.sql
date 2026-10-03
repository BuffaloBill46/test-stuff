-- 034: WEEKLY MODES ON/OFF (Cody, 2026-10-03: "give each one a toggle off button in admin", and "keep them off for now").
-- One row per weekly mode (mockups/weekly.js VARIANTS), all OFF to start. Cody switches each on or off from the admin screen
-- (server/admin.js 'weekly-mode', signed by his wallet, logged). Only modes that are on AND built (weekly.js ROTATION) take
-- turns, one a game week; none on = no weekly mode anywhere (plain Free-for-all only). Safe to run twice.
create table if not exists public.weekly_modes (
  id text primary key check (id in ('hothat', 'gazebo', 'blizzard', 'hathunt')),
  "on" boolean not null default false, updated_at timestamptz not null default now()
);
insert into public.weekly_modes (id) values ('hothat'), ('gazebo'), ('blizzard'), ('hathunt') on conflict (id) do nothing;
alter table public.weekly_modes enable row level security;
drop policy if exists weekly_modes_read on public.weekly_modes; create policy weekly_modes_read on public.weekly_modes for select using (true);
revoke insert, update, delete on public.weekly_modes from anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'santa_referee') then grant select on public.weekly_modes to santa_referee; end if;
  if exists (select 1 from pg_roles where rolname = 'santa_games') then grant select, update on public.weekly_modes to santa_games; end if;
end $$;
