-- 021: alerts to Cody's Telegram (server/alerts.js), 2026-10-02. What was sent when (so a lasting problem is repeated every
-- few hours, not every 5 minutes), and the Telegram chat the alerts go to (found from the bot's first /start). Server only:
-- the website can't read or write either table.
create table public.alerts_sent (
  key text primary key,
  sent_at timestamptz not null default now(),
  text text not null
);
create table public.alert_settings (
  k text primary key,
  v text not null
);
alter table public.alerts_sent enable row level security;
alter table public.alert_settings enable row level security;
revoke all on public.alerts_sent, public.alert_settings from anon, authenticated;
