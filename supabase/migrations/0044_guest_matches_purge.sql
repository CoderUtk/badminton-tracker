-- 0044_guest_matches_purge.sql
-- Requires pg_cron enabled on the project. Split from 0043 so a missing extension cannot roll back the table DDL.

-- Retention: anon rows accumulate one owner per guest device. Hard-delete
-- matches older than 30 days; guest_match_events cascades. Requires the
-- pg_cron extension enabled on the project (Database -> Extensions).
select cron.schedule(
  'purge-guest-matches',
  '17 3 * * *',
  $$ delete from public.guest_matches
     where created_at < now() - interval '30 days' $$
);
