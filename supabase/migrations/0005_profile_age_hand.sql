-- supabase/migrations/0005_profile_age_hand.sql
-- Optional onboarding fields captured at first login. Both nullable —
-- existing users never see the welcome screen again (display_name_set is
-- already true for them), so there is nothing to backfill and no forced
-- re-prompt.
alter table public.profiles add column if not exists age int;
alter table public.profiles add column if not exists hand text check (hand in ('left', 'right'));
