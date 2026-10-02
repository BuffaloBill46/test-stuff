-- APPLIED live 2026-10-01 (the three live constraints checked: n between 1 and 100). Runs of any size from 1 to 100 plays (Cody, 2026-10-01: "a custom fill box with arrows ... if people want to
-- spin more than 10 times they can. Maybe set a max of 100"). 005 allowed only 1, 5 or 10. Same limit as mockups/credits.js
-- MAX_RUN (tests/credits.test.mjs). Pool safety is unchanged: every play is still checked against its pool when it is made, and
-- a play the pool refuses is refunded in the run's one transfer at the end.
alter table public.quotes drop constraint quotes_n_check, add constraint quotes_n_check check (n between 1 and 100);
alter table public.payments drop constraint payments_n_check, add constraint payments_n_check check (n between 1 and 100);
alter table public.runs drop constraint runs_n_check, add constraint runs_n_check check (n between 1 and 100);
