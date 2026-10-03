-- APPLIED live 2026-10-02 (checked: anyone can add, reading is refused, an over-long name is refused).
-- 027: FOCUS-GROUP FEEDBACK (Cody, 2026-10-02: "We will need to run a QA focus group audit player test"; TEST_PLAN.md A).
-- Testers fill in santahatgames.com/feedback.html; their answers land here for Claude to read and summarise for Cody.
-- Anyone may ADD feedback (testers are friends without accounts; the page uses the public publishable key); nobody can READ,
-- change or delete it through the site (no select/update/delete grants or policies: only the database owner reads it).
-- Every field is size-limited by the table itself, so a flood can't store anything large. For the test phase: drop or close
-- the insert policy before launch if it isn't wanted.
create table public.tester_feedback (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  tester text check (char_length(tester) <= 40),                              -- a first name or nickname (optional)
  device text check (char_length(device) <= 60),                              -- e.g. "iPhone 14, Safari"
  wallet text check (wallet in ('phantom', 'solflare', 'email', 'none', 'other')),
  ratings jsonb not null default '{}' check (jsonb_typeof(ratings) = 'object' and octet_length(ratings::text) <= 600),
  answers jsonb not null default '{}' check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 9000)
);
alter table public.tester_feedback enable row level security;
revoke all on public.tester_feedback from anon, authenticated;
grant insert (tester, device, wallet, ratings, answers) on public.tester_feedback to anon, authenticated;
grant usage on sequence public.tester_feedback_id_seq to anon, authenticated;
create policy feedback_add on public.tester_feedback for insert to anon, authenticated with check (true);
